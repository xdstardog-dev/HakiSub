# HakiSub 架构

域名与TLS准备（2026-10-16）：入口固定为hakisub.xdstar.work，用户要求ICP备案前不公开广州节点。新增独立Caddy Compose profile与固定域名配置，预期在Linux宿主网络反向代理现有127.0.0.1:18787，免费Let's Encrypt自动签发/续期，保留证书卷，关闭管理API和HTTP/3，不启用访问日志并过滤运行日志的request字段。启用前要求实际备案成功及确认字段，默认不启动；后端端口保持回环。官方Caddy2.11.6镜像已校验上传，在无网络无端口临时容器通过配置validate，隔离Compose解析通过；TLS签发、WSS与续期未实测，未改常驻服务。用户控制台确认域名未实名，公共DNS/RDAP证实暂停解析；操作步骤及精确镜像摘要见PUBLIC-DEPLOYMENT.md。

公网部署扩展（2026-10-16）：`runtimeConfiguration.mjs` 新增 `public` 模式，要求显式非本机 HTTPS Origin，继续禁用网页设置及无成员令牌 ASR，默认两路并发；本机/私有模式行为保留。`deploy/compose.public.yaml` 覆盖网关模式和来源，保留宿主机回环端口及原有资源限制，预期由同源 TLS 反向代理转发网页与两条 WebSocket。公网入口尚未部署，实际状态见 [公网部署](PUBLIC-DEPLOYMENT.md)。音频、字幕生命周期、UI、Key读取方式均未改变。

阿里云第一阶段已于2026-10-16部署：单个Node容器经宿主机127.0.0.1:18787及本机SSH隧道供授权人员测试，健康检查通过。容器内已验证正式网页、模型资源、房间WebSocket创建/加入/字幕广播和私有访问限制；API Key为空，真实ASR及双设备讲话待验收。执行记录见 [受控测试部署手册](PRIVATE-TEST-DEPLOYMENT.md)，初期背景见 [部署审查与方案](DEPLOYMENT-PLAN.md)。

`server/runtimeConfiguration.mjs` 只从服务端进程环境读取部署模式、监听地址、端口、允许的本机Origin与1～8路ASR上限；非法值在启动前拒绝。默认local保持既有本机行为，private-test关闭密钥设置接口和无成员令牌ASR，限制一个房间、默认两路ASR。Compose显式设置容器内0.0.0.0:8787，宿主机只映射127.0.0.1:18787，Origin只接受测试电脑的localhost:18787/127.0.0.1:18787。默认模式不会因新增Docker支持而扩大本机监听。

Dockerfile不在服务器构建前端；按锁文件安装Linux依赖，最终镜像仅复制ws、server和已构建的dist。Compose以非root、只读文件系统运行，配置512MiB内存上限且不额外使用Swap、0.75CPU、日志轮转与unless-stopped。Key由服务器secrets/server.env在运行时注入，不进入构建上下文。打包脚本按白名单生成版本包及校验清单，包含尚未提交代码；不依赖远端Git已更新。当前使用本机Windows OpenSSH、现有密钥代理和hakisub-server别名直接管理；不修改服务器登录配置。

本次镜像获取：服务器现有阿里云加速器连续3次返回not found，本机以已校验的官方crane工具、原版Node22.23.3 Linux/amd64基础层和锁文件同版纯JS ws组装完整运行镜像，无需本机Docker；这次没有执行Dockerfile的npm安装阶段。应用文件来自与当前测试结果一致的发布快照，基础层及ws完整性分别校验。通过SCP上传、SHA256复核及docker load导入后，先运行无网络/无宿主端口的临时容器验证，再经用户确认以--no-build --pull never启动Compose。Node基础摘要已记入发布配置，未修改Docker全局配置、Node主版本或其他项目。Docker29的containerd存储以manifest摘要显示镜像ID，须与归档config摘要区分记录。

`src/` 是 Vue 网页；`server/` 是本地 Node.js 语音网关；`tests/` 包含字幕、布局、浏览器和豆包模拟测试；`docs/` 保存维护说明和实际开发记录。

## 产品说明页面

`public/product.html` 是独立的产品方向与功能范围备忘录，样式与交互分别位于 `public/product.css`、`public/product.js`。Vite 开发时直接提供，构建后原样复制到 `dist/`，正式静态服务无需新路由。该页面不接入音频、ASR、字幕状态或任何密钥接口。功能清单在 `product.js` 中维护，区分代码实现与真实验收状态；路线与未确认功能显式标为建议或讨论项。

