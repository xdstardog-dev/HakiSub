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
import { createAsrDiagnostics } from '../server/asrDiagnostics.mjs'

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

const { createVoiceActivityGate: createProbabilityGate } = loadTypeScript('../src/voiceActivityGate.ts', ['createVoiceActivityGate'])
// 本文件测试上传会话顺序，声音判定由 fixture 明确注入；真实模型另有独立测试。
const mockSpeechProbability = pcm => {
  const view = new DataView(pcm)
  let active = 0
  for (let index = 1; index < 3200; index++) if (Math.abs(view.getInt16(index * 2, true)) >= 200) active++
  return active >= 600 ? .9 : .01
}
const createVoiceActivityGate = (...args) => {
  const gate = createProbabilityGate(...args), accept = gate.accept
  gate.accept = pcm => accept(pcm, mockSpeechProbability(pcm))
  return gate
}
const { createDoubaoAsrClient } = loadTypeScript('../src/doubaoAsrClient.ts', ['createDoubaoAsrClient'], { setTimeout, clearTimeout, createVoiceActivityGate })
const voicedPacket = new ArrayBuffer(6400)
for (let i = 0; i < 3200; i++) new DataView(voicedPacket).setInt16(i * 2, i % 2 ? 5000 : -5000, true)
const gateEvents = []
const gate = createVoiceActivityGate(() => gateEvents.push('start'), () => gateEvents.push('audio'), () => gateEvents.push('end'))
for (let i = 0; i < 100; i++) gate.accept(new ArrayBuffer(6400))
assert.deepEqual(gateEvents, [])
gate.accept(voicedPacket); assert.deepEqual(gateEvents, ['start', 'audio', 'audio', 'audio', 'audio'])
gate.accept(voicedPacket); assert.equal(gateEvents.at(-1), 'audio')
for (let i = 0; i < 8; i++) gate.accept(new ArrayBuffer(6400))
assert.equal(gateEvents.at(-1), 'end')
const audioAfterEnd = gateEvents.length
for (let i = 0; i < 30; i++) gate.accept(new ArrayBuffer(6400))
assert.equal(gateEvents.length, audioAfterEnd)
const taggedPacket = (tag, amplitude = 0, activeFrames = 10) => {
  const packet = new ArrayBuffer(6400), view = new DataView(packet)
  view.setInt16(0, tag, true)
  for (let i = 1; i < activeFrames * 320; i++) view.setInt16(i * 2, i % 2 ? amplitude : -amplitude, true)
  return packet
}
const shortEvents = [], shortPackets = []
const shortGate = createVoiceActivityGate(() => shortEvents.push('start'), packet => shortPackets.push(packet), () => shortEvents.push('end'), { preRollMs: 500 })
const beforeShort = [taggedPacket(1), taggedPacket(2), taggedPacket(3)]
beforeShort.forEach(packet => shortGate.accept(packet))
const oneCharacter = taggedPacket(4, 300, 3) // 只有约 60ms 的轻声，整包 RMS 会被静音稀释。
shortGate.accept(oneCharacter)
assert.deepEqual(shortEvents, ['start'])
assert.deepEqual(shortPackets, [...beforeShort, oneCharacter], '句首缓冲按时间顺序且触发包只出现一次')
for (let i = 0; i < 8; i++) shortGate.accept(taggedPacket(10 + i))
assert.deepEqual(shortEvents, ['start', 'end'])
for (let i = 0; i < 300; i++) shortGate.accept(taggedPacket(20 + i))
const afterLongSilence = taggedPacket(500, 300, 3)
shortGate.accept(afterLongSilence)
assert.deepEqual(shortEvents, ['start', 'end', 'start'], '长时间静音后短句仍能触发')
assert.equal(shortPackets.at(-1), afterLongSilence)
const customPreRoll = []
const customGate = createVoiceActivityGate(() => {}, packet => customPreRoll.push(packet), () => {}, { preRollMs: 200 })
const oldQuiet = taggedPacket(510), recentQuiet = taggedPacket(511), configuredStart = taggedPacket(512, 5000)
customGate.accept(oldQuiet); customGate.accept(recentQuiet); customGate.accept(configuredStart)
assert.deepEqual(customPreRoll, [recentQuiet, configuredStart], '前置环形缓冲长度可配置')
const pauseEvents = []
const pauseGate = createVoiceActivityGate(() => pauseEvents.push('start'), () => {}, () => pauseEvents.push('end'))
pauseGate.accept(taggedPacket(520, 300, 3))
for (let i = 0; i < 7; i++) pauseGate.accept(taggedPacket(521 + i))
pauseGate.accept(taggedPacket(530, 300, 3))
assert.deepEqual(pauseEvents, ['start'], '短暂停顿后轻声续讲仍属于同一会话')
for (let i = 0; i < 8; i++) pauseGate.accept(taggedPacket(531 + i))
assert.deepEqual(pauseEvents, ['start', 'end'])
function clientFixture({ delayDetector = false } = {}) {
  let emitAudio, reportCaptureError, resolveCapture, resolveDetector, reportDetectorError, detectionResult, reportLoading
  const bufferedDetection = []
  const detector = { ready: !delayDetector, stopped: false,
    start: () => delayDetector ? new Promise(resolve => { resolveDetector = resolve }) : Promise.resolve(),
    accept(pcm) { if (this.ready) detectionResult(pcm, mockSpeechProbability(pcm)); else bufferedDetection.push(pcm) },
    stop() { this.stopped = true },
  }
  const sockets = []
  const capture = { stopped: false, start: () => new Promise(resolve => { resolveCapture = resolve }), stop() { this.stopped = true } }
  const states = [], results = [], discarded = [], usages = []
  const client = createDoubaoAsrClient({ onState: (state, message) => states.push({ state, message }), onResult: (...result) => results.push(result), onDiscard: id => discarded.push(id), onUsage: usage => usages.push(usage) }, {
    createSocket: () => { const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(value) { this.sent.push(value) }, close() { this.closed = true } }; sockets.push(socket); return socket },
    createCapture: (onAudio, onError) => { emitAudio = onAudio; reportCaptureError = onError; return capture },
    createDetector: (onResult, onError, onLoading) => { detectionResult = onResult; reportDetectorError = onError; reportLoading = onLoading; return detector },
  })
  return { client, sockets, capture, detector, states, results, discarded, usages, get socket() { return sockets.at(-1) }, get socketCount() { return sockets.length },
    readyDetector: async () => { detector.ready = true; resolveDetector(); bufferedDetection.forEach(pcm => detectionResult(pcm, mockSpeechProbability(pcm))); await new Promise(resolve => setImmediate(resolve)) },
    detectorError: () => reportDetectorError('本地语音检测失败'), loading: message => reportLoading(message),
    readyCapture: async () => { resolveCapture(); await new Promise(resolve => setImmediate(resolve)) }, audio: (packet = voicedPacket, count = 1) => { for (let i = 0; i < count; i++) emitAudio(packet) },
    captureError: () => reportCaptureError('设备断开'), message: message => sockets.at(-1).onmessage({ data: JSON.stringify(message) }) }
}
const fixture = clientFixture()
fixture.client.start(); fixture.client.start(); assert.equal(fixture.socketCount, 0)
await fixture.readyCapture(); fixture.audio(new ArrayBuffer(6400), 30); assert.equal(fixture.socketCount, 0)
fixture.audio(voicedPacket, 2); assert.equal(fixture.socketCount, 1)
fixture.message({ type: 'ready' }); assert.equal(fixture.socket.sent.length, 2)
fixture.message({ type: 'usage', requestId: 'segment-1', submittedAudioSeconds: .4, completedAudioSeconds: .2, serverAudioSeconds: null })
assert.equal(fixture.usages.length, 1)
fixture.audio(new ArrayBuffer(6400), 8)
assert.equal(fixture.socket.sent.at(-1), 'finish')
fixture.audio(voicedPacket, 2); assert.equal(fixture.socketCount, 1)
fixture.message({ type: 'ended' }); assert.equal(fixture.capture.stopped, false)
assert.equal(fixture.socketCount, 1, '旧连接未关闭时不得抢占网关单连接名额')
fixture.socket.onclose()
assert.equal(fixture.socketCount, 2)
fixture.message({ type: 'ready' })
assert.equal(fixture.socket.sent.length, 2)
fixture.message({ type: 'caption', utteranceId: 'a', text: '你', state: 'interim' })
fixture.message({ type: 'caption', utteranceId: 'a', text: '你好', state: 'final' })
fixture.message({ type: 'caption', utteranceId: 'b', text: '未完', state: 'interim' })
const lateMessage = fixture.socket.onmessage
fixture.client.stop(); fixture.audio(); lateMessage({ data: JSON.stringify({ type: 'ready' }) })
assert.equal(fixture.capture.stopped, true); assert.equal(fixture.socket.closed, true)
assert.deepEqual(fixture.discarded, ['b']); assert.equal(fixture.states.at(-1).state, 'idle')
const cancelled = clientFixture(); cancelled.client.start(); cancelled.client.stop(); await cancelled.readyCapture()
assert.equal(cancelled.socketCount, 0); assert.equal(cancelled.capture.stopped, true)
for (const failure of ['error', 'backpressure', 'capture', 'detector', 'invalid']) {
  const f = clientFixture(); f.client.start(); await f.readyCapture(); f.audio(voicedPacket, 2); f.message({ type: 'ready' })
  if (failure === 'error') f.message({ type: 'error', message: '服务未开通' })
  if (failure === 'backpressure') { f.socket.bufferedAmount = 64001; f.audio() }
  if (failure === 'capture') f.captureError()
  if (failure === 'detector') f.detectorError()
  if (failure === 'invalid') f.message({ type: 'unexpected' })
  assert.equal(f.capture.stopped, true); assert.equal(f.states.at(-1).state, 'error'); assert.equal(f.socketCount, 1)
  assert.equal(f.detector.stopped, true, '任何故障均释放检测器，不能继续上传')
}

