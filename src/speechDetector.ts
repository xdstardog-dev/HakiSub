export type SpeechDetector = { start: () => Promise<void>; accept: (pcm: ArrayBuffer) => void; stop: () => void }
type DetectorOptions = { createWorker?: () => Worker; assetBase?: string; startupTimeoutMs?: number; packetTimeoutMs?: number;
  initializationTimeoutMs?: number; maximumStartupMs?: number; onLoading?: (message: string) => void }

export function createSpeechDetector(onResult: (pcm: ArrayBuffer, probability: number) => void,
  onError: (message: string) => void, options: DetectorOptions = {}): SpeechDetector {
  let worker: Worker | undefined, stopped = false, ready = false, nextId = 0
  let inFlight: { id: number; pcm: ArrayBuffer; capturedAt: number } | undefined
  const queued: { pcm: ArrayBuffer; capturedAt: number }[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let startupDeadline: ReturnType<typeof setTimeout> | undefined
  let rejectStart: ((error: Error) => void) | undefined
  const stop = () => {
    stopped = true; ready = false; clearTimeout(timer); clearTimeout(startupDeadline)
    worker?.terminate(); worker = undefined
    queued.length = 0; inFlight = undefined
    rejectStart?.(Error('语音检测已停止。')); rejectStart = undefined
  }
  const fail = (message: string) => { if (!stopped) { stop(); onError(message) } }
  const dispatch = () => {
    if (stopped || !ready || inFlight || !queued.length) return
    const packet = queued.shift()!
    if (Date.now() - packet.capturedAt > 5000) { fail('本地语音检测延迟过大，已停止识别，请重新开启。'); return }
    inFlight = { id: nextId++, pcm: packet.pcm, capturedAt: packet.capturedAt }
    timer = setTimeout(() => fail('本地语音检测超时，已停止识别，请重新开启。'), options.packetTimeoutMs ?? 3000)
    // 只转移副本；原包留给句首缓冲和上传，不能被 Worker 转移后失效。
    const copy = packet.pcm.slice(0)
    try { worker!.postMessage({ type: 'audio', id: inFlight.id, pcm: copy }, [copy]) }
    catch { fail('本地语音检测失败，已停止识别。') }
  }
  return {
    stop,
    start() {
      return new Promise<void>((resolve, reject) => {
        if (stopped || worker) { reject(Error('无法重复启动语音检测。')); return }
        rejectStart = reject
        try {
          worker = options.createWorker?.() ?? new Worker(new URL('./sileroVad.worker.ts', import.meta.url), { type: 'module' })
          timer = setTimeout(() => fail('语音检测运行库加载超时，请检查网络后重新开启。'), options.startupTimeoutMs ?? 30000)
          startupDeadline = setTimeout(() => fail('语音检测准备时间过长，请检查网络与浏览器后重新开启。'), options.maximumStartupMs ?? 180000)
          worker.onerror = event => { event.preventDefault(); fail('本地语音检测无法运行，请使用支持 WebAssembly 的现代浏览器。') }
          worker.onmessageerror = () => fail('本地语音检测通信失败，已停止识别。')
          worker.onmessage = event => {
            if (stopped) return
            const message = event.data
            if (message?.type === 'loading' && !ready) {
              if (!['runtime', 'download', 'initialize'].includes(message.stage) || (message.stage === 'download' &&
                (!Number.isFinite(message.loadedBytes) || !Number.isFinite(message.totalBytes) || message.totalBytes <= 0 ||
                  message.loadedBytes < 0 || message.loadedBytes > message.totalBytes))) {
                fail('语音检测加载状态异常，请刷新网页。'); return
              }
              clearTimeout(timer)
              const initializing = message.stage === 'initialize'
              timer = setTimeout(() => fail(initializing ? '语音检测模型初始化超时，请使用新版浏览器重试。' :
                '语音检测资源下载停滞，请检查网络后重新开启。'), initializing ? (options.initializationTimeoutMs ?? 60000) : (options.startupTimeoutMs ?? 30000))
              options.onLoading?.(initializing ? '语音检测资源已下载，正在初始化模型…' : message.stage === 'runtime' ? '正在加载语音检测运行库…' :
                `正在下载语音检测资源 ${Math.floor(message.loadedBytes / message.totalBytes * 100)}% · 首次加载请稍候`)
            } else if (message?.type === 'ready' && !ready) {
              clearTimeout(timer); clearTimeout(startupDeadline); rejectStart = undefined; ready = true; resolve(); dispatch()
            } else if (message?.type === 'error' && !ready) {
              fail(message.stage === 'download' ? '语音检测资源下载失败或不完整，请检查网络后重试。' :
                message.stage === 'initialize' ? '语音检测模型初始化失败，请使用支持 WebAssembly SIMD 的新版浏览器。' : '语音检测运行库加载失败，请刷新网页后重试。')
            } else if (message?.type === 'result' && inFlight && message.id === inFlight.id &&
              Number.isFinite(message.probability) && message.probability >= 0 && message.probability <= 1) {
              clearTimeout(timer)
              if (Date.now() - inFlight.capturedAt > 5000) { fail('本地语音检测延迟过大，已停止识别，请重新开启。'); return }
              const pcm = inFlight.pcm; inFlight = undefined
              onResult(pcm, message.probability)
              dispatch()
            } else fail('本地语音检测失败，已停止识别；不会自动切换为持续上传。')
          }
          const assetBase = options.assetBase ?? new URL(`${import.meta.env.BASE_URL}vad/`, location.origin).href
          worker.postMessage({ type: 'init', assetBase })
        } catch { fail('无法加载本地语音检测，请检查浏览器支持及网页资源。') }
      })
    },
    accept(pcm) {
      if (stopped) return
      if (pcm.byteLength !== 6400) { fail('本地音频格式异常，已停止识别。'); return }
      if (!ready) {
        // 首次加载模型可能超过5秒；此时尚未开始识别，只滚动保留最近600ms，
        // 避免把正常加载当作运行积压，也不在就绪后补算过时音频。
        queued.push({ pcm, capturedAt: Date.now() })
        if (queued.length > 3) queued.shift()
        return
      }
      if (queued.length + (inFlight ? 1 : 0) >= 25) { fail('本地语音检测积压，已停止识别，请重新开启。'); return }
      queued.push({ pcm, capturedAt: Date.now() }); dispatch()
    },
  }
}
