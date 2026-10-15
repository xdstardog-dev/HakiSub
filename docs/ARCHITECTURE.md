# HakiSub 架构

`src/` 是 Vue 网页；`server/` 是本地 Node.js 语音网关；`tests/` 包含字幕、布局、浏览器和豆包模拟测试；`docs/` 保存维护说明和实际开发记录。

## 音频到字幕

```text
App.vue（来源选择与麦克风按钮）
  → asrSession.ts（为成员创建独立会话）
     ├─ browserAsr.ts → 浏览器 Web Speech API
     └─ doubaoAsrClient.ts
          ← audioCapture.ts / audioCapture.worklet.js（单麦克风）
          ← audioResampler.ts（16kHz、16-bit LE、单声道，每200ms一包）
          → voiceActivityGate.ts（本地音量检测、起始缓冲、安静判停）
          → /api/asr → server/asrGateway.mjs
          → doubaoProtocol.mjs → 豆包 ASR 2.0 WebSocket
          ← doubaoResults.mjs（供应商分句转成通用事件）
  → captionEvents.ts（memberId / utteranceId / text / interim或final）
  → App.vue → captions.ts → MemberCaptionGrid.vue
```

`captions.ts` 是唯一字幕生命周期实现：Interim 原位更新、不计时；Final 确认后按字数保留 3/6/10 秒，再渐隐 2 秒。模拟模式仍直接使用它。

## 协议与会话边界

- 网关固定连接 `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`；资源为 `volc.seedasr.sauc.duration`。请求头为 `X-Api-Key`、`X-Api-Resource-Id`、随机 `X-Api-Request-Id`。
- v3 二进制：四字节头、可选响应序号、大端长度、Gzip 负载。首包为 JSON 配置，随后为 PCM 包；解析响应和供应商错误帧，验证长度及压缩类型。末包标志与负序号按协议解析。用户停止是立即取消连接，不等待最终补字。
- `show_utterances=true`、`result_type=full`、`enable_nonstream=true`。默认模型支持普通话，双向接口不传旧文档中 nostream 专用的 `language`。
- 全量响应的已确认分句是稳定前缀。用会话 ID + 分句顺序映射 Interim/Final，避免文字和临时时间戳修订造成重复。仅 `definite=true` 触发 Final；不会凭静音时间猜 Final。累计历史只在当前响应解析，不保存文本历史；映射器只保留计数。
- 二遍识别仍使用云端默认分句；本地声音检测只决定上传和会话边界，不代替云端的 definite 标记。检测在 200ms PCM 包内使用 20ms 子帧，约 40ms 达门槛即可触发；环形缓冲保留可配置的约 500ms 触发前音频。安静约 1.6 秒后发空负包，等待云端末包与 Final，并在旧连接实际关闭后才为下一句建连。采集保持开启。环境噪声和音量门槛会影响检测，不保证精确端到端延迟或精确省费。后备重采样使用覆盖面积平均，保留跨块相位；优先让 AudioContext 以 16kHz 输出。
- 客户端先取得麦克风权限，本地检测到说话后才创建云端连接；握手期间最多暂存约 10 秒音频，超限安全停止。音频和每段结束标记共用有序队列，握手完成后最多按每个采集包补发两个旧包，避免一次突发推送；采集继续推进队列，不靠后台 JS 定时器。停止时释放轨道、Worklet、AudioContext、WebSocket 和计时器；迟到的权限结果也释放。未确认字幕丢弃，已确认字幕继续过期。
- 页面切换到后台不主动停止采集；浏览器音频图若进入 suspended 状态，会尝试 resume，失败则显示采集错误。`pagehide`、离房、模式切换和手动关闭仍完整清理。后台运行是否持续由浏览器和系统决定，仍需真实麦克风验收。
- 本地网关只绑定 127.0.0.1、限制本项目 Origin、一次只接收一个会话；收到前端 `finish` 控制消息后发送空负包，等待上游最终响应再结束会话。10 秒无音频、15 分钟会话上限、启动超时、队列积压都会结束连接；意外断线仍须手动重启，正常分句结束后客户端可自动新建下一会话。公网部署需要另行增加用户鉴权与额度管理。

## 密钥与启动

正式模式 `npm start` 由同一 Node HTTP 服务在 127.0.0.1:8787 提供 `dist/` 静态页面、设置接口和 ASR WebSocket，无需 Vite。`staticWebsite.mjs` 只读取构建目录，限制方法、拒绝点文件与路径越界；`/glasses` 返回入口页。允许的本机 Origin 包含 8787，开发模式仍保留 5173/4173。

Windows `scripts/install-local.ps1` 安装当前用户登录触发的 `HakiSub-Local` 计划任务及 Chrome 桌面快捷方式；`start-local.ps1` 隐藏启动 Node 并等待退出，供任务计划程序追踪生命周期。任务不自动启麦、不保存声音，重启会清空内存用量。此方案不是云部署，不能在本机关闭时供其他设备使用。

