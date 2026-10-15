// 模拟字幕运行逻辑：把“一段发言”展开成带时间的 Interim / Final 事件。
// 这里只做纯数据展开，不接触成员、DOM 或时钟，便于独立测试。

export type ScenarioUtterance = {
  memberIndex: number
  at: number
  text: string
  // 有 interim 时按节奏先多次 Interim、最后再 Final；没有则到点直接 Final。
  interim?: {
    steps: number
    intervalMs: number
    growth: 'chars' | 'fraction'
    finalAfterMs: number
  }
}

export type PrimitiveSimulationEvent = {
  at: number
  memberIndex: number
  utteranceId: string
  text: string
  state: 'interim' | 'final'
}

// 每次发言使用同一个 utteranceId，Interim 与 Final 才能被字幕生命周期正确关联。
export function expandScenario(utterances: ScenarioUtterance[], makeId: () => string): PrimitiveSimulationEvent[] {
  const events: PrimitiveSimulationEvent[] = []
  for (const utterance of utterances) {
    const utteranceId = makeId()
    const characters = Array.from(utterance.text)
    if (utterance.interim) {
      const { steps, intervalMs, growth, finalAfterMs } = utterance.interim
      for (let step = 0; step < steps; step++) {
        // chars 每次多一个字；fraction 按比例增长，与原有压力测试节奏一致。
        const text = growth === 'chars'
          ? characters.slice(0, step + 1).join('')
          : characters.slice(0, Math.ceil(characters.length * (step + 1) / steps)).join('')
        events.push({ at: utterance.at + intervalMs * step, memberIndex: utterance.memberIndex, utteranceId, text, state: 'interim' })
      }
      events.push({ at: utterance.at + intervalMs * steps + finalAfterMs, memberIndex: utterance.memberIndex, utteranceId, text: utterance.text, state: 'final' })
    } else {
      events.push({ at: utterance.at, memberIndex: utterance.memberIndex, utteranceId, text: utterance.text, state: 'final' })
    }
  }
  return events
}
