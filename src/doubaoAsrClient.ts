import { createAudioCapture, type AudioCapture } from './audioCapture'
import { createVoiceActivityGate } from './voiceActivityGate'
import { createSpeechDetector, type SpeechDetector } from './speechDetector'
import type { AsrCallbacks } from './captionEvents'

type ClientEnvironment = {
  createSocket: () => WebSocket
  createCapture: (onPacket: (pcm: ArrayBuffer) => void, onError: (message: string) => void) => AudioCapture
  createDetector: (onResult: (pcm: ArrayBuffer, probability: number) => void, onError: (message: string) => void) => SpeechDetector
}
export function createDoubaoAsrClient(callbacks: AsrCallbacks, environment: ClientEnvironment = {
  createSocket: () => new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/asr${roomToken ? `?session=${encodeURIComponent(roomToken)}` : ''}`),
  createCapture: createAudioCapture,
  createDetector: createSpeechDetector,
}, roomToken = '') {
  let generation = 0, active = false, microphoneReady = false
  let socket: WebSocket | undefined, capture: AudioCapture | undefined
  let detector: SpeechDetector | undefined
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  let gatewayReady = false, finishing = false, awaitingClose = false
  const queuedAudio: (ArrayBuffer | null)[] = []
  const pendingIds = new Set<string>()
  const cleanupSocket = () => {
    clearTimeout(startupTimer)
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      socket.close(); socket = undefined
    }
    gatewayReady = false; finishing = awaitingClose = false
    pendingIds.forEach(id => callbacks.onDiscard(id)); pendingIds.clear()
  }
  const cleanup = () => {
    active = false; generation++
    microphoneReady = false
    capture?.stop(); capture = undefined
    detector?.stop(); detector = undefined
    gate.reset(); queuedAudio.length = 0
    cleanupSocket()
  }
  const fail = (message: string) => { cleanup(); callbacks.onState('error', message) }
  const flush = () => {
    if (!gatewayReady || !socket || finishing) return
    let sentPackets = 0
    while (queuedAudio.length && sentPackets < 2) {
      if (queuedAudio[0] === null) {
        queuedAudio.shift()
        finishing = true; socket.send('finish')
        return
      }
      if (socket.bufferedAmount > 64000) { fail('音频上传积压，已关闭麦克风，请检查网络。'); return }
      socket.send(queuedAudio.shift()!)
      sentPackets++
    }
  }
  const connect = () => {
    if (!active || !microphoneReady || socket) return
    callbacks.onState('listening', '检测到说话，正在连接豆包…')
    const currentGeneration = generation
    startupTimer = setTimeout(() => { if (active && generation === currentGeneration) fail('连接豆包超时，请检查本地网关。') }, 15000)
    try {
      socket = environment.createSocket()
      socket.onmessage = event => {
        if (!active || generation !== currentGeneration) return
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'ready') {
            gatewayReady = true; clearTimeout(startupTimer)
            callbacks.onState('listening', '正在识别讲话 · 安静后自动暂停上传')
            flush()
          } else if (message.type === 'error') fail(typeof message.message === 'string' ? message.message : '豆包识别失败。')
          else if (message.type === 'ended') {
            // 网关仍可能占着单连接名额；等旧 WebSocket 真正关闭后再重连。
            awaitingClose = true; gatewayReady = false
            socket?.close()
          } else if (message.type === 'usage' && typeof message.requestId === 'string' &&
            typeof message.submittedAudioSeconds === 'number' && typeof message.completedAudioSeconds === 'number' &&
            (message.serverAudioSeconds === null || typeof message.serverAudioSeconds === 'number')) {
            callbacks.onUsage?.(message)
          } else if (message.type === 'discard' && typeof message.utteranceId === 'string') {
            pendingIds.delete(message.utteranceId); callbacks.onDiscard(message.utteranceId)
          } else if (message.type === 'caption' && typeof message.utteranceId === 'string' && typeof message.text === 'string' && ['interim', 'final'].includes(message.state)) {
            if (message.state === 'interim') pendingIds.add(message.utteranceId)
            else pendingIds.delete(message.utteranceId)
            callbacks.onResult(message.utteranceId, message.text, message.state)
          } else throw Error('无效网关响应')
        } catch { fail('本地识别网关返回异常数据，已关闭麦克风。') }
      }
      socket.onerror = () => { if (active && generation === currentGeneration && !awaitingClose) fail('无法连接本地语音网关，请运行 npm run dev 后重试。') }
      socket.onclose = () => {
        if (!active || generation !== currentGeneration) return
        if (!awaitingClose) { fail('语音连接已断开，麦克风已关闭，请手动重试。'); return }
        cleanupSocket()
        if (queuedAudio.length) connect()
        else callbacks.onState('listening', '麦克风已开启 · 等待说话（本地检测）')
      }
    } catch { fail('无法连接本地语音网关。') }
  }
  const gate = createVoiceActivityGate(
    () => { if (!socket && microphoneReady) connect() },
    pcm => {
      if (!active) return
      queuedAudio.push(pcm)
      // 网关正在结束上一句时，短暂缓存下一句；超限则安全停止，避免内存无限增长。
      if (queuedAudio.length > 50) { fail('语音连接恢复过慢，已关闭麦克风。'); return }
    },
    () => {
      if (!active) return
      queuedAudio.push(null)
    },
  )
  return {
    start() {
      if (active) return
      active = true; generation++
      const currentGeneration = generation
      callbacks.onState('starting', '正在准备麦克风与本地语音检测…')
      startupTimer = setTimeout(() => { if (active && generation === currentGeneration) fail('麦克风或本地语音检测启动超时。') }, 30000)
      try {
        detector = environment.createDetector((pcm, probability) => {
          if (!active || generation !== currentGeneration) return
          try {
            gate.accept(pcm, probability)
            // 每个判定后的原包推进有序补发，不靠页面定时器催上传。
            if (active) flush()
          } catch { if (active) fail('语音判断异常，已停止识别。') }
        }, message => { if (active && generation === currentGeneration) fail(message) })
        capture = environment.createCapture(pcm => {
          if (!active || generation !== currentGeneration) return
          detector?.accept(pcm)
        },
          message => { if (active && generation === currentGeneration) fail(message) })
        void Promise.all([capture.start(), detector.start()]).then(() => {
          if (!active || generation !== currentGeneration) return
          microphoneReady = true; clearTimeout(startupTimer)
          if (queuedAudio.length) connect()
          else callbacks.onState('listening', '麦克风已开启 · 等待说话（本地检测）')
        }).catch(error => { if (active && generation === currentGeneration) fail(error instanceof Error ? error.message : '无法启动语音识别。') })
      } catch { fail('无法初始化麦克风或本地语音检测，请检查浏览器支持。') }
    },
    stop() { cleanup(); callbacks.onState('idle', '麦克风已关闭') },
  }
}
