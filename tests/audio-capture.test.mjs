import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const captureSource = readFileSync(new URL('../src/audioCapture.ts', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '').replace('import.meta.url', '"http://localhost/src/audioCapture.ts"')
function fixture({ denied = false, moduleError = false } = {}) {
  let resolveMedia
  const track = { stopCount: 0, stop() { this.stopCount++ } }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  const contexts = [], processors = [], errors = [], packets = []
  class AudioContext {
    sampleRate = 16000; state = 'running'; destination = {}; closed = false
    constructor() { contexts.push(this) }
    audioWorklet = { addModule: async () => { if (moduleError) throw Error('module failed') } }
    resume = async () => {}
    close = async () => { this.closed = true; this.state = 'closed' }
    createMediaStreamSource = () => ({ connect() {}, disconnect() {} })
  }
  class AudioWorkletNode {
    constructor() { processors.push(this) }
    port = { close() { this.closed = true } }
    connect() {}
    disconnect() { this.disconnected = true }
  }
  const context = vm.createContext({ window: { isSecureContext: true }, navigator: { mediaDevices: { getUserMedia: () => denied ? Promise.reject(new DOMException('denied', 'NotAllowedError')) : new Promise(resolve => { resolveMedia = resolve }) } },
    AudioContext, AudioWorkletNode, URL, DOMException, createAudioResampler: (_rate, onPacket) => onPacket })
  vm.runInContext(ts.transpile(captureSource + '\nglobalThis.create = createAudioCapture', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  const capture = context.create(packet => packets.push(packet), message => errors.push(message))
  return { capture, track, contexts, processors, errors, packets, allow: () => resolveMedia(stream) }
}
const pending = fixture()
const pendingStart = pending.capture.start(); await new Promise(resolve => setImmediate(resolve))
pending.capture.stop(); pending.allow(); await pendingStart
assert.equal(pending.track.stopCount, 1); assert.equal(pending.contexts[0].closed, true); assert.equal(pending.processors.length, 0)

const active = fixture()
const activeStart = active.capture.start(); await new Promise(resolve => setImmediate(resolve)); active.allow(); await activeStart
const processor = active.processors[0], lateAudio = processor.port.onmessage
lateAudio({ data: new Float32Array([1]) }); assert.equal(active.packets.length, 1)
active.track.onended(); assert.match(active.errors[0], /断开/)
active.capture.stop(); lateAudio({ data: new Float32Array([1]) })
assert.equal(active.packets.length, 1); assert.equal(active.track.stopCount, 1)
assert.equal(active.contexts[0].closed, true); assert.equal(processor.disconnected, true); assert.equal(processor.port.closed, true)

const rejected = fixture({ denied: true })
await assert.rejects(rejected.capture.start(), /权限被拒绝/)
assert.equal(rejected.contexts[0].closed, true)
const broken = fixture({ moduleError: true })
const brokenStart = broken.capture.start(); await new Promise(resolve => setImmediate(resolve)); broken.allow()
await assert.rejects(brokenStart, /无法开启麦克风/)
assert.equal(broken.track.stopCount, 1); assert.equal(broken.contexts[0].closed, true)
console.log('通过：麦克风授权取消竞态、正常停止后迟到音频、设备断开、权限拒绝、Worklet失败后的资源释放（使用模拟设备）。')

