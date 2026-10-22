# 账号系统本地验收与生产前操作

> 2026-10-23 本地规则更新：所有真实联网房间Key仅存在当前HakiSub后端进程内存中，启动或重启后统一未配置。旧加密Key不解密、不加载。元数据读取v1/v2/v3、写v3。此规则取代此前Key加密持久化、blocked及重启失败锁说明；未部署生产。

> 2026-10-22 更新：本地现已增加 UID 房主绑定、房间 Key 与 ASR 管理；后面的2026-10-21说明保留历史阶段。新版的部署准备及回滚要求以下节为准。

## 房主绑定与房间管理本地阶段（2026-10-22）

本轮只在 Windows 工作区开发，未访问或修改 Star-Hub、生产 Caddy、服务、房间库、Key 或 Docker 卷。最初 Git 工作区已存在 ASR 八路并发及部署文档改动，全部保留。main 基线 `f42d35ef7bb5f0aea083090a58bae2bf8ff2618c` 与 GitHub main 已核对一致；未提交/推送本轮代码。

新增配置（均为服务端，不得放 VITE_*）：

| 服务 | 配置 | 用途 |
| --- | --- | --- |
| 两端 | HAKISUB_ROOM_MANAGEMENT_SECRET | 同一独立随机密钥，至少32字节随机值编码为不少于43字符；不能复用账号签名/房间加密密钥 |
| 账号 | XDSTAR_HAKISUB_GATEWAY_URL | 网关的服务端 Origin，例如回环 http://127.0.0.1:8787；同Docker私有网络为 http://hakisub:8787 |
| 房间 | HAKISUB_ROOM_STORE_PATH | 继续使用原房间卷保存元数据；不再读取或生成HAKISUB_ROOM_ENCRYPTION_KEY，已有历史配置无需删除 |

两端均从进程环境或根.env读取；Docker分别注入账号/房间的私有 env 文件。缺少服务管理配置时，仅账号管理返回503；游客创建加入、匿名房主管理继续正常。示例为空占位符，预览脚本另产生临时服务签名密钥；预览房间库在 `artifacts/account-preview/rooms.json`，只用于合成凭据，不得放真实 Key。账号独立打包已经包含 `accounts/server/roomManagementClient.mjs`，网关镜像从 server/ 包含新管理端点，无新第三方依赖。

### 本地验收命令与证据

```powershell
npm test
npm run test:accounts
npm run test:room-management
npm run build
npm run build:accounts
npm run preview:accounts
```

专项 `accounts/tests/room-management.test.mjs` 使用真实 Argon2id/SQLite、HTTP 和 WebSocket，假豆包上游覆盖：v1含Key/无Key迁移；114514/985529；匿名创建加入及管理；会话+凭据绑定、跨设备登录；跨UID越权、伪造UID/Origin/CSRF；在线及重连后的旧ownerToken撤权；房主离线管理；远程暂停清理上游与并发名额、拒绝新建和手动恢复；换Key清理、删除无回退；双服务重启；签名篡改/超时/重放/重启失效；同房并发409；持久化失败运行期关闭；退出/账号或网关不可用拒绝管理。`tests/owned-rooms-view.test.mjs` 渲染实际模板，验证Key输入清理、已删除/暂停状态、失败不显示成功、账号切换后迟到响应隔离。原并发测试改为显式设置合成房间Key，保留已有八路并发改动。

浏览器在隔离8790账号、5179页面、8791空付费能力网关中验证：已登录合成账号创建并自动绑定，个人中心显示真实房间；设置合成Key后输入清空；远程暂停/恢复，房内状态同步；删除合成Key显示“房主已删除”且测试入口禁用；房内绑定房间经账号服务管理。没有开麦，也没有调用真实云端。截图在 `artifacts/room-management-review/account-desktop.png`。浏览器工具的 viewport 覆盖未改变实际1265px视口，不能称已完成手机真机或窄屏验收；现有760px响应式单列及按钮换行仍保留。

### 旧数据迁移、保存失败和最小上线方案（后续单独授权）

1. 先在隔离Linux容器用受控备份副本验证v1/v2→v3：114514/985529、UID/房主/别名/开关保持，所有旧Key均不可用，重启后仍未配置。首次成功元数据保存剥离旧Key字段；加载及Key设置/删除不改磁盘。通知所有房主升级/重启后重填Key，不用任何默认Key自动补齐。
2. 在维护窗口备份原房间文件与匹配主密钥、账号SQLite一致性备份、镜像标识、env和代理配置。备份须加密且独立留存。只把新包放独立目录，先核验SHA-256及两个镜像；不覆盖现有数据，不执行down -v。
3. 在同一私有容器网络配置独立服务密钥与服务URL；账号端口/房间端口继续仅回环映射。Caddy仅代理已有主站项目API与HakiSub公开API，明确阻断 `/internal/*`，不增加公网管理路由。内网如跨主机须使用受信TLS或现有受控隧道；HMAC只提供认证/完整性，不加密传输正文中的Key。
4. 原卷挂载给新版房间服务，账号卷保持独立；最小切换涉及房间后端/前端与账号后端/前端，不能仅升级个人中心。Caddy已有 `/api/projects/hakisub/*` 通配路由则不需新增公开路由；如实际配置不同，先只读核实，再单独确认变更。通过真实HTTPS跨子域 Cookie/CORS/CSRF 和账号切换、双设备、ASR关闭费用边界后再解除维护。
5. Key设置/删除不依赖磁盘，立即更新本进程内存并停止本房旧会话。ASR开关仍需持久化；写失败返回失败、保留原持久开关，同时清掉本房Key。重启后所有Key必为空，因此没有额外失败锁恢复问题。修复存储后重试开关，识别仍需合法房主重新填写Key。

