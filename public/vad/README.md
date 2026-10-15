# 本地 VAD 资源

- 模型：Silero VAD，官方固定发布标签 `v6.0`。
- 来源：<https://raw.githubusercontent.com/snakers4/silero-vad/v6.0/src/silero_vad/data/silero_vad.onnx>
- 本地名：`silero-v6.onnx`；SHA-256：`597d30b3ec076608d059477bb14cfeffdf951bf5cae370d38f65d33bbfe82004`。
- 许可证：随目录提供 `LICENSE.silero.txt`（MIT）。
- 推理契约依据：<https://github.com/snakers4/silero-vad/blob/v6.0/src/silero_vad/utils_vad.py>。16kHz、512新样本及64上下文样本，state形状为[2,1,128]。
- 运行时：`onnxruntime-web@1.24.3`，由npm锁文件固定；官方许可证及第三方声明随目录提供，来源为 <https://github.com/microsoft/onnxruntime/tree/v1.24.3>。

`npm run dev` / `npm run build` 前自动执行 `scripts/prepare-vad-runtime.mjs`，校验模型并从已安装依赖复制 `ort.wasm.min.mjs`、`ort-wasm-simd-threaded.mjs` 与 `ort-wasm-simd-threaded.wasm`。这些运行时副本由Git忽略，模型和许可证则随仓库保存。构建后整个 `dist/vad/` 随网站部署，不需要外部CDN或独立Python服务。

网页通过独立Worker使用单线程WASM；需要WebAssembly SIMD支持，不需要跨源隔离。模型更新需同步修改校验值、推理契约及测试；运行时更新需同步核对资源文件名和许可证。不可只更换WASM而保留旧版本JS。

`npm test` 包含固定模型的真实WASM静音推理及模拟状态检查；可选公开语音示例检查：`node tests/speech-detector.test.mjs <16kHz单声道16-bit PCM WAV路径>`。测试音频不收入仓库，不记录用户音频。

构建后可用 `node tests/vad-browser-smoke.mjs <Playwright模块路径或包名>` 检查本地正式网页；需另行提供Playwright及已安装的Chrome，或设 `VAD_BROWSER_CHANNEL=msedge` 使用Edge。此工具只用生成的静音模拟麦克风，不调用真实麦克风或豆包，不安装为产品依赖。
