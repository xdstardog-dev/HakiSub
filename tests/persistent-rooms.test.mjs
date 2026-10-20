import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter, once } from 'node:events'
import WebSocket from 'ws'
import { createRoomStore, getRoomEncryptionKey } from '../server/roomStore.mjs'
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
  const encryptionKey = await getRoomEncryptionKey(environmentPath)
  const store = await createRoomStore(dataPath, encryptionKey)
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
  const key = await getRoomEncryptionKey(environmentPath)
  assert.equal(await getRoomEncryptionKey(environmentPath), key)
  assert.match(await readFile(environmentPath, 'utf8'), /DOUBAO_API_KEY=fixture-existing/)
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
  assert.equal((await (await settings(other)).json()).source, 'server', '其他房间不继承本房间密钥')
  assert.equal((await (await settings(alice, { action: 'test' })).json()).ok, true)
  const stored = await readFile(dataPath, 'utf8')
  assert.equal(stored.includes('fixture-room-a'), false)
  assert.equal(stored.includes(alice.identity.ownerToken), false, '只持久化管理凭据摘要')
  const wrong = Buffer.alloc(32, 7).toString('base64')
  await assert.rejects(createRoomStore(dataPath, wrong), /无法读取房间资料/)
  failSave = true
  assert.equal((await settings(alice, { action: 'save', apiKey: 'fixture-must-not-replace' })).status, 500)
  failSave = false
  assert.equal(await readFile(dataPath, 'utf8'), stored)
  alice.send({ type: 'mic', mic: true })
  await waitFor(() => alice.events.at(-1)?.members?.some(member => member.mic))
  assert.equal((await settings(alice, { action: 'delete' })).status, 409)
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
  assert.equal((await (await settings(returning)).json()).source, 'room')
  returning.send({ type: 'mic', mic: true })
  await waitFor(() => returning.events.at(-1)?.members?.some(member => member.mic))
  const restoredAudio = new WebSocket(base.replace('http:', 'ws:') + `/api/asr?session=${returning.identity.token}`, { origin })
  clients.push(restoredAudio); await once(restoredAudio, 'open')
  assert.equal(upstreamKeys.at(-1), 'fixture-room-a', '重启后解密并使用原房间密钥')
  restoredAudio.terminate(); returning.send({ type: 'mic', mic: false })
  await waitFor(() => returning.events.at(-1)?.members?.every(member => !member.mic))
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal((await settings(returning, { action: 'delete' })).status, 200)
  assert.equal((await (await settings(returning)).json()).source, 'server')
  console.log('通过：房间及创建者重启恢复、API Key加密持久化/密钥隔离/不回显、权限与Origin校验、忙碌保护、写入失败保留旧值、旧令牌失效。仅假上游，无真实API或麦克风。')
} finally {
  clients.forEach(socket => socket.terminate())
  await gateway?.close()
  await rm(directory, { recursive: true, force: true })
}
