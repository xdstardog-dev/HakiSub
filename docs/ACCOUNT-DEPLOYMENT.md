# 账号系统本地验收与生产前操作

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