`server/index.mjs` 通过 `apiKeyStore.mjs` 从根目录 `.env`（或优先的进程环境）读取 Key。禁止把 Key 放入 `VITE_*`、前端构建产物或浏览器存储。健康检查只返回是否已配置。程序不保存音频和识别结果，不转发上游原始错误文本。

主页 `components/ApiSettings.vue` → 同源 `/api/asr/settings` → `server/apiSettings.mjs` → `apiKeyStore.mjs` → 根目录 `.env`。用户输入仅用于提交到本机网关，服务端不回传原值；保存采用临时文件替换，保留其他配置，成功后更新内存，下次识别使用新 Key。文件为明文，Git 忽略不等于加密；进程环境提供的 Key 在页面只读。

设置接口校验本机 Host、允许的 Origin、JSON 类型及随机请求令牌；变更和连接测试互斥，识别期间拒绝操作，设置操作期间拒绝新识别连接。连接测试只进行带鉴权头的 WebSocket 握手，超时或页面离开即清理，不发送音频、不自动重连，也不证明实际识别成功。这些约束面向本机服务，不能替代未来联网房间的用户鉴权、房主授权及额度管理。

`npm run dev` 同进程启动网关和 Vite；Ctrl+C 统一关闭。构建预览需 `npm run server` 加 `npm run preview`。浏览器 ASR 的原有有限重连策略保持不变。

## 用量诊断

`AsrUsageStatistics.vue` 在设置卡片内轮询本机 `/api/asr/settings/usage`，沿用设置接口的 Host/Origin 限制。网关只保留最近一个会话的统计对象和启动以来累计 PCM 字节数，无历史列表、不落盘。统计独立于日志开关；累计不因换 Key 清零，不能视作账户统计。页面按官方毫秒单位换算 `audio_info.duration`，仍不视作扣量或余额。

房间里的“本次开麦”统计由 `App.vue` 在手动开启豆包麦克风时清零；首次进入监听状态启动墙钟计时，关闭或报错冻结。网关在音频发送完成及收到 `audio_info.duration` 时通过本地 WebSocket 发送仅含 Request ID 与三个时长值的 `usage` 事件。前端按 Request ID 覆盖进度，再对自动分句连接求和，避免重复累计。提交值表示交给上游发送，完成值表示本地 WebSocket 发送回调成功，豆包返回值取各连接最新响应中的时长字段，均不是账单查询。切换来源、模式或离房时清除内存统计；服务端仍不保存分段历史。

官方管理查询与识别链路分离：[资源包状态接口目录](https://api.volcengine.com/api-docs/?serviceCode=speech_saas_prod&version=2025-05-20)、[用量查询及 AK/SK 签名示例](https://docs.volcengine.com/docs/DoubaoVoice/Callvolumequeryinterfacedescription?lang=zh)、[资金余额查询](https://docs.volcengine.com/docs/BillingCenter/QueryBalanceAcct-Queryuseraccountbalanceinformation?lang=zh)。本次仅核对文档，未接入管理凭证或调用这些账户接口；资源包小时额度与现金余额应分别查询和显示。

用量诊断由 `server/asrDiagnostics.mjs` 负责，仅由网关在上游音频发送边界统计 PCM 字节和发送完成回调。`HAKISUB_ASR_DEBUG=1`（进程环境）开启元数据日志；默认关闭。不将 Gzip 长度当成音频长度，不累计多次响应中的 `audio_info.duration`，也不将本地发送成功解释为云端计费确认。日志不含音频、识别文字和鉴权信息。

## 后续扩展位置（尚未实现）

- 更高级的 VAD、RNNoise：现有简单音量门槛在 `voiceActivityGate.ts`，后续可替换其判定算法，不修改二进制编码器或字幕生命周期。
- 多麦克风：为每个设备创建独立采集、ASR 会话和 memberId；届时调整当前网关单会话限制。现在没有设备选择或多路功能。
- 串音过滤、声纹验证：音频处理链和字幕事件进入 `captions.ts` 之前接入；不把身份判断混入 UI。
- OBS、眼镜显示端：消费同样的通用字幕事件；当前没有跨端传输。
- 其他 ASR 提供商：在 `asrSession.ts` 中增加适配器，复用字幕事件与生命周期。

官方依据（核对日期 2026-10-12）：
- [实时双向流式识别：参数与鉴权](https://docs.volcengine.com/docs/DoubaoVoice/bidirectional-streaming-automatic-speech-recognition-websocket?lang=zh)
- [v3 二进制协议与错误帧](https://docs.volcengine.com/docs/6561/1354869?lang=zh)
