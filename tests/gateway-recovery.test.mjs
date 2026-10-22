import assert from 'node:assert/strict'
import { once, EventEmitter } from 'node:events'
import { gzipSync } from 'node:zlib'
import WebSocket from 'ws'
import { createAsrGateway } from '../server/asrGateway.mjs'

const origin = 'http://127.0.0.1:5173'
class FakeUpstream extends EventEmitter {
  readyState = 0; bufferedAmount = 0
  send(_packet, callback) { callback?.() }
  terminate() { this.readyState = 3 }
  open() { this.readyState = 1; this.emit('open') }
  end() {
    const payload = gzipSync(Buffer.from(JSON.stringify({ result: { utterances: [] } })))
    const header = Buffer.from([0x11, 0x92, 0x11, 0, 0, 0, 0, 0]); header.writeUInt32BE(payload.length, 4)
    this.emit('message', Buffer.concat([header, payload]), true)
  }
}
async function waitFor(predicate) {
  for (let count = 0; count < 100; count++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw Error('Gateway recovery test timed out')
}
for (const roomMode of [false, true]) {
  const upstreams = [], clients = []
  const gateway = createAsrGateway({ apiKey: 'fixture-only-not-a-key', maxAsrSessions: 1,
    connectUpstream() { const upstream = new FakeUpstream(); upstreams.push(upstream); return upstream } })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  const base = `ws://127.0.0.1:${gateway.server.address().port}`
  const connect = async path => {
    const socket = new WebSocket(base + path, { origin }), events = []
    clients.push(socket); socket.on('message', data => events.push(JSON.parse(data)))
    await once(socket, 'open'); return { socket, events }
  }
  try {
    let token = ''
    if (roomMode) {
      const room = await connect('/api/rooms'); room.socket.send(JSON.stringify({ type: 'create', name: 'Recovery' }))
      await waitFor(() => room.events.some(event => event.type === 'joined'))
      token = room.events.find(event => event.type === 'joined').token
      const saved = await fetch(base.replace('ws:', 'http:') + '/api/rooms/settings', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', apiKey: 'fixture-room-key' }) })
      assert.equal(saved.status, 200)
      room.socket.send(JSON.stringify({ type: 'mic', mic: true }))
      await waitFor(() => room.events.at(-1)?.members?.[0]?.mic)
    }
    const path = '/api/asr' + (token ? `?session=${token}` : '')
    const first = await connect(path); upstreams[0].open()
    await waitFor(() => first.events.some(event => event.type === 'ready'))
    // 暂停接收，刻意不回复旧连接的close帧，复现已结束但仍占名额的窗口。
    first.socket.pause()
    let oldClosed = false; first.socket.once('close', () => { oldClosed = true })
    upstreams[0].end()
    const second = await connect(path)
    assert.equal(oldClosed, false, '新连接必须在旧close握手完成前就能获得已释放的名额')
    assert.equal(upstreams.length, 2); assert.equal(upstreams[0].readyState, 3)
    upstreams[1].open(); await waitFor(() => second.events.some(event => event.type === 'ready'))
    first.socket.resume(); await waitFor(() => oldClosed)
    const duplicate = new WebSocket(base + path, { origin })
    clients.push(duplicate)
    assert.match(await new Promise(resolve => duplicate.once('error', error => resolve(error.message))), /403/,
      '旧close回调不能清除新成员占位，同一成员/并发仍限一路')
    assert.equal(upstreams.length, 2)
  } finally {
    clients.forEach(client => client.terminate()); await gateway.close()
  }
}
console.log('通过：延迟旧WebSocket关闭握手时，新句及时释放成员与并发名额，旧close不清新占位且重复识别仍拒绝。仅假上游。')