### 最小回滚

UI回退优先保留本轮兼容v3/UID/内存Key的房间后端及账号代理。旧网关拒绝v3；不得强改version或把旧v1/v2备份交给会解密恢复Key的旧运行时。不要恢复默认Key回退、旧ownerToken路径或覆盖新身份数据。完整后端回退须维持付费ASR及管理入口关闭，单独确认数据/权限方案。

若必须整体回退到本功能之前的镜像，应保持维护状态关闭房间管理与付费ASR外部入口，保留新版房间文件和账号卷；先在新隔离卷恢复备份检验差异，另行确认数据回退与权限撤销方案，不能盲目重新开放旧运行时。更安全的最小路径是回退前端、保留新版授权后端并向前修复。绑定时已随机替换ownerHash，原匿名凭据不能被新版恢复。

### 未完成的真实验收

正式主/子域TLS及Cookie SameSite/host-only/HttpOnly、真实第二设备和手机、Linux原生依赖与容器资源/网络、持久卷断电/备份恢复、真实麦克风/豆包Key权限与云端费用、多人语音稳定性均需另验。专项自动化只使用假上游，不消耗真实API额度，也不等于完整费用熔断。

日期：2026-10-21（Asia/Shanghai）。**当前是本地实现，生产仍为原 HakiSub/Caddy。** 本轮服务器仅有只读检查，无数据库部署、配置覆盖、密钥变更或重启。

## 当前已有实现

注册及三问、登录/退出、会话、个人中心、昵称/密码/密保修改、找回、持久限流、管理员预警/解限、个人存档 CRUD。账号模块位于 `accounts/`；完整决策见 [架构方案](ACCOUNT-SYSTEM-PLAN.md) 与 [开源组件说明](../accounts/THIRD-PARTY.md)。

主站专属 Cookie，不设置父域 Domain；HakiSub 通过凭据 CORS 调用主站的受限 identity/presets API。项目端不获得 username、密保或全站 token。账号/房主/成员与付费语音许可分离；本轮没有新增房主绑定接口、暂停/强制销毁或费用控制。

## Windows 本地 PowerShell

在 `F:\hakiSub`：

```powershell
npm ci
npm ci --prefix accounts
npm test
npm run test:accounts
npm run build
npm run build:accounts
npm run preview:accounts
```

最后一条启动隔离预览：账号 `http://127.0.0.1:8790/account/`，HakiSub `http://127.0.0.1:5179/`，空 Key 测试网关 8791 不发布公网。退出使用 Ctrl+C。测试库在忽略目录 `artifacts/account-preview/`，不能作为生产库；不填写真实凭据。

构建后可运行 `npm run package:accounts` 生成白名单无密钥账号包及 SHA-256 清单到 `artifacts/`。包包含后端、独立锁文件、预构建账号页面、Dockerfile、候选配置和手册，不含 node_modules、SQLite、Cookie、根 .env 或房间资料；生产必须重新在 Linux 安装运行依赖。HakiSub 自身的构建与发布仍走原流程，不能仅更新账号包就宣称两端已上线。

已用真实浏览器在这两个不同 Origin 完成：合成账号登录 → HakiSub 自动昵称 → 保存存档 → 个人中心读取/改名 → 链接加载回 HakiSub；加载只应用偏好，不入房、不采集。另验证以昵称入房、Key 配置仍为空、退出后游客入口与已有匿名创建者凭据继续存在。没有触碰麦克风/付费 API。截图在 `artifacts/account-review/`，未作为源码提交。

自动测试覆盖实际 SQLite 与 Argon2id，包含恢复并发一次消费、旧会话撤销、跨账号越权、未知/密钥字段拒绝、会话轮换和闲置过期、数据库重开、在线备份的 integrity_check、同名/同IP并发及滚动边界、代理头伪造、IPv6 /64 与哈希排队上限。客户端通信另有模拟验证。现有 HakiSub 全套模拟回归仍需与每次发布同时执行。

## 远程 Star-Hub Linux：部署前必须完成

以下是后续执行清单，本轮未执行生产变更。

