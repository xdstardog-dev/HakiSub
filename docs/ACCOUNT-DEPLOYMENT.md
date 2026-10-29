# 账号系统部署、验收与恢复

## 账号工作台 UI 上线（2026-10-29，Asia/Shanghai）

用户在本地重构验收后明确要求“上传至GitHub与服务器”。正常提交并推送GitHub main：`bb5447df91bf339f92247f7e2d4b270be6984706`，包含13项账号前端、测试和文档变更，无强推。沿用此前已通过的`npm test`、账号/房主管理测试与两端构建，发布前重新生成账号正式构建，JS为`index-C3UESmQU.js`、CSS为`index-DBkiAsm5.css`。发布包白名单32项，SHA256 `0acd5f9ff07a4fba3002d2fd22de8732571f61d50d65d9780f34e87c9705612a`，不含凭据、数据库或node_modules。

发布目录 `/srv/projects/hakisub/images/account-workspace-20261029T1139Z`。原账号后端逐项哈希与依赖配置核对一致，复用已验证的`xdstar-accounts:interaction-20261025T1510Z` Linux镜像及原生依赖，仅替换`/app/dist`，无网络构建。新镜像为`xdstar-accounts:account-workspace-20261029T1139Z`，镜像ID `sha256:035e12bb80e211b9774299f41bf04c73a9980ec58c15c8430a026369965d9f5f`，镜像配置摘要 `22fb7060527386cb971072eda3757d44cdd5213fc179b0ee055e0ea10274aa47`。隔离只读/无网络/内存SQLite容器验证账号健康、HTML/JS/CSS和新导航样式后才切换。

北京时间19:43:06仅将根.env的XDSTAR_ACCOUNT_RELEASE改为本发布名，以原四份Compose配置执行`up -d --no-deps --no-build --pull never accounts`。账号容器健康；HakiSub网关仍为`captions-20261029T0853Z`且容器ID未变，Caddy容器ID未变，因此未因本次发布重启网关或清空房间内存Key。账号后端、数据库v2、原账号持久卷、秘密环境、代理及回环端口/资源限制保留。原23间房元数据逐项匹配，4个原账号内部ID/公开UID映射保留，SQLite integrity_check=ok、foreign_key_check无异常。

加密备份均位于本发布`backup/`，AES-256-CBC/PBKDF2，目录0700、归档/口令0600，口令仅服务器`secrets/account-workspace-20261029T1139Z-backup.key`。SQLite使用在线backup API一致性快照，连同房间、env和部署/代理配置加密，实际解密逐字节核验并在服务器隔离内存目录打开SQLite检查；没有下载生产数据库或凭据。

- 切换前 `production-before.tar.enc`：`7333997a5134e03bc44c1d74237f0a41d522ac4c4d98619daebd501c0f61527b`。
- 切换后 `production-after.tar.enc`：`93a0937603b6e2314e11e88c9eaa8b5c3f070da1fa05548e71da3d63ab10e762`。
- 公网验收后 `production-final.tar.enc`：`eba7dacd39c59491d23378ba37c3f80e7fc00ff6eff98abb0a708c3916cf4565`。

正式HTTPS的账号HTML/JS/CSS共3项与本地构建逐字节匹配，HakiSub HTML保持原构建，健康正常，/.env、内部管理、Vue源文件路径404。正式Chrome通过375/768/1440px：真实两步注册往返与完成、五个工作台页面、手机抽屉不挤压内容、背景锁定/遮罩/Escape/焦点恢复、刷新保持登录、六位UID登录与退出；浏览器Cookie确认主站host-only、Secure/HttpOnly/SameSite=Lax，并从真实HakiSub子域凭据fetch确认身份CORS正常，页面无JS异常。新增`workspace_probe_20261029`合成自检账号，显示名“工作台上线自检（合成）”；随机密码和答案仅测试进程内存，不写报告、不输出。无新房间，未修改原账号/房间设置，最终5账号/23房。证据在`verification/public-browser.json`和三视口截图，本地ignored artifacts同名发布目录有副本。该生产自检账号没有房间，单房间Key/ASR完整交互由本地合成接口与房主管理专项覆盖，不冒称生产Key操作已实测。真实物理手机、Key/麦克风/豆包未验收。

账号独立回滚已准备，未实际执行；失败切换路径会自动调用同一回滚：

```sh
sudo -n python3 /srv/projects/hakisub/images/account-workspace-20261029T1139Z/publish-account-workspace.py rollback
```

