import { normalizeSoundPreferences, QUICK_REACTIONS, type ReactionType, type SoundPreferences, type SoundState } from './roomInteractions'

export type SoundSlot = ReactionType | 'default'
const soundDirectory = '/sounds/reactions/'
const maximumAssetBytes = 1024 * 1024
const maximumDurationSeconds = 5
type SoundSlots = { default: string; reactions: Partial<Record<ReactionType, string>> }
export function normalizeSoundSlots(value: unknown): SoundSlots {
  const defaults: SoundSlots = { default: 'default.mp3', reactions: Object.fromEntries(QUICK_REACTIONS.map(option => [option.type, `${option.type}.mp3`])) }
  if (!value || typeof value !== 'object') return defaults
  const candidate = value as { default?: unknown; reactions?: Record<string, unknown> }
  // 配置只允许同目录 MP3，不能把成员浏览器导向外部地址或其他应用资源。
  const validFile = (file: unknown): file is string => typeof file === 'string' && /^[a-zA-Z0-9_-]{1,80}\.mp3$/i.test(file)
  if (validFile(candidate.default)) defaults.default = candidate.default
  for (const option of QUICK_REACTIONS) {
    const file = candidate.reactions?.[option.type]
    if (validFile(file)) defaults.reactions[option.type] = file
  }
  return defaults
}

export function createReactionSound(createContext = () => new AudioContext(), initialPreferences?: SoundPreferences,
  request: typeof fetch = (...args) => fetch(...args)) {
  let context: AudioContext | undefined, slotsPromise: Promise<SoundSlots> | undefined
  let preferences = normalizeSoundPreferences(initialPreferences), unavailable = false, generation = 0
  const buffers = new Map<string, Promise<AudioBuffer>>()
  const controllers = new Set<AbortController>(), pendingPlays = new Set<symbol>(), activeTones = new Set<() => void>()
  const stopTones = () => { for (const stop of [...activeTones]) stop() }
  const cancelLoads = () => { for (const controller of controllers) controller.abort(); controllers.clear() }
  async function readAsset(file: string, maximumBytes: number): Promise<ArrayBuffer> {
    const controller = new AbortController()
    controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), 5000)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const response = await request(soundDirectory + file, { signal: controller.signal, cache: 'no-cache', credentials: 'same-origin', redirect: 'error' })
      if (!response.ok || !response.body) throw Error('Sound asset unavailable')
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maximumBytes) throw Error('Sound asset too large')
        chunks.push(value)
      }
      const result = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
      return result.buffer
    } finally {
      clearTimeout(timeout); controllers.delete(controller)
      try { await reader?.cancel() } catch { /* 请求可能已取消。 */ }
      reader?.releaseLock()
    }
  }
  function loadSlots() {
    return slotsPromise ??= readAsset('slots.json', 16384).then(bytes => normalizeSoundSlots(JSON.parse(new TextDecoder().decode(bytes))))
      .catch(() => normalizeSoundSlots(undefined))
  }
  function loadBuffer(file: string, requested: AudioContext) {
    let pending = buffers.get(file)
    if (!pending) {
      pending = readAsset(file, maximumAssetBytes).then(bytes => requested.decodeAudioData(bytes)).then(buffer => {
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > maximumDurationSeconds) throw Error('Sound duration invalid')
        return buffer
      })
      buffers.set(file, pending)
      const current = pending
      void pending.catch(() => { if (buffers.get(file) === current) buffers.delete(file) })
    }
    return pending
  }
  return {
    configure(value: SoundPreferences) {
      preferences = normalizeSoundPreferences(value); generation++; stopTones()
      if (!preferences.enabled || !preferences.volume) { cancelLoads(); slotsPromise = undefined }
    },
    getState(): SoundState {
      if (!preferences.enabled || preferences.volume === 0) return 'muted'
      if (pendingPlays.size) return 'loading'
      if (unavailable) return 'unavailable'
      if (!context) return 'idle'
      return context.state === 'running' ? 'ready' : 'blocked'
    },
    async unlock() {
      if (!preferences.enabled || preferences.volume === 0) return false
      try {
        const requested = context ??= createContext()
        unavailable = false
        if (requested.state === 'suspended') await requested.resume()
        return context === requested && preferences.enabled && preferences.volume > 0 && requested.state === 'running'
      } catch { unavailable = !context; return false }
    },
    async play(slot: SoundSlot = 'default') {
      if (!preferences.enabled || !preferences.volume || context?.state !== 'running' || activeTones.size + pendingPlays.size >= 3) return false
      const requested = context, operation = generation, token = Symbol()
      const current = () => requested === context && operation === generation && preferences.enabled && preferences.volume > 0 && requested.state === 'running'
      pendingPlays.add(token)
      let stopOnError: (() => void) | undefined
      try {
        const slots = await loadSlots()
        if (!current()) return false
        const file = slot === 'default' ? slots.default : slots.reactions[slot] ?? slots.default
        let buffer: AudioBuffer
        try { buffer = await loadBuffer(file, requested) }
        catch {
          if (!current() || file === slots.default) throw Error('Sound slot unavailable')
          buffer = await loadBuffer(slots.default, requested)
        }
        // 解码可能晚于静音、音量修改或离房；过期任务不能继续发声。
        if (!current()) return false
        const source = requested.createBufferSource(), gain = requested.createGain()
        source.buffer = buffer
        gain.gain.setValueAtTime(preferences.volume / 100, requested.currentTime)
        source.connect(gain); gain.connect(requested.destination)
        let stopped = false
        const stop = () => {
          if (stopped) return
          stopped = true; activeTones.delete(stop); source.onended = null
          try { source.stop() } catch { /* 素材可能已经播完。 */ }
          try { source.disconnect(); gain.disconnect() } catch { /* 设备可能已经关闭。 */ }
        }
        stopOnError = stop; activeTones.add(stop); source.onended = stop
        source.start(); source.stop(requested.currentTime + buffer.duration)
        unavailable = false
        return true
      } catch { stopOnError?.(); if (current()) unavailable = true; return false }
      finally { pendingPlays.delete(token) }
    },
    close() {
      generation++; stopTones(); cancelLoads(); pendingPlays.clear(); buffers.clear(); slotsPromise = undefined
      const previous = context; context = undefined; unavailable = false
      try { void previous?.close().catch(() => {}) } catch { /* 清理可以重复执行。 */ }
    },
  }
}
