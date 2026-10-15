export type VoiceActivityGate = { accept: (pcm: ArrayBuffer, speechProbability: number) => void; reset: () => void }
type VoiceActivityOptions = { preRollMs?: number; tailMs?: number }
const packetMs = 200

export function createVoiceActivityGate(onStart: () => void, onAudio: (pcm: ArrayBuffer) => void,
  onEnd: () => void, options: VoiceActivityOptions = {}): VoiceActivityGate {
  const preRollPackets = Math.max(2, Math.ceil((options.preRollMs ?? 500) / packetMs) + 1)
  const tailPackets = Math.max(1, Math.ceil((options.tailMs ?? 1600) / packetMs))
  const ring = new Array<ArrayBuffer | undefined>(preRollPackets)
  let ringNext = 0, ringLength = 0, quietPackets = 0, speaking = false
  const reset = () => { ring.fill(undefined); ringNext = ringLength = quietPackets = 0; speaking = false }
  return {
    reset,
    accept(pcm, speechProbability) {
      if (pcm.byteLength !== 6400 || !Number.isFinite(speechProbability) || speechProbability < 0 || speechProbability > 1) throw Error('Invalid speech detection result')
      // 续讲门槛较低，轻声尾音不因概率在门槛附近波动而频繁断流。
      const voiced = speechProbability >= (speaking ? 0.35 : 0.5)
      if (!speaking) {
        ring[ringNext] = pcm
        ringNext = (ringNext + 1) % preRollPackets
        ringLength = Math.min(preRollPackets, ringLength + 1)
        if (!voiced) return
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
