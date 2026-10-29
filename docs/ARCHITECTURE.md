# HakiSub 架构

## 打字与快捷回应（2026-10-29，已部署）

生产于北京时间17:04部署`captions-20261029T0853Z`，源代码`b8afe0ca719b15a3b8126b20fae3b051864492c9`。只更新网关镜像及前端，账号源码/构建11项与生产逐字节一致，账号/Caddy容器未重建，数据卷与凭据保留。原21房/4账号身份验证保留；独立公网验收新增2间空测试房，总23房。HTTPS页面/音效28项哈希一致、公网WSS八人及正式浏览器打字/回应/词库/MP3试听通过；真实麦克风/豆包与物理手机另验。加密备份、镜像和回滚见ACCOUNT-DEPLOYMENT本期记录。

沿用 `MemberCaptionGrid.vue` 卡片、`App.vue` 每成员 ASR 会话、`roomClient.ts` 和 `/api/rooms`，不引入聊天系统。保留 `mic` 字段及旧 ASR 消息；成员广播新增 `mode: microphone | muted | typing`。`mic` 开关同步 mode，`mode` 只接受 muted/typing 并关闭当前成员 ASR。客户端切换前停止采集和 ASR，保留已确认字幕、丢弃 Interim；ASR 回调增加会话代次校验，停止后的旧回调不能修改新会话或打字状态。房间/识别来源/模拟功能继续使用既有生命周期。

打字草稿在 App 内存保存，逐字输入不发网络。`typed-caption` 带 UUID 句子请求 ID 和文字；网关按连接身份验证 typing 状态、非空/1000 UTF-16 长度/控制字符以及每连接 1 秒间隔，广播普通 `caption(final)`，句子 ID 加入服务端成员命名空间。UI 统一交给未改动的 `captions.ts`，等待自己的回包确认再清空对应草稿，期间新编辑不会被旧确认覆盖；错误或 10 秒未确认保留草稿。切换模式保留草稿，离房/断线清空。

卡片仅发送本人 `editTyped` 入口事件，App 按当前 typing 状态挂载 `TypingComposer.vue`。输入窗使用全局 fixed 定位，桌面位于页面中下方，触屏在可见视口底部留 12px 间隔；监听 `visualViewport.resize/scroll`，以 height/width/offsetTop/offsetLeft 跟随软键盘及 iOS 聚焦平移，没有该 API 则跟随 window.resize。宽高限制在可见区域内，考虑 safe-area，textarea 使用16px字体避免手机聚焦放大。打开时 preventScroll 聚焦，发送按钮阻止 pointerdown 转移焦点以维持键盘；收起/切换模式/离房卸载并清理监听，草稿继续按 App 生命周期管理。textarea 使用 composition 标志、isComposing、旧 keyCode 229 和 compositionend 后 50ms 保护处理选字事件顺序；Shift+Enter 保留换行。此输入窗只编辑待发送字幕，不展示聊天历史。

`reaction` 只发送 targetId 与固定词库中的类型；网关完全从 socket 取 senderId，验证目标是本房在线其他成员，每连接 1.5 秒限流，服务端分配事件 UUID 后只广播本房。回应不依赖 mic、字幕或布局，成员列表仍是唯一目标来源。客户端在独立有界数组保存最多 24 条事件，每卡最多显示最新 3 个气泡，共用 50ms 时钟在收到后 2.6 秒移除，不进入字幕生命周期。离房、目标离线清理。两类新消息继承现有总流量/载荷/Origin/背压/会话撤销保护，不写磁盘，也不向新加入者补发。

回应菜单最多显示个人选择的5项，底部左取消、右设置。`ReactionSettings.vue` 使用原生dialog和独立选择草稿，从13项固定词库勾选1～5项，选满禁用未选项，支持恢复默认/取消/保存。App管理本人偏好并传给卡片；`roomInteractions.ts` 提供词库、默认5项、去重/白名单/数量归一化及 `hakisub.reaction-selection.v1` 本地存储，仅保存回应类型，不含成员身份或消息。存储损坏/不可用时回退默认，保存失败仍在当前页面生效并提示。个人选择不发网络、不开启账号同步，其他成员无论自己是否勾选都按完整词库渲染收到的回应。网关白名单与词库配套扩展，真实WebSocket测试遍历全部13种，原发送者/房间/限流校验保留；前后端需配套更新并重启网关。