它只恢复账号镜像`interaction-20261025T1510Z`及对应发布变量，保留当前账号库/UID/存档/会话和房间数据，不降schema、不恢复旧快照、不重启网关/Caddy。不要使用10月25日schema降级脚本撤销本次UI。备份仍是同机加密副本。发布回执为prepared.json、activated.json、verified-after.json、verified-final.json。

## 打字、回应和素材音效上线（2026-10-29，Asia/Shanghai）

用户明确授权“上传至GitHub+同步到服务器”。已将此前已上线但未提交的账号交互修复、本轮打字/回应/音效、原本未推送的文档提交一并正常推送GitHub main；功能代码为`b8afe0ca719b15a3b8126b20fae3b051864492c9`。发布前扫描66个变更文件，未发现凭据/数据库/临时工具进入Git。`npm test`、`npm run build`、`npm run test:accounts`、`npm run test:room-management`、`npm run build:accounts`全部通过；最终Vite产物为`index-DRecb3bU.js`与`index-CC_Vion2.css`。

### 实际切换与保留

北京时间17:04:33（09:04:33 UTC）切换`hakisub-test:captions-20261029T0853Z`，镜像ID为`sha256:c0c35c202cef59db4ee247583e1e6eebb2de8eb750c453d66381a0bc56bcecac`，revision标签为上述功能提交。源码/构建白名单包66项，SHA256 `7425483914174b946ba5aff4b363fe388182bb672c9ca50517d2e7ce0733a32f`，存于服务器`/srv/projects/hakisub/images/captions-20261029T0853Z/source/`并有RELEASE.json逐项哈希。复用生产已验证Node22.23.3/ws8.22.0依赖，只叠加server/dist，无新原生运行依赖。

账号server/dist共11项与本地当前构建SHA256完全一致，因此不重建、不重启账号服务，仍运行`xdstar-accounts:interaction-20261025T1510Z`；账号库保持v2。Caddy容器、服务器secrets/server.env与accounts.env、代理文件、回环端口、资源限制及数据卷保持原样。仅将根.env的HAKISUB_RELEASE改为新发布名，使用原四份Compose文件和public-web/accounts profiles，以`up -d --no-deps --no-build --pull never hakisub`切换单个网关。网关按既有内存Key规则在重启后缺Key，房主需重新填写；未使用真实Key或付费ASR。

### 备份与数据核验

备份在本次发布目录backup/，AES-256-CBC/PBKDF2加密，目录0700、归档/口令0600；口令只在服务器`secrets/captions-20261029T0853Z-backup.key`。使用SQLite在线backup API获得一致性快照，房间、env及部署/代理配置一起加密；实际解密逐字节核验，并在隔离内存目录重新打开SQLite，integrity_check=ok、foreign_key_check无异常。未下载生产数据库或凭据至本机。

- 切换前`production-before.tar.enc`：`30361ee1b78847c1ccfa64b89d8d340ae55078e1b91bbd336c4dc7fa24081992`。
- 切换后`production-after.tar.enc`：`decf97cfe2b4e4b5bbe692148332416f4499b01c94bd846b1a40cb68b8d77b60`。
- 公网与浏览器验收后的`production-final.tar.enc`：`1538c2598fb52e2598193e111f42fa0784dc4ab7f59d8f60169cb9db9c97ef60`。

原21间房记录逐项匹配，4个原账号内部ID/公开UID映射保留，账号/Caddy容器ID不变，两业务端口仅127.0.0.1。公网自检创建合成房间377573、275696，最终23房、4账号；没有修改原房权限/Key，没有新建账号，测试结束已关闭全部客户端，不补发字幕历史。证据在发布目录prepared.json、activated.json、verified-after.json、verified-final.json及verification/报告。备份仍为同机加密备份，不是异机备份。

### 验收与回滚

新镜像先在无网络、无生产卷/凭据的Linux容器中通过真实回环WS打字、回应、身份和跨房隔离联调。正式HTTPS验证页面/音效/账号静态资源28项逐字节匹配，其中14个MP3正确audio/mpeg；账号健康和匿名身份、内部路径/源文件404正常。正式WSS验证打字、成员typing状态、扩展词库、发送者防伪、目标房间校验、八人广播/第九人拒绝、后来加入无历史均通过。正式Chrome隔离会话在合成房间实际点击完成全局输入窗/跨浏览器打字、右键设置词库、跨浏览器谢谢气泡、疑问MP3逐项试听及离房，页面无JS异常，明确阻止ASR请求。物理扬声器听感、真实系统IME、iOS/Android软键盘及真实麦克风/豆包不在本次自动验收内。

本次独立回滚入口已准备、语法检查，未实际执行：

```sh
sudo -n python3 /srv/projects/hakisub/images/captions-20261029T0853Z/publish-captions.py rollback
```

