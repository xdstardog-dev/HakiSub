export const SPEECH_FREQUENCIES = [261.6256, 293.6648, 329.6276, 349.2282, 391.9954, 440, 493.8833, 523.2511] as const

export function createSpeechSound(createContext = () => new AudioContext()) {
  let context: AudioContext | undefined, volume = 60
  const active = new Set<() => void>()
  function stopAll() { for (const stop of [...active]) stop() }
  return {
    configure(value: number) { volume = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0; stopAll() },
    async unlock() {
      if (!volume) return false
      try {
        const current = context ??= createContext()
        if (current.state === 'suspended') await current.resume()
        return current === context && current.state === 'running'
      } catch { return false }
    },
    play(toneSlot: number) {
      // 未解锁直接丢弃，最多八个短音；同拍和弦降低单音增益，不排队补播。
      if (!volume || context?.state !== 'running' || !Number.isInteger(toneSlot) || toneSlot < 0 || toneSlot > 7 || active.size >= 8) return false
      let stop: (() => void) | undefined
      try {
        const oscillator = context.createOscillator(), gain = context.createGain(), time = context.currentTime
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(SPEECH_FREQUENCIES[toneSlot]!, time)
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(.055 * (volume / 100) ** 1.6, time + .012)
        gain.gain.exponentialRampToValueAtTime(.0001, time + .19)
        oscillator.connect(gain); gain.connect(context.destination)
        let stopped = false
        stop = () => {
          if (stopped) return
          stopped = true; active.delete(stop!); oscillator.onended = null
          try { oscillator.stop(); oscillator.disconnect(); gain.disconnect() } catch { /* 设备可提前关闭。 */ }
        }
        active.add(stop); oscillator.onended = stop
        oscillator.start(time); oscillator.stop(time + .21)
        return true
      } catch { stop?.(); return false }
    },
    close() { stopAll(); const previous = context; context = undefined; try { void previous?.close().catch(() => {}) } catch { /* 可重复清理。 */ } },
  }
}
