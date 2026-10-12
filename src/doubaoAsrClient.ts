import { createAudioCapture, type AudioCapture } from './audioCapture'
import type { AsrCallbacks } from './captionEvents'

type ClientEnvironment = {
  createSocket: () => WebSocket
  createCapture: (onPacket: (pcm: ArrayBuffer) => void, onError: (message: string) => void) => AudioCapture
}
export function createDoubaoAsrClient(callbacks: AsrCallbacks, environment: ClientEnvironment = {
  createSocket: () => new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/asr`),
  createCapture: createAudioCapture,
}) {
  let generation = 0, active = false
  let socket: WebSocket | undefined, capture: AudioCapture | undefined
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  const pendingIds = new Set<string>()
  const cleanup = () => {
    active = false; generation++
    clearTimeout(startupTimer)
    capture?.stop(); capture = undefined
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      socket.close(); socket = undefined
    }
    pendingIds.forEach(id => callbacks.onDiscard(id)); pendingIds.clear()
  }
  const fail = (message: string) => { cleanup(); callbacks.onState('error', message) }
  return {
    start() {
      if (active) return
      active = true
      const currentGeneration = ++generation
      const valid = () => active && generation === currentGeneration
      callbacks.onState('starting', '正在请求麦克风权限并连接豆包…')
      startupTimer = setTimeout(() => { if (valid()) fail('启动超时，请确认麦克风授权和本地网关已启动。') }, 20000)
      let microphoneReady = false, gatewayReady = false
      const reportReady = () => {
        if (valid() && microphoneReady && gatewayReady) {
          clearTimeout(startupTimer)
          callbacks.onState('listening', '麦克风已开启 · 豆包 ASR 2.0')
        }
      }
      try {
        capture = environment.createCapture(pcm => {
          if (!valid() || !gatewayReady || socket?.readyState !== 1) return
          if (socket.bufferedAmount > 64000) { fail('音频上传积压，已关闭麦克风，请检查网络。'); return }
          socket.send(pcm)
        }, message => { if (valid()) fail(message) })
        // 先取得麦克风权限再建立付费会话；取消授权不会产生云端连接。
        void capture.start().then(() => {
          if (!valid()) return
          microphoneReady = true
          socket = environment.createSocket()
          socket.onmessage = event => {
            if (!valid()) return
            try {
              const message = JSON.parse(event.data)
              if (message.type === 'ready') { gatewayReady = true; reportReady() }
              else if (message.type === 'error') fail(typeof message.message === 'string' ? message.message : '豆包识别失败。')
              else if (message.type === 'ended') { cleanup(); callbacks.onState('idle', '识别会话已结束，请手动开启麦克风。') }
              else if (message.type === 'discard' && typeof message.utteranceId === 'string') {
                pendingIds.delete(message.utteranceId); callbacks.onDiscard(message.utteranceId)
              } else if (message.type === 'caption' && typeof message.utteranceId === 'string' && typeof message.text === 'string' && ['interim', 'final'].includes(message.state)) {
                if (message.state === 'interim') pendingIds.add(message.utteranceId)
                else pendingIds.delete(message.utteranceId)
                callbacks.onResult(message.utteranceId, message.text, message.state)
              } else throw Error('无效网关响应')
            } catch { fail('本地识别网关返回异常数据，已关闭麦克风。') }
          }
          socket.onerror = () => { if (valid()) fail('无法连接本地语音网关，请运行 npm run dev 后重试。') }
          socket.onclose = () => { if (valid()) fail('语音连接已断开，麦克风已关闭，请手动重试。') }
        }).catch(error => { if (valid()) fail(error instanceof Error ? error.message : '无法启动语音识别。') })
      } catch { fail('无法初始化麦克风，请使用支持音频采集的 Chrome。') }
    },
    stop() { cleanup(); callbacks.onState('idle', '麦克风已关闭') },
  }
}