它只将网关镜像切回`interaction-20261025T1510Z`并检查健康，不恢复旧rooms.json/SQLite，不改账号库版本，不重启账号/Caddy，不覆盖新写入数据。不要使用下方10月25日的schema降级回滚来撤销本次功能。发布脚本首次对旧标签中的大写T/Z校验过严，在生产未切换时修正并复用已核验备份，随后准备/上线/验收全部成功。

## 交互修复上线（2026-10-25，Asia/Shanghai）

按用户指定23:10开始，23:23切换 `interaction-20261025T1510Z`。网关/账号镜像为 `hakisub-test:interaction-20261025T1510Z`、`xdstar-accounts:interaction-20261025T1510Z`；基于上一版已验证Linux镜像及原生依赖叠加本次服务和构建文件。本地修改尚未提交Git。Caddy、服务密钥、端口、持久卷均保留。本次重启清空内存Key，房主需重填。

发布目录 `/srv/projects/hakisub/images/interaction-20261025T1510Z`；`source/RELEASE.json` 包含46项文件校验。无密钥白名单包SHA-256：`a2c4b4ea978470ae9dd786e0ced5bd4151a56413fe24143999f59701594b2568`。镜像config摘要：网关 `4c4a0626a32896ad3fe130595a2d2e90326a536d67789abfa2ae7d420805dc65`；账号 `ce5720baed3894fcfcaf2529ba2e2f7af0cdf65380aa78185c2a161d422c3ad4`。

上线前在线SQLite backup API快照与房间/环境/代理配置加密为 `backup/production-before.tar.enc`，SHA-256 `5157ade9d8fbc3f570519cd872bd0b4427ad76607c389acd51eeba7f7c254fd8`；AES-256-CBC/PBKDF2口令仅服务器 `secrets/interaction-20261025T1510Z-backup.key`。目录0700、归档/口令0600。先解密逐字节核验，再在无网络、只读根目录的新版Linux容器中对真实副本执行v1→v2，比较全部旧列，保留ID、密码哈希、会话和关联；临时明文副本清除。首次Docker cp无法读取tmpfs快照，改为容器内读取，未输出数据库到终端或本机。

上线后核对原3个账号、20间房全部旧数据、密保/存档/项目关联保留；所有公开UID六位且唯一，SQLite integrity_check=ok、foreign_key_check无异常。两个服务healthy，仅回环映射；代理及服务密钥和备份一致。新增合成验收账号 `interaction_probe_20261025` 与房间 `367398`，最终该房间暂停且Key已删除，现共4个账号、21间房。没有修改原房间的权限。上线后再生成并实际解密核验 `backup/production-after.tar.enc`，SHA-256 `b0a1d1b55a17aab1811ca34185da37dc30f242c8c3188975beeb96f31c576f89`。证据为发布目录 `backup/verified.json`、`activated.json`、`verified-after.json`。备份仍只在同机。

本地 `npm test`、`npm run test:accounts`、`npm run test:room-management`、`npm run build`、`npm run build:accounts` 全通过。首次沙箱阻止Node/esbuild子进程，获准正常环境重跑通过。专项覆盖八位数字密码注册/修改/恢复、账号/UID登录、UID占用、v1迁移重开关联、显示/明文/导出、房主显密、绑定撤权、游客/成员/跨账号拒绝、掩码拒绝及清理。

公网可信HTTPS/WSS实测：两端HTML/JS/CSS与本地构建逐字节一致，八位密码、账号/UID登录、匿名及绑定房主跨客户端显密、游客/成员/旧凭据/退出后拒绝、掩码保存拒绝、状态及成员广播无Key、删除及内网路径404。首轮验收脚本未带刚获取的CSRF Cookie而403，修正脚本顺序后全部通过，未放宽服务保护。报告为本地 `artifacts/INTERACTION-PUBLIC-VERIFICATION.json`。

隔离浏览器实际完成保存合成Key→掩码保留→显示→隐藏，并核对账号设置和安全码导出入口。生产浏览器导航两次超时，不能称生产UI点击/手机真机已验收；正式资源及接口通过独立客户端验收。未调用真实豆包、未开麦克风，也未做付费握手。

### 本次最小回滚

脚本已准备，未实际执行：

```sh
sudo -n python3 /srv/projects/hakisub/images/interaction-20261025T1510Z/activate.py --rollback
```

