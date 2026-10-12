import type { AsrCallbacks } from './captionEvents'
export type { AsrState } from './captionEvents'
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
export type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }
export interface RecognitionEngine {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
export type AsrEnvironment = {
  isSecureContext: boolean
  SpeechRecognition?: new () => RecognitionEngine
  webkitSpeechRecognition?: new () => RecognitionEngine
}
const asrErrors: Record<string, string> = {
  'not-allowed': '麦克风授权被拒绝。请在浏览器网站设置中允许麦克风，再点击开启；内嵌预览请改用独立浏览器标签页。',
  'service-not-allowed': '浏览器禁止使用语音识别服务。请检查浏览器或系统语音设置，或改用 Chrome。',
  'audio-capture': '无法采集麦克风。请检查设备连接、系统权限及是否被其他应用占用。',
  network: '语音识别服务连接失败。请检查网络；浏览器的在线识别服务可能在当前网络不可用。',
  'language-not-supported': '当前识别服务不支持普通话（zh-CN）。请更换浏览器或系统语音设置。',
  aborted: '语音识别已被浏览器中断，请重新开启麦克风。',
}

// The browser owns microphone capture and its ASR transport. No audio recording,
// extra getUserMedia stream, API key or application server is involved.
export function createBrowserAsr(callbacks: AsrCallbacks, environment: AsrEnvironment = window as unknown as AsrEnvironment) {
  const Engine = environment.SpeechRecognition ?? environment.webkitSpeechRecognition
  let engine: RecognitionEngine | null = null
  let wanted = false
  let session = 0
  let emptyRestarts = 0
  let restartTimer: ReturnType<typeof setTimeout> | undefined
  let startTimer: ReturnType<typeof setTimeout> | undefined
  const interimIds = new Set<string>()
  const discardInterims = () => {
    interimIds.forEach(id => callbacks.onDiscard(id))
    interimIds.clear()
  }
  const detach = () => {
    clearTimeout(restartTimer)
    clearTimeout(startTimer)
    restartTimer = startTimer = undefined
    const previous = engine
    engine = null
    if (previous) {
      previous.onstart = previous.onresult = previous.onerror = previous.onend = null
      try { previous.abort() } catch { /* Some engines are already stopped. */ }
    }
    discardInterims()
  }
  const fail = (message: string) => {
    wanted = false
    detach()
    callbacks.onState('error', message)
  }
  const launch = () => {
    if (!wanted || !Engine) return
    try {
      const current = new Engine()
      engine = current
      const sessionId = ++session
      const finalized = new Set<number>()
      const valid = () => wanted && engine === current
      current.lang = 'zh-CN'
      current.continuous = true
      current.interimResults = true
      current.maxAlternatives = 1
      current.onstart = () => {
        if (!valid()) return
        clearTimeout(startTimer)
        callbacks.onState('listening', '麦克风已开启 · 普通话')
      }
      current.onresult = event => {
        if (!valid()) return
        emptyRestarts = 0
        // Interim results can shrink or disappear when the engine revises them.
        for (const id of interimIds) {
          const index = Number(id.slice(id.lastIndexOf('-') + 1))
          if (index >= event.results.length) {
            callbacks.onDiscard(id)
            interimIds.delete(id)
          }
        }
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (finalized.has(i)) continue
          const result = event.results[i]!
          const id = `asr-${sessionId}-${i}`
          const text = result[0].transcript.trim()
          if (result.isFinal) {
            finalized.add(i)
            interimIds.delete(id)
          } else {
            interimIds.add(id)
          }
          if (text) callbacks.onResult(id, text, result.isFinal ? 'final' : 'interim')
          else callbacks.onDiscard(id)
        }
      }
      current.onerror = event => {
        if (!valid()) return
        if (event.error === 'no-speech') {
          // Retry a silent session only a bounded number of times.
          reconnect()
        } else {
          fail(asrErrors[event.error] ?? `语音识别失败（${event.error}），请重新开启麦克风。`)
        }
      }
      current.onend = () => { if (valid()) reconnect() }
      startTimer = setTimeout(() => {
        if (valid()) fail('麦克风或识别服务启动超时。请检查授权、网络，并在独立浏览器标签页重试。')
      }, 20000)
      current.start()
    } catch {
      fail('无法启动语音识别。请检查浏览器权限，并重新点击开启麦克风。')
    }
  }
  const reconnect = () => {
    detach()
    if (!wanted) return
    if (++emptyRestarts > 2) {
      fail('长时间未收到语音，或识别服务反复断开，麦克风已关闭。请重新点击开启。')
      return
    }
    callbacks.onState('reconnecting', '识别会话已结束，正在重新连接…')
    restartTimer = setTimeout(launch, 400)
  }
  return {
    supported: !!Engine && environment.isSecureContext,
    start() {
      if (wanted) return
      if (!environment.isSecureContext) {
        fail('麦克风需要安全连接。请通过 HTTPS 或本机 localhost 打开；手机不能使用普通 HTTP 局域网地址。')
        return
      }
      if (!Engine) {
        fail('当前浏览器不支持实时语音识别，请使用支持该功能的 Chrome 或 Safari，或切回模拟模式。')
        return
      }
      wanted = true
      emptyRestarts = 0
      callbacks.onState('starting', '正在请求麦克风权限并连接识别服务…')
      launch()
    },
    stop() {
      wanted = false
      detach()
      callbacks.onState('idle', '麦克风已关闭')
    },
  }
}
