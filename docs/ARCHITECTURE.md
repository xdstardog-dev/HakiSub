# HakiSub 架构

统一账号（2026-10-21，本地完成，未部署）：`accounts/server/` 是独立 Fastify/SQLite 服务，使用成熟 Cookie/CORS/CSRF 插件、Argon2id 与 better-sqlite3，不修改实时网关或豆包协议。主站专属 `__Host-xdstar_session` Cookie（无Domain）只发送给主站；HakiSub 的 `accountClient.ts` 通过精确 Origin 凭据 CORS 请求最小身份和本人存档，不读取 username 或长期认证 token。账号设置只接受主站 Origin；CSRF 绑定会话与 account/hakisub 作用域。SQLite 保存密码/答案哈希、会话 token 摘要、找回挑战、私人配置及持久限流；注册成功配额与插入同事务复检，哈希计算有单路与有界队列。

`AccountAccess.vue` 定期/回到页面时刷新身份；App 仅在未入房且用户未手改显示名时填昵称，不更换 memberId。`RoomPresets.vue` 保存/同步/改名/加载/删除识别来源和布局，严格排除 API Key、ownerToken、成员token、音频字幕。个人中心链接携带的 preset UUID 仍由服务端按当前 UID 授权，加载不会自动入房或开麦。主站页面独立构建至 `accounts/dist/`，HakiSub 主体布局和字幕生命周期保留。`scripts/preview-accounts.mjs` 使用独立测试库、空Key内存网关和5179/8790回环端口，不连接现有8787或生产。

UID、Room Owner、Member 三者独立：目前 UID 仅关联长期数据，房主仍由现有独立凭据确认；未来 nullable ownerUid 与 ownerHash 可并存，绑定必须验证本房管理凭据，不能按昵称、房间号或存档认领。房主暂停全房ASR/销毁、费用额度/熔断均未实施。新建可选 `compose.accounts.yaml` 和 Caddy 候选文件，实际生产配置未覆盖、服务未重启。Linux原生依赖、真实跨子域Cookie及生产费用保护另验；完整风险、数据表和方案见 [账号审查](ACCOUNT-SYSTEM-PLAN.md)，执行见 [账号部署](ACCOUNT-DEPLOYMENT.md)。

房间URL及分享（2026-10-21）：`roomNavigation.ts`严格解析六位数字路径并构造只含origin和正式房间号的分享URL；App在服务器joined确认后从首页pushState，直达/别名路径则replaceState为规范的`/<code>/`。初始深链接及popstate只预填加入信息，不自动连接或开麦；后退/前进先清理成员会话、采集和字幕。pagehide保留路径以支持刷新，断线保留房间路径供重进，返回首页按钮才切换根路径。系统分享失败回退Clipboard，AbortError视为取消，全部受限时提供只读地址；异步结果通过操作编号避免离房后更新。模拟房间不提供联网分享入口。生产静态服务仅额外白名单匹配六位房间路径（可含尾斜线），仍拒绝其他未知路径，资源/API使用根路径。

房间换号（2026-10-20）：roomStore的version 1记录增加可选aliases，加载时校验其六位码、去重及与所有正式房间号互斥；旧资料无aliases兼容。renameRoom在串行原子提交中保留ownerHash、解密原Key后以新号为AAD重新加密，删除旧正式记录并保存旧号别名；冲突/非法目标不覆盖资料，保存配置不丢别名。gateway在加入时把别名解析到同一room对象，创建时避开所有别名，不产生第二份成员/配置。joined仅向本房成员提供号码别名，无新增公开管理API。

前端rememberRoom按正式号及服务器返回的别名合并本地入口，保留当前浏览器的ownerToken；直接输入新号而本机只有旧号凭据时，App最多重新加入一次以补验原房主身份，不自动开麦。普通成员不会获得房主凭据，失效凭据不无限重试。服务器CLI renameRoom.mjs默认--check，--apply仅供停止应用后的维护窗口；要求预先备份加密数据及环境，重复执行识别已迁移状态，不回显Key/管理凭据。不修改字幕、音频、识别或重连参数。

语音传输恢复（2026-10-20）：用户取消延迟调优，仅修复断连。`asrGateway.mjs`在识别cleanup时先标记asrStopped、终止上游并释放本人asr引用，升级校验只统计尚未结束的连接；旧close回调通过引用相等检查不能清除新连接的占位。测试让旧客户端暂停接收close，验证本机和联网成员在旧握手未完成时均可建下一句，同时重复/超并发仍403。

`doubaoAsrClient.ts`对浏览器到网关的error/异常close/send异常做250/750ms退避，30秒内最多两次；每连接编号与代次隔离迟到回调，关麦/离房撤销计时器。保留已有10秒有界未发送队列，成功交给WebSocket的音频不重放，清除旧Interim而保留Final；没有未发语音时回到本地等待，下次开口再建连。`App.vue`仅豆包reconnecting继续广播mic:true，避免恢复状态误关麦导致服务器撤销连接。服务端明确的配置/协议/上游错误仍安全停止，不无限重试；中断片段可能缺失，不宣称恢复全部音频。识别参数/检测/上传节奏/字幕生命周期不变。

