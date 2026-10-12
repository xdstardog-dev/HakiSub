// full 返回累计分句。用分句顺序而非文字/时间戳作 ID，避免临时文字和时间修订生成重复字幕。
export function createDoubaoResultMapper(sessionId) {
  let finalizedCount = 0
  let pendingCount = 0
  return payload => {
    const result = Array.isArray(payload.result) ? payload.result[0] : payload.result
    if (!result || !Array.isArray(result.utterances)) return []
    const utterances = result.utterances
    const events = []
    for (let index = finalizedCount; index < utterances.length; index++) {
      const utterance = utterances[index]
      if (typeof utterance.text !== 'string' || typeof utterance.definite !== 'boolean') throw Error('分句格式错误')
      const utteranceId = `${sessionId}-${index}`
      if (utterance.text.trim()) events.push({ type: 'caption', utteranceId, text: utterance.text, state: utterance.definite ? 'final' : 'interim' })
      else events.push({ type: 'discard', utteranceId })
      if (utterance.definite) {
        // full 协议中已确认分句应是连续前缀；不猜测缺失的 Final。
        if (index !== finalizedCount) throw Error('分句确认顺序异常')
        finalizedCount++
      }
    }
    for (let index = Math.max(finalizedCount, utterances.length); index < pendingCount; index++) {
      events.push({ type: 'discard', utteranceId: `${sessionId}-${index}` })
    }
    pendingCount = Math.max(finalizedCount, utterances.length)
    return events
  }
}