const awaitRetry = async (f, count) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (f.socketCount === count) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw Error('Transport recovery did not run')
}
const retryOpening = clientFixture()
retryOpening.client.start(); await retryOpening.readyCapture()
const retainedAudio = [taggedPacket(901, 5000), taggedPacket(902, 5000)]
retainedAudio.forEach(pcm => retryOpening.audio(pcm))
const firstConnection = retryOpening.socket, lateOpeningClose = firstConnection.onclose, lateOpeningMessage = firstConnection.onmessage
firstConnection.onerror()
assert.equal(retryOpening.states.at(-1).state, 'reconnecting')
assert.equal(retryOpening.capture.stopped, false); assert.equal(retryOpening.detector.stopped, false)
lateOpeningClose(); await awaitRetry(retryOpening, 2)
lateOpeningMessage({ data: JSON.stringify({ type: 'ready' }) })
assert.equal(retryOpening.socket.sent.length, 0, '旧连接迟到ready不能放行新连接')
retryOpening.message({ type: 'ready' })
assert.deepEqual(retryOpening.socket.sent, retainedAudio, '握手失败后只补交此前未发送的有序音频')
retryOpening.client.stop()

const retryListening = clientFixture()
retryListening.client.start(); await retryListening.readyCapture(); retryListening.audio(voicedPacket, 2); retryListening.message({ type: 'ready' })
const sentBeforeFailure = [...retryListening.socket.sent]
retryListening.message({ type: 'caption', utteranceId: 'unfinished', text: '未确认', state: 'interim' })
retryListening.socket.onclose()
retryListening.audio(taggedPacket(903, 5000))
assert.equal(retryListening.socketCount, 1, '退避期间不能由音频回调绕过计时器建连')
await awaitRetry(retryListening, 2); retryListening.message({ type: 'ready' })
assert.deepEqual(retryListening.discarded, ['unfinished'])
assert.equal(retryListening.socket.sent.length, 1)
assert.ok(!sentBeforeFailure.includes(retryListening.socket.sent[0]), '已交给旧连接的音频不能重放或重复计量')
retryListening.socket.onerror(); retryListening.audio(taggedPacket(904, 5000)); await awaitRetry(retryListening, 3)
retryListening.message({ type: 'ready' }); retryListening.socket.onerror()
assert.equal(retryListening.states.at(-1).state, 'error', '30秒内仅允许两次恢复，不能无限重试')
assert.match(retryListening.states.at(-1).message, /服务器语音网关/)
assert.doesNotMatch(retryListening.states.at(-1).message, /npm run dev|本地语音网关/)
assert.equal(retryListening.capture.stopped, true); assert.equal(retryListening.detector.stopped, true)