脚本停止账号写入，使用原镜像SQLite将版本门槛2降回1，保留新增列、UID映射及全部当前数据，再恢复之前 `deploy-20261022T1748Z` 的两镜像/发布标识并检查健康。旧版界面将显示内部UUID，八位密码仍能登录；再次升级会保留映射并补齐旧版新增用户的空UID。不覆盖账号库、不还原旧房间快照、不恢复磁盘Key、不改变Caddy或卷。完整灾难恢复需停写后先将加密备份恢复到隔离位置验证，禁止直接覆盖当前数据。

## Star-Hub 实际上线记录（2026-10-23，Asia/Shanghai）

本节为当前生产事实，后续较早日期的“本地未部署”“待授权”等内容保留为历史记录，不代表当前状态。用户已明确授权北京时间 01:48 起执行备份、配套上线、必要配置切换和正式站验收；本次未重复部署前全面审查。启动时工作区干净，GitHub main 已是 `d1f237ba9bdbedb43c8d80e1822d38d3512fa4ad`，包含 `52b9788`，无需推送或合并，也未丢弃工作区修改。

### 实际版本与网络

| 项目 | 已运行配置 |
| --- | --- |
| 发布目录 | `/srv/projects/hakisub/images/deploy-20261022T1748Z` |
| HakiSub 镜像 | `hakisub-test:deploy-20261022T1748Z`，镜像配置 SHA-256 `ab5a455ac2eff5ec661cd8180fea56d2c5d53e4c86da433248a40569fc55dee6` |
| 账号镜像 | `xdstar-accounts:deploy-20261022T1748Z`，镜像配置 SHA-256 `89dd2b54c983b0b6954580f325c078dfbaa9fd0331934c9c3fedaacc5a726881` |
| Node | 复用原已验证的官方 Node 22.23.3 Linux 基础镜像；原生依赖在隔离 Linux 构建阶段安装 |
| 账号入口 | `https://xdstar.work/account/`，主站代理 account 及 projects/hakisub API 至回环 18788 |
| 房间入口 | `https://hakisub.xdstar.work/`，原代理结构及回环 18787 保留 |
| 私有通信 | 原 `hakisub-test_default` 网络，账号访问 `http://hakisub:8787`，独立随机服务签名密钥 |
| 持久数据 | 原 `hakisub-test_hakisub_room_data` 未替换；新增独立 `hakisub-test_xdstar_account_data`，node 用户及 0700 卷目录 |

白名单源码包 SHA-256 为 `44d4def30e149439f804bd4ca6dc93ad50bb9e25c9416564bf96451b637ed17a`，只含发布文件和逐项校验清单，不含生产凭据、数据库或 Windows node_modules。首轮账号原生依赖构建缺少 Python，已在一次性构建阶段补齐 python3/make/g++ 后成功；未安装到宿主机或运行时镜像。Linux SQLite integrity_check 与 Argon2 hash/verify 冒烟通过。两端镜像 revision 标签均与目标 main 相符。

服务管理密钥及账号签名密钥仅在服务器生成，分别注入受限 env；原有历史解密密钥和配置保留，不用于恢复房间 Key。Caddy 候选配置 validate、Compose config --quiet 均通过后，依次启用账号、切换 HakiSub，再重建原 Caddy。两个业务容器健康检查通过，端口均只绑定 127.0.0.1，未开放额外公网端口；域名、原静态主站及 TLS 结构保留。Caddy 覆盖 X-XDstar-Client-IP；受信 peer `172.18.0.1` 已通过正式请求和持久限流哈希对比验证，伪造来源头无效。公网内部管理路径明确 404，Origin/CSRF 缺失或错误请求被拒绝。

### 备份、迁移与恢复证据

切换前备份位于发布目录 `backup/production-before.tar.enc`，包括原 rooms.json、env、部署/代理配置、原镜像标识及匹配历史密钥；当时不存在账号服务或账号数据库。备份采用 OpenSSL AES-256-CBC/PBKDF2 加密，发布/备份目录 0700，归档与恢复口令文件 0600；口令仅在服务器 `secrets/deploy-20261022T1748Z-backup.key`。已实际解密到隔离内存副本，读取归档并逐项恢复核对房间、别名及配置，确认后才切换。归档 SHA-256 `682b50a168d0792bf638d754b71a4e74605f7b82e4d59a06a91bdf58567ae232`。

上线后逐间比对原 19 间房的 code、ownerHash、ownerUid、aliases、asrEnabled，全部一致；114514 的 985529 别名保留。只有本次自建合成房间 698553 增加，最终共 20 间。首次元数据成功保存将旧文件转为 v3，逐项确认只含元数据白名单，没有 Key/密文字段；旧 Key 从启动起即不被加载，未等待迁移写入才撤销。没有认领或修改原有匿名房间，也没有删除/重建旧卷、空库覆盖或 down -v。

