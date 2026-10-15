import type * as Ort from 'onnxruntime-web/wasm'

// Silero v6 官方流式契约：16kHz、512 新样本 + 64 上下文、独立循环状态。
export function createSileroClassifier(runtime: typeof Ort, session: Ort.InferenceSession) {
  let remainder = new Float32Array(0)
  let context = new Float32Array(64)
  let state = new Float32Array(256)
  return async (pcm: ArrayBuffer): Promise<number> => {
    if (pcm.byteLength !== 6400) throw Error('Invalid VAD audio packet')
    const samples = new Float32Array(remainder.length + 3200)
    samples.set(remainder)
    const view = new DataView(pcm)
    for (let index = 0; index < 3200; index++) samples[remainder.length + index] = view.getInt16(index * 2, true) / 32768
    let probability = 0, offset = 0
    while (offset + 512 <= samples.length) {
      const input = new Float32Array(576)
      input.set(context); input.set(samples.subarray(offset, offset + 512), 64)
      const feeds = {
        input: new runtime.Tensor('float32', input, [1, 576]),
        state: new runtime.Tensor('float32', state, [2, 1, 128]),
        sr: new runtime.Tensor('int64', new BigInt64Array([16000n]), []),
      }
      let outputs: Ort.InferenceSession.ReturnType | undefined
      try {
        outputs = await session.run(feeds)
        const value = Number(outputs.output?.data[0])
        if (!Number.isFinite(value) || value < 0 || value > 1 || outputs.stateN?.data.length !== 256) throw Error('Invalid VAD result')
        probability = Math.max(probability, value)
        state = new Float32Array(outputs.stateN.data as Float32Array)
        context = input.slice(-64)
      } finally {
        Object.values(feeds).forEach(tensor => tensor.dispose())
        if (outputs) Object.values(outputs).forEach(tensor => tensor.dispose())
      }
      offset += 512
    }
    // 200ms 与 32ms 帧不整除，余样本必须跨包保留，不能丢弃或逐包补零。
    remainder = samples.slice(offset)
    return probability
  }
}