`roomInteractions.ts` 集中 UI 事件类型、固定选项、边界常量、IME判断、回应/音效偏好校验及浏览器存储；实际音频素材加载和播放独立在 `reactionSound.ts`。卡片桌面通过 contextmenu 右键打开回应，手机 Pointer Events 长按500ms打开，左键/轻触不绑定回应；移动超过10px/结束/取消撤销定时器。触屏系统contextmenu仅preventDefault，不提前打开或重定位；其他卡片配合touch-callout和user-select防止系统菜单，自己的textarea保留原生编辑菜单。菜单固定在视口内，可取消/Escape/外部点击关闭，卸载移除监听器与定时器。

全局音效入口在房间顶部，`SoundSettings.vue` 使用原生dialog提供即时开关、音量、按槽位试听及加载/就绪/受限/静音状态。App持有设备级 `SoundPreferences`，所有有效回应统一经过同一音频引擎，不按卡片/目标/麦克风状态过滤，但把reaction类型交给对应MP3槽位。`hakisub.sound-preferences.v1`只持久化enabled和0～100音量；读取校验/损坏回退默认开启60%，写失败仅提示本页已生效，无房间协议或账号同步。音量线性映射到素材增益，最多3个加载中或播放中的声音；关闭/零音量不加载播放，配置变化立即停止旧声音，离房/卸载释放全部节点与AudioContext。resume与异步加载/解码均检查context和操作代次，迟到授权/下载/解码不补播；拒绝/不支持/设备失败均返回状态，不向字幕或WebSocket抛错。试听不发房间消息、不启动采集。

`public/sounds/reactions/`提供14个已填充MP3和运行时`slots.json`，默认通用文件加13种回应。只允许同目录ASCII MP3文件名，禁止远程URL、其他目录与任意供应商结构；配置缺失或损坏回退约定文件名。fetch同源/no-cache，配置限16KiB，音频流有界读取1MiB、单请求5秒超时，decodeAudioData后验证0～5秒；专属素材缺失/损坏/超限回退通用MP3，通用也失败则静音并提示。Promise缓存去重相同文件下载/解码，刷新或离房清理；取消请求和过期任务不会晚到播放。server/staticWebsite.mjs增加audio/mpeg与JSON/TXT MIME，构建和现有打包自动包含public复制的dist素材。原WebAudio振荡器已移除，使用AudioBufferSourceNode播放本地下载素材；没有运行时FFmpeg或第三方请求。

素材来自Kenney官方Interface Sounds 1.0（CC0），原包License.txt随目录保留，SOURCES.json记录原包SHA256、原文件名/哈希、转码后哈希及增益调整；原OGG经一次性FFmpeg/libmp3lame转为单声道44.1kHz/96kbps MP3，原信号峰值统一约-12dBFS，总60497字节。README给出槽位替换、统一映射、刷新/重新构建步骤。tests/sound-settings.test.mjs验证实际MP3槽位/配置、异步去重、回退/边界/超时/取消/迟到解码，以及音量/静音/授权/设备失败模拟；Chromium脚本从正式静态服务读取并解码全部14个素材，核对MIME/时长/非静音/峰值，统计原生BufferSource.start验证默认/逐项试听、同房旁观成员播放、跨房隔离及偏好恢复，不把调用成功等同于物理听感验收。

验证入口：`npm test` 包括新增真实双房间/八成员 WebSocket 完整词库联调、卡片模板与事件、个人回应选择/上限/持久化/存储失败、悬浮输入窗及键盘视口/IME 模拟、App/ASR 生命周期、提示音失败模拟；`npm run test:room-interactions:browser -- <playwright>` 使用构建产物和临时网关验证菜单取消/设置布局、个人词库选项/刷新恢复/成员偏好隔离/新词广播、桌面右键/左键不弹菜单、移动长按、全局输入窗、模拟软键盘视口升降平移、八人发送、IME 合成事件和语音模拟回归。物理多设备、真实软键盘/系统 IME、真实音频与 ASR 单独人工验收。

