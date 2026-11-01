# 2026-11-01 邮箱账号改造：GitHub 已推送，服务器候选就绪

功能提交：`69424ba6a2a8508fcc4c32ec89484f198c53633e`，已推送 GitHub main。

用户授权推送并同步服务器，随后明确选择“配置好 SMTP 后再切换”。只读检查确认服务器尚未配置 SMTP，因此本次**没有激活新版，没有修改正式账号数据库、环境配置或镜像选择器，没有重启任何生产容器**。

候选发布目录：`/srv/projects/hakisub/images/xdstar-accounts-20261101T070153Z/`。白名单运行归档 `runtime.tar.gz` 的 SHA-256：`0756d2c73ecd6d39a163c69bf3a95da552ce0c4beb938c29de3c2a29fca8868e`。归档含账号运行源码、构建、锁文件、测试和文档，不含环境变量、凭据、数据库或 Windows node_modules。

候选镜像：`xdstar-accounts:xdstar-accounts-20261101T070153Z`，镜像 ID `sha256:98e95cd4dd4f66a52fe12bb5d0d00c0c99adb385da79e660560e63016e9ff7f6`。复用原账号 Linux Node 22.23.3 镜像及原生依赖，唯一新增 Nodemailer 10.3.1（MIT-0，无传递依赖），从锁文件指定官方 npm URL 下载并校验 SHA-512 integrity 后加入；镜像构建禁用网络。未使用 Windows 原生模块。

备份：发布目录 `backup/production-staging.tar.enc`；沿用 AES-256-CBC/PBKDF2，加密备份权限0600、目录0700，口令只在服务器 `secrets/xdstar-accounts-20261101T070153Z-backup.key`，未下载或输出。备份使用 SQLite 一致性快照，包含房间元数据、数据库、匹配配置与镜像标识；已实际解密并逐字节核验。加密归档 SHA-256：`ef732988407cbe604d9ec059256ed75e8c2d5421a21dd04fb9019e927a926ac0`。这只是候选准备时快照，未来切换前还必须另存最新快照，不能直接恢复该旧快照覆盖后续写入。

候选通过：Linux隔离容器 `accounts.test.mjs` 五项完整邮件/注册/恢复/兼容测试，以及 `security.test.mjs` 两项来源/限流/哈希测试。无网络、无生产卷、无真实SMTP凭据。另将真实生产数据库一致性备份副本放入内存临时目录，以实际 node UID1000 演练 v2→v3；11 个旧账号，users、sessions、security_questions、hakisub_room_presets、user_projects、registration_events 逐项完全相同，完整性与外键检查通过。未输出用户字段或房间码，临时明文副本清理。首次候选测试因非秘密测试目录权限0700不可读而停止；只修正受限发布目录内测试文件的读取权限后全部通过，未修改生产服务安全策略。

服务器 `staged.json` 保存候选验证收据；`stage-email-release.py`、`verify-email-stage.py` 保存实际准备与核验逻辑。三个生产容器 ID 均保持，生产账号仍为 schema v2 和原 `room-ui-20261031T1745Z` 镜像，网关仍为 `mobile-recovery-20261101T0550Z`，Caddy不变。

后续由用户在 `/srv/projects/hakisub/secrets/accounts.env` 配置 `XDSTAR_SMTP_HOST`、`XDSTAR_SMTP_PORT`、`XDSTAR_SMTP_SECURE`、`XDSTAR_SMTP_USER`、`XDSTAR_SMTP_PASSWORD`、`XDSTAR_SMTP_FROM`，不将密码发到聊天或Git。配置好后验证SMTP认证/TLS与收件可达性，重新制作切换前备份，在维护窗口仅替换账号容器。迁移、旧会话和公网Cookie/CSRF验收通过后归档实际上线结果；当前不宣称邮件功能已上线或真实SMTP验收成功。

## 正式上线与邮件界面修正（2026-11-01）

用户配置QQ SMTP后继续授权上线。隔离候选使用服务器私有环境验证 smtp.qq.com 连接/TLS/认证成功，以 xd_star@qq.com 为发件地址向同一用户授权邮箱发送真实测试邮件，SMTP接受且用户确认收到；未输出授权码、认证对话或密钥。