const cancelRecovery = clientFixture()
cancelRecovery.client.start(); await cancelRecovery.readyCapture(); cancelRecovery.audio()
cancelRecovery.socket.onerror(); cancelRecovery.client.stop()
await new Promise(resolve => setTimeout(resolve, 300))
assert.equal(cancelRecovery.socketCount, 1, '手动关闭必须取消待重连，不能自行重新开启麦克风')
assert.equal(cancelRecovery.states.at(-1).state, 'idle')

const sendFailure = clientFixture()
sendFailure.client.start(); await sendFailure.readyCapture(); sendFailure.audio(voicedPacket, 2)
sendFailure.socket.send = () => { throw Error('transport unavailable') }
sendFailure.message({ type: 'ready' })
assert.equal(sendFailure.states.at(-1).state, 'reconnecting')
await awaitRetry(sendFailure, 2); sendFailure.message({ type: 'ready' })
assert.deepEqual(sendFailure.socket.sent, [voicedPacket, voicedPacket], '同步send失败的包没有交出，恢复后只发送一次')
sendFailure.audio(new ArrayBuffer(6400), 8)
sendFailure.socket.onclose()
await new Promise(resolve => setTimeout(resolve, 800))
assert.equal(sendFailure.socketCount, 2, '没有待发送语音时，不为恢复空建云端连接')
assert.equal(sendFailure.states.at(-1).state, 'listening')
sendFailure.audio(voicedPacket)
assert.equal(sendFailure.socketCount, 3, '恢复静音等待后，下次开口可再次建立连接')
sendFailure.client.stop()
const modelLoading = clientFixture({ delayDetector: true })
modelLoading.client.start(); await modelLoading.readyCapture()
modelLoading.loading('正在下载语音检测资源 42%')
assert.deepEqual(modelLoading.states.at(-1), { state: 'starting', message: '正在下载语音检测资源 42%' })
modelLoading.audio(voicedPacket, 2)
assert.equal(modelLoading.socketCount, 0, '模型尚未就绪不能开启豆包上传')
await modelLoading.readyDetector()
assert.equal(modelLoading.socketCount, 1, '模型就绪后启动已缓存讲话，不丢首次开口')
modelLoading.message({ type: 'ready' }); assert.equal(modelLoading.socket.sent.length, 2)
modelLoading.client.stop()
const cancelledModel = clientFixture({ delayDetector: true })
cancelledModel.client.start(); await cancelledModel.readyCapture(); cancelledModel.audio()
cancelledModel.client.stop(); await cancelledModel.readyDetector()
cancelledModel.loading('迟到的进度')
assert.equal(cancelledModel.states.at(-1).state, 'idle', '停止后忽略迟到加载进度')
assert.equal(cancelledModel.socketCount, 0, '加载期间停止后，迟到的模型结果不得重新开麦或上传')
assert.equal(cancelledModel.capture.stopped, true); assert.equal(cancelledModel.detector.stopped, true)
const delayed = clientFixture()
delayed.client.start(); await delayed.readyCapture()
const quietLead = [taggedPacket(601), taggedPacket(602), taggedPacket(603)]
const speech = [taggedPacket(604, 5000), taggedPacket(605, 5000), taggedPacket(606, 5000)]
const quietTail = Array.from({ length: 8 }, (_, index) => taggedPacket(607 + index))
for (const packet of [...quietLead, ...speech, ...quietTail]) delayed.audio(packet)
assert.equal(delayed.socketCount, 1)
assert.equal(delayed.socket.sent.length, 0, '建连等待期间只缓存，不发送')
delayed.message({ type: 'ready' })
for (let i = 0; i < 12; i++) delayed.audio(taggedPacket(700 + i))
assert.deepEqual(delayed.socket.sent, [...quietLead, ...speech, ...quietTail, 'finish'], '补发和实时上传严格有序、无重复，结束包在音频之后')
delayed.message({ type: 'caption', utteranceId: 'short-final', text: '好', state: 'final' })
delayed.message({ type: 'ended' })
assert.deepEqual(delayed.results.at(-1), ['short-final', '好', 'final'], '尾部 Final 在连接关闭前交付')
delayed.socket.onclose()
assert.equal(delayed.capture.stopped, false)
const repeated = clientFixture()
repeated.client.start(); await repeated.readyCapture()
for (let utterance = 0; utterance < 3; utterance++) {
  repeated.audio(taggedPacket(800 + utterance, 5000))
  if (utterance === 0) repeated.message({ type: 'ready' })
  repeated.audio(new ArrayBuffer(6400), 8)
  if (utterance < 2) {
    repeated.audio(taggedPacket(810 + utterance, 5000))
    repeated.message({ type: 'ended' })
    repeated.socket.onclose()
    repeated.message({ type: 'ready' })
  }
}
assert.equal(repeated.socketCount, 3, '快速重复开口自动使用三个有序会话')
assert.equal(repeated.capture.stopped, false)
repeated.client.stop(); delayed.client.stop()

