import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createRoomAccess } from '../server/roomAccess.mjs'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { once } from 'node:events'
import WebSocket from 'ws'
let time = 0
const access = createRoomAccess({ now: () => time }), room = { accessVersion: 'v1' }
const credential = access.issueResume(room, { id: 'a', owner: false })
assert.ok(access.resume(room, credential)); assert.equal(access.resume({}, credential), undefined)
room.accessVersion = 'v2'; assert.equal(access.resume(room, credential), undefined)
room.accessVersion = 'v1'; time = 30 * 60 * 1000; assert.equal(access.resume(room, credential), undefined)
let clock = 0, nextTimer = 0, joined = 0, closed = 0, fatal = 0
const timers = new Map(), sockets = []
const context = vm.createContext({ setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: clock + delay }); return id }, clearTimeout(id) { timers.delete(id) } })
vm.runInContext(ts.transpile(readFileSync(new URL('../src/roomClient.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '') + '\nglobalThis.create = createRoomClient', { target: ts.ScriptTarget.ES2022 }), context)
const client = context.create({ onJoined() { joined++ }, onMembers() {}, onCaption() {}, onDiscard() {}, onError() {}, onFatal() { fatal++ }, onClose() { closed++ } }, () => {
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(value) { this.sent.push(JSON.parse(value)) }, close() {} }; sockets.push(socket); return socket
})
const advance = ms => { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn() } }
const join = socket => { socket.onopen(); socket.onmessage({ data: JSON.stringify({ type: 'joined', code: '123456', memberId: 'new', token: 'session', reconnectToken: credential }) }) }
client.connect('join', '游客', '123456', undefined, { password: '0042' }); join(sockets[0]); assert.equal(joined, 1)
const stale = sockets[0].onclose; stale({ code: 1006 }); assert.equal(closed, 1)
advance(999); assert.equal(sockets.length, 1); advance(1); assert.equal(sockets.length, 2)
stale({ code: 1006 }); assert.equal(closed, 1, '旧回调不干扰新连接')
sockets[1].onopen(); assert.equal(sockets[1].sent[0].password, undefined); assert.equal(sockets[1].sent[0].reconnectToken, credential)
sockets[1].onerror(); advance(2000); assert.equal(sockets.length, 3)
client.suspend(); advance(60000); assert.equal(sockets.length, 3); client.resume(); client.resume(); assert.equal(sockets.length, 4)
join(sockets[3]); assert.equal(client.send({ type: 'mic', mic: false }), true)
sockets[3].onmessage({ data: JSON.stringify({ type: 'error', message: 'not found', reason: 'room-not-found' }) }) // 会话内错误不终止
client.suspend(); client.resume(); sockets.at(-1).onmessage({ data: JSON.stringify({ type: 'error', message: 'not found', reason: 'room-not-found' }) })
assert.equal(fatal, 1); advance(60000); assert.equal(timers.size, 0)
const gateway = createAsrGateway({ allowedOrigins: ['http://localhost'], connectUpstream() { throw Error('禁止真实ASR') } })
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const peers = [], url = `ws://127.0.0.1:${gateway.server.address().port}/api/rooms`
async function connect(command) {
  const socket = new WebSocket(url, { origin: 'http://localhost' }), events = []; peers.push(socket)
  socket.on('message', data => events.push(JSON.parse(data))); await once(socket, 'open'); socket.send(JSON.stringify({ name: '测试', ...command }))
  for (let i = 0; i < 200 && !events.some(e => e.type === 'joined' || e.type === 'error'); i++) await new Promise(r => setTimeout(r, 5))
  return { socket, events, identity: events.find(e => e.type === 'joined') }
}
try {
  const owner = await connect({ type: 'create', password: '0042' }), code = owner.identity.code
  const guest = await connect({ type: 'join', code, password: '0042' })
  for (let i = 0; i < 6; i++) assert.ok((await connect({ type: 'join', code, password: '0042' })).identity)
  const replacement = await connect({ type: 'join', code, reconnectToken: guest.identity.reconnectToken })
  assert.ok(replacement.identity, '八人满房也可替换旧连接'); assert.notEqual(replacement.identity.memberId, guest.identity.memberId)
  const members = replacement.events.filter(e => e.type === 'members').at(-1).members
  assert.equal(members.length, 8); assert.equal(members.filter(m => m.id === guest.identity.memberId).length, 0)
  assert.equal(members.find(m => m.id === replacement.identity.memberId).mic, false)
  const changed = await fetch(url.replace('ws:', 'http:').replace('/api/rooms', '/api/rooms/settings'), { method: 'POST', headers: { Origin: 'http://localhost', Authorization: `Bearer ${owner.identity.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'access-code', accessCode: '1234' }) })
  assert.equal(changed.status, 200)
  const invalid = await connect({ type: 'join', code, reconnectToken: guest.identity.reconnectToken })
  assert.equal(invalid.identity, undefined); assert.equal(invalid.events[0].reason, 'password-required')
} finally { for (const peer of peers) peer.terminate(); await gateway.close() }
console.log('通过：短期凭据房间/版本/期限、单连接退避/旧回调/挂起/恢复/永久错误、八人满房替换、改码立即失效；无真实音频或线上数据。')
