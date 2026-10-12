export function createAudioResampler(inputRate: number, onPacket: (pcm: ArrayBuffer) => void) {
  if (!Number.isFinite(inputRate) || inputRate < 16000) throw Error('麦克风采样率不受支持')
  const ratio = inputRate / 16000
  let accumulatedWeight = 0, accumulatedValue = 0
  let packet = new ArrayBuffer(6400), view = new DataView(packet), sampleIndex = 0
  return (samples: Float32Array) => {
    // 按覆盖面积平均，保留跨音频块的小数相位；44.1kHz 不能简单地每隔三个样本取一个。
    // 优先由 AudioContext 以 16kHz 采集；此处是设备实际采样率不同的后备转换。
    for (const rawSample of samples) {
      const sample = Number.isFinite(rawSample) ? Math.max(-1, Math.min(1, rawSample)) : 0
      let remainingWeight = 1
      while (remainingWeight > 1e-9) {
        const weight = Math.min(remainingWeight, ratio - accumulatedWeight)
        accumulatedValue += sample * weight
        accumulatedWeight += weight
        remainingWeight -= weight
        if (accumulatedWeight >= ratio - 1e-9) {
          const value = Math.max(-1, Math.min(1, accumulatedValue / ratio))
          view.setInt16(sampleIndex++ * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
          accumulatedWeight = accumulatedValue = 0
          if (sampleIndex === 3200) {
            onPacket(packet)
            packet = new ArrayBuffer(6400); view = new DataView(packet); sampleIndex = 0
          }
        }
      }
    }
  }
}
