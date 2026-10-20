# xdstar.work 统一账号系统：审查与实施方案

日期：2026-10-21（Asia/Shanghai）。本轮先完成只读审查，再按本方案进行本地开发；没有授权修改生产配置或重启服务。方案包含后续补充的 UID / Room Owner / Member 分离要求。

进展：阶段一审查与阶段二～四的本地账号/密保/存档实现已完成；测试与预览结果、尚未执行的生产验收见 [账号部署手册](ACCOUNT-DEPLOYMENT.md)。下文的方案描述保留设计依据，不代表对应内容已上线。现成组件与自实现边界见 [开源复用记录](../accounts/THIRD-PARTY.md)。

## 1. 已核实的部署与代码

| 项目 | 实际情况 | 对本次开发的影响 |
| --- | --- | --- |
| 仓库 | `xdstardog-dev/HakiSub`，本地 main，HEAD `69a3bd0`，大量原有未提交改动 | 保留工作区；GitHub main 的 package.json 尚未包含本地新增的多项房间测试，不能直接用远端 main 覆盖运行版本 |
| 主站 | `deploy/xdstar/` 的静态 HTML/CSS/SVG，Caddy 提供；HTTPS GET 200 | 新增 `/account/` 与账号 API 路由，主页继续保留 |
| HakiSub | Vue 3 / TypeScript / Vite + Node / ws；线上 `hakisub-20261020T173624Z`，healthy | 只在入口和存档组件接入账号，不改音频与字幕链路 |
| Star-Hub | Ubuntu 24.04.5，2 CPU，内存约 1613MiB，检查时可用约 1068MiB，磁盘可用约 31GiB | 足以先试运行轻量服务；哈希必须有并发与排队上限，隔离于实时网关 |
| 容器 | Node 22.23.3 / Docker 29.9.1；HakiSub 限 512MiB / 0.75CPU，Caddy 限 128MiB / 0.25CPU | 不升级现有网关运行时、不调整现有限额 |
| 入口 | Caddy 80/443，HakiSub 只发布 `127.0.0.1:18787`；未发现运行的数据库服务/容器或数据库监听 | 新账号服务使用 SQLite，另一个回环端口；无需公网新端口、DNS 或商业服务 |
| 房间 | `roomStore.mjs` 保存 JSON 元数据和 AES-256-GCM 加密的房间 Key，ownerHash 校验独立房主凭据 | 已有房间级 Key 管理，不能误判为待开发或改成账号 Key |
| 持久化 | `hakisub-test_hakisub_room_data` → `/app/data`；rooms.json 权限 0600；Caddy 有证书卷 | 新建账号数据卷，不混入房间资料；备份恢复仍须另验 |
| 身份 | 目前没有账号/数据库/统一登录；memberId 和临时成员 token 独立 | 新增 UID，继续保留游客与实时成员身份 |
| 浏览器记录 | `rememberedRooms.ts` 保存房间码、显示名和本浏览器 ownerToken | 这是本机房间入口，不是跨设备个人存档；不自动上传旧凭据 |
| ASR | 线上 health 的 configured:false 仅代表服务器默认 Key 未设置，不代表各房间无 Key；两路全局并发、15 分钟单路上限 | 不把注册成功当作付费许可，不改密钥、路由与计费逻辑 |

以上来自本地源代码、GitHub 文件读取及现有 SSH 别名的只读核查。公网网页由服务器使用正常 TLS 校验访问；web 抓取工具无法打开两站，不能把它的失败当成网站宕机。未创建生产测试房间、调用真实 ASR 或访问麦克风。

## 2. 实施结构

新增 `accounts/`：独立 package/锁文件、Fastify 服务、SQLite 存储、账号路由、Vue 页面、测试和运维 CLI。同仓库管理、单实例部署，无 Redis、消息队列或商业认证依赖。独立进程避免密码哈希与数据库任务阻塞语音网关。

