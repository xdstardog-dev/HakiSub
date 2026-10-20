import type * as Ort from 'onnxruntime-web/wasm'
import { createSileroClassifier } from './sileroVadModel'
import { downloadVadAsset, vadAssetSizes, vadAssetUrl, vadDownloadBytes } from './vadAssets'

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage: (message: unknown) => void
}
let classify: ReturnType<typeof createSileroClassifier> | undefined
let busy = false
let loadingStage = 'runtime'
workerScope.onmessage = async event => {
  if (busy) { workerScope.postMessage({ type: 'error' }); return }
  busy = true
  try {
    if (event.data.type === 'init' && !classify) {
      workerScope.postMessage({ type: 'loading', stage: 'runtime' })
      const base = event.data.assetBase
      const runtime = await import(/* @vite-ignore */ vadAssetUrl(base, 'ort.wasm.min.mjs')) as typeof Ort
      loadingStage = 'download'
      const received = { model: 0, wasm: 0 }
      let lastReport = 0
      const report = () => {
        const loadedBytes = received.model + received.wasm
        if (Date.now() - lastReport < 200 && loadedBytes !== vadDownloadBytes) return
        lastReport = Date.now()
        workerScope.postMessage({ type: 'loading', stage: 'download', loadedBytes, totalBytes: vadDownloadBytes })
      }
      workerScope.postMessage({ type: 'loading', stage: 'download', loadedBytes: 0, totalBytes: vadDownloadBytes })
      const [model, wasm] = await Promise.all([
        downloadVadAsset(vadAssetUrl(base, 'silero-v6.onnx'), vadAssetSizes.model, bytes => { received.model = bytes; report() }),
        downloadVadAsset(vadAssetUrl(base, 'ort-wasm-simd-threaded.wasm'), vadAssetSizes.wasm, bytes => { received.wasm = bytes; report() }),
      ])
      loadingStage = 'initialize'
      workerScope.postMessage({ type: 'loading', stage: 'initialize' })
      // 单线程 WASM 在专用 Worker 中运行，不要求跨源隔离或浏览器识别服务。
      runtime.env.wasm.numThreads = 1
      runtime.env.wasm.proxy = false
      runtime.env.wasm.wasmPaths = { mjs: vadAssetUrl(base, 'ort-wasm-simd-threaded.mjs') }
      runtime.env.wasm.wasmBinary = wasm
      const session = await runtime.InferenceSession.create(model, {
        executionProviders: ['wasm'], graphOptimizationLevel: 'all',
      })
      await createSileroClassifier(runtime, session)(new ArrayBuffer(6400))
      classify = createSileroClassifier(runtime, session)
      loadingStage = 'ready'
      workerScope.postMessage({ type: 'ready' })
    } else if (event.data.type === 'audio' && classify) {
      const probability = await classify(event.data.pcm)
      workerScope.postMessage({ type: 'result', id: event.data.id, probability })
    } else throw Error('Invalid VAD request')
  } catch {
    workerScope.postMessage({ type: 'error', stage: loadingStage })
  } finally { busy = false }
}
