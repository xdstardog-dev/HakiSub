# 2026-11-01 游客随机昵称发布

按用户明确授权同步 GitHub 与部署。功能提交 `fb96f0aba5aaa92510c2e3737d47f2e2bbe422f2` 已推送 main。版本 `guest-names-20261101T1115Z` 于北京时间 19:17:31 切换并完成服务器核验，19:17:45 公网资源核验通过，19:17:49 真实 Chrome 专项通过。

游客从指定44项名字池随机取名，标签页 sessionStorage 保留；刷新、重连、换房沿用，登录使用账号昵称。随机名可重复，成员仍由独立 memberId 区分。旧留房记录中的“游客”恢复时迁移随机名，其他既有恢复名称保留。

沿用已验证的前端发布助手，仅复制 dist 到当前镜像的衍生镜像 `hakisub-test:guest-names-20261101T1115Z`。基线镜像 ID `sha256:55eb3c35e3b39ed7e0a4cf2b3d6f08d439d5e48c744ffdf08dae82499b66eb91`。server、accounts/shared、node_modules、运行 package 文件聚合指纹与基线相同；离线候选页面/六位入口/私有路径检查通过。仅重建 hakisub，账号和 Caddy 原容器、环境、端口、卷与配置保持，切换前后房间文件逐字节一致。网关重启清空内存 ASR Key，房主需重新填写。

停止网关后，在服务器制作房间资料、部署配置与镜像选择器的一致加密备份，AES-256-CBC/PBKDF2，实际解密并逐字节核对。目录0700、口令与文件0600；未下载或输出凭据、生产资料或备份。账号服务没有停写，本轮备份不声称包括账号数据库一致快照，原账号备份保留。

本地 npm test 全套通过；部署前重新 npm run build 通过，git diff --check 通过。服务器38项前端资源哈希、公网34项非预压缩资源哈希一致，HTTPS首页、六位入口与健康接口200，环境/服务源码/内部路径404。真实Chrome在390px视口分别核对本地和已上线HTTPS前端：固定随机区间的两位独立游客显示“高松灯”和“奶龙3号”，全房列表广播一致，刷新及退出重入保留昵称，无页面脚本错误。浏览器验收将所有房间WebSocket/API转至隔离本地网关，账号身份使用合成游客响应，未创建生产房间或账号。物理手机、真实麦克风及豆包API本次未验收。

服务器归档 `/srv/projects/hakisub/images/guest-names-20261101T1115Z/` 含源码、资源包、清单、发布助手、核验收据及加密备份；本地非Git证据位于 `artifacts/guest-names-20261101T1115Z/verification/`。

归档 SHA-256：

- runtime.tar.gz：`06a93fd32740a55108251a5e426ec1f5d4a99c4659736d2d4387a4136d294b91`
- source-commit.zip：`f7f992d013ef5edc9e96c317bf205828d04df4bdde742ba497a9662dfbcb8c00`
- 切换前加密备份：`3fcc66649dcb3c162198602270ecd71929d96f9c798ae59895c0d734a76a1875`

准备的代码回退命令：`sudo -n python3 /srv/projects/hakisub/images/guest-names-20261101T1115Z/publish.py rollback`。本次未执行；只切回上一兼容镜像并重建网关，不恢复备份或覆盖业务数据，也会清空内存Key。部署时房间文件逐字节一致仅描述切换时点，后续正常业务可改变资料。