上线后另用 SQLite 在线 backup API 生成一致性快照，和当前房间及配置一起加密为 `backup/production-after.tar.enc`，SHA-256 `e65347bcf4500485f6236de1e86df3910884aac7c03992b209a45ddd647fa91f`。已在服务器隔离目录实际恢复 SQLite 并重新打开，integrity_check=ok，两合成账号存在，测试房间 ownerUid 与账号记录相符。临时明文副本已清理。证据为发布目录 `backup/verified.json`、`verified-after.json`、`activated.json`。此为同机备份，尚无异机副本，不能覆盖整机丢失风险；后续应由用户指定加密异机存储。

### 本次测试及实际边界

本地重新执行 npm test、npm run test:accounts、npm run test:room-management 全通过；两端构建通过。自动测试覆盖重启缺 Key、旧加密数据忽略、磁盘失败、房主撤权、并发及正在运行会话清理，均用模拟豆包。日志在本地忽略目录 artifacts/deploy-*-test.log；构建日志位于服务器发布目录。

正式 HTTPS 使用明确标注的两个合成账号及自建房间验收：注册、独立客户端登录、host-only Secure/HttpOnly Cookie、UID 与原合法凭据绑定、无需原客户端或入房即可读取并管理；其他账号、游客、普通成员、旧 ownerToken 不能越权，客户端注入 UID 被拒绝。合成 Key 保存不回显，远程暂停向在线成员广播且新 ASR 握手返回 403，恢复后可修改状态；删除后 source=none，无默认 Key 回退。原 114514/985529 均可通过 WSS 加入同房，未获得原房主管理权限。两个 HTTPS 页面及账号健康接口正常，/.env 与 /internal/* 均 404。

正式浏览器完成账号登录、个人中心自有房间展示、合成 Key 保存后输入清空、ASR 开启/暂停、确认删除后显示“房主已删除”并禁用测试入口。最终测试房间为暂停、无 Key；截图本地 `artifacts/production-account-review.png`，接口断言报告 `artifacts/production-room-review-result.json`。浏览器操作曾因工具响应慢超时，经重新读取页面状态后完成；未修改生产安全策略来绕过工具限制。注册与完整越权矩阵通过正式 HTTPS 独立客户端执行，不冒称所有分支均由 UI 点选完成。

仍待：用户提供可用测试 Key 后的真实豆包连接、真实音频、多人讲话稳定性、手机与物理双设备，以及真实上游运行中远程暂停的现场验证。本次没有调用付费豆包、没有自动开麦；独立 Cookie 会话和模拟上游不能替代这些验收。生产磁盘故障/断电未注入，覆盖来自隔离专项；未为单独验证重启而再次重启生产。后端每次重启都会清空所有房间 Key，房主须重新填写。

### 可执行最小回滚及恢复路径

旧镜像 `hakisub-test:hakisub-20261020T173624Z`、原配置加密备份及两个数据卷均保留。**旧后端不能直接读取 v3，且可能恢复旧磁盘 Key；禁止直接改回旧镜像、改 version、覆盖当前房间文件或账号库。** 优先保留本轮授权后端和元数据，向前修复。

账号路由故障时，已准备服务器受限脚本 `images/deploy-20261022T1748Z/rollback-starhub-proxy.py`。它只从原加密备份提取 Caddyfile，执行 Caddy validate 后原子恢复旧代理并只重建 Caddy；不还原数据、不切回旧识别后端。执行将短暂断开 WSS，账号入口撤下，账号服务及数据库保留；HakiSub 仍保留新版 UID/内存 Key 安全边界。脚本已做语法检查，**未实际执行回滚**：

```sh
sudo -n python3 /srv/projects/hakisub/images/deploy-20261022T1748Z/rollback-starhub-proxy.py
```

重新启用新版路由可将同目录 `Caddyfile.new` 经 validate 后复制回 `deploy/caddy/Caddyfile`，使用原四份 Compose 文件、public-web/accounts profiles，执行 `up -d --no-deps --no-build --pull never --force-recreate caddy`。应用正常重建也只使用这组配置，保持原卷；每次网关重建后重新填房间 Key。完整数据恢复仅在停写维护窗口：先另存当前元数据/账号一致性快照；解密备份到新隔离目录/卷，验证房间身份和 SQLite，再选择匹配 v3 的后端；恢复账号库时撤销 sessions/recovery_challenges。不得把切换前快照直接覆盖新 UID 绑定或新账号，完整旧后端回退须另行决定权限和付费关闭策略。

以下为历史开发和部署前说明；与本节不一致时，以本节和当前源代码为准。

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