## 公开 UID 与交互（2026-10-25，已部署）

`interaction-20261025T1510Z` 于北京时间23:23配套上线。账号库事务迁移至v2，增加唯一 `users.public_uid`，给旧账号分配100000～999999的六位字符串，避开现有数字账号名；注册也拒绝占用已分配UID的账号名。公开身份仅返回短UID，账号/UID均经密码验证登录和启动找回，账号限流归一到内部ID。`users.id`、全部外键、会话和房间 `ownerUid` 继续使用原UUID，服务签名授权只取服务端会话中的内部ID，无需修改房间所有权或重新绑定。密码统一8～128字符，Argon2id、Origin/CSRF、限流和会话撤销保留。

密码字段提供独立显示开关，切页/提交结束清理输入及开关。当前安全码是三道密保答案，默认明文，只导出本地当次填写内容；后端继续只存哈希，不新增可逆密保存储。

Key输入分开保存草稿、配置状态掩码、临时查看原文；保存后清除草稿并显示 `********`。空草稿和全星号不得提交，服务端也拒绝全星号。新增 `reveal` 经现有POST/Origin/CSRF/HMAC和当前房主校验，仅点击时返回原文，不进入成员广播、普通状态、日志、磁盘或浏览器持久存储。账号代理在上游返回后再次验证会话；匿名凭据绑定后被撤权，游客/成员/其他账号不能查看。隐藏、刷新、卸载和账号切换清理原文。只读成员没有输入和显示按钮；本机设置沿用本机Origin/令牌保护，环境只读Key不提供查看。

生产原3个账号、20间房及密保/存档/项目关联经备份副本迁移和上线逐项核对保留。SQLite integrity_check与foreign_key_check通过。回滚与验收见ACCOUNT-DEPLOYMENT；真实豆包、麦克风与手机另验。后文记录此前阶段。

> 2026-10-23 生产状态：Star-Hub 已运行 main `d1f237b`，包含 `52b9788`，发布 `deploy-20261022T1748Z`。账号服务与 HakiSub 独立进程，分别仅回环映射 18788/18787，同一私有 Docker 网络通过 HMAC 管理通信；原 Caddy 提供主站与子域 HTTPS，公网 `/internal`、`/internal/*` 明确返回 404。主站会话 Cookie 为 host-only、Secure、HttpOnly，通过主站 BFF 校验 UID，子域不持有账号凭据。UID/房主/别名/ASR 开关持久化，房间 Key 仅内存，启动后全部缺 Key，旧磁盘 Key 永不恢复、无默认回退。生产原有 19 间房元数据保留，首次成功元数据写入已迁移为 v3；详见 ACCOUNT-DEPLOYMENT 的本期记录。后文早期“本地未部署”字样仅描述当时阶段。

## UID 房主与远程房间管理（2026-10-22，本地未部署）

`accounts/server/accountServer.mjs` 复用主站 HttpOnly、Secure、host-only Cookie / CSRF / 精确 Origin。所有管理路径位于 `/api/projects/hakisub/rooms`；HakiSub 子域通过带凭据 CORS 请求主站，Cookie 仍只发给主站。客户端不提交 UID、不复制 Cookie 或长期 token。`GET rooms` 只返回当前账号真正拥有的房间，个人偏好存档与本机入口继续单独管理。

账号服务只从有效 SQLite 会话取 UID，网络等待后重查会话，通过 `roomManagementClient.mjs` 签发限定房间操作。独立 `HAKISUB_ROOM_MANAGEMENT_SECRET` 对 `POST\n/internal/rooms/manage\n<完整JSON正文>` 做 HMAC-SHA256。正文包含 UID、动作、房间码、时间、一次性 nonce 和每次网关启动随机 audience；10 秒时间窗、常量时间签名比较、nonce 缓存上限及重启失效防止篡改/重放。请求不重定向、不接受浏览器 Origin，响应不含 Key/ownerHash/ownerToken。内部接口即使误入反代也必须校验签名；生产仍不得公开代理 `/internal/*`。双服务只通过回环/隔离容器网络或受信 TLS 通信，不允许公网明文传递 Key。账号故障/过期/缺配置拒绝管理，无成员权限降级。管理请求已经发出后不作跨服务分布式撤销；请求有效期最多10秒，不向浏览器签发可复用授权票据。