采用成熟的 Fastify cookie/CORS/CSRF 插件、`argon2` 和 `better-sqlite3`。锁定安装版本；Linux 原生依赖必须在 Linux 构建并验证，不能复制 Windows node_modules。现有 Dockerfile 仅复制 ws，不能直接用于账号服务。账号镜像使用独立 Dockerfile，保留原网关镜像构建流程。

模块按实际需要创建：configuration、database、passwords、requestSecurity、accountServer、CLI；前端 AccountApp 和表单组件；HakiSub 的 accountClient 与 RoomPresets 组件。现有 `captions.ts`、采集、重采样、VAD、ASR 协议保持原职责。

## 3. 统一登录与子域名隔离

采用主站专属 HttpOnly 会话 Cookie：`__Host-xdstar_session`，Secure、SameSite=Lax、Path=/、无 Domain。随机 256-bit token，数据库只存 SHA-256 摘要，默认最长 30 天、闲置 7 天失效；注册/登录轮换，关闭浏览器后仍可使用。浏览器只持 Cookie，不将认证凭据存 localStorage。

HakiSub 使用 `fetch('https://xdstar.work/api/...', { credentials:'include' })`。两站 HTTPS、同站但不同源：Cookie 发往主站，不发给 HakiSub 服务器。API 按路由校验精确 Origin：

| 接口范围 | 允许来源 | 可读数据 |
| --- | --- | --- |
| 注册、登录、退出、找回、个人资料及账号设置 | 主站自己 | 本人登录账号、UID、昵称、注册时间等 |
| HakiSub 身份接口 | 主站和正式 HakiSub Origin | 仅 UID、nickname、登录状态，不含 username、密保或会话 token |
| HakiSub 存档接口 | 主站和正式 HakiSub Origin | 当前会话 UID 的存档 |

凭据 CORS 只返回精确允许来源、credentials:true、Vary:Origin，不使用通配符。服务端拒绝错误 Origin，而不是只省略 CORS 响应头。所有写入需 JSON、自定义 CSRF 请求头及会话绑定校验；登录/注册也先取匿名 CSRF Cookie。不能用 SameSite 代替 CSRF，因为其他子域也属于同站。退出为 POST，所有私有响应 no-store。

初期无需 OAuth 服务或跨域 token 交换。HakiSub 房间后端本轮不需要全站 Cookie：长期数据由账号服务验证 UID；实时成员仍由原房间连接验证。UI 默认昵称不是可验证的房主身份标志，服务端不接受客户端提交的 UID 作为授权依据。未来某个项目后端确实需要认证 UID 时，再增加独立、限受众的服务端身份验证协议。

个人中心默认新标签打开，原房间页面继续运行；同标签导航仍遵循原 pagehide 清理，不能承诺维持麦克风。回到 HakiSub 时刷新身份；过期或退出仅停止私人存档操作，不主动踢出游客可用房间。

依据：[Cookie 属性](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)、[凭据 CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)、[OWASP CSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)。

## 4. 数据与校验

SQLite 启用外键、WAL、busy_timeout；短事务、参数化 SQL；仅账号容器读写自己的数据卷。迁移事务化并记录版本，异常时拒绝启动，不重建或覆盖旧库。

| 表 | 关键字段与约束 |
| --- | --- |
| users | UUID id，不变；username 规范为小写且 UNIQUE；nickname 不唯一；password_hash；email / email_verified_at nullable；auth_version；时间戳 |
| security_questions | user_id + slot(0..2) 为主键；question、answer_hash、normalization_version、updated_at |
| sessions | token_hash 主键；user_id、auth_version、创建/最后使用/到期时间；无原始 token |
| recovery_challenges | token_hash、规范化账号的 HMAC 索引、user_id nullable、auth_version、问题快照、到期、剩余次数；真实/虚拟挑战外观一致 |
| hakisub_room_presets | UUID id、user_id 外键、preset_name、schema_version、严格白名单 configuration、时间戳 |
| user_projects | user_id + project_key；首次保存该项目资料时关联 |
| rate_limit_events | action、IP/账号 HMAC、时间；服务重启不清零；定期清理过期记录 |
| registration_events / security_events | 成功注册与最小化预警/管理员操作记录；不记密码、答案、Cookie、音频或字幕 |
| schema_migrations | 已完成迁移编号 |