北京时间15:30:23首次上线，正式账号库v2→v3。仅停写、备份并重建accounts，原网关和Caddy容器ID未变。最新切换前一致性备份 `backup/production-preactivation-20261101T072950Z.tar.enc` 实际解密核验通过，SHA-256 `612049aac2bf2b9b96b4235d4730772f01cfffec1a0ceab163fd82625932f14d`。11旧用户记录/密码哈希/UID/认证版本/会话及存档关联不变。未更换账号或房间管理密钥。

用户明确同意以QQ邮箱创建验收账号 `email_check_20261101`。通过正式HTTPS注册接口发送真实邮件，用户点击并确认验证成功；服务端确认账号激活，用户名、UID、邮箱三种登录均通过。随后正式HTTPS找回接口发送真实重置邮件，用户确认收到并打开；截至本节记录，尚未提交新密码，真实重置后新密码登录及旧会话失效的最终验收仍待用户完成。该验收账号是独立新增账号，不是原账号xdstar；随机测试密码只保存在服务器受限测试文件，未发送浏览器或日志。

用户指出邮件页面仍显示原先已登录的xdstar账号，且密码字段看到长串内容。复查初始备份逐项比较11旧账号，密码哈希、auth_version、UID变更数均为0；长串显示来源无法凭描述判定，可能是浏览器自动填充，不能据此声称密码被改。修正邮件页面隔离：不加载/显示现有浏览器账号信息，仅持有有效邮件令牌时通过CSRF保护接口读取对应用户名，明确显示目标；链接详情不消费令牌，身份/用途/期限/认证版本与限流仍校验。邮件正文也加入操作账号。没有按当前Cookie账号修改邮件令牌目标。

修正提交e3d83b1已推GitHub；北京时间15:42:09上线 `xdstar-accounts-20261101T074014Z`，镜像ID `sha256:0143d3f24955b191714b9adcb27f85bcabd9b25720f640aa9744b2aa4a19a395`。运行归档SHA-256 `0e99cda1bed96fd7fa24c8d164eed845410632144e778411c8b408db66a2379c`。独立Linux候选8项模拟/安全/密钥轮换就绪测试通过；无网络、无真实SMTP凭据。修正切换前v3备份SHA-256 `da56394a398862e6c9bf63cfdeb3d69a4a7abc68f0da152dbe0468969dadfced`。

15:44:18最终快照 `backup/production-final-20261101T074418Z.tar.enc` 已加密并实际解密核验，SHA-256 `4bc3b4bb108bd9d27288c4c1d4a8c8c9980ef5b60544dedb6670bc9f9e75a14b`。再次确认原11账号密码/UID/认证版本及旧存档/密保保留，27原房所有权一致，schema v3；线上18项账号运行文件及3项HTTPS构建资源哈希匹配，私有路径仍404，账号/网关健康。备份均只在服务器，权限0600、发布目录0700；口令继续在最初候选的服务器秘密目录，未下载。最终收据见最新发布目录 final-verified.json。

可靠代码回退：`sudo -n python3 /srv/projects/hakisub/images/xdstar-accounts-20261101T074014Z/rollback-code.py` 只切回已验证的首个邮箱版v3镜像，重建accounts，保留现有数据库和新用户写入。该回退脚本已准备，未实际执行生产回退。首次v2→v3迁移的恢复脚本仅在账号数据完全未发生新写入时允许恢复v2快照；现已新增验收用户，不能将v2快照直接覆盖当前库。优先代码回退或向前修复，完整数据灾难恢复须停写并保留当前库。

截图暴露密钥仍视为已泄露，尚未轮换。秘密文件root:0600；服务器内存扫描当前tracked源码快照未发现实际密钥/SMTP授权码明文，不涵盖Git历史或截图。用途检查和兼容轮换方案见[密钥轮换方案](ACCOUNT-KEY-ROTATION-PLAN.md)：会话令牌与密码独立于账号密钥，隔离测试证实换密钥后原会话有效、旧CSRF拒绝、刷新CSRF恢复；限流HMAC需分用途迁移，房间管理两端需短窗口协调验签。当前网关无热加载，实际重启会断WSS并清内存ASR Key，不能暗中直接替换密钥。
