import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { createRoomStore } from '../server/roomStore.mjs'
import { createAsrGateway } from '../server/asrGateway.mjs'

const directory = await mkdtemp(join(tmpdir(), 'hakisub-rename-'))
const dataPath = join(directory, 'rooms.json'), invalidPath = join(directory, 'invalid.json')
const key = Buffer.alloc(32, 3).toString('base64'), ownerToken = '11111111-1111-1111-1111-111111111111'
const ownerHash = createHash('sha256').update(ownerToken).digest('hex'), clients = []
let gateway
const waitFor = async predicate => {
  for (let count = 0; count < 100; count++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error('Room rename test timed out')
}
try {
  let store = await createRoomStore(dataPath, key)
  await store.save({ code: '985529', ownerHash, apiKey: 'fixture-room-key' })
  await store.save({ code: '123456', ownerHash, apiKey: 'fixture-other-key' })
  const original = await readFile(dataPath, 'utf8')
  const manualEdit = JSON.parse(original); manualEdit.rooms[0].code = '114514'
  await writeFile(invalidPath, JSON.stringify(manualEdit))
  await assert.rejects(createRoomStore(invalidPath, key), /无法读取/, '直接改号码会破坏Key的AAD认证')
  for (const [source, target] of [['985529', '123456'], ['985529', '985529'], ['985529', 'bad'], ['999999', '114514']]) {
    await assert.rejects(store.renameRoom(source, target))
    assert.equal(await readFile(dataPath, 'utf8'), original, '非法或冲突目标不覆盖原资料')
  }
  const command = fileURLToPath(new URL('../server/renameRoom.mjs', import.meta.url))
  const run = action => spawnSync(process.execPath, [command, '985529', '114514', action], {
    encoding: 'utf8', env: { ...process.env, HAKISUB_ROOM_STORE_PATH: dataPath, HAKISUB_ROOM_ENCRYPTION_KEY: key },
  })
  const check = run('--check'); assert.equal(check.status, 0); assert.equal(JSON.parse(check.stdout).targetAvailable, true)
  assert.equal(await readFile(dataPath, 'utf8'), original)
  const applied = run('--apply'); assert.equal(applied.status, 0)
  assert.equal(JSON.parse(applied.stdout).configurationPreserved, true)
  assert.equal(run('--apply').status, 0, '维护脚本重试识别已迁移状态，不生成第二间房')
  assert.equal((applied.stdout + applied.stderr).includes('fixture-room-key'), false)
  assert.equal((applied.stdout + applied.stderr).includes(ownerToken), false)
  store = await createRoomStore(dataPath, key)
  const renamed = store.list().find(room => room.code === '114514')
  assert.equal(renamed.apiKey, 'fixture-room-key'); assert.equal(renamed.ownerHash, ownerHash)
  assert.deepEqual(renamed.aliases, ['985529']); assert.equal(store.list().length, 2)
  assert.equal(store.list().some(room => room.code === '985529'), false)
  const migrated = JSON.parse(await readFile(dataPath, 'utf8'))
  assert.notDeepEqual(migrated.rooms.find(room => room.code === '114514').encryptedKey, JSON.parse(original).rooms[0].encryptedKey)
  assert.equal(JSON.stringify(migrated).includes('fixture-room-key'), false)
  for (const aliases of [['123456'], ['985529', '985529'], ['bad'], '985529']) {
    const invalid = structuredClone(migrated)
    invalid.rooms.find(room => room.code === '114514').aliases = aliases
    await writeFile(invalidPath, JSON.stringify(invalid))
    await assert.rejects(createRoomStore(invalidPath, key), /无法读取/)
  }
  gateway = createAsrGateway({ roomStore: store, connectUpstream() { throw Error('This test must never call ASR') } })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  const base = `http://127.0.0.1:${gateway.server.address().port}`, origin = 'http://127.0.0.1:5173'
  const connect = async (code, ownership) => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/rooms', { origin }), events = []
    clients.push(socket); socket.on('message', packet => events.push(JSON.parse(packet)))
    await once(socket, 'open'); socket.send(JSON.stringify({ type: 'join', name: 'Migration', code, ownerToken: ownership }))
    await waitFor(() => events.some(event => event.type === 'joined'))
    return { socket, events, identity: events.find(event => event.type === 'joined') }
  }
  const owner = await connect('985529', ownerToken), member = await connect('114514')
  assert.equal(owner.identity.code, '114514'); assert.equal(member.identity.code, '114514')
  assert.equal(owner.identity.isOwner, true); assert.equal(member.identity.isOwner, false)
  assert.deepEqual(owner.identity.aliases, ['985529'])
  await waitFor(() => member.events.some(event => event.type === 'members' && event.members.length === 2))
  for (const [person, readOnly] of [[owner, false], [member, true]]) {
    const response = await fetch(base + '/api/rooms/settings', { headers: { Origin: origin, Authorization: `Bearer ${person.identity.token}` } })
    const status = await response.json()
    assert.equal(status.configured, true); assert.equal(status.source, 'room'); assert.equal(status.readOnly, readOnly)
    assert.equal(JSON.stringify(status).includes('fixture-room-key'), false)
  }
  owner.socket.send(JSON.stringify({ type: 'mic', mic: true }))
  await waitFor(() => member.events.at(-1)?.members?.some(value => value.mic))
  owner.socket.send(JSON.stringify({ type: 'caption', utteranceId: 'migration-fixture', text: '合成字幕', state: 'final' }))
  await waitFor(() => member.events.some(event => event.type === 'caption'))
  assert.equal(member.events.find(event => event.type === 'caption').memberId, owner.identity.memberId)
  clients.forEach(socket => socket.terminate()); await gateway.close(); gateway = undefined
  await store.save({ code: '114514', ownerHash, apiKey: 'fixture-updated-key' })
  store = await createRoomStore(dataPath, key)
  assert.deepEqual(store.list().find(room => room.code === '114514').aliases, ['985529'], '更新Key不能丢失旧入口')
  await store.renameRoom('114514', '114515')
  assert.deepEqual(store.list().find(room => room.code === '114515').aliases, ['985529', '114514'])
  await assert.rejects(store.save({ code: '985529', ownerHash, apiKey: '' }), '旧号码保留为别名，不能被新房间占用')
  console.log('通过：房间换号/AAD重加密/房主保留/冲突失败不改资料/旧新码同房/持久别名/配置状态/字幕广播/管理员脚本幂等及不回显。未调用真实API。')
} finally {
  clients.forEach(socket => socket.terminate()); await gateway?.close()
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('hakisub-rename-'))
  await rm(directory, { recursive: true, force: true })
}
