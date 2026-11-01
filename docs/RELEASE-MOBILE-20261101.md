# 2026-11-01 移动端恢复修复发布

发布编号 mobile-recovery-20261101T0550Z。用户明确授权上传 GitHub 与服务器。

本次仅更新 HakiSub 网关和前端，不替换账号应用、数据库、持久房间资料、业务凭据或代理配置。包含临时断线与刷新恢复、标签页短期重连凭据（权限版本校验、30分钟闲置期限及心跳续期）、八人满房旧连接替换、键盘底栏分离、打字入场反馈与独立气泡背景缩放、设置菜单名称。

本地 npm test 35 组、npm run build、git diff --check 通过。浏览器完成公开房刷新与首页恢复、游客 PIN 后刷新免验证、强制断线后保留草稿与闭麦、主动退出刷新不恢复。真机键盘、后台锁屏、真实音频及豆包 API 待验。

发布沿用既有 Compose 和 Linux 依赖。先生成并实际解密核验同机加密备份，候选镜像在无生产卷、无网络和无真实凭据环境测试，再停止两业务服务生成一致性快照，仅切换 HakiSub 镜像选择器并启动。账号镜像、数据卷与 Caddy 保留。网关重启清空内存 Key，房主需重填。旧镜像也是 v5，可在代码/健康异常时使用旧镜像向前兼容回退，不回滚或覆盖数据；原有不支持 v5 的更早镜像禁止读取当前资料。

发布前状态：room-ui-20261031T1745Z，两业务健康，27 房、11 账号、房间 v5/账号 schema v2。发布实际结果、备份摘要与线上校验将在完成后追加。生产数据库、备份与凭据不下载到本地或 Git。

## 实际发布结果

功能提交 148cc129c479f7e4783ab51e53af005774fd6523 已推送 GitHub main；发布标签 release/20261101-mobile-recovery 指向功能提交。北京时间 2026-11-01 13:54:02 切换成功，13:54:50 完成最终核验与备份。HakiSub 镜像为 hakisub-test:mobile-recovery-20261101T0550Z，账号镜像仍为 xdstar-accounts:room-ui-20261031T1745Z，账号容器 ID 与 Caddy 容器 ID 保留。

服务器归档 /srv/projects/hakisub/images/mobile-recovery-20261101T0550Z/ 包含 80 项白名单运行包及源码归档，依赖未变。隔离 Linux 候选通过入房、重连/8人满房/改码失效、原生账号/CSRF、旧密码迁移与 Key 不落盘测试，并在真实房间备份副本上通过数据兼容演练。网关生产 60 项文件哈希匹配；公网 HTTPS 与 34 项未预压缩静态文件哈希匹配，房间路径和健康端点正常，环境、源码及内部路径仍 404。

原 27 间房、11 个账号保留；房间 v5、账号 schema v2，SQLite 完整性/外键检查通过。既有用户/密保/私人存档/项目关联逐项保留，业务环境、卷、回环端口和 Caddy 不变。未新建生产测试房或账号，未调用麦克风或真实豆包 API。

候选首次预检发现测试文件打包路径不符，已拒绝继续并保留失败候选目录；修正清单路径后重做包并通过。首次切换时账号健康标记仍为 starting，脚本自动回退到兼容 v5 的原镜像（没有恢复或覆盖数据）；修正为等待两个业务容器都 healthy 后，另存 production-preactivation-retry.tar.enc 再切换成功。两次切换前备份均保留，源码不因发布脚本修正而变动。额外定位生产验收房间码/名称的检查被自动审批拒绝，未执行；改用公网只读核验和隔离测试，不读取输出私有房间字段。

备份仅在服务器，目录 0700/文件 0600，AES-256-CBC/PBKDF2，实际解密核验通过。SHA-256：

- runtime.tar.gz：6038ca69ffca2346d83e35a6f43b7e76675b6610f12afc55f52c71fdd4bae315
- source-commit.zip：32d75a7682232dac61ef8bb65e26cb099a6bc559c94662ebbbfe267f571c91ac
- production-before.tar.enc：d487ce686ec217b0b62baa3e8b2b109db6192b687997fd5fec7d730b9b95dbea
- production-preactivation-retry.tar.enc：2dd3a3ed7a7242123469d391e6d3d5b2e0205ff2629cd8845bc6fd44d6365fe6
- production-final.tar.enc：8f6c208362926c9fc1360800de01a45ceefca07b39689c39eeaca43f3663824b

只读核验命令：sudo -n python3 /srv/projects/hakisub/images/mobile-recovery-20261101T0550Z/publish-mobile-recovery.py verify。回退仅允许该脚本记录的已验证 v5 基线镜像，不覆盖任何数据。服务器备份口令只保存在 secrets/mobile-recovery-20261101T0550Z-backup.key，未下载。公网验收收据在本地 ignored artifacts/mobile-recovery-20261101T0550Z/verification/public.json 及服务器 verification/。

真机 Android/iOS 系统输入法、地址栏/旋转、后台挂起和锁屏、关闭整个浏览器后恢复、真实麦克风/付费 API 和扬声器听感仍未实测；不得以隔离模型或静态哈希核验代替。
