import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
import { ref, computed } from 'vue'
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const script = source('../src/App.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const simulationTypes = source('../src/simulation/types.ts').replace(/^export /gm, '')
const simulationEngine = source('../src/simulation/engine.ts').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const simulationScenarios = source('../src/simulation/scenarios.ts').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const materialPacks = [JSON.parse(readFileSync(new URL('../materials/example.json', import.meta.url), 'utf8'))]
const asrModel = source('../src/browserAsr.ts').replace(/^import .*$/gm, '').replace(/^export type \{.*$/gm, '').replace(/^export /gm, '')
const sessionModel = source('../src/asrSession.ts').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const model = source('../src/captions.ts').replace(/^export /gm, '')
let time = 1_800_000_000_000
const timers = []
let cleanup
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])) } static now() { return time } }
class FakeRecognition {
  static instances = []
  constructor() { FakeRecognition.instances.push(this) }
  start() {}
  abort() { this.aborted = true }
}
const browserEvents = new Map(), documentEvents = new Map()
const browser = { isSecureContext: true, SpeechRecognition: FakeRecognition, addEventListener: (name, fn) => browserEvents.set(name, fn), removeEventListener: name => browserEvents.delete(name) }
const documentStub = { hidden: false, addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: name => documentEvents.delete(name) }
let doubaoCallbacks, doubaoStopped = false
const context = vm.createContext({ createDoubaoAsrClient: callbacks => {
  doubaoCallbacks = callbacks
  return { start: () => { doubaoStopped = false; callbacks.onState('listening', '测试豆包') }, stop: () => { doubaoStopped = true; callbacks.onState('idle', '已停止') } }
}, window: browser, document: documentStub, clearTimeout, ref, computed, onUnmounted: fn => cleanup = fn, location: { pathname: '/' }, crypto: webcrypto, Date: Clock, setInterval: (fn, ms) => { timers.push({fn, ms}); return timers.length }, clearInterval: id => timers[id - 1].cleared = true, setTimeout, navigator: {}, materialState: { packs: materialPacks, errors: [] } })
const exported = 'globalThis.demo = {name,code,mode,joined,members,captions,inputMode,asrState,asrProvider,micOpenSeconds,micStartedAt,usageTotals,changeAsrProvider,changeInputMode,toggleRealMic,scenario,scenarioRunning,stressProgress,enter,addMember,setMemberCount,toggleMemberMic,recognize,runSimulation,tick,leave,displayDuration,captionOpacity,characterCount};'
vm.runInContext(ts.transpile(asrModel + sessionModel + simulationTypes + simulationEngine + simulationScenarios + model + script + exported, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const d = context.demo
assert.equal(d.asrProvider.value, 'doubao', '产品默认识别来源为豆包')
const advance = ms => { time += ms; d.tick() }
d.enter(); assert.equal(d.joined.value, false)
d.name.value = '测试'; d.mode.value = 'join'; d.code.value = 'abc'; d.enter(); assert.equal(d.joined.value, false)
d.code.value = '123456'; d.enter(); assert.equal(d.joined.value, true)
for (const [length, duration] of [[1,3000],[15,3000],[16,6000],[30,6000],[31,10000]]) {
  assert.equal(d.displayDuration('中'.repeat(length)), duration)
}
assert.equal(d.characterCount('你好， 世界！'), 4)
for (const [length, hold] of [[15,3000],[16,6000],[30,6000],[31,10000]]) {
  const member = d.members.value[0].id
  d.recognize(member, `boundary${length}`, '中'.repeat(length), 'final')
  const c = d.captions.value.at(-1)
  advance(hold - 1); assert.equal(d.captionOpacity(c, time), 1)
  advance(1); assert.equal(d.captionOpacity(c, time), 1)
  advance(1000); assert.equal(d.captionOpacity(c, time), .5)
  advance(999); assert.ok(d.captions.value.includes(c))
  advance(1); assert.equal(d.captionOpacity(c, time), 0); assert.ok(!d.captions.value.includes(c))
}
const a = d.members.value[0].id, b = d.members.value[1].id
d.recognize(a, 'stream', '我', 'interim')
advance(20000); assert.equal(d.captions.value.length, 1)
d.recognize(a, 'stream', '我正在不断说话', 'interim'); assert.equal(d.captions.value.length, 1)
assert.equal(d.captions.value[0].finalizedAt, null)
d.recognize(a, 'stream', '我说完了。', 'final')
const deadlineStart = d.captions.value[0].finalizedAt
advance(4000)
d.recognize(a, 'stream', '重复回调', 'final')
assert.equal(d.captions.value[0].finalizedAt, deadlineStart)
d.recognize(a, 'next', '下一句', 'final'); d.recognize(b, 'other', '同时讲话', 'final')
assert.equal(d.captions.value.length, 3)
assert.equal(d.captionOpacity(d.captions.value[0], time), .5)
advance(1000); assert.equal(d.captions.value.length, 2)
assert.equal(d.captions.value[0].id, 'next')
d.toggleMemberMic(a); d.recognize(a, 'muted', '不应该出现', 'final'); assert.equal(d.captions.value.length, 2)
advance(4000); assert.equal(d.captions.value.length, 0)
d.toggleMemberMic(a)
d.recognize(a, 'cancelled', '未完成', 'interim'); d.toggleMemberMic(a); assert.equal(d.captions.value.length, 0)
d.toggleMemberMic(a)
for (let n = 1; n <= 8; n++) {
  d.setMemberCount({ target: { value: String(n) } })
  assert.equal(d.members.value.length, n); assert.equal(d.members.value[0].id, a)
}
for (const invalid of ['0', '9', 'bad', '2.5']) {
  d.setMemberCount({ target: { value: invalid } }); assert.equal(d.members.value.length, 8)
}
d.addMember(); assert.equal(d.members.value.length, 8)
assert.equal(new Set(d.members.value.map(m => m.id)).size, 8)
for (const scenario of ['rapid', 'eight', 'long', 'fade', 'overflow', 'interim']) {
  d.leave(); d.enter(); d.scenario.value = scenario
  const stableIds = d.members.value.map(m => m.id)
  d.runSimulation()
  assert.equal(d.scenarioRunning.value, true)
  const initialCount = d.captions.value.length
  d.runSimulation(); assert.equal(d.captions.value.length, initialCount, '不能叠加测试调度')
  if (scenario === 'eight') assert.equal(d.captions.value.length, 8)
  for (let elapsed = 0; elapsed < 7000; elapsed += 50) {
    advance(50)
    if (elapsed === 1950 && scenario === 'overflow') assert.equal(d.captions.value.length, 20)
    if (elapsed === 1950 && scenario === 'rapid') assert.equal(d.captions.value.length, 3)
    if (elapsed === 3950 && scenario === 'fade') {
      assert.equal(d.captions.value.length, 2)
      assert.equal(d.captionOpacity(d.captions.value[0], time), .5)
    }
    if (elapsed === 2950 && scenario === 'interim') {
      assert.equal(d.captions.value.length, 1); assert.equal(d.captions.value[0].state, 'interim')
    }
  }
  assert.equal(d.members.value.slice(0, 4).map(m => m.id).join(), stableIds.join(), '发言不改变位置')
  advance(20000); assert.equal(d.captions.value.length, 0); assert.equal(d.scenarioRunning.value, false)
}
d.scenario.value = 'interim'; d.runSimulation(); d.leave(); d.enter(); advance(1000)
assert.equal(d.captions.value.length, 0, '离房取消未执行的模拟事件')
d.scenario.value = 'eight'; d.runSimulation(); d.setMemberCount({ target: { value: '1' } }); advance(900)
assert.ok(d.captions.value.every(c => c.memberId === d.members.value[0].id))
d.leave(); assert.equal(d.members.value.length, 0); assert.equal(d.captions.value.length, 0)
// 素材对话（时间轴）：自动补齐成员并按自动时间轴播放
d.enter(); d.scenario.value = 'script'
d.runSimulation()
assert.equal(d.scenarioRunning.value, true)
assert.equal(d.members.value.length, 8, '素材对话自动补齐到素材包角色数')
assert.ok(d.members.value.every(m => m.mic))
assert.ok(d.captions.value.length > 0, '素材对话已开始播放')
for (let elapsed = 0; elapsed < 30000; elapsed += 50) advance(50)
assert.equal(d.captions.value.length, 0); assert.equal(d.scenarioRunning.value, false)
d.leave()
// Exercise the complete minute without a real-time wait, including the drain period.
d.enter(); d.scenario.value = 'stress'; d.members.value.forEach(m => m.mic = false)
d.runSimulation()
assert.equal(d.members.value.length, 8)
assert.ok(d.members.value.every(m => m.mic))
const stressIds = d.members.value.map(m => m.id).join()
const seenFinals = new Set(), seenMembers = new Set(), durations = new Set()
const perPhase = Array(6).fill(0)
let sawInterim = false, sawFadeWithNew = false, peak = 0
for (let elapsed = 0; elapsed <= 60000; elapsed += 50) {
  if (elapsed) advance(50)
  assert.equal(d.members.value.map(m => m.id).join(), stressIds)
  for (const c of d.captions.value) {
    if (c.state === 'interim') sawInterim = true
    if (c.state === 'final' && !seenFinals.has(c.id)) {
      seenFinals.add(c.id); seenMembers.add(c.memberId); durations.add(c.holdMs)
      perPhase[Math.min(5, Math.floor(elapsed / 10000))]++
    }
    if (d.captionOpacity(c, time) < 1 && d.captions.value.some(other => other.memberId === c.memberId && other.id !== c.id && d.captionOpacity(other, time) === 1)) sawFadeWithNew = true
  }
  peak = Math.max(peak, d.captions.value.length)
  if (elapsed < 60000) assert.equal(d.scenarioRunning.value, true)
}
assert.equal(seenFinals.size, 81)
assert.equal(seenMembers.size, 8)
assert.deepEqual([...durations].sort(), [3000, 6000, 10000].sort())
assert.deepEqual(perPhase, [24, 3, 24, 3, 24, 3])
assert.ok(sawInterim && sawFadeWithNew && peak > 16)
assert.ok(d.stressProgress.value.startsWith('60 / 60'))
assert.ok(d.captions.value.every(c => c.state === 'final'))
advance(12000)
assert.equal(d.captions.value.length, 0); assert.equal(d.scenarioRunning.value, false)
assert.ok(d.stressProgress.value.includes('完成'))
d.runSimulation(); advance(1000); d.leave(); d.enter(); advance(60000)
assert.equal(d.captions.value.length, 0, '离房取消整分钟的待执行事件')
d.leave()
// Real input uses the same caption lifecycle and cannot run alongside simulation.
d.enter(); d.scenario.value = 'stress'; d.runSimulation(); advance(100)
d.changeInputMode({ target: { value: 'microphone' } })
d.changeAsrProvider({ target: { value: 'browser' } })
assert.equal(d.scenarioRunning.value, false); assert.equal(d.captions.value.length, 0)
d.runSimulation(); advance(2000); assert.equal(d.captions.value.length, 0)
d.toggleRealMic()
const realEngine = FakeRecognition.instances.at(-1)
assert.equal(d.asrState.value, 'starting')
realEngine.onstart()
assert.equal(d.members.value[0].mic, true)
const realEvent = (text, isFinal = false) => ({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] })
realEngine.onresult(realEvent('你好'))
const realId = d.captions.value[0].id
realEngine.onresult(realEvent('你好大家好'))
assert.equal(d.captions.value.length, 1); assert.equal(d.captions.value[0].id, realId)
assert.equal(d.captions.value[0].memberId, d.members.value[0].id)
realEngine.onresult(realEvent('你好大家好', true))
d.toggleRealMic(); assert.equal(realEngine.aborted, true)
assert.equal(d.members.value[0].mic, false)
advance(4000); assert.equal(d.captionOpacity(d.captions.value[0], time), .5)
advance(1000); assert.equal(d.captions.value.length, 0)
d.toggleRealMic(); const deniedEngine = FakeRecognition.instances.at(-1)
deniedEngine.onerror({ error: 'not-allowed' }); assert.equal(d.asrState.value, 'error')
d.toggleRealMic(); const hiddenEngine = FakeRecognition.instances.at(-1)
hiddenEngine.onstart(); hiddenEngine.onresult(realEvent('还没说完'))
documentStub.hidden = true
assert.equal(documentEvents.has('visibilitychange'), false)
assert.equal(hiddenEngine.aborted, undefined, '切换窗口后保持麦克风开启')
browserEvents.get('pagehide')()
assert.equal(hiddenEngine.aborted, true); assert.equal(d.captions.value.length, 0)
documentStub.hidden = false
d.toggleRealMic(); const switchedEngine = FakeRecognition.instances.at(-1)
d.changeInputMode({ target: { value: 'simulation' } })
assert.equal(switchedEngine.aborted, true)
d.runSimulation(); assert.ok(d.captions.value.length > 0)
d.changeInputMode({ target: { value: 'microphone' } }); d.toggleRealMic()
const leavingEngine = FakeRecognition.instances.at(-1); d.leave()
assert.equal(leavingEngine.aborted, true)
d.enter(); d.changeAsrProvider({ target: { value: 'doubao' } }); d.toggleRealMic()
assert.equal(d.asrProvider.value, 'doubao'); assert.equal(d.asrState.value, 'listening')
advance(5000)
assert.equal(d.micOpenSeconds.value, 5)
doubaoCallbacks.onUsage({ requestId: 'first', submittedAudioSeconds: 1, completedAudioSeconds: .8, serverAudioSeconds: null })
doubaoCallbacks.onUsage({ requestId: 'first', submittedAudioSeconds: 2, completedAudioSeconds: 2, serverAudioSeconds: 1.5 })
doubaoCallbacks.onUsage({ requestId: 'second', submittedAudioSeconds: .6, completedAudioSeconds: .4, serverAudioSeconds: null })
assert.equal(d.usageTotals.value.submitted, 2.6, '不同 VAD 连接求和，同连接更新不重复累计')
assert.equal(d.usageTotals.value.completed, 2.4)
assert.equal(d.usageTotals.value.returned, 1.5)
assert.equal(d.usageTotals.value.returnedSegments, 1)
doubaoCallbacks.onResult('sentence-0', '豆', 'interim')
doubaoCallbacks.onResult('sentence-0', '豆包测试', 'interim')
assert.equal(d.captions.value.length, 1); assert.equal(d.captions.value[0].finalizedAt, null)
doubaoCallbacks.onResult('sentence-0', '豆包测试。', 'final')
const doubaoId = d.captions.value[0].id
assert.equal(d.captions.value[0].memberId, d.members.value[0].id)
d.toggleRealMic(); assert.equal(doubaoStopped, true)
advance(3000)
assert.equal(d.micOpenSeconds.value, 5, '关麦后时钟冻结')
doubaoCallbacks.onUsage({ requestId: 'late', submittedAudioSeconds: 20, completedAudioSeconds: 20, serverAudioSeconds: 20 })
assert.equal(d.usageTotals.value.submitted, 2.6, '迟到事件不计入已结束的开麦')
d.toggleRealMic(); doubaoCallbacks.onResult('sentence-0', '第二次开启', 'final')
assert.equal(d.usageTotals.value.submitted, 0, '再次手动开麦开始新统计')
doubaoCallbacks.onUsage({ requestId: 'third', submittedAudioSeconds: .2, completedAudioSeconds: .2, serverAudioSeconds: 0 })
assert.equal(d.usageTotals.value.returnedSegments, 1, '服务端零时长响应也属于已返回')
assert.equal(d.captions.value.length, 2); assert.notEqual(d.captions.value[1].id, doubaoId)
d.changeAsrProvider({ target: { value: 'browser' } }); assert.equal(doubaoStopped, true)
assert.equal(d.micStartedAt.value, null, '切换识别来源清除本次统计')
assert.equal(d.captions.value.length, 2, '换来源保留已确认字幕的原生命周期')
advance(12000); assert.equal(d.captions.value.length, 0)
d.leave()
cleanup(); assert.ok(timers.every(t => t.cleared))
assert.equal(browserEvents.size, 0); assert.equal(documentEvents.size, 0)
console.log('通过：真实识别接入现有生命周期、模式隔离、授权失败、切屏保持/离页关闭、字数边界、独立生命周期、渐隐中加入新句、Interim 原位更新与确认、重复 Final、成员隔离与静音、六种模拟、一分钟压力测试（81 句）、1～8 人切换、离房及卸载清理。')
