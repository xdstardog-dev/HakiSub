// 只采集单声道浮点样本；重采样和供应商协议留在各自模块。
class MicrophoneCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const samples = inputs[0]?.[0]
    if (samples) this.port.postMessage(samples.slice())
    return true
  }
}
registerProcessor('microphone-capture', MicrophoneCaptureProcessor)
