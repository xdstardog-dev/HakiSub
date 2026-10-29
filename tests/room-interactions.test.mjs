import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import WebSocket from 'ws'
import { createAsrGateway } from '../server/asrGateway.mjs'

const model = readFileSync(new URL('../src/roomInteractions.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const context = vm.createContext({})
vm.runInContext(ts.transpile(model + '\nglobalThis.interactions = { shouldSendTypedCaption, QUICK_REACTIONS };', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)

const waitFor = async predicate => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw Error('等待房间消息超时')
}
// 使用真实 HTTP/WebSocket 端口，不访问豆包、麦克风或现有房间资料。
const gateway = createAsrGateway({ connectUpstream() { throw Error('此测试不得请求云端') } })
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const base = `ws://127.0.0.1:${gateway.server.address().port}`
const connections = []
async function connect(name, code) {
  const socket = new WebSocket(`${base}/api/rooms`, { origin: 'http://127.0.0.1:5173' }), events = []
  connections.push(socket)
  socket.on('message', data => events.push(JSON.parse(data)))
  await once(socket, 'open')
  const send = event => socket.send(JSON.stringify(event))
  send({ type: code ? 'join' : 'create', name, code })
  await waitFor(() => events.some(event => event.type === 'joined'))
  return { socket, events, send, identity: events.find(event => event.type === 'joined') }
}
async function expectError(client, event, pattern) {
  const count = client.events.filter(event => event.type === 'error').length
  client.send(event)
  await waitFor(() => client.events.filter(event => event.type === 'error').length > count)
  assert.match(client.events.at(-1).message, pattern)
}
try {
  const alice = await connect('A'), bob = await connect('B', alice.identity.code), other = await connect('Other')
  const typed = text => ({ type: 'typed-caption', utteranceId: randomUUID(), text, memberId: bob.identity.memberId })
  await expectError(alice, typed('闭麦不能伪造打字'), /打字内容无效/)
  alice.send({ type: 'mode', mode: 'typing' })
  await waitFor(() => bob.events.at(-1)?.members?.find(member => member.id === alice.identity.memberId)?.mode === 'typing')
  const member = bob.events.at(-1).members.find(member => member.id === alice.identity.memberId)
  assert.equal(member.mic, false)
  await expectError(alice, typed(' '), /打字内容无效/)
  await expectError(alice, typed('中'.repeat(1001)), /打字内容无效/)
  await expectError(alice, typed('\u0000bad'), /打字内容无效/)
  await expectError(alice, { ...typed('bad'), utteranceId: {} }, /打字内容无效/)
  const message = typed('中文第一行\n第二行 👍')
  alice.send(message)
  await waitFor(() => bob.events.some(event => event.type === 'caption'))
  const caption = bob.events.find(event => event.type === 'caption')
  assert.equal(caption.memberId, alice.identity.memberId, '忽略客户端伪造身份')
  assert.equal(caption.state, 'final'); assert.equal(caption.text, message.text)
  assert.equal(caption.utteranceId, `typed-${alice.identity.memberId}-${message.utteranceId}`)
  await waitFor(() => alice.events.some(event => event.utteranceId === caption.utteranceId))
  await expectError(alice, typed('刷屏'), /发送过快/)
  assert.equal(other.events.some(event => event.type === 'caption'), false)

  const extras = []
  for (let index = 0; index < 6; index++) extras.push(await connect(`成员${index}`, alice.identity.code))
  const roomClients = [alice, bob, ...extras]
  await waitFor(() => alice.events.at(-1)?.members?.length === 8)
  assert.ok(extras.every(client => !client.events.some(event => event.type === 'caption')), '后来加入没有历史补发')
  await expectError(bob, { type: 'reaction', targetId: other.identity.memberId, reaction: 'agree' }, /无效/)
  await expectError(bob, { type: 'reaction', targetId: bob.identity.memberId, reaction: 'agree' }, /无效/)
  await expectError(bob, { type: 'reaction', targetId: alice.identity.memberId, reaction: 'custom' }, /无效/)
  // 遍历完整前端词库，实际验证服务端白名单与八成员广播一致。
  const kinds = Array.from(context.interactions.QUICK_REACTIONS, option => option.type)
  for (const [index, reaction] of kinds.entries()) {
    if (index && index % 7 === 0) await new Promise(resolve => setTimeout(resolve, 1550))
    const sender = roomClients[index % 7 + 1]
    if (index === 1) sender.send({ type: 'mode', mode: 'typing' })
    const targetId = index === 4 ? bob.identity.memberId : alice.identity.memberId
    sender.send({ type: 'reaction', reaction, targetId, senderId: other.identity.memberId })
    await waitFor(() => roomClients.every(client => client.events.some(event => event.type === 'reaction' && event.reaction === reaction)))
    const received = alice.events.find(event => event.type === 'reaction' && event.reaction === reaction)
    assert.equal(received.senderId, sender.identity.memberId)
    assert.equal(received.targetId, targetId)
    assert.match(received.id, /^[a-f0-9-]{36}$/)
  }
  await expectError(bob, { type: 'reaction', targetId: alice.identity.memberId, reaction: 'agree' }, /发送过快/)
  assert.equal(other.events.some(event => ['caption', 'reaction'].includes(event.type)), false, '不同房间没有字幕或回应串流')
  await new Promise(resolve => setTimeout(resolve, 1550))
  bob.send({ type: 'reaction', targetId: alice.identity.memberId, reaction: 'agree' })
  await waitFor(() => alice.events.filter(event => event.type === 'reaction').length === kinds.length + 1)
  const boundary = typed('中'.repeat(1000)); alice.send(boundary)
  await waitFor(() => bob.events.some(event => event.text === boundary.text))
  alice.send({ type: 'mode', mode: 'muted' })
  await expectError(alice, typed('切出打字后拒绝'), /打字内容无效/)
  const departed = extras.at(-1)
  departed.socket.close(); await once(departed.socket, 'close')
  await waitFor(() => alice.events.at(-1)?.members?.length === 7)
  await expectError(alice, { type: 'reaction', targetId: departed.identity.memberId, reaction: 'agree' }, /无效/)
  const returning = await connect('Returning', alice.identity.code)
  assert.equal(returning.events.some(event => ['caption', 'reaction'].includes(event.type)), false)
  assert.equal(returning.events.at(-1).members.find(member => member.id === returning.identity.memberId).mode, 'muted')
} finally {
  connections.forEach(socket => socket.terminate())
  await gateway.close()
}

const { shouldSendTypedCaption } = context.interactions
const enter = { key: 'Enter', keyCode: 13, repeat: false, isComposing: false, shiftKey: false }
assert.equal(shouldSendTypedCaption(enter, false), true)
for (const override of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { repeat: true }]) assert.equal(shouldSendTypedCaption({ ...enter, ...override }, false), false)
assert.equal(shouldSendTypedCaption(enter, true), false)
console.log('通过：真实本地双房间/八成员 WebSocket 打字及完整回应词库、身份防伪、跨房间/离房隔离、模式/内容/边界长度校验、限流及冷却恢复、不补发历史；IME/换行发送判断。音效资产与失败清理由独立音效测试覆盖；未调用真实豆包、麦克风或物理多设备。')
