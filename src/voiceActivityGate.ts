export type VoiceActivityGate = { accept: (pcm: ArrayBuffer) => void; reset: () => void }
type VoiceActivityOptions = { preRollMs?: number; tailMs?: number }
const packetMs = 200

export function createVoiceActivityGate(onStart: () => void, onAudio: (pcm: ArrayBuffer) => void,
  onEnd: () => void, options: VoiceActivityOptions = {}): VoiceActivityGate {
  const preRollPackets = Math.max(2, Math.ceil((options.preRollMs ?? 500) / packetMs) + 1)
  const tailPackets = Math.max(1, Math.ceil((options.tailMs ?? 1600) / packetMs))
  const ring = new Array<ArrayBuffer | undefined>(preRollPackets)
  let ringNext = 0, ringLength = 0, quietPackets = 0, speaking = false, noiseFloor = 0.003
  const reset = () => { ring.fill(undefined); ringNext = ringLength = quietPackets = 0; speaking = false; noiseFloor = 0.003 }
  return {
    reset,
    accept(pcm) {
      if (pcm.byteLength !== 6400) return
      const samples = new DataView(pcm)
      let packetEnergy = 0, activeFrames = 0
      const threshold = Math.max(0.006, noiseFloor * 2.5)
      // 20ms 子帧避免一个很短的字被整包 200ms 静音稀释。
      for (let frame = 0; frame < 10; frame++) {
        let energy = 0
        for (let i = 0; i < 320; i++) {
          const value = samples.getInt16((frame * 320 + i) * 2, true) / 32768
          energy += value * value
        }
        packetEnergy += energy
        if (Math.sqrt(energy / 320) >= threshold) activeFrames++
      }
      const voiced = activeFrames >= 2
      if (!speaking) {
        ring[ringNext] = pcm
        ringNext = (ringNext + 1) % preRollPackets
        ringLength = Math.min(preRollPackets, ringLength + 1)
        if (!voiced) {
          const rms = Math.sqrt(packetEnergy / 3200)
          noiseFloor = Math.min(0.02, noiseFloor * 0.98 + rms * 0.02)
          return
        }
        speaking = true; quietPackets = 0
        onStart()
        // 从最老到最新只读一次；触发包也在环中，不能再单独发送。
        for (let offset = ringLength; offset > 0; offset--) onAudio(ring[(ringNext - offset + preRollPackets) % preRollPackets]!)
        ringLength = 0
        return
      }
      onAudio(pcm)
      quietPackets = voiced ? 0 : quietPackets + 1
      if (quietPackets >= tailPackets) { reset(); onEnd() }
    },
  }
}
