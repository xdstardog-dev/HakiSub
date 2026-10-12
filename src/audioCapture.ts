import { createAudioResampler } from './audioResampler'
export type AudioCapture = { start: () => Promise<void>; stop: () => void }

export function createAudioCapture(onPacket: (pcm: ArrayBuffer) => void, onError: (message: string) => void): AudioCapture {
  let stopped = false
  let stream: MediaStream | undefined, context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined, processor: AudioWorkletNode | undefined
  const stop = () => {
    stopped = true
    if (processor) { processor.port.onmessage = null; processor.port.close(); processor.disconnect() }
    source?.disconnect()
    stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
    if (context) { context.onstatechange = null; void context.close().catch(() => {}) }
  }
  return {
    stop,
    async start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('麦克风需要 Chrome 和本机 localhost 或 HTTPS 地址。')
      try {
        // 在用户点击的调用栈内 resume，避免自动播放策略把采集上下文挂起。
        context = new AudioContext({ sampleRate: 16000 })
        await context.resume()
        if (stopped) return
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        // 授权弹窗可能在点击停止后才返回，必须立即释放迟到的音轨。
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return }
        await context.audioWorklet.addModule(new URL('./audioCapture.worklet.js', import.meta.url))
        if (stopped) return
        const resample = createAudioResampler(context.sampleRate, pcm => { if (!stopped) onPacket(pcm) })
        source = context.createMediaStreamSource(stream)
        processor = new AudioWorkletNode(context, 'microphone-capture', { channelCount: 1, channelCountMode: 'explicit' })
        processor.port.onmessage = event => { if (!stopped) resample(event.data as Float32Array) }
        processor.onprocessorerror = () => { if (!stopped) onError('麦克风音频处理失败，请重新开启。') }
        stream.getAudioTracks().forEach(track => track.onended = () => { if (!stopped) onError('麦克风设备已断开，请检查设备。') })
        context.onstatechange = () => { if (!stopped && context?.state !== 'running') onError('麦克风采集被浏览器暂停，请重新开启。') }
        // Worklet 输出保持全零，只让音频图运行，不回放用户声音。
        source.connect(processor); processor.connect(context.destination)
      } catch (error) {
        stop()
        const name = error instanceof DOMException ? error.name : ''
        throw Error(name === 'NotAllowedError' ? '麦克风权限被拒绝，请在 Chrome 网站设置中允许。' : '无法开启麦克风，请检查设备、浏览器权限和音频支持。')
      }
    },
  }
}
