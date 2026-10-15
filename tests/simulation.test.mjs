import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'

function loadTypeScript(path, names) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({})
  vm.runInContext(ts.transpile(source + `\nglobalThis.exported = {${names.join(',')}}`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  return context.exported
}

// VM 上下文里的数组/对象原型与主上下文不同，deepEqual 前先经 JSON 归一化，避免误报。
const eq = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)))

const { parseMaterialPack } = loadTypeScript('../src/simulation/types.ts', ['parseMaterialPack'])
const { expandScenario } = loadTypeScript('../src/simulation/engine.ts', ['expandScenario'])
const { buildScenario, STRESS_DURATION_MS } = loadTypeScript('../src/simulation/scenarios.ts', ['buildScenario', 'STRESS_DURATION_MS'])

const example = JSON.parse(readFileSync(new URL('../materials/example.json', import.meta.url), 'utf8'))

// —— 素材校验：合法素材包能通过，且结构与示例一致 ——
const pack = parseMaterialPack(example)
assert.equal(pack.name, '示例素材包')
assert.equal(pack.characters.length, 8)
assert.equal(new Set(pack.characters.map(c => c.id)).size, 8)
assert.equal(pack.lines.length, 8)
assert.equal(pack.scenarios.stress.length, 6)
assert.ok(pack.scenarios.stress.every(phase => phase.length === 8))
assert.equal(pack.timing.speechRateMs, 30)
assert.equal(pack.timing.gapMs, 500)

// —— 素材校验：错误输入给出可读的中文错误 ——
assert.throws(() => parseMaterialPack(null), /素材包必须是 JSON 对象/)
assert.throws(() => parseMaterialPack([]), /素材包必须是 JSON 对象/)
assert.throws(() => parseMaterialPack({ ...example, name: '  ' }), /name/)
const dupId = JSON.parse(JSON.stringify(example)); dupId.characters[1].id = 'a'
assert.throws(() => parseMaterialPack(dupId), /重复/)
const badCharacter = JSON.parse(JSON.stringify(example)); badCharacter.lines[0].character = 'zzz'
assert.throws(() => parseMaterialPack(badCharacter), /character/)
const emptyText = JSON.parse(JSON.stringify(example)); emptyText.lines[0].text = ' '
assert.throws(() => parseMaterialPack(emptyText), /text/)
const badAt = JSON.parse(JSON.stringify(example)); badAt.lines[0].at = -1
assert.throws(() => parseMaterialPack(badAt), /at/)
const badDuration = JSON.parse(JSON.stringify(example)); badDuration.lines[0].duration = '长'
assert.throws(() => parseMaterialPack(badDuration), /duration/)
const badEight = JSON.parse(JSON.stringify(example)); delete badEight.scenarios.eight.followUp
assert.throws(() => parseMaterialPack(badEight), /followUp/)
const badStress = JSON.parse(JSON.stringify(example)); badStress.scenarios.stress[0][0] = ''
assert.throws(() => parseMaterialPack(badStress), /stress/)
const badTiming = JSON.parse(JSON.stringify(example)); badTiming.timing = { speechRateMs: -5 }
assert.throws(() => parseMaterialPack(badTiming), /speechRateMs/)
const badGap = JSON.parse(JSON.stringify(example)); badGap.timing = { gapMs: '长' }
assert.throws(() => parseMaterialPack(badGap), /gapMs/)

// —— 场景：七种场景的结构与时间轴 ——
assert.equal(STRESS_DURATION_MS, 60000)

const rapid = buildScenario('rapid', pack, 0)
assert.deepEqual(rapid.map(u => u.at), [0, 700, 1400])
assert.deepEqual(rapid.map(u => u.text), pack.scenarios.rapid)
assert.ok(rapid.every(u => u.memberIndex === 0))

const eight = buildScenario('eight', pack, 0)
assert.equal(eight.length, 16)
eq(eight.filter((_, i) => i % 2 === 0).map(u => u.text), pack.lines.map(l => l.text))
eq(eight.filter((_, i) => i % 2 === 0).map(u => u.memberIndex), [0, 1, 2, 3, 4, 5, 6, 7])
assert.ok(eight.filter((_, i) => i % 2 === 1).every(u => u.text === pack.scenarios.eight.followUp && u.at === 900))

const long = buildScenario('long', pack, 0)
assert.equal(long.length, 1)
assert.equal(long[0].text, pack.scenarios.long)

const fade = buildScenario('fade', pack, 0)
assert.deepEqual(fade.map(u => u.at), [0, 4000])
assert.deepEqual(fade.map(u => u.text), pack.scenarios.fade)

const overflow = buildScenario('overflow', pack, 0)
assert.equal(overflow.length, 20)
assert.equal(overflow[0].at, 0)
assert.equal(overflow[19].at, 1900)
assert.ok(overflow[0].text.startsWith('第1句：'))