登录账号建议 3～32 位英文字母、数字、下划线，大小写视为相同，不支持修改。用户昵称 1～20，采用与既有房间显示名兼容的长度校验，允许重复；密码 12～128 字符、不做 trim 或答案式规范化，允许粘贴与密码管理器，不强加复杂字符组合。密码和每个答案独立随机盐、Argon2id PHC 格式，初始至少 m=19456KiB/t=2/p=1，再以隔离压测决定上调。

所有私人查询/更改都使用 `WHERE id=? AND user_id=?`；UID 从会话取，禁止用请求体 userId 选账号。不存在和他人存档统一 404。修改昵称不修改外键归属。邮箱字段仅预留，不出现无实现的绑定按钮。

依据：[密码存储最低参数](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[node-argon2 平台支持](https://github.com/ranisalt/node-argon2)、[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)。

## 5. 注册、登录和恢复防滥用

服务端持久限流，以下为可配置初值：滚动 24h 同 IP 最多成功注册 3 个；10min 同 IP 最多提交 5 次注册；Asia/Shanghai 自然日超过 100 个成功注册只记预警，不关闭注册。注册请求计数先于昂贵哈希；用户名唯一性和成功次数在同一写事务内复检，防并发穿透。

密码/答案计算全局最多 1 个操作，排队最多 8 个；队列满返回可重试提示，不无限排队。登录按 IP 和 IP+账号限流；找回的挑战获取与答案提交均受 IP/账号/挑战多层限制。拟定登录 IP 30/15min、IP+账号 5/15min；找回获取 IP 10/15min、答案 IP 10/15min + 账号 5/30min、单挑战 5 次/10min。账号不存在也走相同计数和虚拟哈希；不返回哪道答案错误。找回限流不永久锁住正常密码登录。

IP 从 socket peer 获取，只有明确受信代理可解析其覆盖的来源头。Caddy 本轮处于公网最外层，默认会清理伪造的 X-Forwarded-*；新增账号反代显式覆盖专用客户端 IP 头。后端仅信任经部署核实的 Caddy 到容器的精确 peer，不能用 trustProxy:true 或信任所有私网地址。现有 Docker bridge 网关为 172.18.0.1，但新账号容器 peer 需实测，不能把旧值直接当定论。IPv4-mapped IPv6 规范化；IPv6 按 /64 附加聚合限制以减少换地址绕过。代理链变化时重新验收。

管理员通过服务器 CLI 查看计数/单日预警、定向解除某 IP 的限制；无公开管理员接口。解除是带审计的定向重置，不改全站规则。IP 用服务端稳定 HMAC 密钥索引，不保存完整 IP 日志。

依据：[Caddy 的来源头处理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。

## 6. 传统密保：实现与不可消除的风险

注册必须三道不同问题和答案；提供预设及自定义问题，提醒不要填写私密信息或密码提示，答案可是不真实但自己记得住的短语。答案 NFKC、去首尾空白、合并连续空白、英文小写后哈希；记录规范版本。不删除所有符号或模糊匹配，不存原文。修改需当前密码，事务内替换三条、撤销旧找回挑战并更新认证版本。

找回：输入账号 → 限流后获得短期挑战及三问 → 一次提交三答和两次新密码 → 验证所有答案 → 单事务重置密码、增加 auth_version、删除全部会话/挑战。10 分钟、最多 5 次、一次性消费；并发提交只能成功一次。成功后要求重新登录。不存在账号返回稳定的虚拟三问和挑战，错误统一提示，验证码/口令永不进入 URL。

**风险一：三个答案均被熟人知道或猜中，仍可重置密码。** 哈希、限流无法证明来访者是真正本人；无邮箱/第二因素时不能消除此风险。本期按需求保留密保，不能宣称达到强身份恢复级别。建议答案使用独立私密短语；未来可用已验证邮箱或恢复码替换/加强，不做付费身份服务。

**风险二：按账号展示各人自定义问题，无法保证完全隐藏账号是否存在。** 虚拟问题、固定错误与限流只能提高批量枚举成本；问题特征仍可能泄露存在性，注册冲突提示本身也会泄露少量信息。不新增无约束的用户名可用性查询。若要求严格不可枚举，就需所有人使用相同三问，或在展示自定义问题前增加独立凭据；这会改变既定体验，当前不擅自删掉自定义功能。

依据：[OWASP 传统密保风险](https://cheatsheetseries.owasp.org/cheatsheets/Choosing_and_Using_Security_Questions_Cheat_Sheet.html)、[OWASP 找回流程](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)。

## 7. UID、房主和成员的兼容边界

| 标识 | 当前/未来职责 | 不能推导的权限 |
| --- | --- | --- |
| UID | 长期用户与个人存档归属 | 不是付费 ASR 许可，也不是房主证明 |
| room code | 房间定位与邀请入口，可能有旧号别名 | 不是私密管理凭据 |
| memberId / member token | 本次连接、字幕归属和本人 ASR 会话 | 不代表账号 UID，不能管理别人的 API 配置 |
| ownerToken / ownerHash | 已实现的匿名房主独立凭据/服务端摘要 | 不自动等于登录账号 |
| room API Key | 房间独立付费资源，服务器加密管理 | 不是 UID、房间号或用户登录凭据 |

当前只保存严格白名单的非秘密配置，例如识别来源、布局偏好；加载存档先应用设置，再由用户选择创建/加入，不自动开麦。不保存 API Key、ownerToken、member token、成员列表、音频、字幕或历史。存档不是永久在线房间；新建房间不会继承旧房 Key 或管理权。旧本机记录继续独立存在，导入也不能携带房主凭据。

预留方式：个人存档外键已是 UID；配置携带 schemaVersion，未来可迁移增加授权引用。未来房间元数据可增加 nullable ownerUid，并保留匿名 ownerHash，两者与实时 memberId 分开。**将旧房间绑定 UID 必须同时验证登录会话和当前有效的本房管理凭据，不能按房间号、昵称或“存过这个房间”认领。** 本轮不创建虚假的房主绑定记录或开放绑定 API。

未来手动暂停全房 ASR、强制销毁、额度控制属于 roomGateway / ASR 授权层的独立阶段，操作要撤销成员连接与上游识别。当前全员离开后保留元数据、最多 100 间，是已部署行为；本次账号存档不改变它。匿名批量创建占满 100 间及 6 位码可猜测也是原有风险，不能用开放注册限流冒充房间/费用控制。

已有 ownerToken 长期保存在 localStorage，存在 XSS 窃取管理权风险；账号 Cookie 不会自动解决这个历史问题。本期不把它复制进账号库；迁移/缩短房主凭据寿命须独立设计并验收，避免破坏现有匿名房主。

## 8. 页面与 API 实施清单

主站 `/account/` 提供登录、注册、忘记密码、个人中心、账号设置和存档列表；字段明确写“登录账号”“用户昵称”。窄屏单列，沿用现有米白/深绿视觉。私有页不缓存、不使用 v-html 展示昵称/问题/名称。

账号 API：CSRF bootstrap、register、login、logout、me、nickname、password、security-questions、recovery/start、recovery/reset。HakiSub API：最小 identity、存档 list/create/rename/update/delete。所有写入重新验证会话有效性；改密码撤销旧会话并轮换当前会话，重置密码撤销全部会话。

HakiSub 仅增加账号入口/昵称默认值和房间存档对话框；当前房间昵称不在后台静默改写，下一次入房读取新昵称。账号服务不可用时游客流程仍可用；不可把旧账号的缓存存档展示给切换后的新账号。

## 9. 分阶段执行和验收

1. 本阶段完成代码/服务器只读审查并保存本方案；现有 `npm test` 和 `npm run build` 基线已通过。沙箱拦截 esbuild 和换房 CLI 子进程，获准沙箱外重跑后通过。
2. 本地新增 SQLite 迁移、独立账号服务、Cookie/CSRF、注册/登录/退出、个人中心、改昵称/密码、持久注册限流及管理 CLI。第二阶段只是隔离开发，三问未完成前不对生产开放注册。
3. 三问注册/修改、找回挑战、统一错误及复合限流；并发重置、旧会话撤销、虚拟账号和规范化测试。
4. 最小身份读取、默认昵称、游客回归、存档 CRUD/跨客户端读取、跨账号越权测试；不开发未来房间权限或费用控制。
5. 本地全套测试/构建、账号浏览器验收、Linux 原生依赖与容器权限、真实浏览器跨子域 Cookie/CORS/CSRF、备份恢复演练后，提供具体生产差异和回退包。任何配置覆盖、生产重启或 ASR 保护验收单独进行。

验收至少包括：大小写用户名并发唯一；同昵称不同 UID；改名后存档归属；A 无法读写 B；退出/过期/改密/找回的会话变化；24h/10min 边界及重启后限流；伪造代理头无效；哈希队列溢出；三答均需正确、挑战不可重放；未知字段/密钥不能进入存档；游客、模拟、房间链接、原房主权限和 ASR 并发规则不回退。

## 10. 部署、备份与用户需要提供的信息

本地开发无需新服务器、邮箱、短信、付费验证码或真实 Key。拟新增账号服务回环 `127.0.0.1:18788`、账号数据卷和非 root/只读根目录，初拟 384MiB / 0.5CPU；隔离压测确认后才能作为生产参数。

Caddy 仅主站的 `/account/*` 与账号/项目 API 代理至新服务；账号页面单独 CSP 允许自己的脚本/连接/表单，避免与主站原 `form-action 'none'` 叠加而阻断操作。主站其余静态策略、子域网关代理与两条 WSS 路径保留。现有 Caddy admin off，应用配置变化需重建 Caddy，会影响 WSS；必须安排经确认的窗口，不在本轮执行。

账号卷与原房间卷分开。数据库在线备份使用 SQLite backup API（含一致 WAL 内容），每日加密备份保留 7 日/4 周；异机副本由用户选择已有个人存储位置，不新买服务。备份包含密保哈希等敏感资料，目录 0700、文件 0600。恢复先隔离校验 integrity_check/迁移/样本，正式替换前另行确认；恢复后撤销旧会话/找回挑战。不能直接复制单个正在写入的 sqlite 文件，也不自动删除现有库。原房间资料仍须同时备份原主密钥，不改它。

需要用户后续确定：备份异机位置和维护窗口；是否接受自定义密保的上述固有风险。部署时在服务器本地生成稳定的账号签名/限流 HMAC 密钥，不发聊天、不放 VITE_*；确认实际代理 peer 和正式 Origin。无需用户提供豆包 Key，也不修改生产 Key。

执行位置必须显式区分：

- **Windows 本地 PowerShell**：代码、依赖安装、`npm test`、`npm run build`、账号独立测试/构建及发布包生成。
- **远程 Star-Hub Linux**：只读核查；之后经确认才备份、验证 Compose/Caddy、切换镜像和恢复。
- **Docker 容器内部**：账号迁移/备份 CLI、Linux 原生库冒烟、非 root/数据卷权限与恢复演练。测试容器不得使用生产卷或真实 ASR Key。

本方案不是已部署声明。真实跨子域登录、生产费用保护、真实麦克风/豆包识别、异机备份恢复都必须记录各自实际结果，不能用本地模拟替代。