1. 选定维护窗口和异机备份位置。保留当前 `hakisub-20261020T173624Z`、Caddy 配置和原房间卷/主密钥；账号上线不触碰原 Key。
2. 在隔离目录准备账号发布包及 Linux 镜像。`accounts/Dockerfile` 以目标 Node/Linux 安装原生依赖；不得复制 Windows node_modules。校验 Argon2id、SQLite、UID1000、只读根目录、卷权限及 384MiB/0.5CPU 下的峰值和延迟；这些 Linux 验收目前尚未完成。
3. 创建独立账号卷，权限允许容器 node 用户写入。数据库、WAL/SHM 只在卷内，根目录只读。不要把新账号库放进已有 rooms.json 卷。
4. 在服务器本地生成随机 `XDSTAR_ACCOUNT_SECRET`，写入仅服务器可读的 `secrets/accounts.env` 并以 Compose 注入服务端环境。示例 `deploy/accounts.env.example` 不含真实值；根 `.env` 只新增非秘密发布标识 `XDSTAR_ACCOUNT_RELEASE`。不在聊天、命令输出、镜像或 VITE_* 中展示密钥。
5. `deploy/compose.accounts.yaml` 是可选覆盖文件，profile 为 accounts，不会被现有三文件部署自动启用。拟新增回环 18788，不开放公网端口。新容器尚未在服务器创建；具名卷重建容器时保留。
6. 隔离实测 Caddy 到账号容器的 socket peer，填入 `XDSTAR_ACCOUNT_TRUSTED_PROXIES` 的精确地址。候选反代覆盖 `X-XDstar-Client-IP`；在端到端请求中证明伪造来源头无效、不同公网 IP 不误算成同一代理。当前旧网关 bridge 是 172.18.0.1，不能直接假定新容器相同。
7. 对 `deploy/caddy/Caddyfile.accounts.candidate` 单独执行 Caddy validate；它未覆盖正在使用的 Caddyfile。账号路径用后端 CSP，主站其余静态路径保留原禁止表单策略；不得同时下发两个冲突 CSP。
8. 经用户确认具体差异后，备份并替换 Caddy 配置、启用账号容器。Caddy admin off，重建会中断现有 WSS，必须事先说明。更新 HakiSub 静态资源也需要独立镜像切换，不能未经确认重启。
9. 真正 HTTPS 主/子域浏览器验收 Cookie Secure/HttpOnly/无 Domain、CORS/CSRF、退出/过期及另一子域越权。**本地不同端口通过，不等于真实跨子域已经通过。** 同时回归原房间114514、旧别名、WSS、模型和游客流程；真实 ASR 权限及费用保护另验。

Compose 语法、Caddy 候选配置、Linux 原生库及实际 TLS/Cookie 尚未完成生产前验收，不能现在宣称可直接上线。不得运行带删除卷含义的 `down -v`。正常回退先恢复路由与旧 HakiSub 镜像，保留账号卷和已注册数据；数据库迁移回退使用匹配版本及预先验证的备份，不把新库覆写成空库。

## Docker 容器内部：管理员与备份

以下是已实现 CLI 的容器内部命令，不是在 Windows 执行的 docker 命令。需要操作者先进入正确的**账号容器**，并保证运行环境已经注入配置。

```sh
node server/admin.mjs warnings
node server/admin.mjs clear-ip '<需解除限制的客户端IP>'
node server/admin.mjs backup '/app/data/backups/accounts-YYYYMMDD-HHMM.sqlite'
```

`clear-ip` 解除该网络注册/来源层的历史额度，保留成功注册记录及全站日预警统计并追加审计；不关闭全站限流，不重置指定账号的恢复保护。IPv6 按 /64 聚合，解除范围同限流范围。

`backup` 使用 SQLite backup API，一致性包含 WAL；拒绝覆盖现有文件，文件0600。CLI 产物**不是加密文件**，下载或异机存储前应使用已有的加密存储/用户公钥，不能上传到公开网盘。生产方案建议每日备份，保留7日与4周，异机副本在用户选定位置；本轮没有安装定时任务或上传任何备份。仅同一磁盘留副本不能防服务器丢失。

自动测试已将备份在另一个只读 SQLite 连接打开并运行 integrity_check；正式恢复还需在隔离容器验证业务数据与版本。恢复时关闭写入、另存旧库、核对校验和与权限；开始服务前撤销恢复库内所有 sessions/recovery_challenges，避免回退恢复已失效的凭据。执行替换生产数据库或删除 WAL/SHM 前另行确认，不能直接复制单个在线 sqlite 主文件。

## 仍需明确的边界

三问是弱恢复方式：知道答案者可接管账号，自定义问题还会泄露存在性线索；虚拟挑战与限流只能提高批量攻击成本。开放注册也不能防所有代理池机器人。现有匿名房间号/长期 ownerToken 和100间上限另有风险，账号上线不会自动修复这些问题，更不能赋予无限付费识别额度。