模型加载超时修复（2026-10-20）：旧20秒固定启动时限同时包含运行库、约14.7MB模型/WASM下载和编译，慢连接无法完成且无阶段提示。`vadAssets.ts`提供同源版本URL及有界流式下载，按浏览器解压后的实际字节累计进度并校验长度，模型与WASM并行下载；Worker把已下载字节直接交给ORT，避免重复下载，运行库/下载/初始化分别汇报状态。`speechDetector.ts`下载30秒无进度、初始化60秒、总准备180秒保护；`doubaoAsrClient.ts`把采集30秒保护独立计时，采集完成后不再打断模型准备，取消/故障仍终止Worker并释放音轨。进度与公开资源缓存不包含音频、识别文字或密钥。

`prepare-vad-runtime.mjs`生成四份gzip副本（模型/WASM合计约5.1MB），正式静态服务按Accept-Encoding提供预压缩响应、保留原MIME、Content-Length/Vary；只有带版本的已知VAD资源使用长期缓存，HTML仍no-cache。打包校验原件与gzip均存在；模型/ORT升级需同步`vadAssets.ts`版本和长度。运行时仍单线程、独立Worker、无CDN/跨源隔离要求。下段20秒时限为此前修复的历史状态，以本节为准。

麦克风启动修复（2026-10-20）：此前采集与VAD加载并行，但speechDetector把模型未就绪时的音频也放入25包运行队列，首次加载超过5秒就提前报积压。初始化阶段改为最多3包滚动缓冲（约600ms），ready后只处理最近句首片段；模型加载20秒超时、运行时25包上限/陈旧音频/单包超时和故障释放继续保留。UI通过startingMemberId仅给本人的卡片展示“准备中”，按钮为“取消开启”，均就绪后才显示开启；不预先广播开麦、不提前连云端。回归测试覆盖12秒/60包加载及原有运行期故障；真实浏览器用合成静音、延迟Worker初始化12秒，实际AudioContext/Worklet/重采样/模型推理成功切换listening且云连接为0，关闭后恢复idle。未访问真实麦克风或豆包。

房间流程改造（2026-10-20，已部署hakisub-20261020T133934Z并通过公网及真实服务重启验收）：默认online；`rememberedRooms.ts`只在浏览器保存房间码、显示名及创建者管理凭据，首页再次进入发起新的join并始终保持麦克风关闭。`roomGateway.mjs`在全员离开后保留房间，成员令牌仍立即撤销；重进不恢复音频或字幕。创建者随机凭据只在创建响应发给本人，服务端保存SHA256摘要，重新加入时校验，其他成员不能冒用配置权限。

`RoomApiSettings.vue`在房间内使用原生模态dialog，提供密码输入、保存/移除、握手测试和状态刷新；关闭/离房清空输入并取消请求。`roomSettings.mjs`通过成员Bearer令牌、Origin和创建者权限绑定到当前房间，仅返回布尔状态/来源，不返回Key。房间配置操作串行化，本房任何成员开麦时拒绝变更，配置写入期间拒绝新开麦/ASR；不同房间独立。房间Key优先于旧服务端默认Key，旧本机设置API继续保留给模拟房间。

`roomStore.mjs`持久化房间码、创建者摘要和加密Key，不持久化成员/识别文字/音频。AES-256-GCM每次独立随机nonce，以房间码为AAD防跨房间密文挪用；磁盘写入按全局队列串行、同目录临时文件原子替换，失败不覆盖旧配置。加密主密钥来自服务端环境或根.env（本机初始化带排他锁），数据默认secrets/rooms.json；容器通过环境注入主密钥、具名卷挂载/app/data，其他根目录继续只读。deploy/prepare-room-storage.sh仅在服务器生成主密钥和初始化本项目卷权限，不展示密钥。缺失/错误主密钥或损坏记录导致启动失败，避免静默丢失配置。房间及密钥恢复要求同时保留数据卷与主密钥，浏览器管理凭据目前无跨设备恢复功能；100房间上限包含空房。下述旧版销毁房间/统一Key说明均被本节替代。

主站已上线（2026-10-20）：用户确认备案通过（鄂ICP备2026059859号-1），选择 `xdstar.work` 主站入口卡片链接 `hakisub.xdstar.work`。`deploy/xdstar/` 包含无脚本、无第三方字体的独立 HTML/CSS/SVG 主页；由同一 Caddy 只读挂载 `/srv/xdstar` 并提供文件服务，主站无需启动另一 Node 进程。子域名原样代理到回环18787，Origin只允许子域名，不共享主站状态，不新增iframe、音频采集或ASR接口。主站配置禁止脚本/表单/嵌入，应用的Worker/WASM策略不受该站头影响；打包脚本递归包含主页资源。用户已完成DNS并确认云防火墙放行；两站Let's Encrypt证书签发成功，可信HTTPS、HTTP跳转、VAD资源及公网WSS房间/合成字幕/隔离/清理均通过服务器外部验收。常驻应用已切换174817Z公网镜像，仍512MiB/0.75CPU、非root只读、回环18787；Caddy128MiB/0.25CPU、只读根目录与证书持久卷，管理API关闭。旧环境和镜像保留供回退，真实Key/麦克风/双设备及续期周期尚未验收。下述2026-10-16域名阻塞和私有部署为历史记录，最新状态见PUBLIC-DEPLOYMENT.md。

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

