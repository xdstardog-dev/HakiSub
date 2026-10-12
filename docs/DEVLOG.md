# HakiSub 开发日志

日期：2026-10-12（Asia/Shanghai）

任务：在现有 Vue 项目中接入豆包 ASR 2.0 小时版单麦克风实时字幕。

已完成：
- 新增本地 Node.js WebSocket 网关、服务端环境变量鉴权、v3 二进制/Gzip 协议与错误帧解析。
- 新增 AudioWorklet 单麦克风采集、16kHz/16-bit/单声道 PCM 重采样和 200ms 分包。
- 浏览器 ASR 与豆包通过统一成员字幕事件接入原有生命周期；使用独立会话和稳定分句 ID，支持 Interim 原位更新、Final 去重和撤回。
- 保留原模拟、浏览器 ASR、布局和字幕计时；在真实麦克风模式下增加来源选择。预览发现窄窗口挤压，已改为独立一行。
- 实现停止/切换/隐藏/离房/断线清理、授权迟到释放、无自动重连、上传积压和会话时长限制。
- 新建 AGENTS.md、架构文档、空值 .env.example；更新 README 和本地同步说明。创建被 Git 忽略的空值 .env，等待用户填写。

修改的主要文件：
- `src/App.vue`、`src/browserAsr.ts`、`src/asrSession.ts`、`src/captionEvents.ts`。
- `src/audioCapture.ts`、`src/audioCapture.worklet.js`、`src/audioResampler.ts`、`src/doubaoAsrClient.ts`。
- `server/index.mjs`、`server/asrGateway.mjs`、`server/doubaoProtocol.mjs`、`server/doubaoResults.mjs`。
- `package.json`、`package-lock.json`、`vite.config.ts`；只新增 ws 运行依赖。
- `tests/doubao.test.mjs`、`tests/audio-capture.test.mjs`，适配并扩展 `tests/demo.test.mjs`、`tests/asr.test.mjs`。
- `README.md`、`AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/local-development.md`、`.env.example`；沿用之前已补充的 `.gitignore`。

测试结果：
- `npm test`：六个测试脚本全部通过。覆盖原有字幕/布局/模拟/浏览器 ASR，以及新协议、真实本地 WebSocket + 假上游、采样率转换、会话去重、取消/异常/权限竞态和资源清理。
- `npm run build`：TypeScript 与 Vite 生产构建通过。沙箱首次阻止 esbuild 子进程，获准在正常环境重跑后成功。
- 注入无效测试密钥标记进行构建，扫描 dist 未发现标记。
- `.env` 和 `.env.local` 被 Git 忽略，`.env` 未被跟踪；开发服务 `/.env` 返回 403。
- 新 `npm run dev` 启动成功；网页 `/` 返回 200；同源 `/api/asr/health` 返回 200 与 `configured:false`。
- 在现有内嵌预览页确认真实麦克风/豆包选项及窄窗口布局。Chrome 自动化连接不可用，未把界面检查视作 Chrome 麦克风验收。

未完成或已知问题：
- 没有真实 API Key，未调用真实豆包服务；真实权限、额度、识别准确率、网络兼容、音频设备与长时间稳定性尚未验收。
- 停止直接取消识别，丢弃未确认句和不足 200ms 的尾部音频。单次会话最多 15 分钟，不自动重连。
- 当前仍上传静音；没有本地 VAD、降噪、声纹、多麦克风、联机或其他显示端。网关仅限本机使用。

下一步建议：先填写 Key 完成真实麦克风验收，记录连续讲话、停顿、断网、关闭及 10 分钟稳定性；确认可用后再评估本地 VAD。
