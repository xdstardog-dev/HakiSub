# XDstar 统一账号服务

## 四位入房码与账号免输（2026-10-31，已部署）

北京时间01:46:30与HakiSub配套发布`room-access-20261030T1733Z`，功能提交`391fbb0`。原6账号及24房资料保留，数据库仍v2。公网使用真实注册/UID登录、Cookie/CSRF和跨子域身份，验证首次输码、同账号跨浏览器免输、改码撤销在线访问和再次授权。新增2个明确标记的合成账号、1个测试房，测试会话均退出；未使用真实麦克风/豆包。归档、备份和v4恢复边界见[发布记录](../docs/RELEASE-20261031.md)。

“我的房间 → 管理房间”新增四位入房码设置、更换与移除，房内入口统一为“房间设置”。入房码按用户要求明文保存在网关v4房间资料中；API Key仍只在内存，不写入账号库或房间文件。账号数据库schema保持v2，验证过入房码的内部UID列表由网关按房间持久保存，同账号跨设备及双服务正常重启后可免输；房主改码后清空资格，在线非房主重新验证。游客仍可直接提交四位码加入，不需要注册账号。

新增`POST /api/projects/hakisub/rooms/:code/access`，只接受可选password。账号服务沿用Cookie/CSRF/精确来源和签名通信，从服务端会话取UID；成功后返回网关签发的60秒单次入场票据。客户端不能自行指定UID，普通列表不返回入房码或其他已授权账号。管理接口新增access-code动作，仅合法房主可设置。`npm run test:accounts`已包括真实隔离SQLite、Cookie、CSRF、签名服务和WSS跨设备/重启/改码联调；根目录`npm run test:room-access`可执行专项。本次已配套更新账号后端/前端和网关/主前端；旧网关不能读取v4资料，真机及真实ASR另验。

## 账号工作台 UI（2026-10-29，已部署）

北京时间19:43上线 `account-workspace-20261029T1139Z`，功能提交 `bb5447d`，入口 https://xdstar.work/account/ 。仅账号前端镜像更新并重建账号容器，原后端、依赖、数据库v2及持久卷保留，HakiSub/Caddy未重启。公网正式Chrome完成375/768/1440px、注册往返/完成、UID登录/退出、五个页面、抽屉覆盖/遮罩/Escape/焦点恢复及真实跨子域Cookie/CORS验收；自检新增合成账号，不改原资料或房间。备份和独立UI回滚见 [发布手册](../docs/ACCOUNT-DEPLOYMENT.md)。下方“合成浏览器验收”指开发阶段，不能代替真机或真实豆包。

前端继续复用 `accountApi.js` 和 `QuestionFields.vue`，不更改账号/房间接口或数据库。`AccountApp.vue` 管理认证及五个独立页面：总览、我的房间、房间存档、个人资料、安全设置；`AccountNavigation.vue` 共用桌面和手机导航，`OwnedRooms.vue` 提供房间摘要、列表和单房间管理。总览及列表不渲染 Key 输入；只有进入单房间管理并点击“显示”才读取已有 Key 原文，返回/切页/刷新/退出均丢弃显示状态，迟到响应不能重新展示旧 Key。

登录不再使用三项 Tab；注册第一步只验证账号、昵称、密码与确认密码，第二步填写三道密保后才一次调用注册 API。步骤往返保留全部输入，请求失败保留当前账号表单，成功提交和离开认证/安全页面时清理敏感输入。密码与密保修改使用独立的当前密码字段；昵称草稿不被同一账号的焦点刷新覆盖。退出或会话过期会清理账号资料、存档和敏感状态。

桌面固定 240px 左栏与最大 1180px 内容容器；900px 以下采用原生 `dialog.showModal()` 抽屉（85vw，最大 320px），使用顶层遮罩、浏览器焦点约束、Escape/遮罩/关闭按钮和导航自动关闭。打开时保存背景样式与滚动位置，关闭或切回桌面时恢复；减少动画设置生效。PC 与手机共用业务状态，视口改变不重新挂载表单。

新增可选浏览器验收：先 `npm run build:accounts`，再在根目录运行 `npm run test:accounts:browser -- <Playwright模块名或file: URL>`。脚本使用本机已有 Playwright 与 Chrome（可用 `HAKISUB_BROWSER_CHANNEL` 指定其他已安装频道），不新增依赖；临时回环静态服务和合成接口覆盖三种宽度、两步注册/失败重试/导出、登录/刷新/找回、房间管理/Key/ASR、存档、资料/安全、退出以及抽屉焦点与滚动恢复。截图在 ignored `artifacts/account-workspace/`。真实权限由 `npm run test:accounts` 和 `npm run test:room-management` 中隔离数据库与房间服务联调验证；合成浏览器验收不代表生产 Cookie、真机或真实豆包已验收。

独立于实时语音网关的 Fastify + SQLite 服务，页面使用现有 Vue/Vite 工具链。2026-10-25已部署 `interaction-20261025T1510Z`：最低8位密码、保密输入显示开关、六位公开UID及账号/UID登录、明文密保答案和当次内容下载。数据库v2保留内部UUID和全部关联，历史答案哈希不可还原。设计与风险见 [审查方案](../docs/ACCOUNT-SYSTEM-PLAN.md)，迁移、备份与验收见 [账号部署手册](../docs/ACCOUNT-DEPLOYMENT.md)。

**Windows 本地 PowerShell，项目根 `F:\hakiSub`：**

```powershell
npm ci
npm ci --prefix accounts
npm run test:accounts
npm run build:accounts
npm run preview:accounts
```

预览地址为 `http://127.0.0.1:8790/account/` 和 `http://127.0.0.1:5179/`。预览使用 `artifacts/account-preview/accounts.sqlite` 的专用测试库和无 Key 的独立内存房间网关；不访问生产或本机 8787，不包含真实语音能力。Ctrl+C 停止。不要填真实密码、密保或 Key。预览每次生成新的随机签名密钥，因此重启后需要刷新 CSRF Cookie，预览限流索引不作为生产重启验收依据；自动测试使用固定的合成密钥验证持久性。

普通本地开发可先构建页面，再运行 `npm --prefix accounts run dev`；默认账号库为根 `secrets/accounts.sqlite`。要让开发重启后的 CSRF 与限流索引稳定，在根 `.env` 或服务端环境配置随机 `XDSTAR_ACCOUNT_SECRET`，不要用 `VITE_*`。真实密码无需发给开发者。

后端可直接传 `createAccountServer(configuration, { now })` 做时间边界和真实 SQLite/Argon2id 的隔离测试。UID 只来自服务端会话；身份接口不返回登录账号，存档不接受 Key、ownerToken 或成员凭据。恢复方式是传统三问，无法消除熟人猜中答案和自定义问题枚举风险。

账号服务无需也不持有豆包凭据。现有 HakiSub 语音授权、房主和匿名凭据属于独立边界。
