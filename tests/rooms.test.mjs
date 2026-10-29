import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import WebSocket from 'ws'
import { createAsrGateway } from '../server/asrGateway.mjs'

const origin = 'http://127.0.0.1:5173'
const waitFor = async predicate => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw Error('等待消息超时')
}
class FakeUpstream extends EventEmitter {
  readyState = 0; bufferedAmount = 0; sent = []
  send(packet, callback) { this.sent.push(packet); callback?.() }
  terminate() { this.readyState = 3 }
  open() { this.readyState = 1; this.emit('open') }
  caption(text) {
    const body = gzipSync(Buffer.from(JSON.stringify({ result: { utterances: [{ text, definite: true, start_time: 0, end_time: 500 }] } })))
    const header = Buffer.from([0x11, 0x90, 0x11, 0, 0, 0, 0, 0]); header.writeUInt32BE(body.length, 4)
    this.emit('message', Buffer.concat([header, body]), true)
  }
}
const upstreams = []
const gateway = createAsrGateway({ apiKey: 'fixture-only', connectUpstream() {
  const upstream = new FakeUpstream(); upstreams.push(upstream); return upstream
} })
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const base = `ws://127.0.0.1:${gateway.server.address().port}`
const connections = []
async function connect(path = '/api/rooms', customOrigin = origin) {
  const socket = new WebSocket(base + path, { origin: customOrigin }), events = []
  connections.push(socket)
  socket.on('message', data => events.push(JSON.parse(data)))
  await once(socket, 'open')
  return { socket, events, send: event => socket.send(JSON.stringify(event)) }
}
async function reject(path, customOrigin = origin) {
  const socket = new WebSocket(base + path, { origin: customOrigin })
  assert.match(await new Promise(resolve => socket.on('error', error => resolve(error.message))), /403/)
}
try {
  await reject('/api/rooms', 'https://untrusted.example')
  const alice = await connect(); alice.send({ type: 'create', name: 'Alice' })
  await waitFor(() => alice.events.some(event => event.type === 'joined'))
  const identity = alice.events.find(event => event.type === 'joined')
  assert.match(identity.code, /^\d{6}$/)
  const bob = await connect(); bob.send({ type: 'join', code: identity.code, name: 'Bob' })
  await waitFor(() => bob.events.some(event => event.type === 'members' && event.members.length === 2))
  const bobIdentity = bob.events.find(event => event.type === 'joined')
  assert.notEqual(identity.memberId, bobIdentity.memberId)
  assert.equal(JSON.stringify(bob.events).includes(identity.token), false)
  const other = await connect(); other.send({ type: 'create', name: 'Other' })
  await waitFor(() => other.events.some(event => event.type === 'joined'))
  for (const person of [alice, other]) {
    const response = await fetch(base.replace('ws:', 'http:') + '/api/rooms/settings', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${person.events.find(event => event.type === 'joined').token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', apiKey: 'fixture-room-only' }) })
    assert.equal(response.status, 200)
  }
  await reject('/api/asr?session=invalid')
  await reject(`/api/asr?session=${identity.token}`) // 未开麦
  alice.send({ type: 'mic', mic: true }); bob.send({ type: 'mic', mic: true })
  await waitFor(() => alice.events.at(-1)?.members?.every(member => member.mic))
  const audioAlice = await connect(`/api/asr?session=${identity.token}`)
  const audioBob = await connect(`/api/asr?session=${bobIdentity.token}`)
  assert.equal(upstreams.length, 2)
  await reject(`/api/asr?session=${identity.token}`) // 每成员最多一路
  upstreams.forEach(upstream => upstream.open())
  await waitFor(() => audioBob.events.some(event => event.type === 'ready'))
  audioAlice.socket.send(Buffer.alloc(6400, 1)); audioBob.socket.send(Buffer.alloc(6400, 2))
  await waitFor(() => upstreams.every(upstream => upstream.sent.length === 2))
  upstreams[0].caption('甲的话'); upstreams[1].caption('乙的话')
  await waitFor(() => audioAlice.events.some(event => event.type === 'caption') && audioBob.events.some(event => event.type === 'caption'))
  const captionAlice = audioAlice.events.find(event => event.type === 'caption')
  const captionBob = audioBob.events.find(event => event.type === 'caption')
  assert.equal(audioAlice.events.some(event => event.text === '乙的话'), false)
  assert.equal(audioBob.events.some(event => event.text === '甲的话'), false)
  // 浏览器将统一事件送入房间；冒用 memberId 也只能更新自己的卡片。
  alice.send({ ...captionAlice, memberId: bobIdentity.memberId })
  bob.send(captionBob)
  await waitFor(() => bob.events.filter(event => event.type === 'caption').length === 2)
  assert.deepEqual(bob.events.filter(event => event.type === 'caption').map(event => [event.memberId, event.text]), [[identity.memberId, '甲的话'], [bobIdentity.memberId, '乙的话']])
  assert.equal(other.events.some(event => event.type === 'caption'), false)
  alice.send({ type: 'caption', utteranceId: 'pending', text: '未完', state: 'interim' })
  alice.send({ type: 'discard', utteranceId: 'pending' })
  await waitFor(() => bob.events.some(event => event.type === 'discard'))
  const extras = []
  for (let index = 0; index < 6; index++) {
    const extra = await connect(); extra.send({ type: 'join', name: `Extra${index}`, code: identity.code })
    await waitFor(() => extra.events.some(event => event.type === 'joined')); extras.push(extra)
    assert.equal(extra.events.some(event => event.type === 'caption'), false, '新成员不补发历史字幕')
  }
  for (const extra of extras) extra.send({ type: 'mic', mic: true })
  await waitFor(() => alice.events.at(-1)?.members?.length === 8 && alice.events.at(-1).members.every(member => member.mic))
  for (const extra of extras) {
    await connect(`/api/asr?session=${extra.events.find(event => event.type === 'joined').token}`)
    upstreams.at(-1).open()
  }
  assert.equal(upstreams.length, 8, '八位成员可以各建一路识别连接')
  other.send({ type: 'mic', mic: true })
  await waitFor(() => other.events.at(-1)?.members?.[0]?.mic)
  await reject(`/api/asr?session=${other.events.find(event => event.type === 'joined').token}`)
  const ninth = await connect(); ninth.send({ type: 'join', name: 'Ninth', code: identity.code })
  await waitFor(() => ninth.events.some(event => event.type === 'error'))
  assert.match(ninth.events.at(-1).message, /已满/)
  bob.send({ type: 'mic', mic: false })
  await waitFor(() => upstreams[1].readyState === 3)
  assert.equal(upstreams[0].readyState, 1, '关麦不影响别人的上游')
  alice.socket.close(); await once(alice.socket, 'close')
  await waitFor(() => upstreams[0].readyState === 3)
  await reject(`/api/asr?session=${identity.token}`)
  for (const person of [bob, ...extras]) person.socket.close()
  await waitFor(() => extras.every(extra => extra.socket.readyState === 3) && bob.socket.readyState === 3)
  const returning = await connect(); returning.send({ type: 'join', name: 'Returning', code: identity.code, ownerToken: identity.ownerToken })
  await waitFor(() => returning.events.some(event => event.type === 'joined'))
  const returned = returning.events.find(event => event.type === 'joined')
  assert.equal(returned.isOwner, true)
  assert.notEqual(returned.token, identity.token)
  assert.equal(returning.events.some(event => event.type === 'caption'), false)
} finally {
  connections.forEach(socket => socket.terminate())
  await gateway.close()
}

// 客户端使用假 WebSocket 验证连接、身份、事件及主动关闭后的迟到回调。
const source = readFileSync(new URL('../src/roomClient.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const context = vm.createContext({ setTimeout, clearTimeout })
vm.runInContext(ts.transpile(source + '\nglobalThis.factory = createRoomClient', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
let fake, joined, members, caption, reaction, discarded, closed = 0, error
const client = context.factory({
  onJoined: (...args) => joined = args, onMembers: value => members = value,
  onCaption: value => caption = value, onDiscard: (...args) => discarded = args,
  onReaction: value => reaction = value,
  onClose: () => closed++, onError: value => error = value,
}, () => fake = { readyState: 1, bufferedAmount: 0, sent: [], send(data) { this.sent.push(JSON.parse(data)) }, close() { this.closed = true } })
client.connect('create', 'Alice', ''); fake.onopen()
assert.equal(fake.sent[0].name, 'Alice')
const emit = event => fake.onmessage({ data: JSON.stringify(event) })
emit({ type: 'joined', code: '123456', memberId: 'alice', token: 'ephemeral' })
assert.deepEqual(joined.slice(0, 2), ['123456', 'alice']); assert.equal(joined[2].isOwner, false); assert.equal(client.getToken(), 'ephemeral')
emit({ type: 'joined', code: '114514', memberId: 'alice', token: 'ephemeral', aliases: ['985529', 123456, 'bad'] })
assert.deepEqual(Array.from(joined[2].aliases), ['985529'])
emit({ type: 'members', members: [{ id: 'alice' }] }); assert.equal(members[0].id, 'alice')
emit({ type: 'caption', memberId: 'alice', text: '你好' }); assert.equal(caption.text, '你好')
emit({ type: 'reaction', id: 'r', senderId: 'bob', targetId: 'alice', reaction: 'agree' }); assert.equal(reaction.targetId, 'alice')
emit({ type: 'discard', memberId: 'alice', utteranceId: 'one' }); assert.deepEqual(discarded, ['alice', 'one'])
client.close(); assert.equal(client.getToken(), ''); assert.equal(fake.onmessage, null); assert.equal(closed, 0)
client.connect('join', 'Bob', '123456'); fake.onclose(); assert.equal(closed, 1)
client.connect('create', 'Alice', ''); fake.onmessage({ data: '{bad' }); assert.match(error, /无法解析/); assert.equal(closed, 2)
console.log('通过：真实本地 WebSocket 创建/加入/满员/销毁、成员身份隔离、跨房间隔离、双路假豆包并发/独立音频/字幕、关麦离房清理、令牌撤销及房间客户端事件。未调用真实豆包或麦克风。')
