import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import * as runtime from 'onnxruntime-web/wasm'

function load(path, name, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*$/gm, '')
    .replaceAll('import.meta.url', '"http://localhost/src/speechDetector.ts"').replaceAll('import.meta.env.BASE_URL', '"/"')
    .replace(/^export /gm, '')
  const context = vm.createContext({ setTimeout, clearTimeout, URL, Date, Float32Array, BigInt64Array, ArrayBuffer, DataView, ...globals })
  vm.runInContext(ts.transpile(source + `\nglobalThis.loaded = ${name}`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  return context.loaded
}
const createSpeechDetector = load('../src/speechDetector.ts', 'createSpeechDetector')
const packet = tag => { const pcm = new ArrayBuffer(6400); new DataView(pcm).setInt16(0, tag, true); return pcm }
function fixture(options = {}) {
  const results = [], errors = [], sent = []
  const worker = { postMessage(message, transfer) { sent.push(message); if (transfer) structuredClone(message, { transfer }) }, terminate() { this.stopped = true } }
  const detector = createSpeechDetector((pcm, probability) => results.push({ pcm, probability }), message => errors.push(message), {
    createWorker: () => worker, assetBase: 'http://localhost/vad/', ...options,
  })
  return { detector, worker, results, errors, sent, reply: message => worker.onmessage({ data: message }) }
}
const ordered = fixture(), start = ordered.detector.start()
const original = [packet(1), packet(2), packet(3)]
original.forEach(pcm => ordered.detector.accept(pcm))
assert.equal(ordered.sent.length, 1, '模型就绪前只缓存，不判定或上传')
ordered.reply({ type: 'ready' }); await start
assert.equal(ordered.sent.length, 2, '一次只发一个推理任务，避免异步状态交错')
for (let id = 0; id < 3; id++) {
  ordered.reply({ type: 'result', id, probability: id ? .9 : .01 })
  assert.equal(ordered.results[id].pcm, original[id])
  assert.equal(original[id].byteLength, 6400, 'Worker 传输不能 detach 句首保护所需的原包')
}
assert.equal(ordered.sent.length, 4)
const lateResult = ordered.worker.onmessage
ordered.detector.stop(); lateResult({ data: { type: 'result', id: 3, probability: .9 } })
assert.equal(ordered.results.length, 3); assert.equal(ordered.worker.stopped, true)

const cancelled = fixture(), cancelledStart = cancelled.detector.start()
const rejection = assert.rejects(cancelledStart, /停止/)
cancelled.detector.stop(); cancelled.reply({ type: 'ready' }); await rejection
assert.equal(cancelled.sent.length, 1); assert.equal(cancelled.results.length, 0)

function timedLoadingFixture(options = {}) {
  let now = 0, nextTimer = 0
  const timers = new Map(), errors = [], labels = []
  const create = load('../src/speechDetector.ts', 'createSpeechDetector', {
    setTimeout: (callback, duration) => { const id = ++nextTimer; timers.set(id, { callback, due: now + duration }); return id },
    clearTimeout: id => timers.delete(id), Date: { now: () => now },
  })
  const worker = { postMessage() {}, terminate() { this.stopped = true } }
  const detector = create(() => {}, message => errors.push(message), {
    createWorker: () => worker, assetBase: 'http://localhost/vad/', onLoading: message => labels.push(message), ...options,
  })
  const advance = duration => {
    const target = now + duration
    while (true) {
      const next = [...timers.entries()].filter(([, task]) => task.due <= target).sort((a, b) => a[1].due - b[1].due)[0]
      if (!next) break
      now = next[1].due; timers.delete(next[0]); next[1].callback()
    }
    now = target
  }
  return { detector, worker, errors, labels, advance, timers, reply: data => worker.onmessage({ data }) }
}
const downloading = timedLoadingFixture(), downloadingStart = downloading.detector.start()
downloading.reply({ type: 'loading', stage: 'runtime' })
for (let index = 0; index < 6; index++) {
  downloading.advance(10000)
  downloading.reply({ type: 'loading', stage: 'download', loadedBytes: index * 10, totalBytes: 100 })
}
assert.equal(downloading.errors.length, 0, '持续下载60秒不能被旧的20/30秒总时限误杀')
assert.match(downloading.labels.at(-1), /50%/)
downloading.reply({ type: 'loading', stage: 'initialize' }); downloading.advance(45000)
assert.equal(downloading.errors.length, 0, '下载和模型初始化分别计时')
downloading.reply({ type: 'ready' }); await downloadingStart
assert.equal(downloading.timers.size, 0); downloading.detector.stop()

for (const failure of ['stalled', 'initialize', 'absolute', 'invalid', 'download-error', 'cancel']) {
  const f = timedLoadingFixture(), promise = f.detector.start(), rejected = assert.rejects(promise)
  f.reply({ type: 'loading', stage: 'download', loadedBytes: 1, totalBytes: 100 })
  if (failure === 'stalled') f.advance(30001)
  if (failure === 'initialize') { f.reply({ type: 'loading', stage: 'initialize' }); f.advance(60001) }
  if (failure === 'absolute') for (let index = 0; index < 18; index++) {
    f.advance(10000); f.reply({ type: 'loading', stage: 'download', loadedBytes: index + 2, totalBytes: 100 })
  }
  if (failure === 'invalid') f.reply({ type: 'loading', stage: 'download', loadedBytes: NaN, totalBytes: 100 })
  if (failure === 'download-error') f.reply({ type: 'error', stage: 'download' })
  if (failure === 'cancel') f.detector.stop()
  await rejected
  assert.equal(f.worker.stopped, true, failure); assert.equal(f.timers.size, 0, failure)
  assert.equal(f.errors.length, failure === 'cancel' ? 0 : 1, failure)
}

let clock = 1000
const createTimedDetector = load('../src/speechDetector.ts', 'createSpeechDetector', { Date: { now: () => clock } })
const loadingMessages = [], loadingErrors = [], loadingResults = []
const loadingWorker = { postMessage(message) { loadingMessages.push(message) }, terminate() { this.stopped = true } }
const slowLoading = createTimedDetector((pcm, probability) => loadingResults.push({ pcm, probability }), message => loadingErrors.push(message), {
  createWorker: () => loadingWorker, assetBase: 'http://localhost/vad/',
})
const slowStart = slowLoading.start(), startupPackets = []
for (let index = 0; index < 60; index++) {
  clock += 200
  startupPackets.push(packet(index))
  slowLoading.accept(startupPackets.at(-1))
}
assert.equal(loadingErrors.length, 0, '模型加载12秒不能触发运行期5秒积压保护')
assert.equal(loadingMessages.length, 1, '模型未就绪时不执行推理或放行音频')
loadingWorker.onmessage({ data: { type: 'ready' } }); await slowStart
for (let id = 0; id < 3; id++) loadingWorker.onmessage({ data: { type: 'result', id, probability: .01 } })
assert.deepEqual(loadingResults.map(result => result.pcm), startupPackets.slice(-3), '只处理最近600ms句首缓冲，丢弃加载期间的旧包')
assert.equal(loadingErrors.length, 0); slowLoading.stop()

const staleErrors = [], staleResults = []
const staleWorker = { postMessage() {}, terminate() { this.stopped = true } }
const stale = createTimedDetector((...result) => staleResults.push(result), message => staleErrors.push(message), {
  createWorker: () => staleWorker, assetBase: 'http://localhost/vad/',
})
const staleStart = stale.start(); staleWorker.onmessage({ data: { type: 'ready' } }); await staleStart
stale.accept(packet(9)); clock += 6000
staleWorker.onmessage({ data: { type: 'result', id: 0, probability: .9 } })
assert.equal(staleWorker.stopped, true); assert.equal(staleErrors.length, 1); assert.equal(staleResults.length, 0, '挂起后迟到的陈旧音频不能恢复上传')

for (const mode of ['load', 'result', 'order', 'crash', 'message', 'overflow', 'timeout', 'startup']) {
  const f = fixture({ packetTimeoutMs: 10, startupTimeoutMs: mode === 'startup' ? 10 : 20000 })
  const started = f.detector.start()
  if (mode === 'load' || mode === 'startup') {
    const rejected = assert.rejects(started)
    if (mode === 'load') f.reply({ type: 'error' })
    await rejected
  } else {
    f.reply({ type: 'ready' }); await started
    f.detector.accept(packet(4))
    if (mode === 'result') f.reply({ type: 'result', id: 0, probability: NaN })
    if (mode === 'order') f.reply({ type: 'result', id: 99, probability: .9 })
    if (mode === 'crash') f.worker.onerror({ preventDefault() {} })
    if (mode === 'message') f.worker.onmessageerror()
    if (mode === 'overflow') for (let index = 0; index < 25; index++) f.detector.accept(packet(index))
    if (mode === 'timeout') await new Promise(resolve => setTimeout(resolve, 30))
  }
  assert.equal(f.worker.stopped, true, mode)
  assert.equal(f.errors.length, 1, mode)
  assert.equal(f.results.length, 0, '故障不能放行未经检测的音频')
  f.detector.accept(packet(5)); assert.equal(f.errors.length, 1)
}

const createVoiceActivityGate = load('../src/voiceActivityGate.ts', 'createVoiceActivityGate')
const events = [], uploads = []
const gate = createVoiceActivityGate(() => events.push('start'), pcm => uploads.push(pcm), () => events.push('end'))
const lead = [packet(20), packet(21), packet(22)]
lead.forEach(pcm => gate.accept(pcm, .49))
assert.equal(uploads.length, 0)
const first = packet(23); gate.accept(first, .5)
assert.deepEqual(uploads, [...lead, first])
for (let index = 0; index < 20; index++) gate.accept(packet(24), .4)
assert.deepEqual(events, ['start'], '续讲采用较低门槛，避免轻声尾音被误判结束')
for (let index = 0; index < 8; index++) gate.accept(packet(25), .1)
assert.deepEqual(events, ['start', 'end'])
const countAfterEnd = uploads.length
const nextLead = [packet(30), packet(31), packet(32)]
nextLead.forEach(pcm => gate.accept(pcm, .01))
assert.equal(uploads.length, countAfterEnd, '长静音只本地监听，不上传')
const nextFirst = packet(33); gate.accept(nextFirst, .8)
assert.deepEqual(uploads.slice(countAfterEnd), [...nextLead, nextFirst], '每次重新开口都有完整且不重复的句首缓冲')
assert.throws(() => gate.accept(packet(0), NaN))

const createSileroClassifier = load('../src/sileroVadModel.ts', 'createSileroClassifier')
const observed = []
const fakeSession = { async run(feeds) {
  observed.push({ input: Array.from(feeds.input.data), state: Array.from(feeds.state.data), sr: feeds.sr.data[0] })
  return { output: new runtime.Tensor('float32', new Float32Array([.1]), [1, 1]),
    stateN: new runtime.Tensor('float32', new Float32Array(256).fill(observed.length), [2, 1, 128]) }
} }
const classify = createSileroClassifier(runtime, fakeSession)
for (let block = 0; block < 4; block++) {
  const pcm = new ArrayBuffer(6400), view = new DataView(pcm)
  for (let index = 0; index < 3200; index++) view.setInt16(index * 2, block * 3200 + index, true)
  await classify(pcm)
}
assert.equal(observed.length, 25, '800ms 必须产生25个32ms帧，不逐包丢样本或补零')
const reconstructed = observed.flatMap(frame => frame.input.slice(64))
for (let index = 0; index < reconstructed.length; index++) assert.equal(reconstructed[index], index / 32768)
assert.deepEqual(observed[0].input.slice(0, 64), Array(64).fill(0))
for (let frame = 1; frame < observed.length; frame++) {
  assert.deepEqual(observed[frame].input.slice(0, 64), observed[frame - 1].input.slice(-64))
  assert.equal(observed[frame].state[0], frame)
  assert.equal(observed[frame].sr, 16000n)
}
// 实际运行随仓库分发的固定模型和 WASM，不调用麦克风或云端。
const model = readFileSync(new URL('../public/vad/silero-v6.onnx', import.meta.url))
assert.equal(createHash('sha256').update(model).digest('hex'), '597d30b3ec076608d059477bb14cfeffdf951bf5cae370d38f65d33bbfe82004')
runtime.env.wasm.numThreads = 1
const session = await runtime.InferenceSession.create(model, { executionProviders: ['wasm'] })
try {
  const silence = createSileroClassifier(runtime, session)
  for (let index = 0; index < 10; index++) assert.ok(await silence(new ArrayBuffer(6400)) < .35)
  await assert.rejects(silence(new ArrayBuffer(2)), /Invalid/)
  if (process.argv[2]) {
    // 可选：使用公开或合成的16k单声道PCM示例，不收入仓库。
    const wave = readFileSync(process.argv[2])
    assert.equal(wave.toString('ascii', 0, 4), 'RIFF')
    let data, rate, channels, bits, format
    for (let offset = 12; offset + 8 <= wave.length;) {
      const name = wave.toString('ascii', offset, offset + 4), length = wave.readUInt32LE(offset + 4)
      if (name === 'fmt ') { format = wave.readUInt16LE(offset + 8); channels = wave.readUInt16LE(offset + 10); rate = wave.readUInt32LE(offset + 12); bits = wave.readUInt16LE(offset + 22) }
      if (name === 'data') data = wave.subarray(offset + 8, offset + 8 + length)
      offset += 8 + length + (length % 2)
    }
    assert.deepEqual([format, channels, rate, bits], [1, 1, 16000, 16])
    assert.ok(data && data.length >= 160000)
    const classifySpeech = createSileroClassifier(runtime, session), transitions = []
    let uploaded = 0, detectedPackets = 0
    const speechGate = createVoiceActivityGate(() => transitions.push('start'), () => uploaded++, () => transitions.push('end'))
    const feed = async pcm => { const probability = await classifySpeech(pcm); if (probability >= .5) detectedPackets++; speechGate.accept(pcm, probability) }
    for (let repetition = 0; repetition < 2; repetition++) {
      for (let index = 0; index < 25; index++) {
        const part = data.subarray(index * 6400, (index + 1) * 6400)
        await feed(part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength))
      }
      for (let index = 0; index < 25; index++) await feed(new ArrayBuffer(6400))
    }
    assert.ok(detectedPackets > 0, '真实模型必须能识别示例人声')
    assert.deepEqual(transitions, ['start', 'end', 'start', 'end'], '真实模型支持两次讲话与静音后的再次开口')
    assert.ok(uploaded < 100, '不应把完整静音等待段都上传')
    console.log(`提供的语音样本离线检查：20秒输入，${detectedPackets}个人声触发包，${(uploaded * .2).toFixed(1)}秒进入上传队列，两次讲话均自动结束。`)
  }
} finally { await session.release() }
console.log('通过：检测Worker顺序/取消/超时/故障/积压清理、每次句首保护/静音断流/续讲门槛、Silero帧上下文与跨包连续性，以及真实模型WASM静音推理；未调用真实麦克风或豆包。')
