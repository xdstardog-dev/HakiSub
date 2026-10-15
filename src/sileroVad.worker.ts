import type * as Ort from 'onnxruntime-web/wasm'
import { createSileroClassifier } from './sileroVadModel'

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage: (message: unknown) => void
}
let classify: ReturnType<typeof createSileroClassifier> | undefined
let busy = false
workerScope.onmessage = async event => {
  if (busy) { workerScope.postMessage({ type: 'error' }); return }
  busy = true
  try {
    if (event.data.type === 'init' && !classify) {
      const runtime = await import(/* @vite-ignore */ new URL('ort.wasm.min.mjs', event.data.assetBase).href) as typeof Ort
      // 单线程 WASM 在专用 Worker 中运行，不要求跨源隔离或浏览器识别服务。
      runtime.env.wasm.numThreads = 1
      runtime.env.wasm.proxy = false
      runtime.env.wasm.wasmPaths = event.data.assetBase
      const session = await runtime.InferenceSession.create(new URL('silero-v6.onnx', event.data.assetBase).href, {
        executionProviders: ['wasm'], graphOptimizationLevel: 'all',
      })
      await createSileroClassifier(runtime, session)(new ArrayBuffer(6400))
      classify = createSileroClassifier(runtime, session)
      workerScope.postMessage({ type: 'ready' })
    } else if (event.data.type === 'audio' && classify) {
      const probability = await classify(event.data.pcm)
      workerScope.postMessage({ type: 'result', id: event.data.id, probability })
    } else throw Error('Invalid VAD request')
  } catch {
    workerScope.postMessage({ type: 'error' })
  } finally { busy = false }
}