用户选择的独立私有在线版使用 `sites/hakisub-product/` 的独立 Sites 源码仓库与身份，静态资源位于其 `dist/`；与 `public/product.*` 同步维护，仅将返回本机应用的链接改为页内导航。发布只包含这三个静态文件与部署声明，不包含主项目、密钥、语音模型或运行时。网站以私有方式部署，后续更新复用既有站点身份。

讨论备忘仅在用户点击保存时写入当前源的 localStorage，键为 `hakisub.product.discussion-note.v1`，不保存识别内容、不跨端同步；存储失败时提示导出 Markdown。打印时临时展示完整功能清单、展开讨论问题，打印结束后恢复原筛选和折叠状态。此页面不代表新的联网房间或跨平台实现。

## 房间通信

新增 server/roomGateway.mjs 管理 /api/rooms WebSocket、内存房间、成员和临时会话令牌。服务端生成不冲突的六位数字码，每房最多 8 人、最多 100 个房间；只有创建/加入成功后才能发送成员消息。成员身份从连接确定，客户端提交其他 memberId 不会冒用他人身份。心跳每 15 秒检查连接，连续未响应会终止连接、撤销令牌和释放该成员 ASR；最后一人离开销毁房间。不持久化音频、字幕或成员历史，也不补发旧字幕。

src/roomClient.ts 处理创建/加入、成员快照、统一字幕及撤回事件、连接超时和清理。App.vue 按服务端 selfId 查找本人，不能用成员数组首位代表本人。联网模式与本地模拟分开；麦克风仍由用户主动开启。识别回调把统一 CaptionEvent 发到房间，服务端绑定 memberId 后广播，各页面交给原 captions.ts 维护 interim/final 和过期。成员关麦清理未确认字幕，离房移除该成员全部字幕；整个房间连接中断则停止本机采集并清空页面。

asrSession.ts 将仅存在内存的房间令牌传给 doubaoAsrClient.ts，ASR 通过 /api/asr?session=令牌 绑定到已开麦成员。网关拒绝无效令牌、同一成员第二路连接及超出全局上限的连接，每路上游、超时、结果映射和用量独立。旧无令牌入口保留本机单设备兼容，与成员会话互斥。Key 继续由服务端统一读取，未实现每房间凭据和额度隔离。令牌是临时成员凭据，不是豆包 Key；部署时不应记录带查询参数的 ASR URL。

本地默认仍只监听127.0.0.1；已部署私有容器监听0.0.0.0，宿主发布限于127.0.0.1，Origin只接受SSH隧道的本机页面，并禁用无令牌入口和设置接口。公网Origin、HTTPS反向代理、正式用户/管理员授权和用量策略留待下一阶段。模拟测试覆盖真实本地双路WebSocket与假豆包上游、独立音频及结果、成员与房间隔离、满员、关麦离房和客户端/UI清理；容器实测不等于真实API、多设备、串音、额度或长时运行验收。

## 音频到字幕