`roomGateway.mjs` 是唯一所有权与运行状态权威：匿名房间用 ownerHash 核对原凭据；绑定同时验证服务器认证的 UID 和原 ownerToken，原子保存 ownerUid 并随机替换 ownerHash，撤销所有在线成员缓存的匿名 owner。绑定失败不撤销；已绑定拒绝重复认领（含同 UID），不提供解绑/转移。绑定后匿名设置 POST 一律403，账号管理每次核对 ownerUid，普通 memberId/token 只代表在线成员。登录后创建复用“创建匿名真实房间 → 服务器核验绑定”流程；若账号不可用，明确提示绑定未完成并保留可重试的匿名房主凭据。

`roomStore.mjs` 读取v1/v2/v3，写v3白名单元数据：code、aliases、ownerHash、ownerUid、asrEnabled。旧encryptedKey/apiKey/keyState忽略且不解密，不需要旧加密主密钥。首次成功元数据写入剥离全文件旧Key字段；读取不自动改写源文件。网关加载记录后强制apiKey为空、keyState=missing，即使传入旧适配器也不恢复Key。configured/deleted/missing仅当前进程内存状态，后端启动重置为missing。

房内匿名设置与账号远程操作共用每房互斥管理函数，冲突409。Key设置/删除仅更改网关内存，不调用持久存储；绑定/开关只提交元数据。换删Key、切换开关时先锁定并同步清理本房客户端/上游和并发占位。开关持久化失败返回500，保持原开关并清除当前Key，广播缺Key状态；无blocked或重启重新授权状态。重启即缺Key，不能因磁盘故障恢复付费能力。

ASR WebSocket upgrade 强制检查成员、开麦、房间锁、asrEnabled、本房内存Key和并发。恢复开关不会自动开麦，Key测试仍只检查握手。身份、跨设备管理、Cookie/签名授权、成员广播与模拟/Web Speech规则不变。

自动验证：`npm run test:room-management` 使用真实 SQLite/Argon2id/HTTP/WebSocket 和假豆包，另渲染实际个人中心模板；现有四条测试/构建命令仍须执行。真实跨子域 TLS/Cookie、真机/麦克风/云端识别及容器资源验收单独记录。

ASR 并发配置（2026-10-22）：`runtimeConfiguration.mjs` 三种部署模式默认均为 8 路，`HAKISUB_MAX_ASR_SESSIONS` 仍只接受 1～8，Compose 与发布示例同步默认 8。此上限为网关跨房间的全局有效识别连接数，每成员一路、无令牌入口限制、Origin、Key、超时和停止清理逻辑不变。线上原镜像已通过显式环境配置从 2 改为 8，无需发布本地其他功能。部署模拟覆盖默认八路、显式两路覆盖、跨房间第九路拒绝、同成员重复拒绝以及关麦后释放名额；后文默认两路是历史记录。

统一账号（2026-10-21，本地完成，未部署）：`accounts/server/` 是独立 Fastify/SQLite 服务，使用成熟 Cookie/CORS/CSRF 插件、Argon2id 与 better-sqlite3，不修改实时网关或豆包协议。主站专属 `__Host-xdstar_session` Cookie（无Domain）只发送给主站；HakiSub 的 `accountClient.ts` 通过精确 Origin 凭据 CORS 请求最小身份和本人存档，不读取 username 或长期认证 token。账号设置只接受主站 Origin；CSRF 绑定会话与 account/hakisub 作用域。SQLite 保存密码/答案哈希、会话 token 摘要、找回挑战、私人配置及持久限流；注册成功配额与插入同事务复检，哈希计算有单路与有界队列。

