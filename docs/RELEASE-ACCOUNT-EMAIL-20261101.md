# 2026-11-01 邮箱账号改造：GitHub 已推送，服务器候选就绪

功能提交：`69424ba6a2a8508fcc4c32ec89484f198c53633e`，已推送 GitHub main。

用户授权推送并同步服务器，随后明确选择“配置好 SMTP 后再切换”。只读检查确认服务器尚未配置 SMTP，因此本次**没有激活新版，没有修改正式账号数据库、环境配置或镜像选择器，没有重启任何生产容器**。

候选发布目录：`/srv/projects/hakisub/images/xdstar-accounts-20261101T070153Z/`。白名单运行归档 `runtime.tar.gz` 的 SHA-256：`0756d2c73ecd6d39a163c69bf3a95da552ce0c4beb938c29de3c2a29fca8868e`。归档含账号运行源码、构建、锁文件、测试和文档，不含环境变量、凭据、数据库或 Windows node_modules。

候选镜像：`xdstar-accounts:xdstar-accounts-20261101T070153Z`，镜像 ID `sha256:98e95cd4dd4f66a52fe12bb5d0d00c0c99adb385da79e660560e63016e9ff7f6`。复用原账号 Linux Node 22.23.3 镜像及原生依赖，唯一新增 Nodemailer 10.3.1（MIT-0，无传递依赖），从锁文件指定官方 npm URL 下载并校验 SHA-512 integrity 后加入；镜像构建禁用网络。未使用 Windows 原生模块。

备份：发布目录 `backup/production-staging.tar.enc`；沿用 AES-256-CBC/PBKDF2，加密备份权限0600、目录0700，口令只在服务器 `secrets/xdstar-accounts-20261101T070153Z-backup.key`，未下载或输出。备份使用 SQLite 一致性快照，包含房间元数据、数据库、匹配配置与镜像标识；已实际解密并逐字节核验。加密归档 SHA-256：`ef732988407cbe604d9ec059256ed75e8c2d5421a21dd04fb9019e927a926ac0`。这只是候选准备时快照，未来切换前还必须另存最新快照，不能直接恢复该旧快照覆盖后续写入。

候选通过：Linux隔离容器 `accounts.test.mjs` 五项完整邮件/注册/恢复/兼容测试，以及 `security.test.mjs` 两项来源/限流/哈希测试。无网络、无生产卷、无真实SMTP凭据。另将真实生产数据库一致性备份副本放入内存临时目录，以实际 node UID1000 演练 v2→v3；11 个旧账号，users、sessions、security_questions、hakisub_room_presets、user_projects、registration_events 逐项完全相同，完整性与外键检查通过。未输出用户字段或房间码，临时明文副本清理。首次候选测试因非秘密测试目录权限0700不可读而停止；只修正受限发布目录内测试文件的读取权限后全部通过，未修改生产服务安全策略。

服务器 `staged.json` 保存候选验证收据；`stage-email-release.py`、`verify-email-stage.py` 保存实际准备与核验逻辑。三个生产容器 ID 均保持，生产账号仍为 schema v2 和原 `room-ui-20261031T1745Z` 镜像，网关仍为 `mobile-recovery-20261101T0550Z`，Caddy不变。

后续由用户在 `/srv/projects/hakisub/secrets/accounts.env` 配置 `XDSTAR_SMTP_HOST`、`XDSTAR_SMTP_PORT`、`XDSTAR_SMTP_SECURE`、`XDSTAR_SMTP_USER`、`XDSTAR_SMTP_PASSWORD`、`XDSTAR_SMTP_FROM`，不将密码发到聊天或Git。配置好后验证SMTP认证/TLS与收件可达性，重新制作切换前备份，在维护窗口仅替换账号容器。迁移、旧会话和公网Cookie/CSRF验收通过后归档实际上线结果；当前不宣称邮件功能已上线或真实SMTP验收成功。