```text
App.vue（来源选择与麦克风按钮）
  → asrSession.ts（为成员创建独立会话）
     ├─ browserAsr.ts → 浏览器 Web Speech API
     └─ doubaoAsrClient.ts
          ← audioCapture.ts / audioCapture.worklet.js（单麦克风）
          ← audioResampler.ts（16kHz、16-bit LE、单声道，每200ms一包）
          → speechDetector.ts → sileroVad.worker.ts / sileroVadModel.ts（本地人声概率）
          → voiceActivityGate.ts（起始缓冲、概率门槛、安静判停）
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
- 二遍识别仍使用云端默认分句；本地人声检测只决定上传和会话边界，不代替云端的 definite 标记。独立 Worker 内以单线程 ONNX Runtime Web 运行固定 Silero v6：每帧 512 个16kHz样本、64个历史样本和独立循环状态，跨200ms包保留余样本，不逐包补零或丢弃。每包取最大人声概率，起始/续讲门槛0.5/0.35。环形缓冲保留可配置的约500ms触发前音频；安静约1.6秒后发空负包，等待云端末包与 Final，并在旧连接实际关闭后才为下一句建连。采集保持开启。模型可能误判或漏判，不保证精确端到端延迟或精确省费。AudioContext 使用设备默认采样率，输出由覆盖面积平均重采样到16kHz并保留跨块相位，避免强制上下文采样率带来的兼容性问题。
- `speechDetector.ts` 保留原始PCM用于句首与上传，仅将副本转移给Worker；一次只派发一个推理请求。包含在途包在内最多缓存25包（5秒）；启动20秒、单包推理3秒超时或音频陈旧超过5秒时停止，不退回持续上传。Worker、模型和WASM从同源加载，固定单线程无需跨源隔离。`prepare-vad-runtime.mjs` 在dev/build前校验模型SHA-256并准备固定版本运行资源，许可证随资源部署。手动停止销毁整个Worker，循环状态与缓冲不跨会话或成员共享。
- 客户端先取得麦克风权限，本地检测到说话后才创建云端连接；握手期间最多暂存约 10 秒音频，超限安全停止。音频和每段结束标记共用有序队列，握手完成后最多按每个采集包补发两个旧包，避免一次突发推送；采集继续推进队列，不靠后台 JS 定时器。停止时释放轨道、Worklet、AudioContext、WebSocket 和计时器；迟到的权限结果也释放。未确认字幕丢弃，已确认字幕继续过期。
- 页面切换到后台不主动停止采集；浏览器音频图若进入 suspended 状态，会尝试 resume，失败则显示采集错误。`pagehide`、离房、模式切换和手动关闭仍完整清理。后台运行是否持续由浏览器和系统决定，仍需真实麦克风验收。
- 本地网关只绑定 127.0.0.1、限制本项目 Origin、旧本地入口一次只接收一个会话；绑定房间成员的入口每人最多一路，全网关默认最多 8 路；收到前端 `finish` 控制消息后发送空负包，等待上游最终响应再结束会话。10 秒无音频、15 分钟会话上限、启动超时、队列积压都会结束连接；意外断线仍须手动重启，正常分句结束后客户端可自动新建下一会话。公网部署需要另行增加用户鉴权与额度管理。

## 密钥与启动

正式模式 `npm start` 由同一 Node HTTP 服务在 127.0.0.1:8787 提供 `dist/` 静态页面、设置接口和 ASR WebSocket，无需 Vite。`staticWebsite.mjs` 只读取构建目录，限制方法、拒绝点文件与路径越界；`/glasses` 返回入口页。允许的本机 Origin 包含 8787，开发模式仍保留 5173/4173。

Windows `scripts/install-local.ps1` 安装当前用户登录触发的 `HakiSub-Local` 计划任务及 Chrome 桌面快捷方式；`start-local.ps1` 隐藏启动 Node 并等待退出，供任务计划程序追踪生命周期。任务不自动启麦、不保存声音，重启会清空内存用量。此方案不是云部署，不能在本机关闭时供其他设备使用。

`server/index.mjs` 通过 `apiKeyStore.mjs` 从根目录 `.env`（或优先的进程环境）读取 Key。禁止把 Key 放入 `VITE_*`、前端构建产物或浏览器存储。健康检查只返回是否已配置。程序不保存音频和识别结果，不转发上游原始错误文本。

主页 `components/ApiSettings.vue` → 同源 `/api/asr/settings` → `server/apiSettings.mjs` → `apiKeyStore.mjs` → 根目录 `.env`。用户输入仅用于提交到本机网关，服务端不回传原值；保存采用临时文件替换，保留其他配置，成功后更新内存，下次识别使用新 Key。文件为明文，Git 忽略不等于加密；进程环境提供的 Key 在页面只读。

上述设置写入仅用于提供该接口的本机模式。`ApiSettings.vue`在初次读取设置返回404时，改为查询现有 `/api/asr/health` 的configured布尔值，显示服务器统一管理说明；后续刷新只请求health，不渲染密钥表单、删除/测试入口或AsrUsageStatistics，脚本也拒绝执行设置写操作。不改变服务器404策略，不通过前端打开管理员权限。加载状态区分读取中、可用及不可用，网络/响应/超时错误不会永久显示“正在读取配置”；离开时取消请求并忽略迟到响应。`tests/api-settings-view.test.mjs`用模拟HTTP请求与实际Vue模板渲染覆盖私有只读、本机保存和环境只读、重试/超时/卸载行为。

设置接口校验本机 Host、允许的 Origin、JSON 类型及随机请求令牌；变更和连接测试互斥，识别期间拒绝操作，设置操作期间拒绝新识别连接。连接测试只进行带鉴权头的 WebSocket 握手，超时或页面离开即清理，不发送音频、不自动重连，也不证明实际识别成功。这些约束面向本机服务，不能替代公网用户鉴权、房主授权及额度管理。

`npm run dev` 同进程启动网关和 Vite；Ctrl+C 统一关闭。构建预览需 `npm run server` 加 `npm run preview`。浏览器 ASR 的原有有限重连策略保持不变。

## 用量诊断

`AsrUsageStatistics.vue` 在设置卡片内轮询本机 `/api/asr/settings/usage`，沿用设置接口的 Host/Origin 限制。网关只保留最近一个会话的统计对象和启动以来累计 PCM 字节数，无历史列表、不落盘。统计独立于日志开关；累计不因换 Key 清零，不能视作账户统计。页面按官方毫秒单位换算 `audio_info.duration`，仍不视作扣量或余额。

房间里的“本次开麦”统计由 `App.vue` 在手动开启豆包麦克风时清零；首次进入监听状态启动墙钟计时，关闭或报错冻结。网关在音频发送完成及收到 `audio_info.duration` 时通过本地 WebSocket 发送仅含 Request ID 与三个时长值的 `usage` 事件。前端按 Request ID 覆盖进度，再对自动分句连接求和，避免重复累计。提交值表示交给上游发送，完成值表示本地 WebSocket 发送回调成功，豆包返回值取各连接最新响应中的时长字段，均不是账单查询。切换来源、模式或离房时清除内存统计；服务端仍不保存分段历史。

官方管理查询与识别链路分离：[资源包状态接口目录](https://api.volcengine.com/api-docs/?serviceCode=speech_saas_prod&version=2025-05-20)、[用量查询及 AK/SK 签名示例](https://docs.volcengine.com/docs/DoubaoVoice/Callvolumequeryinterfacedescription?lang=zh)、[资金余额查询](https://docs.volcengine.com/docs/BillingCenter/QueryBalanceAcct-Queryuseraccountbalanceinformation?lang=zh)。本次仅核对文档，未接入管理凭证或调用这些账户接口；资源包小时额度与现金余额应分别查询和显示。

用量诊断由 `server/asrDiagnostics.mjs` 负责，仅由网关在上游音频发送边界统计 PCM 字节和发送完成回调。`HAKISUB_ASR_DEBUG=1`（进程环境）开启元数据日志；默认关闭。不将 Gzip 长度当成音频长度，不累计多次响应中的 `audio_info.duration`，也不将本地发送成功解释为云端计费确认。日志不含音频、识别文字和鉴权信息。

## 跨平台迁移约束

豆包是产品默认识别路线，真实输入的初始识别来源已设为豆包；模拟模式仍为页面初始输入。网页版和安卓 App 必须保留设备本地检测、讲话触发上传、静音结束云端会话和再次讲话恢复的完整状态转换；浏览器 ASR 仅为可选适配器，不作为自动停止上传的实现基础。当前网页已接入 Silero 模型 VAD，用户报告的省费效果不等于精确计费或跨平台验收结论。

迁移时分离平台采集适配器、VAD 判定、上传会话控制和统一字幕事件；现有字幕生命周期继续复用。设备端停止向网关发送与网关停止向豆包发送分别验证。客户端挂起、失联或音频中断时由网关超时清理上游连接；不能依赖后台页面一定能够主动发送结束消息。当前已有无音频超时与会话上限，尚无网关端声学 VAD。

详细设计依据、EasySub 与 Silero 参考、环境边界及迁移验收见 [跨平台语音与自动停止上传](cross-platform-audio.md)。网页已接入模型，尚未进行安卓适配或公网部署。

## 后续扩展位置（尚未实现）

- VAD调优、RNNoise：Silero推理在 `sileroVadModel.ts`，概率门槛与缓冲在 `voiceActivityGate.ts`；后续按真实声学测试调优，不修改二进制编码器或字幕生命周期。RNNoise尚未接入。
- 设备选择：联网成员已有独立采集、ASR 会话和 memberId；单台设备的多麦克风选择和路由尚未实现。
- 串音过滤、声纹验证：音频处理链和字幕事件进入 `captions.ts` 之前接入；不把身份判断混入 UI。
- OBS、眼镜显示端：消费同样的通用字幕事件；尚未接入这些显示端；房间内已可跨连接同步字幕。
- 其他 ASR 提供商：在 `asrSession.ts` 中增加适配器，复用字幕事件与生命周期。

官方依据（核对日期 2026-10-12）：
- [实时双向流式识别：参数与鉴权](https://docs.volcengine.com/docs/DoubaoVoice/bidirectional-streaming-automatic-speech-recognition-websocket?lang=zh)
- [v3 二进制协议与错误帧](https://docs.volcengine.com/docs/6561/1354869?lang=zh)
