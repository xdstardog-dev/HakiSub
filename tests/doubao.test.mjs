import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { gzipSync, gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import WebSocket from 'ws'
import { createRecognitionRequest, createAudioPacket, parseRecognitionResponse, DOUBAO_RESOURCE_ID } from '../server/doubaoProtocol.mjs'
import { createDoubaoResultMapper } from '../server/doubaoResults.mjs'
import { createAsrGateway } from '../server/asrGateway.mjs'

function loadTypeScript(path, names, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({ ...globals })
  vm.runInContext(ts.transpile(source + `\nglobalThis.exported = {${names.join(',')}}`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  return context.exported
}
// 独立构造供应商响应 fixture，避免用被测编码器测试自己。
function responsePacket(payload, { sequence = 1, flags = 1, compressed = true } = {}) {
  const body = Buffer.from(JSON.stringify(payload))
  const encoded = compressed ? gzipSync(body) : body
  const header = Buffer.from([0x11, 0x90 | flags, compressed ? 0x11 : 0x10, 0])
  const metadata = Buffer.alloc(flags & 1 ? 8 : 4)
  if (flags & 1) metadata.writeInt32BE(sequence)
  metadata.writeUInt32BE(encoded.length, metadata.length - 4)
  return Buffer.concat([header, metadata, encoded])
}
const utterance = (text, definite = false, start_time = 0) => ({ text, definite, start_time, end_time: 1000 })
const payload = (...utterances) => ({ result: { utterances } })
const request = createRecognitionRequest('session-test')
assert.deepEqual([...request.subarray(0, 4)], [0x11, 0x10, 0x11, 0])
assert.equal(request.readUInt32BE(4), request.length - 8)
const configuration = JSON.parse(gunzipSync(request.subarray(8)))
assert.deepEqual(configuration.audio, { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 })
assert.equal(configuration.request.show_utterances, true)
assert.equal(configuration.request.result_type, 'full')
assert.equal(configuration.request.enable_nonstream, true)
const pcm = Buffer.alloc(6400, 0x42)
assert.deepEqual(gunzipSync(createAudioPacket(pcm).subarray(8)), pcm)
assert.equal(createAudioPacket(Buffer.alloc(0), true)[1], 0x22)
for (const compressed of [false, true]) for (const flags of [0, 1, 2, 3]) {
  const parsed = parseRecognitionResponse(responsePacket(payload(utterance('你好', true)), { flags, sequence: -2, compressed }))
  assert.equal(parsed.payload.result.utterances[0].text, '你好')
  assert.equal(parsed.isLast, !!(flags & 2))
  assert.equal(parsed.sequence, flags & 1 ? -2 : undefined)
}
const errorBody = Buffer.from('private upstream detail')
const errorPacket = Buffer.alloc(12 + errorBody.length)
Buffer.from([0x11, 0xf0, 0x10, 0]).copy(errorPacket)
errorPacket.writeUInt32BE(45000001, 4); errorPacket.writeUInt32BE(errorBody.length, 8); errorBody.copy(errorPacket, 12)
assert.deepEqual(parseRecognitionResponse(errorPacket), { errorCode: 45000001 })
for (const invalid of [Buffer.alloc(0), responsePacket({}).subarray(0, 9), Buffer.concat([responsePacket({}), Buffer.from([0])])]) {
  assert.throws(() => parseRecognitionResponse(invalid))
}

const { receiveCaption, expireCaptions } = loadTypeScript('../src/captions.ts', ['receiveCaption', 'expireCaptions'])
const mapper = createDoubaoResultMapper('a'), queue = []
const apply = (response, now) => mapper(response).forEach(event => {
  if (event.type === 'caption') receiveCaption(queue, 'member-a', event.utteranceId, event.text, event.state, now)
})
apply(payload(utterance('你')), 0)
apply(payload(utterance('你好', false, 40)), 10)
assert.equal(queue.length, 1); assert.equal(queue[0].finalizedAt, null)
apply(payload(utterance('你好。', true, 50)), 20)
assert.equal(queue.length, 1); assert.equal(queue[0].finalizedAt, 20)
queue.splice(0, queue.length, ...expireCaptions(queue, 10000))
apply(payload(utterance('你好。', true), utterance('下一句')), 10000)
assert.equal(queue.length, 1); assert.equal(queue[0].text, '下一句')
assert.equal(mapper(payload(utterance('你好。', true)))[0].type, 'discard')
assert.equal(createDoubaoResultMapper('b')(payload(utterance('你好')))[0].utteranceId, 'b-0')

const { createAudioResampler } = loadTypeScript('../src/audioResampler.ts', ['createAudioResampler'])
for (const rate of [16000, 44100, 48000]) {
  const packets = [], resample = createAudioResampler(rate, packet => packets.push(packet))
  const samples = new Float32Array(rate).fill(0.5)
  for (let offset = 0; offset < samples.length; offset += 128) resample(samples.subarray(offset, offset + 128))
  assert.equal(packets.length, 5, `${rate}: 1秒必须输出5个200ms包`)
  assert.equal(packets[0].byteLength, 6400)
  assert.equal(new DataView(packets[0]).getInt16(0, true), 16384)
}
const clipped = []
createAudioResampler(16000, packet => clipped.push(packet))(new Float32Array(3200).fill(-2))
assert.equal(new DataView(clipped[0]).getInt16(0, true), -32768)

const { createDoubaoAsrClient } = loadTypeScript('../src/doubaoAsrClient.ts', ['createDoubaoAsrClient'], { setTimeout, clearTimeout })
function clientFixture() {
  let emitAudio, reportCaptureError, resolveCapture
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(value) { this.sent.push(value) }, close() { this.closed = true } }
  const capture = { stopped: false, start: () => new Promise(resolve => { resolveCapture = resolve }), stop() { this.stopped = true } }
  const states = [], results = [], discarded = []
  let socketCount = 0
  const client = createDoubaoAsrClient({ onState: (state, message) => states.push({ state, message }), onResult: (...result) => results.push(result), onDiscard: id => discarded.push(id) }, {
    createSocket: () => { socketCount++; return socket },
    createCapture: (onAudio, onError) => { emitAudio = onAudio; reportCaptureError = onError; return capture },
  })
  return { client, socket, capture, states, results, discarded, get socketCount() { return socketCount },
    readyCapture: async () => { resolveCapture(); await Promise.resolve() }, audio: () => emitAudio(new ArrayBuffer(6400)),
    captureError: () => reportCaptureError('设备断开'), message: message => socket.onmessage({ data: JSON.stringify(message) }) }
}
const fixture = clientFixture()
fixture.client.start(); fixture.client.start(); assert.equal(fixture.socketCount, 0)
await fixture.readyCapture(); fixture.audio(); assert.equal(fixture.socket.sent.length, 0)
fixture.message({ type: 'ready' }); fixture.audio(); assert.equal(fixture.socket.sent.length, 1)
fixture.message({ type: 'caption', utteranceId: 'a', text: '你', state: 'interim' })
fixture.message({ type: 'caption', utteranceId: 'a', text: '你好', state: 'final' })
fixture.message({ type: 'caption', utteranceId: 'b', text: '未完', state: 'interim' })
const lateMessage = fixture.socket.onmessage
fixture.client.stop(); fixture.audio(); lateMessage({ data: JSON.stringify({ type: 'ready' }) })
assert.equal(fixture.socket.sent.length, 1); assert.equal(fixture.capture.stopped, true); assert.equal(fixture.socket.closed, true)
assert.deepEqual(fixture.discarded, ['b']); assert.equal(fixture.states.at(-1).state, 'idle')
const cancelled = clientFixture(); cancelled.client.start(); cancelled.client.stop(); await cancelled.readyCapture()
assert.equal(cancelled.socketCount, 0); assert.equal(cancelled.capture.stopped, true)
for (const failure of ['close', 'error', 'backpressure', 'capture', 'invalid']) {
  const f = clientFixture(); f.client.start(); await f.readyCapture(); f.message({ type: 'ready' })
  if (failure === 'close') f.socket.onclose()
  if (failure === 'error') f.message({ type: 'error', message: '服务未开通' })
  if (failure === 'backpressure') { f.socket.bufferedAmount = 64001; f.audio() }
  if (failure === 'capture') f.captureError()
  if (failure === 'invalid') f.message({ type: 'unexpected' })
  assert.equal(f.capture.stopped, true); assert.equal(f.states.at(-1).state, 'error'); assert.equal(f.socketCount, 1)
}

class FakeUpstream extends EventEmitter {
  readyState = 0; bufferedAmount = 0; sent = []
  send(packet) { this.sent.push(packet) }
  terminate() { this.readyState = 3; this.terminated = true }
  open() { this.readyState = 1; this.emit('open') }
}
async function gatewayFixture(options = {}) {
  let upstream, connectionOptions, connections = 0
  const gateway = createAsrGateway({ apiKey: 'test-secret-not-real', ...options, connectUpstream: (url, config) => {
    assert.equal(url, 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async')
    connectionOptions = config; connections++; upstream = new FakeUpstream(); return upstream
  } })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  const url = `ws://127.0.0.1:${gateway.server.address().port}/api/asr`
  const client = new WebSocket(url, { origin: 'http://127.0.0.1:5173' })
  const received = []
  client.on('message', packet => received.push(JSON.parse(packet)))
  await once(client, 'open')
  return { gateway, client, received, url, get upstream() { return upstream }, get options() { return connectionOptions }, get connections() { return connections },
    close: () => gateway.close() }
}
const nextTurn = () => new Promise(resolve => setTimeout(resolve, 20))
const gateway = await gatewayFixture()
try {
  assert.equal(gateway.options.headers['X-Api-Key'], 'test-secret-not-real')
  assert.equal(gateway.options.headers['X-Api-Resource-Id'], DOUBAO_RESOURCE_ID)
  gateway.upstream.open(); await nextTurn(); assert.equal(gateway.received[0].type, 'ready')
  gateway.client.send(pcm); await nextTurn(); assert.equal(gateway.upstream.sent.length, 2)
  assert.deepEqual(gunzipSync(gateway.upstream.sent[1].subarray(8)), pcm)
  gateway.upstream.emit('message', responsePacket(payload(utterance('我'))), true)
  gateway.upstream.emit('message', responsePacket(payload(utterance('我说完了', true))), true)
  gateway.upstream.emit('message', responsePacket(payload(utterance('我说完了', true))), true)
  await nextTurn()
  const captions = gateway.received.filter(message => message.type === 'caption')
  assert.equal(captions.length, 2); assert.equal(captions[0].utteranceId, captions[1].utteranceId)
  assert.equal(JSON.stringify(gateway.received).includes('test-secret-not-real'), false)
  gateway.client.close(); await once(gateway.client, 'close'); await nextTurn()
  assert.equal(gateway.upstream.terminated, true)
} finally { await gateway.close() }
for (const failure of ['missing-key', 'upstream-error', 'invalid-packet', 'bad-audio', 'timeout', 'origin']) {
  const f = await gatewayFixture(failure === 'missing-key' ? { apiKey: '' } : failure === 'timeout' ? { startupTimeoutMs: 30 } : {})
  try {
    if (failure === 'origin') {
      const stranger = new WebSocket(f.url, { origin: 'https://untrusted.example' })
      const rejected = await new Promise(resolve => stranger.on('error', error => resolve(error.message)))
      assert.match(rejected, /403/); assert.equal(f.connections, 1)
    } else {
      if (failure === 'upstream-error') f.upstream.emit('error', Error('test-secret-not-real'))
      if (failure === 'invalid-packet') { f.upstream.open(); f.upstream.emit('message', Buffer.alloc(1), true) }
      if (failure === 'bad-audio') { f.upstream.open(); f.client.send(Buffer.alloc(2)) }
      if (f.client.readyState !== WebSocket.CLOSED) await once(f.client, 'close')
      assert.equal(f.received.at(-1).type, 'error')
      assert.equal(JSON.stringify(f.received).includes('test-secret-not-real'), false)
      assert.equal(failure === 'missing-key' ? f.connections === 0 : f.upstream.terminated, true)
    }
  } finally { await f.close() }
}
console.log('通过：豆包协议/Gzip/序号/错误帧、累计分句去重/撤回/过期、16k/44.1k/48k采样、客户端取消/断线/积压清理、本地WebSocket网关鉴权/音频转发/缺Key/超时/来源限制。未调用真实豆包 API。')
