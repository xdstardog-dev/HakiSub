import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import WebSocket from 'ws'
import { createAccountServer } from '../server/accountServer.mjs'
import { createAsrGateway } from '../../server/asrGateway.mjs'
import { createRoomStore } from '../../server/roomStore.mjs'

const directory = await mkdtemp(join(tmpdir(), 'hakisub-account-access-'))
const origin = 'https://hakisub.example', accountOrigin = 'https://account.example', prefix = '/api/projects/hakisub'
const secret = 'synthetic-account-room-access-secret-at-least-forty-three-characters'
const configuration = { development: false, secret: 'synthetic-account-cookie-secret-at-least-forty-three-characters', origin: accountOrigin, projectOrigin: origin,
  databasePath: join(directory, 'accounts.sqlite'), trustedProxies: [], limits: { registrationAttempts: 10, registrationSuccesses: 10, dailyWarning: 100 },
  hashing: { memoryCost: 19456, timeCost: 2, parallelism: 1 }, hashConcurrency: 1, hashQueue: 8, sessionMaximumMs: 86400000, sessionIdleMs: 86400000,
  roomManagementSecret: secret }
const sockets = []
let accounts, gateway, base
async function start() {
  gateway = createAsrGateway({ allowedOrigins: [origin], roomManagementSecret: secret, roomStore: await createRoomStore(join(directory, 'rooms.json')),
    connectUpstream() { throw Error('账号入房测试禁止真实ASR') } })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  base = `http://127.0.0.1:${gateway.server.address().port}`
  accounts = await createAccountServer({ ...configuration, roomGatewayUrl: base })
}
function client(ip) {
  const cookies = new Map()
  async function request(url, method = 'GET', payload, extra = {}) {
    const response = await accounts.app.inject({ method, url, remoteAddress: ip, headers: { origin: accountOrigin, cookie: [...cookies.values()].join('; '),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, ...(payload === undefined ? {} : { payload }) })
    for (const value of [response.headers['set-cookie'] ?? []].flat()) { const entry = value.split(';')[0]; cookies.set(entry.split('=')[0], entry) }
    return { status: response.statusCode, body: response.json() }
  }
  async function write(url, payload) {
    const csrf = await request(url.startsWith(prefix) ? prefix + '/csrf' : '/api/account/csrf')
    return request(url, 'POST', payload, { 'x-csrf-token': csrf.body.token })
  }
  return { request, write, access: (code, password) => write(`${prefix}/rooms/${code}/access`, password === undefined ? {} : { password }),
    manage: (code, accessCode) => write(`${prefix}/rooms/${code}/manage`, { action: 'access-code', accessCode }) }
}
const registration = username => ({ username, nickname: '合成测试', password: 'synthetic account password', confirmPassword: 'synthetic account password', questions: [
  { question: '测试短语一是什么？', answer: 'mint garden' }, { question: '测试短语二是什么？', answer: 'blue forest' }, { question: '测试短语三是什么？', answer: 'orange hill' },
] })
async function room(command) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/rooms', { origin }), events = []
  sockets.push(socket); socket.on('message', packet => events.push(JSON.parse(packet)))
  await once(socket, 'open'); const first = once(socket, 'message')
  socket.send(JSON.stringify({ name: '合成访客', ...command })); await first
  return { socket, events, identity: events.find(event => event.type === 'joined') }
}
try {
  await start()
  const owner = client('203.0.113.11'), visitor = client('203.0.113.12'), outsider = client('203.0.113.13'), guest = client('203.0.113.14')
  for (const [person, name] of [[owner, 'entry_owner'], [visitor, 'entry_visitor'], [outsider, 'entry_outsider']]) assert.equal((await person.write('/api/account/register', registration(name))).status, 201)
  const created = await room({ type: 'create' }), code = created.identity.code
  assert.equal((await owner.write(`${prefix}/rooms/${code}/bind`, { ownerToken: created.identity.ownerToken })).status, 200)
  assert.equal((await owner.manage(code, '0064')).status, 200)
  assert.equal((await visitor.manage(code, '1234')).status, 403)
  assert.equal((await guest.access(code)).status, 401)
  assert.equal((await visitor.request(`${prefix}/rooms/${code}/access`, 'POST', {})).status, 403, 'CSRF验证保留')
  assert.equal((await visitor.write(`${prefix}/rooms/${code}/access`, { uid: 'forged', password: '0064' })).status, 400, '前端不能指定授权账号')
  assert.equal((await visitor.access(code, '123')).status, 400)
  assert.equal((await visitor.access(code)).body.requiresPassword, true)
  assert.equal((await visitor.access(code, '0000')).body.accessTicket, undefined)
  const verified = await visitor.access(code, '0064')
  assert.equal(verified.status, 200); assert.ok(verified.body.accessTicket)
  assert.equal('password' in verified.body, false); assert.equal('accessCode' in verified.body, false)
  assert.ok((await room({ type: 'join', code, accessTicket: verified.body.accessTicket })).identity)
  assert.equal((await outsider.access(code)).body.accessTicket, undefined, '其他登录账号不继承进房资格')
  assert.ok((await owner.access(code)).body.accessTicket, '合法房主账号免入房码')
  const anotherDevice = client('203.0.113.15')
  assert.equal((await anotherDevice.write('/api/account/login', { username: 'entry_visitor', password: registration('').password })).status, 200)
  assert.ok((await anotherDevice.access(code)).body.accessTicket, '同账号另一设备免输')
  sockets.forEach(socket => socket.terminate()); await accounts.app.close(); await gateway.close(); await start()
  assert.ok((await visitor.access(code)).body.accessTicket, '账号和网关重启后原登录会话及资格仍有效')
  assert.ok((await anotherDevice.access(code)).body.accessTicket)
  assert.equal((await owner.manage(code, '7640')).status, 200)
  assert.equal((await visitor.access(code)).body.accessTicket, undefined)
  assert.equal((await anotherDevice.access(code)).body.accessTicket, undefined, '改码跨设备统一失效')
  assert.ok((await anotherDevice.access(code, '7640')).body.accessTicket)
  assert.ok((await visitor.access(code)).body.accessTicket, '重新验证后同账号其他设备恢复免输')
  assert.equal((await anotherDevice.write('/api/account/logout', {})).status, 200)
  assert.equal((await anotherDevice.access(code)).status, 401, '退出账号后不能签发新入场票据')
  assert.equal((await owner.manage(code, '')).status, 200)
  assert.ok((await room({ type: 'join', code })).identity)
  const listed = await owner.request(prefix + '/rooms')
  assert.equal(listed.body.rooms[0].requiresPassword, false)
  assert.equal('accessCode' in listed.body.rooms[0], false)
  assert.equal('accessAccounts' in listed.body.rooms[0], false)
  console.log('通过：真实隔离SQLite/账号Cookie/CSRF/签名服务与WebSocket联调、四位入房码/房主权限/伪造UID拒绝、同账号跨设备和双服务重启免输、改码统一失效/重新验证、账号退出与公开房间兼容。未调用真实ASR或生产数据。')
} finally { sockets.forEach(socket => socket.terminate()); await accounts?.app.close(); await gateway?.close(); await rm(directory, { recursive: true, force: true }) }