新增 server/roomGateway.mjs 管理 /api/rooms WebSocket、内存房间、成员和临时会话令牌。服务端生成不冲突的六位数字码，每房最多 8 人、最多 100 个房间；只有创建/加入成功后才能发送成员消息。成员身份从连接确定，客户端提交其他 memberId 不会冒用他人身份。心跳每 15 秒检查连接，连续未响应会终止连接、撤销令牌和释放该成员 ASR；最后一人离开清空成员，房间资料与配置继续保留。不持久化音频、字幕或成员历史，也不补发旧字幕。

src/roomClient.ts 处理创建/加入、成员快照、统一字幕及撤回事件、连接超时和清理。App.vue 按服务端 selfId 查找本人，不能用成员数组首位代表本人。联网模式与本地模拟分开；麦克风仍由用户主动开启。识别回调把统一 CaptionEvent 发到房间，服务端绑定 memberId 后广播，各页面交给原 captions.ts 维护 interim/final 和过期。成员关麦清理未确认字幕，离房移除该成员全部字幕；整个房间连接中断则停止本机采集并清空页面。

asrSession.ts 将仅存在内存的房间令牌传给 doubaoAsrClient.ts，ASR 通过 /api/asr?session=令牌 绑定到已开麦成员。网关拒绝无效令牌、同一成员第二路连接及超出全局上限的连接，每路上游、超时、结果映射和用量独立。旧无令牌入口保留本机单设备兼容，与成员会话互斥。Key优先从当前房间读取，未设置时兼容旧服务端默认Key；尚无账户额度隔离。令牌是临时成员凭据，不是豆包 Key；部署时不应记录带查询参数的 ASR URL。

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
- `speechDetector.ts` 保留原始PCM用于句首与上传，仅将副本转移给Worker；一次只派发一个推理请求。模型未就绪时只滚动保留最近3包（600ms），就绪后包含在途包在内最多缓存25包（5秒）；下载停滞30秒、初始化60秒/总准备180秒、单包推理3秒或音频陈旧5秒保护触发时停止，不退回持续上传。Worker、模型和WASM从同源加载，固定单线程无需跨源隔离。`prepare-vad-runtime.mjs` 在dev/build前校验模型SHA-256并准备固定版本运行资源和gzip副本，许可证随资源部署。手动停止销毁整个Worker，循环状态与缓冲不跨会话或成员共享。
- 客户端先取得麦克风权限，本地检测到说话后才创建云端连接；握手期间最多暂存约 10 秒音频，超限安全停止。音频和每段结束标记共用有序队列，握手完成后最多按每个采集包补发两个旧包，避免一次突发推送；采集继续推进队列，不靠后台 JS 定时器。停止时释放轨道、Worklet、AudioContext、WebSocket 和计时器；迟到的权限结果也释放。未确认字幕丢弃，已确认字幕继续过期。
- 页面切换到后台不主动停止采集；浏览器音频图若进入 suspended 状态，会尝试 resume，失败则显示采集错误。`pagehide`、离房、模式切换和手动关闭仍完整清理。后台运行是否持续由浏览器和系统决定，仍需真实麦克风验收。
- 本地网关只绑定 127.0.0.1、限制本项目 Origin、旧本地入口一次只接收一个会话；绑定房间成员的入口每人最多一路，全网关默认最多 8 路；收到前端 `finish` 控制消息后发送空负包，等待上游最终响应再结束会话。10 秒无音频、15 分钟会话上限、启动超时、队列积压都会结束连接；明确服务错误需手动处理，网页到网关的传输故障限次恢复，正常分句结束后可自动新建下一会话。结束识别立即释放有效名额，不让关闭中的旧Socket阻挡下一句。公网部署需要另行增加用户鉴权与额度管理。

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

豆包是产品默认识别路线，真实输入的初始识别来源已设为豆包；页面默认真实联网，仍要求手动开麦；模拟模式可选。网页版和安卓 App 必须保留设备本地检测、讲话触发上传、静音结束云端会话和再次讲话恢复的完整状态转换；浏览器 ASR 仅为可选适配器，不作为自动停止上传的实现基础。当前网页已接入 Silero 模型 VAD，用户报告的省费效果不等于精确计费或跨平台验收结论。

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

本次房间链接功能已部署hakisub-20261020T173624Z，线上index-DhETaCY6.js与本地构建逐字节一致；公网房间路径/HEAD/no-cache/非法路径、HTTPS/WSS及VAD资源回归通过，隔离浏览器实际完成直达/刷新/分享复制/历史切换。原114514及985529别名、配置保留，未调用真实ASR。
