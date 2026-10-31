import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import WebSocket from 'ws'
import * as avatars from '../accounts/shared/roomAvatars.mjs'
import { createRoomGateway } from '../server/roomGateway.mjs'
import { createRoomSettingsHandler } from '../server/roomSettings.mjs'
import { createRoomStore } from '../server/roomStore.mjs'

assert.equal(avatars.QUICK_ROOM_AVATARS.length, 4)
assert.ok(avatars.ROOM_AVATARS.length > 4)
assert.equal(new Set(avatars.ROOM_AVATARS.map(avatar => avatar.id)).size, avatars.ROOM_AVATARS.length)
for (const id of [undefined, null, '<svg>', 'https://example.com/avatar.svg']) assert.equal(avatars.normalizeRoomAvatar(id), 'home')
const clientSource = readFileSync(new URL('../src/roomAvatarClient.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const context = vm.createContext({ ...avatars, AbortController, Error, setTimeout, clearTimeout })
vm.runInContext(ts.transpile(clientSource + ';globalThis.createClient=createRoomAvatarClient', { target: ts.ScriptTarget.ES2022 }), context)
let status = { readOnly: false, bound: false }, posted, cancelled = 0
const account = { rooms: async () => ({ rooms: [{ code: '123456' }] }), manageRoom: async (_code, command) => { posted = command; return { room: { avatarId: command.avatarId } } }, cancel() { cancelled++ } }
const client = context.createClient(account, async (_url, options) => { if (options.method === 'POST') { posted = JSON.parse(options.body); return { ok: true, json: async () => ({ avatarId: posted.avatarId }) } }; return { ok: true, json: async () => status } })
assert.equal((await client.permission('123456', 'session')).canEdit, true)
status = { readOnly: true, bound: false }; assert.equal((await client.permission('123456', 'session')).canEdit, false)
status = { readOnly: true, bound: true }; assert.equal((await client.permission('123456', 'session')).canEdit, true)
assert.equal((await client.permission('654321', 'session')).canEdit, false)
assert.equal(await client.save('123456', 'session', 'cat', false), 'cat'); assert.equal(posted.action, 'avatar')
assert.equal(await client.save('123456', 'session', 'book', true), 'book'); assert.equal(posted.avatarId, 'book')
await assert.rejects(client.save('123456', 'session', '../external', false), /预制/)
const denied = context.createClient(account, async () => ({ ok: false, json: async () => ({ message: '权限失败' }) }))
await assert.rejects(denied.permission('123456', 'session'), /权限失败/)
let requestSignal
const pendingClient = context.createClient(account, (_url, options) => new Promise((_resolve, reject) => { requestSignal = options.signal; options.signal.addEventListener('abort', () => reject(Error('cancelled'))) }))
const pending = pendingClient.permission('123456', 'session'); pendingClient.cancel(); await assert.rejects(pending, /cancelled/); assert.equal(requestSignal.aborted, true)
client.cancel(); assert.ok(cancelled >= 2)

const directory = await mkdtemp(join(tmpdir(), 'hakisub-room-avatars-')), file = join(directory, 'rooms.json'), origin = 'http://127.0.0.1:5173'
let rooms, server, base, store, failSave = false
const sockets = []
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }; throw Error('Avatar test timed out') }
async function start() {
  store = await createRoomStore(file)
  rooms = createRoomGateway({ roomStore: { list: store.list, save: room => failSave ? Promise.reject(Error('synthetic disk failure')) : store.save(room) } })
  server = createServer(createRoomSettingsHandler(rooms, { allowedOrigins: [origin] })); server.on('upgrade', rooms.upgrade)
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
}
async function connect(command) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/rooms', { origin }), events = []
  sockets.push(socket); socket.on('message', packet => events.push(JSON.parse(packet)))
  await once(socket, 'open'); socket.send(JSON.stringify({ name: '合成成员', ...command })); await waitFor(() => events.some(event => event.type === 'joined'))
  return { socket, events, identity: events.find(event => event.type === 'joined') }
}
const settings = (member, command, requestOrigin = origin) => fetch(base + '/api/rooms/settings', { method: command ? 'POST' : 'GET', headers: { Origin: requestOrigin, Authorization: `Bearer ${member.identity.token}`, ...(command ? { 'Content-Type': 'application/json' } : {}) }, ...(command ? { body: JSON.stringify(command) } : {}) })
async function stop() { sockets.forEach(socket => socket.terminate()); await rooms?.close(); await new Promise(resolve => server.close(resolve)) }
try {
  await start()
  const owner = await connect({ type: 'create' }), member = await connect({ type: 'join', code: owner.identity.code }), other = await connect({ type: 'create' })
  assert.equal(owner.identity.avatarId, 'home')
  assert.equal((await settings(member, { action: 'avatar', avatarId: 'cat' })).status, 403)
  assert.equal((await settings(owner, { action: 'avatar', avatarId: 'cat' }, 'https://untrusted.example')).status, 403)
  for (const id of ['', '<svg>', 1, null, 'https://example.com/icon']) assert.equal((await settings(owner, { action: 'avatar', avatarId: id })).status, 400)
  const session = rooms.findSession(owner.identity.token); let stopped = 0
  session.room.apiKey = 'synthetic-avatar-test-key'; session.asr = { stopRoomAsr() { stopped++ }, terminate() {} }
  assert.equal((await settings(owner, { action: 'avatar', avatarId: 'cat' })).status, 200)
  await waitFor(() => member.events.some(event => event.type === 'room-status' && event.avatarId === 'cat'))
  assert.equal(stopped, 0); assert.equal(session.room.apiKey, 'synthetic-avatar-test-key')
  assert.equal((await (await settings(other)).json()).avatarId, 'home', '房间头像隔离')
  failSave = true; assert.equal((await settings(owner, { action: 'avatar', avatarId: 'star' })).status, 500)
  assert.equal((await (await settings(owner)).json()).avatarId, 'cat'); assert.equal(stopped, 0); assert.equal(session.room.apiKey, 'synthetic-avatar-test-key')
  failSave = false
  const uid = randomUUID(); await rooms.manageAccount({ action: 'bind', uid, code: owner.identity.code, ownerToken: owner.identity.ownerToken })
  assert.equal((await settings(owner, { action: 'avatar', avatarId: 'book' })).status, 403, '绑定后旧匿名身份不能改头像')
  await assert.rejects(rooms.manageAccount({ action: 'avatar', code: owner.identity.code, uid: randomUUID(), avatarId: 'book' }), /房主/)
  await rooms.manageAccount({ action: 'avatar', code: owner.identity.code, uid, avatarId: 'star' })
  assert.equal(store.list().find(room => room.code === owner.identity.code).avatarId, 'star')
  assert.equal((await readFile(file, 'utf8')).includes('synthetic-avatar-test-key'), false)
  const code = owner.identity.code; await stop(); rooms = undefined
  await start(); const returned = await connect({ type: 'join', code }); assert.equal(returned.identity.avatarId, 'star')
  const record = store.list().find(room => room.code === code)
  await store.save({ code, ownerHash: record.ownerHash, asrEnabled: false }); assert.equal(store.list().find(room => room.code === code).avatarId, 'star')
  await writeFile(join(directory, 'legacy.json'), JSON.stringify({ version: 5, rooms: [{ code: '123456', ownerHash: 'a'.repeat(64) }] }))
  assert.equal((await createRoomStore(join(directory, 'legacy.json'))).list()[0].avatarId, 'home')
  console.log('通过：预制编号、头像客户端权限/双链路/取消、房主与跨房隔离、广播、持久重启、旧资料默认房屋、写失败保留头像与Key且不停止ASR。仅本地模拟。')
} finally { if (rooms) await stop(); await rm(directory, { recursive: true, force: true }) }
