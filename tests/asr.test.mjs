import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source = readFileSync(new URL('../src/browserAsr.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export type \{.*$/gm, '').replace(/^export /gm, '')
const timers = new Map()
let timerId = 0
const context = vm.createContext({
  setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId },
  clearTimeout: id => timers.delete(id),
})
vm.runInContext(ts.transpile(source + '\nglobalThis.create = createBrowserAsr;', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
function fixture(options = {}) {
  const instances = [], states = [], results = [], discarded = []
  class Engine {
    constructor() { instances.push(this) }
    start() { if (options.throwStart) throw Error('start failed') }
    abort() { this.aborted = true }
  }
  const callbacks = {
    onState: (state, message) => states.push({ state, message }),
    onResult: (id, text, state) => results.push({ id, text, state }),
    onDiscard: id => discarded.push(id),
  }
  const environment = options.environment ?? { isSecureContext: true, webkitSpeechRecognition: Engine }
  const adapter = context.create(callbacks, environment)
  return { adapter, instances, states, results, discarded }
}
const result = (text, isFinal = false) => ({ isFinal, 0: { transcript: text } })
const fire = (engine, results, resultIndex = 0) => engine.onresult({ results, resultIndex })
const runTimer = ms => {
  const entry = [...timers].find(([, timer]) => timer.ms === ms)
  assert.ok(entry, `missing ${ms}ms timer`)
  timers.delete(entry[0]); entry[1].fn()
}
const f = fixture(); f.adapter.start(); f.adapter.start()
assert.equal(f.instances.length, 1)
const engine = f.instances[0]
assert.equal(engine.lang, 'zh-CN'); assert.equal(engine.continuous, true); assert.equal(engine.interimResults, true)
engine.onstart(); assert.equal(f.states.at(-1).state, 'listening')
fire(engine, [result('你')]); fire(engine, [result('你好')])
assert.equal(f.results[0].id, f.results[1].id)
fire(engine, [result('你好', true), result('下一句')])
const firstId = f.results[0].id, secondId = f.results.at(-1).id
assert.notEqual(firstId, secondId)
fire(engine, [result('你好', true), result('下一句话', true)], 1)
assert.equal(f.results.filter(r => r.state === 'final').length, 2)
fire(engine, [result('重复', true), result('重复', true)])
assert.equal(f.results.filter(r => r.state === 'final').length, 2)
fire(engine, [result('你好', true), result('下一句话', true), result('撤回')], 2)
const withdrawn = f.results.at(-1).id
fire(engine, [result('你好', true), result('下一句话', true)], 2)
assert.ok(f.discarded.includes(withdrawn))
const lateResult = engine.onresult, lateEnd = engine.onend
f.adapter.stop(); assert.equal(engine.aborted, true)
const count = f.results.length
lateResult({ results: [result('迟到', true)], resultIndex: 0 }); lateEnd()
assert.equal(f.results.length, count); assert.equal(timers.size, 0)
f.adapter.start(); const next = f.instances.at(-1); next.onstart(); fire(next, [result('新会话', true)])
assert.notEqual(f.results.at(-1).id, firstId)
next.onend(); assert.equal(f.states.at(-1).state, 'reconnecting'); runTimer(400)
const reconnected = f.instances.at(-1); reconnected.onstart(); reconnected.onend(); runTimer(400)
f.instances.at(-1).onend()
assert.equal(f.states.at(-1).state, 'error'); assert.equal(timers.size, 0)
for (const error of ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported', 'aborted', 'unknown']) {
  const f = fixture(); f.adapter.start(); const engine = f.instances[0]; engine.onstart()
  fire(engine, [result('未确认')]); engine.onerror({ error })
  assert.equal(f.states.at(-1).state, 'error'); assert.equal(engine.aborted, true)
  assert.equal(f.discarded.length, 1); assert.equal(timers.size, 0)
}
const silent = fixture(); silent.adapter.start()
silent.instances[0].onerror({ error: 'no-speech' }); assert.equal(silent.states.at(-1).state, 'reconnecting')
silent.adapter.stop(); assert.equal(timers.size, 0)
for (const environment of [{ isSecureContext: true }, { isSecureContext: false }]) {
  const f = fixture({ environment }); assert.equal(f.adapter.supported, false)
  f.adapter.start(); assert.equal(f.states.at(-1).state, 'error')
}
const thrown = fixture({ throwStart: true }); thrown.adapter.start()
assert.equal(thrown.states.at(-1).state, 'error'); assert.equal(timers.size, 0)
const timeout = fixture(); timeout.adapter.start(); runTimer(20000)
assert.equal(timeout.states.at(-1).state, 'error'); assert.equal(timeout.instances[0].aborted, true)
assert.equal(timers.size, 0)
console.log('通过：ASR 中文配置、稳定句子 ID、Final 去重、Interim 撤回、关闭及迟到回调、有限重连、权限/网络/设备/语言错误、不支持浏览器、启动异常及超时。')
