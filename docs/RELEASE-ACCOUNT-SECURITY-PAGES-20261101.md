# 2026-11-01 账号安全设置子页面发布

功能提交 `3615b0f` 已推送 GitHub main，发布 `xdstar-accounts-20261101T080355Z` 于北京时间16:05:21上线。

安全设置首页仅显示修改密码和绑定/更换邮箱入口，分别进入独立二级页面，提供返回安全设置按钮并保持导航父项高亮。返回、切页和退出清理密码、显示状态及邮箱草稿。账号中心HakiSub房间存档页面、桌面/手机导航和前端存档CRUD/读取逻辑已移除；后台数据/API及HakiSub房内原存档功能保留。

只复制账号前端dist到现有账号镜像。部署前逐项校验全部后端/shared文件及依赖与生产一致，没有更新后端、数据库schema、SMTP或密钥，没有修改房间/ASR/字幕/实时通信代码。只重建accounts，账号会话及数据卷保留，网关和Caddy容器ID未变。

测试通过：`npm test`、`npm run build`、`npm run test:accounts`、`npm run build:accounts`、`npm run test:accounts:browser`（375/768/1440px，原有登录/注册/恢复/邮件链接隔离/房间管理回归，新增安全首页无表单、二级页面隔离、返回清理、绑定/更换标题、无存档入口及API调用）。已目视检查375px安全首页和密码页截图。没有发送真实邮件或修改任何真实账号密码进行本轮UI验收。

服务器发布目录：`/srv/projects/hakisub/images/xdstar-accounts-20261101T080355Z/`。运行归档SHA-256 `1793df37207326945000c96e7ddbe596359b66064506e12726febb889c5f3c36`。候选镜像 `xdstar-accounts:xdstar-accounts-20261101T080355Z`，镜像ID `sha256:987656d5f7ca3cd77fdef4ba92b157029d59e2126f070ae90e9d01c2ba8f1bae`，无网络构建。

切换前停写账号并保存一致性加密备份 `backup/production-preactivation.tar.enc`，实际解密逐字节核验通过，SHA-256 `82d2c0f80503571f26f3b4d04d5865bf369b5a59f059aacc15a72213956d754d`。切换后与本次最新快照比较，用户/密码哈希/UID/auth_version、密保、私人存档/项目关联不变，旧会话摘要/用户/版本/期限保留。最终验证最初引用了早期邮箱迁移备份，因中间存在账号操作而拒绝通过；改用本次已验证的最新切换前快照后通过，未通过修改生产记录消除差异。

16:06:30最终加密快照 `backup/production-final-20261101T080630Z.tar.enc` 实际解密核验通过，SHA-256 `f078b092e9f86d8768af224c76539d812cab1e77ea25cb7bca286b691e384564`。线上18项运行文件与3项HTTPS资源哈希一致、账号健康、原房间所有权保留。所有备份与口令只在服务器受限目录，未下载、输出或提交Git；这些为同机备份，不能覆盖整机丢失风险。

代码回退：`sudo -n python3 /srv/projects/hakisub/images/xdstar-accounts-20261101T080355Z/rollback-code.py`。只切回兼容schema v3的上一邮箱版镜像并重建accounts，不恢复或降级数据库，不影响新账号/邮箱修改记录。脚本已准备，未执行生产回退。实际发布/最终收据为 `activated.json`、`final-verified.json`；部署助手与核验脚本保留在该发布目录。

截图暴露密钥的实际轮换仍未执行，遵循独立[轮换方案](ACCOUNT-KEY-ROTATION-PLAN.md)。本轮没有修改密钥或声明泄露风险已经消除。