const interim = buildScenario('interim', pack, 0)
assert.equal(interim.length, 2)
assert.equal(interim[0].interim.growth, 'chars')
assert.equal(interim[0].interim.steps, Array.from(interim[0].text).length)
assert.equal(interim[1].at, Array.from(interim[0].text).length * 250 + 1000)

// —— 压力测试：81 句、可重复、六段 24/3 交替 ——
const stress1 = buildScenario('stress', pack, 0)
const stress2 = buildScenario('stress', pack, 0)
assert.equal(stress1.length, 81)
assert.deepEqual(stress1, stress2, '压力测试必须可重复')
assert.equal(new Set(stress1.map(u => u.memberIndex)).size, 8)
assert.ok(stress1.every(u => u.interim && u.interim.steps === 4 && u.interim.growth === 'fraction'))
const perPhase = [0, 0, 0, 0, 0, 0]
for (const utterance of stress1) perPhase[Math.min(5, Math.floor(utterance.at / 10000))]++
assert.deepEqual(perPhase, [24, 3, 24, 3, 24, 3])
// 台词长度覆盖短/中/长三档（对应 3/6/10 秒显示）
const textLengths = Array.from(stress1, u => Array.from(u.text).length)
assert.ok(Math.min(...textLengths) <= 15, '压力测试应包含短句')
assert.ok(Math.max(...textLengths) > 30, '压力测试应包含长句')

// —— 素材对话（时间轴）：自动 / 手动 / 混合 ——
const autoPack = {
  timing: { speechRateMs: 30, gapMs: 500 },
  characters: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }],
  lines: [
    { character: 'a', text: '你好' },
    { character: 'b', text: '大家好' },
    { character: 'c', text: '这是一句足够长的台词用来检验时长按字数计算' },
  ],
}
const autoScript = buildScenario('script', autoPack, 0)
eq(autoScript.map(u => u.at), [0, 1100, 2200])
eq(autoScript.map(u => u.memberIndex), [0, 1, 2])
eq(autoScript.map(u => u.interim.intervalMs), [150, 150, 157.5])

const manualPack = {
  timing: { speechRateMs: 30, gapMs: 500 },
  characters: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }],
  lines: [
    { character: 'a', text: '第一句', at: 0, duration: 1500 },
    { character: 'b', text: '同时插话', at: 500, duration: 1000 },
    { character: 'a', text: '接着说', at: 2000, duration: 1200 },
  ],
}
const manualScript = buildScenario('script', manualPack, 0)
eq(manualScript.map(u => u.at), [0, 500, 2000])
eq(manualScript.map(u => u.memberIndex), [0, 1, 0])
eq(manualScript.map(u => u.interim.intervalMs), [375, 250, 300])
assert.ok(manualScript[1].at < manualScript[0].at + 1500, '手动时间轴允许多人发言重叠')

const mixedPack = {
  timing: { speechRateMs: 30, gapMs: 500 },
  characters: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }],
  lines: [
    { character: 'a', text: '自动开始' },
    { character: 'b', text: '只有时长', duration: 800 },
    { character: 'a', text: '只有开始', at: 3000 },
  ],
}
const mixedScript = buildScenario('script', mixedPack, 0)
eq(mixedScript.map(u => u.at), [0, 1100, 3000])
eq(mixedScript.map(u => u.interim.intervalMs), [150, 200, 150])

// —— 运行引擎：Interim/Final 展开 ——
const fraction = expandScenario([{ memberIndex: 0, at: 100, text: 'abcdefgh', interim: { steps: 4, intervalMs: 50, growth: 'fraction', finalAfterMs: 0 } }], () => 'id-1')
eq(fraction.map(e => e.text), ['ab', 'abcd', 'abcdef', 'abcdefgh', 'abcdefgh'])
eq(fraction.map(e => e.at), [100, 150, 200, 250, 300])
eq(fraction.map(e => e.state), ['interim', 'interim', 'interim', 'interim', 'final'])
assert.ok(fraction.every(e => e.utteranceId === 'id-1'))

const chars = expandScenario([{ memberIndex: 1, at: 0, text: '你好啊', interim: { steps: 3, intervalMs: 250, growth: 'chars', finalAfterMs: 500 } }], () => 'id-2')
eq(chars.map(e => e.text), ['你', '你好', '你好啊', '你好啊'])
eq(chars.map(e => e.at), [0, 250, 500, 1250])

const plain = expandScenario([{ memberIndex: 2, at: 700, text: '直接确认' }], () => 'id-3')
eq(plain, [{ at: 700, memberIndex: 2, utteranceId: 'id-3', text: '直接确认', state: 'final' }])

console.log('通过：素材包校验（合法/错误提示）、七种场景结构与时间轴、一分钟压力测试（81 句可重复）、素材对话自动/手动/混合时间轴、运行引擎的 Interim/Final 展开。')
