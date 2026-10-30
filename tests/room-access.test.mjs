import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { createRoomStore } from '../server/roomStore.mjs'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { createRoomAccess } from '../server/roomAccess.mjs'

const directory = await mkdtemp(join(tmpdir(), 'hakisub-entry-'))
const path = join(directory, 'rooms.json'), origin = 'http://127.0.0.1:5173'
const secret = 'synthetic-entry-service-secret-at-least-forty-three-characters'
const ownerUid = randomUUID(), visitorUid = randomUUID(), sockets = []
let gateway, store, base, failSave = false
const waitFor = async predicate => {
  for (let index = 0; index < 150; index++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error('入房凭证测试超时')
}
async function start() {
  store = await createRoomStore(path)
  gateway = createAsrGateway({ allowedOrigins: [origin], roomManagementSecret: secret, roomStore: {
    list: store.list, save: room => failSave ? Promise.reject(Error('synthetic storage failure')) : store.save(room),
  }, connectUpstream() { throw Error('入房凭证测试禁止真实ASR') } })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  base = `http://127.0.0.1:${gateway.server.address().port}`
}
async function connect(command) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/rooms', { origin }), events = []
  sockets.push(socket); socket.on('message', data => events.push(JSON.parse(data)))
  await once(socket, 'open'); socket.send(JSON.stringify({ name: '合成成员', ...command }))
  await waitFor(() => events.some(event => ['joined', 'error'].includes(event.type)))
  return { socket, events, identity: events.find(event => event.type === 'joined') }
}
async function settings(client, command) {
  const response = await fetch(base + '/api/rooms/settings', { method: command ? 'POST' : 'GET', headers: {
    Origin: origin, Authorization: `Bearer ${client.identity.token}`, ...(command ? { 'Content-Type': 'application/json' } : {}),
  }, ...(command ? { body: JSON.stringify(command) } : {}) })
  return { status: response.status, body: await response.json() }
}
async function signed(command) {
  const { audience } = await (await fetch(base + '/internal/rooms/challenge')).json()
  const body = JSON.stringify({ audience, issuedAt: Date.now(), nonce: randomUUID(), command })
  const signature = createHmac('sha256', secret).update('POST\n/internal/rooms/manage\n' + body).digest('hex')
  const response = await fetch(base + '/internal/rooms/manage', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HakiSub-Signature': signature }, body })
  return { status: response.status, body: await response.json() }
}
try {
  await start()
  const owner = await connect({ type: 'create' }), code = owner.identity.code
  const before = await connect({ type: 'join', code })
  assert.ok(before.identity)
  assert.equal((await settings(before, { action: 'access-code', accessCode: '0426' })).status, 403)
  for (const accessCode of ['123', '12345', 'abcd', 1234]) assert.equal((await settings(owner, { action: 'access-code', accessCode })).status, 400)
  assert.equal((await settings(owner, { action: 'access-code', accessCode: '0426' })).status, 200)
  await waitFor(() => before.events.some(event => event.type === 'access-revoked'))
  assert.equal((await settings(before)).status, 403, '改码同步撤销旧成员令牌')
  const blocked = await connect({ type: 'join', code })
  assert.equal(blocked.events[0].reason, 'password-required')
  assert.equal(blocked.events.some(event => ['members', 'room-status', 'caption'].includes(event.type)), false)
  const guest = await connect({ type: 'join', code, password: '0426' })
  assert.ok(guest.identity, '前导零入房码可验证')
  assert.equal((await settings(guest)).body.requiresPassword, true)
  assert.equal('accessCode' in (await settings(guest)).body, false)
  const returningOwner = await connect({ type: 'join', code, ownerToken: owner.identity.ownerToken })
  assert.equal(returningOwner.identity.isOwner, true); returningOwner.socket.terminate()
  assert.equal((await signed({ action: 'bind', code, uid: ownerUid, ownerToken: owner.identity.ownerToken })).status, 200)
  assert.equal((await signed({ action: 'access', code, uid: visitorUid })).body.requiresPassword, true)
  const access = (await signed({ action: 'access', code, uid: visitorUid, password: '0426' })).body
  assert.ok(access.accessTicket)
  assert.equal('accessCode' in access, false)
  const visitor = await connect({ type: 'join', code, accessTicket: access.accessTicket })
  assert.ok(visitor.identity)
  const replay = await connect({ type: 'join', code, accessTicket: access.accessTicket, uid: visitorUid })
  assert.equal(replay.identity, undefined, '单次入场票据不能重放，客户端UID没有权限')
  assert.equal((await signed({ action: 'access', code, uid: visitorUid })).body.accessTicket.length, 36, '同账号无需再次提交入房码')
  const other = await connect({ type: 'create' }), otherCode = other.identity.code
  await settings(other, { action: 'access-code', accessCode: '3197' })
  const ticketA = (await signed({ action: 'access', code, uid: visitorUid })).body.accessTicket
  assert.equal((await connect({ type: 'join', code: otherCode, accessTicket: ticketA })).identity, undefined, '票据隔离房间')
  assert.equal((await signed({ action: 'access', code: otherCode, uid: visitorUid })).body.accessTicket, undefined, '账号资格隔离房间')
  const disk = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(disk.version, 4)
  assert.equal(disk.rooms.find(room => room.code === code).accessCode, '0426', '按要求明文持久保存入房码')
  assert.deepEqual(disk.rooms.find(room => room.code === code).accessAccounts, [visitorUid])
  sockets.forEach(socket => socket.terminate()); await gateway.close(); await start()
  const afterRestart = await signed({ action: 'access', code, uid: visitorUid })
  assert.ok(afterRestart.body.accessTicket, '重启保留账号进房资格')
  const restartedVisitor = await connect({ type: 'join', code, accessTicket: afterRestart.body.accessTicket })
  assert.ok(restartedVisitor.identity)
  assert.equal((await settings(restartedVisitor)).body.configured, false, '入房资格持久化不改变API Key仅内存规则')
  const ownerTicket = (await signed({ action: 'access', code, uid: ownerUid })).body.accessTicket
  const restartedOwner = await connect({ type: 'join', code, accessTicket: ownerTicket })
  const oldTicket = (await signed({ action: 'access', code, uid: visitorUid })).body.accessTicket
  const newCode = await signed({ action: 'access-code', code, uid: ownerUid, accessCode: '9870' })
  assert.equal(newCode.status, 200)
  await waitFor(() => restartedVisitor.events.some(event => event.type === 'access-revoked'))
  assert.equal(restartedOwner.socket.readyState, WebSocket.OPEN, '房主可继续管理')
  assert.equal((await connect({ type: 'join', code, accessTicket: oldTicket })).identity, undefined, '改码使未用旧票据失效')
  assert.equal((await signed({ action: 'access', code, uid: visitorUid })).body.accessTicket, undefined, '改码清除账号资格')
  assert.ok((await signed({ action: 'access', code, uid: visitorUid, password: '9870' })).body.accessTicket)
  assert.equal((await signed({ action: 'save', code, uid: ownerUid, apiKey: 'synthetic-ephemeral-key' })).status, 200)
  failSave = true
  assert.equal((await signed({ action: 'access-code', code, uid: ownerUid, accessCode: '1110' })).status, 500)
  const unsavedUid = randomUUID()
  assert.equal((await signed({ action: 'access', code, uid: unsavedUid, password: '9870' })).status, 500)
  assert.equal(store.list().find(room => room.code === code).accessAccounts.includes(unsavedUid), false, '进房资格写入失败不能假装保存成功')
  assert.equal((await settings(restartedOwner)).body.configured, true, '入房码保存失败不清除ASR Key')
  assert.equal(store.list().find(room => room.code === code).accessCode, '9870')
  failSave = false
  for (let index = 0; index < 5; index++) assert.equal((await connect({ type: 'join', code, password: '0000' })).events[0].reason, 'password-incorrect')
  assert.equal((await connect({ type: 'join', code, password: '9870' })).events[0].reason, 'access-rate-limited', '重连不重置错误次数')
  const roomRecord = store.list().find(room => room.code === code)
  sockets.forEach(socket => socket.terminate()); await gateway.close()
  const newRoomCode = ['114514', '222222', '333333'].find(value => !store.list().some(room => room.code === value))
  await store.renameRoom(code, newRoomCode); await start()
  const aliasAccess = await signed({ action: 'access', code, uid: visitorUid })
  assert.equal(aliasAccess.body.code, newRoomCode); assert.ok(aliasAccess.body.accessTicket)
  assert.equal(store.list().find(room => room.code === newRoomCode).accessVersion, roomRecord.accessVersion)
  assert.equal((await signed({ action: 'access-code', code, uid: ownerUid, accessCode: '' })).status, 200)
  assert.ok((await connect({ type: 'join', code })).identity, '移除入房码恢复公开加入')
  assert.equal((await readFile(path, 'utf8')).includes('synthetic-ephemeral-key'), false)
  let now = 0
  const accessControl = createRoomAccess({ now: () => now, saveRoom: async () => {} })
  const fixture = { code: '123456', accessCode: '0012', accessVersion: randomUUID(), accessAccounts: [] }
  for (let index = 0; index < 5; index++) assert.throws(() => accessControl.verifyCode(fixture, '0000', 'fixture'), error => error.statusCode === 403)
  assert.throws(() => accessControl.verifyCode(fixture, '0012', 'fixture'), error => error.statusCode === 429)
  now = 60001; accessControl.verifyCode(fixture, '0012', 'fixture')
  const expired = await accessControl.authorizeAccount(fixture, visitorUid, '0012')
  now += 60001; assert.equal(accessControl.consumeTicket(fixture, expired.accessTicket), undefined)
  console.log('通过：真实隔离WebSocket四位明文入房码/前导零、房主权限、验证前无成员/字幕、跨账号/房间和票据重放隔离、账号免输及重启/换号保留、改码撤权、保存失败保留原设置和Key、跨重连错误限流/冷却、票据到期、移除及v4持久化。未调用真实ASR。')
} finally { sockets.forEach(socket => socket.terminate()); await gateway?.close(); await rm(directory, { recursive: true, force: true }) }