`AccountAccess.vue` 定期/回到页面时刷新身份；App 仅在未入房且用户未手改显示名时填昵称，不更换 memberId。`RoomPresets.vue` 保存/同步/改名/加载/删除识别来源和布局，严格排除 API Key、ownerToken、成员token、音频字幕。个人中心链接携带的 preset UUID 仍由服务端按当前 UID 授权，加载不会自动入房或开麦。主站页面独立构建至 `accounts/dist/`，HakiSub 主体布局和字幕生命周期保留。`scripts/preview-accounts.mjs` 使用独立测试库、空Key内存网关和5179/8790回环端口，不连接现有8787或生产。

UID、Room Owner、Member 三者独立：UID关联长期数据，ownerUid关联已绑定房间；未绑定房间继续使用独立匿名凭据。绑定必须同时验证账号会话和本房管理凭据，不能按昵称、房间号或存档认领。房主手动暂停全房豆包ASR已在本地实现，销毁、费用额度/熔断未实施。可选 `compose.accounts.yaml` 和 Caddy 候选文件尚未启用。Linux原生依赖、真实跨子域Cookie及生产费用保护另验；完整风险、数据表和方案见 [账号审查](ACCOUNT-SYSTEM-PLAN.md)，执行见 [账号部署](ACCOUNT-DEPLOYMENT.md)。

房间URL及分享（2026-10-21）：`roomNavigation.ts`严格解析六位数字路径并构造只含origin和正式房间号的分享URL；App在服务器joined确认后从首页pushState，直达/别名路径则replaceState为规范的`/<code>/`。初始深链接及popstate只预填加入信息，不自动连接或开麦；后退/前进先清理成员会话、采集和字幕。pagehide保留路径以支持刷新，断线保留房间路径供重进，返回首页按钮才切换根路径。系统分享失败回退Clipboard，AbortError视为取消，全部受限时提供只读地址；异步结果通过操作编号避免离房后更新。模拟房间不提供联网分享入口。生产静态服务仅额外白名单匹配六位房间路径（可含尾斜线），仍拒绝其他未知路径，资源/API使用根路径。

房间换号（2026-10-20）：roomStore的version 1记录增加可选aliases，加载时校验其六位码、去重及与所有正式房间号互斥；旧资料无aliases兼容。renameRoom在串行原子提交中保留ownerHash、解密原Key后以新号为AAD重新加密，删除旧正式记录并保存旧号别名；冲突/非法目标不覆盖资料，保存配置不丢别名。gateway在加入时把别名解析到同一room对象，创建时避开所有别名，不产生第二份成员/配置。joined仅向本房成员提供号码别名，无新增公开管理API。

前端rememberRoom按正式号及服务器返回的别名合并本地入口，保留当前浏览器的ownerToken；直接输入新号而本机只有旧号凭据时，App最多重新加入一次以补验原房主身份，不自动开麦。普通成员不会获得房主凭据，失效凭据不无限重试。服务器CLI renameRoom.mjs默认--check，--apply仅供停止应用后的维护窗口；要求预先备份加密数据及环境，重复执行识别已迁移状态，不回显Key/管理凭据。不修改字幕、音频、识别或重连参数。

语音传输恢复（2026-10-20）：用户取消延迟调优，仅修复断连。`asrGateway.mjs`在识别cleanup时先标记asrStopped、终止上游并释放本人asr引用，升级校验只统计尚未结束的连接；旧close回调通过引用相等检查不能清除新连接的占位。测试让旧客户端暂停接收close，验证本机和联网成员在旧握手未完成时均可建下一句，同时重复/超并发仍403。

`doubaoAsrClient.ts`对浏览器到网关的error/异常close/send异常做250/750ms退避，30秒内最多两次；每连接编号与代次隔离迟到回调，关麦/离房撤销计时器。保留已有10秒有界未发送队列，成功交给WebSocket的音频不重放，清除旧Interim而保留Final；没有未发语音时回到本地等待，下次开口再建连。`App.vue`仅豆包reconnecting继续广播mic:true，避免恢复状态误关麦导致服务器撤销连接。服务端明确的配置/协议/上游错误仍安全停止，不无限重试；中断片段可能缺失，不宣称恢复全部音频。识别参数/检测/上传节奏/字幕生命周期不变。