class FakeUpstream extends EventEmitter {
  readyState = 0; bufferedAmount = 0; sent = []
  send(packet, callback) { this.sent.push(packet); callback?.() }
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
// 已知一分钟输入经过真实重采样、编码与本地 WebSocket，只连接假上游。
for (const rate of [16000, 44100, 48000]) {
  const records = []
  const diagnosticGateway = await gatewayFixture({
    keyStore: { getKey: () => 'test-secret-not-real', status: () => ({ configured: true }) },
    diagnostics: { enabled: true, write: record => records.push(record) },
  })
  try {
    diagnosticGateway.upstream.open(); await nextTurn()
    const second = new WebSocket(diagnosticGateway.url, { origin: 'http://127.0.0.1:5173' })
    assert.match(await new Promise(resolve => second.on('error', error => resolve(error.message))), /403/)
    assert.equal(diagnosticGateway.connections, 1)
    const resample = createAudioResampler(rate, packet => diagnosticGateway.client.send(Buffer.from(packet)))
    const block = new Float32Array(128).fill(0.25)
    for (let offset = 0; offset < rate * 60; offset += 128) resample(block.subarray(0, Math.min(128, rate * 60 - offset)))
    for (let attempt = 0; attempt < 100 && diagnosticGateway.upstream.sent.length < 301; attempt++) await nextTurn()
    const audioPackets = diagnosticGateway.upstream.sent.slice(1)
    assert.equal(audioPackets.length, 300)
    assert.equal(audioPackets.reduce((sum, packet) => sum + gunzipSync(packet.subarray(8)).length, 0), 1920000)
    diagnosticGateway.upstream.emit('message', responsePacket({ audio_info: { duration: 60000 }, result: {} }), true)
    diagnosticGateway.upstream.emit('message', responsePacket({ audio_info: { duration: 60000 }, result: {} }), true)
    await nextTurn()
    const usageEvents = diagnosticGateway.received.filter(message => message.type === 'usage')
    assert.ok(usageEvents.length >= 1)
    assert.deepEqual(usageEvents.at(-1), { type: 'usage', requestId: diagnosticGateway.options.headers['X-Api-Request-Id'],
      submittedAudioSeconds: 60, completedAudioSeconds: 60, serverAudioSeconds: 60 })
    diagnosticGateway.client.close(); await once(diagnosticGateway.client, 'close'); await nextTurn()
    const summary = records.at(-1)
    assert.equal(summary.event, 'end'); assert.equal(summary.submittedAudioSeconds, 60)
    assert.equal(summary.completedAudioSeconds, 60); assert.equal(summary.serverDuration.value, 60000)
    assert.equal(summary.requestId, diagnosticGateway.options.headers['X-Api-Request-Id'])
    assert.equal(records.filter(record => record.event === 'end').length, 1)
    assert.equal(diagnosticGateway.upstream.terminated, true)
    assert.equal(JSON.stringify(records).includes('test-secret-not-real'), false)
    const usageUrl = diagnosticGateway.url.replace('ws:', 'http:') + '/settings/usage'
    const usageResponse = await fetch(usageUrl)
    assert.equal(usageResponse.headers.get('cache-control'), 'no-store')
    const usage = await usageResponse.json()
    assert.equal(usage.totalAudioSeconds, 60)
    assert.equal(usage.latest.submittedAudioSeconds, 60)
    assert.equal(usage.latest.active, false)
    assert.equal(usage.latest.serverDuration.value, 60000)
    assert.equal(JSON.stringify(usage).includes('test-secret-not-real'), false)
    assert.equal((await fetch(usageUrl, { headers: { Origin: 'https://untrusted.example' } })).status, 403)
    const nextClient = new WebSocket(diagnosticGateway.url, { origin: 'http://127.0.0.1:5173' })
    await once(nextClient, 'open'); diagnosticGateway.upstream.open(); await nextTurn()
    nextClient.send(Buffer.alloc(6400)); await nextTurn()
    const nextUsage = await (await fetch(usageUrl)).json()
    assert.equal(nextUsage.totalAudioSeconds, 60.2)
    assert.equal(nextUsage.latest.submittedAudioSeconds, 0.2)
    assert.equal(nextUsage.latest.active, true)
    assert.equal(nextUsage.latest.serverDuration, null)
    assert.notEqual(nextUsage.latest.requestId, usage.latest.requestId)
    nextClient.close(); await once(nextClient, 'close'); await nextTurn()
    console.log(`用量模拟：${rate}Hz 输入60秒 → 300包 → 1920000 PCM字节 → 上游60秒；单连接，停止已清理。`)
  } finally { await diagnosticGateway.close() }
}
const finishedGateway = await gatewayFixture()
try {
  finishedGateway.upstream.open(); await nextTurn()
  finishedGateway.client.send(Buffer.alloc(6400, 1)); await nextTurn()
  finishedGateway.client.send('finish'); await nextTurn()
  const lastPacket = finishedGateway.upstream.sent.at(-1)
  assert.equal(lastPacket[1], 0x22)
  assert.equal(gunzipSync(lastPacket.subarray(8)).length, 0)
  finishedGateway.upstream.emit('message', responsePacket(payload(utterance('结束', true)), { flags: 3, sequence: -1 }), true)
  await nextTurn()
  assert.equal(finishedGateway.received.at(-1).type, 'ended')
  assert.equal(finishedGateway.received.some(event => event.type === 'caption' && event.state === 'final'), true)
  if (finishedGateway.client.readyState !== WebSocket.CLOSED) await once(finishedGateway.client, 'close')
  const reopened = new WebSocket(finishedGateway.url, { origin: 'http://127.0.0.1:5173' })
  await once(reopened, 'open')
  assert.equal(finishedGateway.connections, 2, '旧连接关闭后网关允许新句建连')
  reopened.close(); await once(reopened, 'close')
} finally { await finishedGateway.close() }
const disabledRecords = []
const disabled = createAsrDiagnostics('disabled', { write: value => disabledRecords.push(value) })
disabled.submitted(6400); disabled.completed(6400); disabled.end()
assert.equal(disabledRecords.length, 0)
const missingDurationRecords = []
const missingDuration = createAsrDiagnostics('missing', { enabled: true, write: value => missingDurationRecords.push(value) })
missingDuration.response({ result: { text: '不得记录' }, audio_info: { duration: 'secret' } })
missingDuration.end(); missingDuration.end()
assert.equal(missingDurationRecords.at(-1).serverDuration, null)
assert.equal(missingDurationRecords.length, 2)
assert.equal(JSON.stringify(missingDurationRecords).includes('不得记录'), false)
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
