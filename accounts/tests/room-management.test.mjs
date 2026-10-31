import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, createHash, createHmac, randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { createAccountServer } from '../server/accountServer.mjs'
import { createRoomManagementClient } from '../server/roomManagementClient.mjs'
import { createRoomStore } from '../../server/roomStore.mjs'
import { createAsrGateway } from '../../server/asrGateway.mjs'

const origin = 'https://hakisub.xdstar.work', accountOrigin = 'https://xdstar.work', prefix = '/api/projects/hakisub'
const secret = 'synthetic-room-service-secret-at-least-forty-three-characters'
const ownerToken = '11111111-1111-1111-1111-111111111111'
const ownerHash = createHash('sha256').update(ownerToken).digest('hex')
const waitFor = async predicate => {
  for (let count = 0; count < 150; count++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error('Room management fixture timed out')
}
class FakeUpstream extends EventEmitter {
  readyState = 1; bufferedAmount = 0
  constructor(key) { super(); this.key = key; setImmediate(() => { if (this.readyState === 1) this.emit('open') }) }
  send(_packet, callback) { callback?.() }
  terminate() { this.readyState = 3 }
}
function accountClient(server, ip) {
  const cookies = new Map()
  const request = async (url, method = 'GET', payload, extra = {}) => {
    const response = await server.app.inject({ method, url, remoteAddress: ip, headers: { origin: accountOrigin, cookie: [...cookies.values()].join('; '),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, ...(payload === undefined ? {} : { payload }) })
    for (const value of [response.headers['set-cookie'] ?? []].flat()) { const entry = value.split(';')[0]; cookies.set(entry.split('=')[0], entry) }
    return { status: response.statusCode, body: response.json(), headers: response.headers }
  }
  const write = async (url, payload) => {
    const csrf = await request(url.startsWith(prefix) ? prefix + '/csrf' : '/api/account/csrf')
    return request(url, 'POST', payload, { 'x-csrf-token': csrf.body.token })
  }
  return { request, write, cookies, manage: (code, command) => write(`${prefix}/rooms/${code}/manage`, command), bind: (code, token) => write(`${prefix}/rooms/${code}/bind`, { ownerToken: token }) }
}
const registration = username => ({ username, nickname: '合成房主', password: 'fixture account password', confirmPassword: 'fixture account password', questions: [
  { question: '私密短语一？', answer: 'quiet garden' }, { question: '私密短语二？', answer: 'mint valley' }, { question: '私密短语三？', answer: 'orange forest' },
] })

test('UID绑定、跨设备管理、房间隔离、停用清理、防重放、迁移与持久化失败（仅模拟豆包）', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hakisub-owner-test-')), path = join(directory, 'rooms.json')
  const encryptionKey = Buffer.alloc(32, 11).toString('base64'), clients = [], upstreams = []
  let gateway, accounts, base, failSave = false, delaySave = false, releaseSave
  async function startGateway() {
    const store = await createRoomStore(path, encryptionKey)
    gateway = createAsrGateway({ roomStore: { list: store.list, save: async room => {
      if (delaySave) await new Promise(resolve => { releaseSave = resolve })
      if (failSave) throw Error('synthetic storage outage')
      await store.save(room)
    } }, apiKey: 'synthetic-server-default-must-never-be-used', allowedOrigins: [origin], allowLegacyAsr: false, enableSettings: false,
    roomManagementSecret: secret, maxAsrSessions: 2, probeRoomKey: async key => ({ ok: key.startsWith('synthetic-room-'), message: 'unsafe-provider-detail-' + key }),
    connectUpstream: (_url, options) => { const upstream = new FakeUpstream(options.headers['X-Api-Key']); upstreams.push(upstream); return upstream } })
    gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
    base = `http://127.0.0.1:${gateway.server.address().port}`
  }
  async function room(command) {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/rooms', { origin }), events = []
    clients.push(socket); socket.on('message', packet => events.push(JSON.parse(packet)))
    await once(socket, 'open'); socket.send(JSON.stringify({ name: 'Fixture', ...command }))
    await waitFor(() => events.some(event => event.type === 'joined'))
    return { socket, events, identity: events.find(event => event.type === 'joined') }
  }
  const anonymousSettings = (person, command) => fetch(base + '/api/rooms/settings', { method: command ? 'POST' : 'GET', headers: { Origin: origin, Authorization: `Bearer ${person.identity.token}`, ...(command ? { 'Content-Type': 'application/json' } : {}) }, ...(command ? { body: JSON.stringify(command) } : {}) })
  async function audio(person) {
    person.socket.send(JSON.stringify({ type: 'mic', mic: true }))
    await waitFor(() => person.events.some(event => event.type === 'members' && event.members.some(member => member.id === person.identity.memberId && member.mic)))
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/asr?session=' + person.identity.token, { origin })
    clients.push(socket); socket.on('message', () => {})
    await once(socket, 'open'); return socket
  }
  async function rejectedAudio(person) {
    person.socket.send(JSON.stringify({ type: 'mic', mic: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/asr?session=' + person.identity.token, { origin })
    clients.push(socket)
    assert.match(await new Promise(resolve => socket.once('error', error => resolve(error.message))), /403/)
  }
  async function signed(command, overrides = {}) {
    const { audience } = await (await fetch(base + '/internal/rooms/challenge')).json()
    const body = JSON.stringify({ audience, issuedAt: Date.now(), nonce: randomUUID(), command, ...overrides })
    const signature = createHmac('sha256', secret).update('POST\n/internal/rooms/manage\n' + body).digest('hex')
    return { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HakiSub-Signature': signature }, body }
  }
  try {
    const seed = await createRoomStore(path, encryptionKey)
    await seed.save({ code: '114514', aliases: ['985529'], ownerHash, apiKey: 'synthetic-room-legacy' })
    await seed.save({ code: '222222', ownerHash, apiKey: '' })
    const legacy = JSON.parse(await readFile(path, 'utf8')); legacy.version = 1
    const nonce = Buffer.alloc(12, 3), cipher = createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64'), nonce)
    cipher.setAAD(Buffer.from('114514'))
    const ciphertext = Buffer.concat([cipher.update('synthetic-room-legacy', 'utf8'), cipher.final()])
    legacy.rooms[0].encryptedKey = { nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
    for (const entry of legacy.rooms) { delete entry.ownerUid; delete entry.asrEnabled; delete entry.keyState }
    await writeFile(path, JSON.stringify(legacy))
    await startGateway()
    const config = { development: false, secret: 'synthetic-account-secret-at-least-forty-three-characters', origin: accountOrigin, projectOrigin: origin,
      databasePath: join(directory, 'accounts.sqlite'), trustedProxies: [], limits: { registrationAttempts: 5, registrationSuccesses: 3, dailyWarning: 100 },
      hashing: { memoryCost: 19456, timeCost: 2, parallelism: 1 }, hashConcurrency: 1, hashQueue: 8, sessionMaximumMs: 86400000, sessionIdleMs: 86400000,
      roomGatewayUrl: base, roomManagementSecret: secret }
    accounts = await createAccountServer(config)
    const a = accountClient(accounts, '203.0.113.1'), b = accountClient(accounts, '203.0.113.2'), guest = accountClient(accounts, '203.0.113.3')
    const userA = await a.write('/api/account/register', registration('fixture_alice'))
    const userB = await b.write('/api/account/register', { ...registration('fixture_bob'), nickname: '一二三四五六七八' })
    assert.equal(userA.status, 201); assert.equal(userB.status, 201)
    const internalA = accounts.database.prepare('SELECT id FROM users WHERE public_uid=?').get(userA.body.user.uid).id
    const internalB = accounts.database.prepare('SELECT id FROM users WHERE public_uid=?').get(userB.body.user.uid).id
    assert.equal((await guest.request(prefix + '/rooms')).status, 401)
    assert.equal((await guest.bind('114514', ownerToken)).status, 401)
    assert.equal((await a.request(prefix + '/rooms/114514/manage', 'POST', { action: 'delete' })).status, 403, 'CSRF required')
    assert.equal((await a.request(prefix + '/rooms', 'GET', undefined, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await a.write(prefix + '/rooms/114514/bind', { ownerToken, uid: userB.body.user.uid })).status, 400, '客户端UID不能参与授权')
    assert.equal((await a.bind('114514', randomUUID())).status, 403)
    assert.equal((await b.manage('114514', { action: 'delete' })).status, 403, '仅房间号不能管理')
    const original = await room({ type: 'join', code: '985529', ownerToken })
    assert.equal(original.identity.code, '114514'); assert.equal(original.identity.isOwner, true)
    assert.equal((await (await anonymousSettings(original)).json()).configured, false, '旧有效密文绝不能恢复为凭据')
    await rejectedAudio(original)
    assert.equal((await anonymousSettings(original, { action: 'save', apiKey: 'synthetic-room-legacy' })).status, 200)
    assert.equal((await anonymousSettings(original, { action: 'reveal' })).status, 400)
    const emptyLegacy = await room({ type: 'join', code: '222222', ownerToken })
    assert.equal((await (await anonymousSettings(emptyLegacy)).json()).keyState, 'missing')
    await rejectedAudio(emptyLegacy)
    const anonymous = await room({ type: 'create' })
    assert.equal((await anonymousSettings(anonymous, { action: 'save', apiKey: 'synthetic-room-other' })).status, 200)
    failSave = true
    assert.equal((await a.bind('985529', ownerToken)).status, 500, '绑定失败不能撤销匿名凭据或假装成功')
    failSave = false
    assert.equal((await (await anonymousSettings(original)).json()).readOnly, false)
    assert.equal((await a.bind('985529', ownerToken)).status, 200)
    assert.equal((await a.manage('114514', { action: 'avatar', avatarId: 'cat' })).status, 200)
    assert.equal((await a.request(prefix + '/rooms')).body.rooms[0].avatarId, 'cat')
    assert.equal((await b.manage('114514', { action: 'avatar', avatarId: 'book' })).status, 403)
    assert.equal((await a.manage('114514', { action: 'avatar', avatarId: 'unknown' })).status, 400)
    assert.equal((await a.manage('114514', { action: 'rename', name: '合成房主的房间', avatarId: 'book' })).status, 400)
    assert.equal((await a.request(prefix + '/rooms')).body.rooms[0].name, '合成房主的房间', '默认名来自服务端真实账号昵称')
    assert.equal((await b.manage('114514', { action: 'rename', name: '偷改名称' })).status, 403)
    assert.equal((await a.manage('114514', { action: 'rename', name: '' })).status, 400)
    assert.equal((await a.write(prefix + '/rooms/114514/bind', { ownerToken, nickname: '伪造昵称' })).status, 400)
    assert.equal((await anonymousSettings(anonymous, { action: 'rename', name: '游客自定义房间' })).status, 200)
    assert.equal((await b.bind('114514', ownerToken)).status, 409)
    assert.equal((await a.bind('114514', ownerToken)).status, 409)
    assert.equal((await anonymousSettings(original, { action: 'delete' })).status, 403, '绑定后已连接旧房主也撤权')
    assert.equal((await anonymousSettings(original, { action: 'reveal' })).status, 403)
    assert.equal((await b.manage('114514', { action: 'reveal' })).status, 400)
    assert.equal((await guest.manage('114514', { action: 'reveal' })).status, 400, '已移除的原文读取动作被拒绝')
    const oldToken = await room({ type: 'join', code: '114514', ownerToken })
    assert.equal(oldToken.identity.isOwner, false)
    assert.equal((await anonymousSettings(oldToken, { action: 'asr', enabled: false })).status, 403)
    assert.equal((await b.bind(anonymous.identity.code, anonymous.identity.ownerToken)).status, 200)
    assert.equal((await b.request(prefix + '/rooms')).body.rooms[0].name, '游客自定义房间', '后续绑定保留已自定义名称')
    const longNicknameRoom = await room({ type: 'create' })
    const longNicknameBound = await b.bind(longNicknameRoom.identity.code, longNicknameRoom.identity.ownerToken)
    assert.equal(longNicknameBound.status, 200)
    assert.equal(longNicknameBound.body.room.name, '一二三四五六七八的房间', '长昵称默认名预留后缀，总长不超过12字')
    assert.equal((await a.manage(anonymous.identity.code, { action: 'save', apiKey: 'synthetic-theft' })).status, 403)
    assert.equal((await b.manage('114514', { action: 'asr', enabled: false })).status, 403)
    const anotherDevice = accountClient(accounts, '203.0.113.4')
    assert.equal((await anotherDevice.write('/api/account/login', { username: 'fixture_alice', password: registration('').password })).status, 200)
    const owned = await anotherDevice.request(prefix + '/rooms')
    assert.deepEqual(owned.body.rooms.map(item => item.code), ['114514'])
    assert.equal(owned.body.rooms[0].asrEnabled, true)
    assert.equal(JSON.stringify(owned.body).includes(ownerToken), false)
    assert.equal(JSON.stringify(owned.body).includes('synthetic-room-legacy'), false)
    const shown = await anotherDevice.manage('114514', { action: 'reveal' })
    assert.equal(shown.status, 400); assert.equal(shown.body.apiKey, undefined)
    assert.equal(shown.headers['cache-control'], 'no-store')
    assert.equal((await anotherDevice.manage('114514', { action: 'save', apiKey: '********' })).status, 400)
    assert.equal(original.events.some(event => JSON.stringify(event).includes('synthetic-room-legacy')), false)
    const probe = await anotherDevice.manage('114514', { action: 'test' })
    assert.equal(probe.body.ok, true); assert.equal(JSON.stringify(probe.body).includes('synthetic-room-legacy'), false)
    const originalAudio = await audio(original), otherAudio = await audio(anonymous)
    const originalUpstream = upstreams.at(-2), otherUpstream = upstreams.at(-1)
    const renamed = await anotherDevice.manage('114514', { action: 'rename', name: '  周末交流  ' })
    assert.equal(renamed.status, 200); assert.equal(renamed.body.room.name, '周末交流')
    assert.equal(originalUpstream.readyState, 1, '改名不停止现有语音会话')
    await waitFor(() => original.events.some(event => event.type === 'room-status' && event.name === '周末交流'))
    failSave = true
    assert.equal((await anotherDevice.manage('114514', { action: 'rename', name: '磁盘失败' })).status, 500)
    failSave = false
    const retained = (await anotherDevice.request(prefix + '/rooms')).body.rooms[0]
    assert.equal(retained.name, '周末交流'); assert.equal(retained.configured, true)
    assert.equal(originalUpstream.readyState, 1, '改名写失败仍保留Key及音频')
    originalAudio.pause()
    assert.equal((await anotherDevice.manage('114514', { action: 'asr', enabled: false })).status, 200)
    assert.equal(originalUpstream.readyState, 3, '暂停立即终止上游')
    assert.equal(otherUpstream.readyState, 1, '不影响别的房间')
    await waitFor(() => original.events.some(event => event.type === 'room-status' && event.asrEnabled === false))
    await rejectedAudio(original)
    assert.equal(original.socket.readyState, WebSocket.OPEN, '暂停不退出房间')
    original.socket.send(JSON.stringify({ type: 'caption', utteranceId: 'browser-while-cloud-paused', text: '合成浏览器字幕', state: 'final' }))
    await waitFor(() => original.events.some(event => event.type === 'caption' && event.utteranceId === 'browser-while-cloud-paused'))
    assert.equal(otherUpstream.readyState, 1, '暂停云端不改变浏览器字幕广播')
    assert.equal((await anotherDevice.manage('114514', { action: 'asr', enabled: true })).status, 200)
    assert.equal(upstreams.length, 2, '恢复不自动开麦或连接')
    const resumedAudio = await audio(original)
    assert.equal(upstreams.at(-1).key, 'synthetic-room-legacy', '旧close未完成也释放并发名额')
    originalAudio.resume()
    assert.equal((await anotherDevice.manage('114514', { action: 'save', apiKey: 'synthetic-room-new' })).status, 200)
    assert.equal(upstreams.at(-1).readyState, 3, '换Key立即清理旧上游')
    await audio(original)
    assert.equal(upstreams.at(-1).key, 'synthetic-room-new')
    assert.equal((await anotherDevice.manage('114514', { action: 'delete' })).status, 200)
    assert.equal(upstreams.at(-1).readyState, 3)
    await rejectedAudio(original)
    assert.ok(upstreams.every(item => item.key !== 'synthetic-server-default-must-never-be-used'))
    let record = (await anotherDevice.request(prefix + '/rooms')).body.rooms[0]
    assert.equal(record.keyState, 'deleted'); assert.equal(record.asrEnabled, true)
    assert.equal((await anotherDevice.manage('114514', { action: 'asr', enabled: false })).status, 200)
    assert.equal((await anotherDevice.manage('114514', { action: 'save', apiKey: 'synthetic-room-final' })).status, 200)
    const persisted = await readFile(path, 'utf8')
    assert.equal(persisted.includes('synthetic-room-final'), false)
    assert.equal(persisted.includes(ownerToken), false)
    assert.equal(JSON.parse(persisted).version, 5)
    assert.equal(persisted.includes('encryptedKey'), false)
    assert.notEqual(JSON.parse(persisted).rooms.find(item => item.code === '114514').ownerHash, ownerHash, '绑定时原摘要永久撤销')
    assert.deepEqual(accounts.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%room%'").all().map(row => row.name), ['hakisub_room_presets'], '账号库只有既有偏好存档，没有Key或所有权镜像')
    const command = { action: 'list', uid: internalA }, packet = await signed(command)
    assert.equal((await fetch(base + '/internal/rooms/manage', packet)).status, 200)
    assert.equal((await fetch(base + '/internal/rooms/manage', packet)).status, 403, '重放被拒绝')
    assert.equal((await fetch(base + '/internal/rooms/manage', { ...packet, body: packet.body.replace(internalA, internalB) })).status, 403)
    assert.equal((await fetch(base + '/internal/rooms/manage', await signed(command, { issuedAt: Date.now() - 20000 }))).status, 403)
    assert.equal((await fetch(base + '/internal/rooms/manage', { ...await signed(command), headers: { 'Content-Type': 'application/json' } })).status, 403)
    assert.equal((await fetch(base + '/internal/rooms/manage', { ...await signed(command), headers: { ...(await signed(command)).headers, Origin: accountOrigin } })).status, 403)
    assert.equal((await fetch(base + '/internal/rooms/manage?proxy=1', await signed(command))).status, 403)
    const beforeRestart = await signed(command)
    clients.forEach(socket => socket.terminate()); await gateway.close()
    await accounts.app.close(); accounts = undefined
    await startGateway()
    accounts = await createAccountServer({ ...config, roomGatewayUrl: base })
    const restoredDevice = accountClient(accounts, '203.0.113.5')
    restoredDevice.cookies.set('__Host-xdstar_session', anotherDevice.cookies.get('__Host-xdstar_session'))
    record = (await restoredDevice.request(prefix + '/rooms')).body.rooms[0]
    assert.equal(record.name, '周末交流', '账号跨设备与服务重启保留自定义名称')
    assert.equal(record.code, '114514'); assert.equal(record.asrEnabled, false); assert.equal(record.keyState, 'missing')
    assert.equal((await fetch(base + '/internal/rooms/manage', beforeRestart)).status, 403, '网关重启后旧签名失效')
    const restoredMember = await room({ type: 'join', code: '985529', ownerToken })
    assert.equal(restoredMember.identity.code, '114514'); assert.equal(restoredMember.identity.isOwner, false)
    await rejectedAudio(restoredMember)
    const persistedStore = await createRoomStore(path, encryptionKey)
    assert.equal(persistedStore.list().find(item => item.code === '114514').apiKey, undefined)
    assert.equal((await restoredDevice.manage('114514', { action: 'asr', enabled: true })).status, 200)
    await rejectedAudio(restoredMember)
    assert.equal((await restoredDevice.manage('114514', { action: 'save', apiKey: 'synthetic-room-refilled' })).status, 200)
    await audio(restoredMember)
    delaySave = true
    const pending = restoredDevice.manage('114514', { action: 'asr', enabled: false })
    await waitFor(() => !!releaseSave)
    assert.equal(upstreams.at(-1).readyState, 3, '慢持久化期间旧Key会话已清理')
    await rejectedAudio(restoredMember)
    const racingDevice = accountClient(accounts, '203.0.113.6')
    racingDevice.cookies.set('__Host-xdstar_session', restoredDevice.cookies.get('__Host-xdstar_session'))
    assert.equal((await racingDevice.manage('114514', { action: 'delete' })).status, 409)
    assert.equal((await racingDevice.manage('114514', { action: 'save', apiKey: 'synthetic-room-race' })).status, 409)
    assert.equal((await racingDevice.manage('114514', { action: 'asr', enabled: true })).status, 409)
    releaseSave(); delaySave = false; assert.equal((await pending).status, 200)
    assert.equal((await restoredDevice.manage('114514', { action: 'asr', enabled: true })).status, 200)
    await audio(restoredMember)
    failSave = true
    assert.equal((await restoredDevice.manage('114514', { action: 'asr', enabled: false })).status, 500)
    assert.equal(upstreams.at(-1).readyState, 3)
    await rejectedAudio(restoredMember)
    record = (await restoredDevice.request(prefix + '/rooms')).body.rooms[0]
    assert.equal(record.configured, false, '持久开关写失败清掉当前Key')
    assert.equal(record.asrEnabled, true, '开关写失败不假装持久暂停成功')
    assert.equal((await restoredDevice.manage('114514', { action: 'save', apiKey: 'synthetic-memory-during-disk-outage' })).status, 200)
    await audio(restoredMember)
    assert.equal((await restoredDevice.manage('114514', { action: 'delete' })).status, 200)
    assert.equal(upstreams.at(-1).readyState, 3)
    await rejectedAudio(restoredMember)
    failSave = false
    assert.equal((await restoredDevice.request(prefix + '/rooms')).body.rooms[0].keyState, 'deleted')
    const afterDelete = (await createRoomStore(path, encryptionKey)).list().find(item => item.code === '114514')
    assert.equal(afterDelete.keyState, undefined); assert.equal(afterDelete.apiKey, undefined); assert.equal(afterDelete.ownerUid, internalA)
    await restoredDevice.write('/api/account/logout', {})
    assert.equal((await restoredDevice.manage('114514', { action: 'asr', enabled: true })).status, 401)
    const noService = createRoomManagementClient({ roomGatewayUrl: base, roomManagementSecret: secret }, async () => { throw Error('synthetic offline') })
    await assert.rejects(noService(command, () => {}), error => error.statusCode === 503)
    await assert.rejects(createRoomManagementClient({})(command, () => {}), error => error.statusCode === 503)
    const invalidSession = createRoomManagementClient({ roomGatewayUrl: base, roomManagementSecret: secret })
    await assert.rejects(invalidSession(command, () => { throw Object.assign(Error('expired'), { statusCode: 401 }) }), error => error.statusCode === 401)
    resumedAudio.terminate(); otherAudio.terminate()
  } finally {
    clients.forEach(socket => socket.terminate()); await gateway?.close(); await accounts?.app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
