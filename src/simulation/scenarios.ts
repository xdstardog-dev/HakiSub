// 测试场景配置：七种内置演示场景 + 「素材对话（时间轴）」的节奏与说话人分配。
// 台词文本全部来自素材包，这里只保留时间轴与结构，因此改台词无需改代码。
import type { MaterialPack } from './types'
import type { ScenarioUtterance } from './engine'

export type ScenarioKey = 'rapid' | 'eight' | 'long' | 'fade' | 'overflow' | 'interim' | 'stress' | 'script'
export const STRESS_DURATION_MS = 60_000

export function buildScenario(key: ScenarioKey, pack: MaterialPack, firstActiveIndex: number): ScenarioUtterance[] {
  switch (key) {
    case 'eight': return eightScenario(pack)
    case 'long': return [{ memberIndex: firstActiveIndex, at: 0, text: pack.scenarios.long }]
    case 'fade': return fadeScenario(pack, firstActiveIndex)
    case 'overflow': return overflowScenario(pack, firstActiveIndex)
    case 'interim': return interimScenario(pack, firstActiveIndex)
    case 'stress': return stressScenario(pack)
    case 'script': return scriptScenario(pack)
    default: return rapidScenario(pack, firstActiveIndex)
  }
}

// 单人连续快速讲话：三句各隔 700ms，由第一位开启麦克风的成员说出。
function rapidScenario(pack: MaterialPack, first: number): ScenarioUtterance[] {
  return pack.scenarios.rapid.map((text, index) => ({ memberIndex: first, at: index * 700, text }))
}

// 八人同时讲话：每位成员说素材库中自己那一句，900ms 后再各追加一句。
function eightScenario(pack: MaterialPack): ScenarioUtterance[] {
  const utterances: ScenarioUtterance[] = []
  for (let memberIndex = 0; memberIndex < 8; memberIndex++) {
    const line = pack.lines[memberIndex]
    if (!line) continue
    utterances.push({ memberIndex, at: 0, text: line.text })
    utterances.push({ memberIndex, at: 900, text: pack.scenarios.eight.followUp })
  }
  return utterances
}

// 渐隐测试：第一句出现 4 秒后追加第二句。
function fadeScenario(pack: MaterialPack, first: number): ScenarioUtterance[] {
  return pack.scenarios.fade.map((text, index) => ({ memberIndex: first, at: index * 4000, text }))
}

// 内容溢出：每 100ms 追加一句，共 20 句，用来观察卡片自动滚动与裁切。
function overflowScenario(pack: MaterialPack, first: number): ScenarioUtterance[] {
  return Array.from({ length: 20 }, (_, index) => ({
    memberIndex: first,
    at: index * 100,
    text: `第${index + 1}句：${pack.scenarios.overflow}`,
  }))
}

// 实时识别到确认：第一句逐字 Interim 增长，确认后再追加第二句。
function interimScenario(pack: MaterialPack, first: number): ScenarioUtterance[] {
  const [text, followUp] = pack.scenarios.interim
  const length = Array.from(text).length
  return [
    { memberIndex: first, at: 0, text, interim: { steps: length, intervalMs: 250, growth: 'chars', finalAfterMs: 500 } },
    { memberIndex: first, at: length * 250 + 1000, text: followUp },
  ]
}

// 一分钟压力测试：六段对话，偶数段密集（8 人）、奇数段稀疏（1 人），每段三轮。
// 八个人的台词按轮次轮转，保证整分钟可重复、确定性一致。
function stressScenario(pack: MaterialPack): ScenarioUtterance[] {
  const phases = pack.scenarios.stress
  const utterances: ScenarioUtterance[] = []
  phases.forEach((lines, phase) => {
    const dense = phase % 2 === 0
    for (let round = 0; round < 3; round++) {
      const speakers = dense ? Array.from({ length: 8 }, (_, i) => i) : [(phase + round * 3) % 8]
      for (const memberIndex of speakers) {
        const text = lines[(memberIndex + round) % lines.length]!
        const duration = Math.min(1600, Math.max(600, Array.from(text).length * 30))
        utterances.push({
          memberIndex,
          at: phase * 10000 + round * (dense ? 3000 : 4000) + (dense ? memberIndex * 70 : 0),
          text,
          interim: { steps: 4, intervalMs: duration / 4, growth: 'fraction', finalAfterMs: 0 },
        })
      }
    }
  })
  return utterances.sort((a, b) => a.at - b.at)
}

// —— 素材对话（时间轴）：按 lines 顺序播放，可自动也可手动指定时间 ——

const DEFAULT_SPEECH_RATE_MS = 30
const DEFAULT_GAP_MS = 500
const MIN_DURATION_MS = 600
const MAX_DURATION_MS = 1600

// 自动时长：按文字长度 × 语速，并限制在合理区间，避免短句一闪而过。
function autoDuration(text: string, rate: number): number {
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Array.from(text).length * rate))
}

// 素材对话：默认按「上一句结束 + 停顿」自动排开始时间；填写 at / duration 则按填写值播放，
// 因此可以故意让多人同时发言（重叠）。character 对应到 characters 中的顺序即成员槽位。
function scriptScenario(pack: MaterialPack): ScenarioUtterance[] {
  const rate = pack.timing?.speechRateMs ?? DEFAULT_SPEECH_RATE_MS
  const gap = pack.timing?.gapMs ?? DEFAULT_GAP_MS
  const memberByCharacter = new Map(pack.characters.map((character, index) => [character.id, index]))
  const utterances: ScenarioUtterance[] = []
  let cursor = 0
  for (const line of pack.lines) {
    const memberIndex = memberByCharacter.get(line.character)
    if (memberIndex === undefined) continue
    const duration = line.duration ?? autoDuration(line.text, rate)
    const at = line.at ?? cursor
    utterances.push({ memberIndex, at, text: line.text, interim: { steps: 4, intervalMs: duration / 4, growth: 'fraction', finalAfterMs: 0 } })
    cursor = at + duration + gap
  }
  return utterances
}
