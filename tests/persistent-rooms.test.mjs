import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter, once } from 'node:events'
import WebSocket from 'ws'
import { createRoomStore } from '../server/roomStore.mjs'
import { createAsrGateway } from '../server/asrGateway.mjs'

const directory = await mkdtemp(join(tmpdir(), 'hakisub-rooms-'))
const environmentPath = join(directory, '.env'), dataPath = join(directory, 'rooms.json')
const origin = 'http://127.0.0.1:5173', clients = [], upstreamKeys = []
let gateway, base, failSave = false
const waitFor = async predicate => {
  for (let index = 0; index < 100; index++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error('等待房间状态超时')
}
class FakeUpstream extends EventEmitter {
  readyState = 0; bufferedAmount = 0
  terminate() { this.readyState = 3 }
}
async function start() {
  const store = await createRoomStore(dataPath)
  gateway = createAsrGateway({ apiKey: 'fixture-default-key', roomStore: {
    list: store.list, save: room => failSave ? Promise.reject(Error('fixture failure')) : store.save(room),
  }, probeRoomKey: async key => ({ ok: key === 'fixture-room-a', message: 'fixture handshake only' }),
  connectUpstream: (_url, options) => { upstreamKeys.push(options.headers['X-Api-Key']); return new FakeUpstream() } })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  base = `http://127.0.0.1:${gateway.server.address().port}`
}
async function connect(command) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/rooms', { origin }), events = []
  clients.push(socket); socket.on('message', packet => events.push(JSON.parse(packet)))
  await once(socket, 'open'); socket.send(JSON.stringify(command))
  await waitFor(() => events.some(event => ['joined', 'error'].includes(event.type)))
  return { socket, events, identity: events.find(event => event.type === 'joined'), send: event => socket.send(JSON.stringify(event)) }
}
async function settings(member, command, customOrigin = origin) {
  return fetch(base + '/api/rooms/settings', { method: command ? 'POST' : 'GET', headers: {
    Origin: customOrigin, Authorization: `Bearer ${member?.identity?.token ?? 'invalid'}`, ...(command ? { 'Content-Type': 'application/json' } : {}),
  }, ...(command ? { body: JSON.stringify(command) } : {}) })
}
try {
  await writeFile(environmentPath, '# fixture environment\nDOUBAO_API_KEY=fixture-existing\n')
  await start()
  const alice = await connect({ type: 'create', name: 'Alice' })
  const bob = await connect({ type: 'join', name: 'Bob', code: alice.identity.code })
  const other = await connect({ type: 'create', name: 'Other' })
  assert.equal(alice.identity.isOwner, true); assert.equal(bob.identity.isOwner, false)
  assert.equal(JSON.stringify(bob.events).includes(alice.identity.ownerToken), false)
  assert.equal((await settings(null)).status, 403)
  assert.equal((await settings(bob, { action: 'save', apiKey: 'fixture-theft' })).status, 403)
  assert.equal((await settings(alice, { action: 'save', apiKey: 'fixture-cross-site' }, 'https://untrusted.example')).status, 403)
  for (const apiKey of ['', 'line\nbreak', 'fixture#invalid', 'x'.repeat(2050)]) assert.equal((await settings(alice, { action: 'save', apiKey })).status, 400)
  assert.equal((await settings(alice, { action: 'save', apiKey: 'x'.repeat(5000) })).status, 413)
  assert.equal((await settings(alice, { action: 'save', apiKey: 'fixture-room-a' })).status, 200)
  const publicStatus = await (await settings(bob)).json()
  assert.equal(publicStatus.configured, true); assert.equal(publicStatus.source, 'room'); assert.equal(publicStatus.readOnly, true)
  assert.equal(JSON.stringify(publicStatus).includes('fixture-room-a'), false)
  assert.equal((await (await settings(other)).json()).source, 'none', '其他房间既不继承本房间密钥，也不使用服务器默认密钥')
  assert.equal((await (await settings(alice, { action: 'test' })).json()).ok, true)
  const stored = await readFile(dataPath, 'utf8')
  assert.equal(stored.includes('fixture-room-a'), false)
  assert.equal(stored.includes(alice.identity.ownerToken), false, '只持久化管理凭据摘要')
  failSave = true
  assert.equal((await settings(alice, { action: 'save', apiKey: 'fixture-memory-only' })).status, 200, '设置Key不依赖磁盘')
  assert.equal((await settings(alice, { action: 'asr', enabled: false })).status, 500)
  assert.equal(await readFile(dataPath, 'utf8'), stored)
  assert.equal((await (await settings(alice)).json()).configured, false, '开关写入失败清掉Key')
  assert.equal((await settings(alice, { action: 'delete' })).status, 200, '删除Key不依赖磁盘')
  failSave = false
  assert.equal((await settings(alice, { action: 'save', apiKey: 'fixture-room-a' })).status, 200)
  alice.send({ type: 'mic', mic: true })
  await waitFor(() => alice.events.at(-1)?.members?.some(member => member.mic))
  assert.equal((await settings(alice, { action: 'test' })).status, 200, '房主无需所有成员退出或关麦即可管理')
  const audio = new WebSocket(base.replace('http:', 'ws:') + `/api/asr?session=${alice.identity.token}`, { origin })
  clients.push(audio); await once(audio, 'open')
  assert.equal(upstreamKeys.at(-1), 'fixture-room-a')
  audio.terminate(); alice.send({ type: 'mic', mic: false })
  await waitFor(() => alice.events.at(-1)?.members?.every(member => !member.mic))
  const identity = alice.identity
  clients.forEach(socket => socket.terminate()); await gateway.close()
  await start()
  const stranger = await connect({ type: 'join', code: identity.code, name: 'Stranger', ownerToken: '00000000-0000-0000-0000-000000000000' })
  assert.equal(stranger.identity.isOwner, false)
  assert.equal((await settings(stranger, { action: 'delete' })).status, 403)
  const returning = await connect({ type: 'join', code: identity.code, name: 'Returning', ownerToken: identity.ownerToken })
  assert.equal(returning.identity.isOwner, true)
  assert.notEqual(returning.identity.token, identity.token)
  assert.equal(returning.events.some(event => event.type === 'caption'), false)
  assert.equal((await settings({ identity })).status, 403, '旧成员令牌不得在重启后复用')
  assert.equal((await (await settings(returning)).json()).source, 'none')
  assert.equal((await (await settings(returning)).json()).keyState, 'missing')
  returning.send({ type: 'mic', mic: true })
  await waitFor(() => returning.events.at(-1)?.members?.some(member => member.mic))
  const deniedAudio = new WebSocket(base.replace('http:', 'ws:') + `/api/asr?session=${returning.identity.token}`, { origin })
  clients.push(deniedAudio)
  assert.match(await new Promise(resolve => deniedAudio.once('error', error => resolve(error.message))), /403/, '重启不得恢复Key或回退默认Key')
  assert.equal((await settings(returning, { action: 'save', apiKey: 'fixture-room-a' })).status, 200)
  const restoredAudio = new WebSocket(base.replace('http:', 'ws:') + `/api/asr?session=${returning.identity.token}`, { origin })
  clients.push(restoredAudio); await once(restoredAudio, 'open')
  assert.equal(upstreamKeys.at(-1), 'fixture-room-a', '合法房主重填后恢复识别')
  restoredAudio.terminate(); returning.send({ type: 'mic', mic: false })
  await waitFor(() => returning.events.at(-1)?.members?.every(member => !member.mic))
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal((await settings(returning, { action: 'delete' })).status, 200)
  assert.equal((await (await settings(returning)).json()).source, 'none')
  assert.equal((await (await settings(returning)).json()).keyState, 'deleted')
  assert.equal(await readFile(environmentPath, 'utf8'), '# fixture environment\nDOUBAO_API_KEY=fixture-existing\n', '房间存储不修改服务端环境')
  console.log('通过：房间身份重启恢复、Key仅内存/重启失效/合法房主重填、磁盘失败清Key且删除不依赖磁盘、隔离/权限/无默认回退。仅假上游。')
} finally {
  clients.forEach(socket => socket.terminate())
  await gateway?.close()
  await rm(directory, { recursive: true, force: true })
}
