// 仅统计元数据，不记录密钥、音频、字幕或完整响应。duration 保留原字段值，不推断计费量。
export function createAsrDiagnostics(requestId, { enabled = false, write = record => console.log('[ASR DEBUG]', JSON.stringify(record)), now = Date.now } = {}) {
  const startedAt = now()
  let ended = false, submittedPcmBytes = 0, completedPcmBytes = 0, packetCount = 0
  let serverDuration = null
  let endedAt = null
  const snapshot = () => ({ requestId, startedAt: new Date(startedAt).toISOString(), endedAt,
    active: !ended, submittedPcmBytes, submittedAudioSeconds: submittedPcmBytes / 32000,
    completedPcmBytes, completedAudioSeconds: completedPcmBytes / 32000, serverDuration })
  const emit = event => {
    if (!enabled) return
    try { write({ event, requestId, startedAt: new Date(startedAt).toISOString(),
      ...(event === 'end' ? { endedAt: new Date(now()).toISOString() } : {}),
      elapsedSeconds: (now() - startedAt) / 1000, packetCount,
      submittedPcmBytes, submittedAudioSeconds: submittedPcmBytes / 32000,
      completedPcmBytes, completedAudioSeconds: completedPcmBytes / 32000,
      serverDuration }) } catch { /* 日志故障不能影响识别或清理。 */ }
  }
  emit('start')
  return {
    snapshot,
    submitted(bytes) { submittedPcmBytes += bytes; packetCount++; if (packetCount % 50 === 0) emit('progress') },
    completed(bytes) { completedPcmBytes += bytes },
    response(payload) {
      const duration = payload?.audio_info?.duration
      if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) {
        serverDuration = { field: 'audio_info.duration', value: duration }
        // 累计时长只保留最新值，不能把多次响应的 duration 相加。
      }
    },
    end() { if (!ended) { ended = true; endedAt = new Date(now()).toISOString(); emit('end') } },
  }
}
