# HakiSub 维护规范

- 用途：面对面交流的实时字幕；Vue 3、TypeScript、Vite，Node.js 本地语音网关。
- `src/App.vue` 负责交互；`captions.ts` 负责既有字幕生命周期；音频采集、重采样、ASR 通信分别放在职责明确的模块中。`server/` 独立处理密钥和豆包协议。
- ASR 通过统一字幕事件传递 memberId、utteranceId、text、interim/final；不要把供应商结构写进 UI。
- 文件和函数使用清晰完整的英文名称；关键算法用简短中文注释说明原因与边界。最小必要抽象，不预建空模块。
- 密钥只从服务端环境或根目录 `.env` 读取；不得输出到日志、前端、Git 或 `VITE_*`。示例只含占位符。默认不保存音频及识别历史。
- 保留模拟模式、浏览器 ASR、字幕时间规则、布局及清理行为。新增音频处理应接在上传前；会话状态不得跨成员共享。
- 变更后执行 `npm test`、`npm run build`；新增通信与音频逻辑须有模拟测试。真实 API 和麦克风验收必须单独记录，不得用模拟成功代替。
- 完成检查、网关、UI、测试时简短汇报进度与阻塞；维护 README、docs/ARCHITECTURE.md，任务结束追加 docs/DEVLOG.md 的实际修改和测试结果。