模型加载超时修复（2026-10-20）：旧20秒固定启动时限同时包含运行库、约14.7MB模型/WASM下载和编译，慢连接无法完成且无阶段提示。`vadAssets.ts`提供同源版本URL及有界流式下载，按浏览器解压后的实际字节累计进度并校验长度，模型与WASM并行下载；Worker把已下载字节直接交给ORT，避免重复下载，运行库/下载/初始化分别汇报状态。`speechDetector.ts`下载30秒无进度、初始化60秒、总准备180秒保护；`doubaoAsrClient.ts`把采集30秒保护独立计时，采集完成后不再打断模型准备，取消/故障仍终止Worker并释放音轨。进度与公开资源缓存不包含音频、识别文字或密钥。

`prepare-vad-runtime.mjs`生成四份gzip副本（模型/WASM合计约5.1MB），正式静态服务按Accept-Encoding提供预压缩响应、保留原MIME、Content-Length/Vary；只有带版本的已知VAD资源使用长期缓存，HTML仍no-cache。打包校验原件与gzip均存在；模型/ORT升级需同步`vadAssets.ts`版本和长度。运行时仍单线程、独立Worker、无CDN/跨源隔离要求。下段20秒时限为此前修复的历史状态，以本节为准。

麦克风启动修复（2026-10-20）：此前采集与VAD加载并行，但speechDetector把模型未就绪时的音频也放入25包运行队列，首次加载超过5秒就提前报积压。初始化阶段改为最多3包滚动缓冲（约600ms），ready后只处理最近句首片段；模型加载20秒超时、运行时25包上限/陈旧音频/单包超时和故障释放继续保留。UI通过startingMemberId仅给本人的卡片展示“准备中”，按钮为“取消开启”，均就绪后才显示开启；不预先广播开麦、不提前连云端。回归测试覆盖12秒/60包加载及原有运行期故障；真实浏览器用合成静音、延迟Worker初始化12秒，实际AudioContext/Worklet/重采样/模型推理成功切换listening且云连接为0，关闭后恢复idle。未访问真实麦克风或豆包。

房间流程改造（2026-10-20，已部署hakisub-20261020T133934Z并通过公网及真实服务重启验收）：默认online；`rememberedRooms.ts`只在浏览器保存房间码、显示名及创建者管理凭据，首页再次进入发起新的join并始终保持麦克风关闭。`roomGateway.mjs`在全员离开后保留房间，成员令牌仍立即撤销；重进不恢复音频或字幕。创建者随机凭据只在创建响应发给本人，服务端保存SHA256摘要，重新加入时校验，其他成员不能冒用配置权限。

`RoomApiSettings.vue`在房间内使用原生模态dialog，提供密码输入、保存/移除、握手测试、绑定及状态刷新；关闭/离房清空输入并取消请求。`roomSettings.mjs`通过成员Bearer、Origin和匿名创建者权限管理未绑定房间；绑定后走账号服务代理。每房管理互斥，配置写入期间阻止新豆包会话并清理旧会话；浏览器字幕广播不受该锁控制，不要求其他成员退出。仅返回状态，不返回Key。联网房间仅使用本房Key；旧本机设置API保留给模拟房间。

当前roomStore仅持久化房间元数据，不持久化Key、成员、识别文字或音频。旧版AES-256-GCM字段从不加载；错误/缺失加密主密钥不再阻止元数据读取，但损坏身份/别名/开关或冲突记录仍拒绝加载。改号只保留元数据与别名，不再解密/重加密Key。旧初始化脚本及生产卷不在本轮执行或修改。

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

asrSession.ts 将仅存在内存的房间令牌传给 doubaoAsrClient.ts，ASR 通过 /api/asr?session=令牌 绑定到已开麦成员。网关拒绝无效令牌、同一成员第二路、超出全局上限、房间暂停/锁定/缺Key的连接，每路上游、超时、结果映射和用量独立。旧无令牌入口只保留本机单设备兼容，与成员会话互斥。联网房间无默认Key回退；尚无账户额度隔离。令牌是临时成员凭据，不是豆包Key；部署时不应记录带查询参数的ASR URL。

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
