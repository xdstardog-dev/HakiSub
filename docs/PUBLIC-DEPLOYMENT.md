# HakiSub 公网部署

2026-10-16：入口已确定为 `https://hakisub.xdstar.work`。用户已购买阿里云域名 `xdstar.work`，明确要求广州服务器完成 ICP 备案前不得公开上线。已有私有服务继续通过 SSH 隧道测试；公网兼容镜像已预置，Caddy配置已上传到隔离目录并通过验证，尚无可交付的公网入口。服务器豆包 Key 上次实测未配置，真实语音与双设备验收未完成。

## 当前核查与用户操作

用户提供2026-10-16 02:44:33控制台查询结果：域名持有者“未实名认证”，WHOIS显示clientHold、clientRenewProhibited、clientTransferProhibited、serverTransferProhibited和addPeriod。之后Codex独立RDAP查询确认相同状态；域名注册时间2026-10-15T18:01:20Z、到期时间2027-10-15T18:01:20Z，注册商为阿里云，记录的NS为dns17.hichina.com和dns18.hichina.com。没有读取或记录注册人资料。

本机及Google公共DNS对主域名NS、子域名A/AAAA查询均无有效结果，公共DNS返回NXDOMAIN；直接向dns17.hichina.com查询子域名A/AAAA也返回名称不存在。公共CAA查询在域名暂停委派下同样返回NXDOMAIN，不能据此断言没有CAA策略；权威CAA补查受本机DNS工具类型限制、Node解析器ECONNREFUSED影响未完成，解除Hold后应复查。审批额度耗尽曾阻止初次公共查询及构建升级执行，恢复后公共DNS/RDAP及构建重试均已完成。

clientHold解释了当前域名无法正常解析，但不能仅凭同时“未实名”就断定全部锁定原因。优先完成域名持有者实名认证并关联到xdstar.work；若认证成功后clientHold仍存在，查看站内信/邮件并提交阿里云域名工单。clientRenewProhibited是禁止续费，具体原因也需注册商确认；禁止转移状态本身不等于禁止建站，不为上线关闭转移保护。参考：[域名状态说明](https://help.aliyun.com/zh/dws/user-guide/whois-lookup-1)、[域名实名认证步骤](https://help.aliyun.com/zh/dws/user-guide/examples-of-real-name-verification-information-for-organization-registrants)。

请在阿里云控制台完成以下检查：

1. **域名 → 域名列表 → xdstar.work → 管理**：查看域名实名认证状态、域名状态、DNS服务器。若未认证或失败，按提示完成域名实名认证；只反馈状态文字，不提供身份证、证件号或完整个人资料。阿里云账号实名不能代替域名实名。若显示审核中、clientHold/serverHold或其他异常，先按控制台原因处理，不能仅凭公网查询推断原因。
2. **云解析DNS → 公网权威解析 → xdstar.work → 解析设置**：查看是否已有 `hakisub` 的 A、AAAA、CNAME，以及根域名/子域名 CAA；不要覆盖其他项目记录。若当前DNS服务商并非阿里云，应在实际权威服务商修改记录，不直接更换整个域名的NS。
3. **ICP备案 → 开始备案**：使用主域名 `xdstar.work`，按实际主体填写，关联广州轻量服务器 `8.138.171.235`。核对域名持有人与备案主体一致，并让控制台验证服务器备案资格；若提示购买时长/服务码不满足，先确认具体缺项，不自动购买套餐或付费代办。备案系统按已有主体情况判断首次备案或新增服务；填写实际网站用途，完成材料、真实性核验及短信核验，等待管局通过。

备案成功后再设置上线解析（本方案暂不要求提前添加）：

| 字段 | 值 |
| --- | --- |
| 记录类型 | A |
| 主机记录 | hakisub |
| 记录值 | 8.138.171.235 |
| 解析请求来源 | 默认 |
| TTL | 10分钟或控制台默认 |

已有同名CNAME或其他A/AAAA时先核对归属，不直接删除。服务器IPv6未核验，不新增AAAA；若存在CAA限制，应确认它允许 `letsencrypt.org`，不盲目删除已有策略。根域名 `@`、`www` 和通配符无需为本应用修改。DNS生效不代表已备案或允许上线。

取得本网站备案成功结果并复核后，才在 **轻量应用服务器 → 广州实例 → 防火墙** 为Caddy放行入站TCP80、TCP443；保留原SSH规则，不放行8787、18787或2019，不修改其他项目规则。当前没有执行任何防火墙修改。若宿主机另有防火墙，还需在只读检查后分别处理，不能假设控制台放行就已可达。

参考：[域名准备与实名核验](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/prepare-and-check-the-domain-name)、[备案期间访问规则](https://help.aliyun.com/zh/icp-filing/the-influence-of-the-record-during-the-site-visit)、[添加公网解析](https://help.aliyun.com/zh/dns/pubz-add-parsing-record/)、[备案流程](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)。阿里云说明首次备案成功前不能对外开通Web服务；备案针对域名及网站/主体信息，不是仅给服务器办理一个通用许可。

## 已准备的 Caddy 配置（尚未运行）

- `deploy/caddy/Caddyfile`：固定域名，明确使用免费 Let's Encrypt ACME；同源代理所有路径到 `127.0.0.1:18787`，包括两条WebSocket。Caddy自动处理Upgrade和证书续期，无需付费证书、阿里云AccessKey或DNS插件。
- `deploy/compose.caddy.yaml`：仅Linux宿主网络供Caddy访问现有回环后端；限128MiB内存、0.25CPU、只读根目录，只保留绑定低端口能力。只启用HTTP/1.1和HTTP/2，关闭管理API，不开放UDP443或2019。Caddy服务在 `public-web` profile中，启动前要求 `HAKISUB_ICP_CONFIRMED=yes`；该字段是防误操作检查，不能替代控制台的实际备案结果。
- `deploy/public.env.example`：固定Origin、该服务器实际验证的Caddy镜像ID、备案字段默认为no。合并到服务器根.env时保留原发布/资源配置；其他服务器须重新核验镜像导入结果。
- Caddy的 `/data`、`/config` 使用本项目命名卷；证书私钥仅存服务器卷，不打包或提交。不开访问日志，运行日志过滤request对象；上线前仍要检查代理故障日志是否包含session参数。管理API关闭后更新配置需要重建/重启Caddy，会断开现有WebSocket。

备案通过之前保持这些配置未启动。官方Caddy 2.11.6-alpine Linux/amd64镜像已下载，并将config及全部五层与固定registry清单核对、通过crane validate，上传后复核SHA256并导入。服务器目录为 `/srv/projects/hakisub/images/caddy-preparation-20261016`，`validation` 下仅为隔离配置和空Key环境文件，不是当前运行配置。最终无网络/无宿主端口、只读、128MiB、0.25CPU临时容器执行 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 返回 `Valid configuration`；三份Compose合并 `config --quiet` 通过。验证结束后只有原应用容器健康常驻，80/443没有监听。未启动Caddy常驻服务、签发证书或实测TLS/WSS。

镜像记录：官方registry清单 `sha256:86d4376ad067063d998533bf06e0c78b97cc8d99cd7cc66f84393165a95a65ed`；config `sha256:5e0a314e87ee77965b977aca1699c2888aac0847287a7c0400d2bcbddde9e526`；归档SHA256 `a6c69126b7dccc73b1a03a6d2f248a3e500b31b5d8321572ebe2e4b33747acaf`；Docker29导入后实际镜像ID `sha256:b81090603cc2ee6442c736e702f3e047feaa0d94cb3867c717327db440d7cf04`。所有RootFS diff_ids与官方config一致。crane重建归档清单为f1349d3c…，不是Docker实际镜像ID；首次误用导致No such image后已纠正。官方Caddy带低端口文件能力，单独cap_drop ALL会导致exec operation not permitted；保留与Compose一致的NET_BIND_SERVICE后验证通过，未增加其他能力。

备案和DNS通过后，准备好经核验的镜像及三份Compose文件（根compose.yaml、deploy/compose.public.yaml、deploy/compose.caddy.yaml），保留原镜像和配置，再启用public-web服务。HTTPS签发成功前不宣布上线；实际检查证书主机名/信任链、HTTP跳转、模型资源和WSS。免费证书由Caddy持续续期，必须保留证书卷和80/443验证通道；不购买商业证书。网页备案号展示在取得真实号码后添加，不写占位或虚构备案号。

参考：[Caddy自动HTTPS](https://caddyserver.com/docs/automatic-https)、[WebSocket反向代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、[官方Docker镜像与证书存储](https://hub.docker.com/_/caddy)。

## 已预置的应用镜像

公网兼容版本 `hakisub-20261015T174817Z` 已上传到服务器 `/srv/projects/hakisub/images/hakisub-20261015T174817Z` 并导入镜像。发布包SHA256为 `cb234a2076917eb7d86a481712a51d4dda58288d2848e912d1401645dcb1a3d6`，完整镜像归档SHA256为 `72c36677a77e1b6b856b7364e220dd2f6519f8ebf39f153be25882ad7cd17e77`，两者均经服务器复核。镜像config摘要 `daa2878fcb88cd341fef172536368b29dc955f46eeafb898b460b0062bfaf5f5`，Docker29 manifest ID为 `1aa72ca2ee6d9c6f36b61f84614d2c93803ef013be685cde505fc67cec8408b6`。仍沿用已固定的官方Node22.23.3基础摘要和ws8.22.0。

实际Linux临时容器在无外部网络、无宿主端口、无Key条件下通过：UID1000、生产网页、VAD资源类型、设置404、无令牌ASR拒绝、非法Origin拒绝、房间创建/加入及合成字幕广播。使用 `https://captions.example` 作为测试Origin，未签发证书或验证公网TLS。当前常驻容器仍为 `hakisub-20261015T172741Z`、healthy、回环端口18787，实测health为configured:false。没有重启现有服务或开放公网端口。

## 入口与网关

公网使用受浏览器信任的 HTTPS，同源代理网页、`/api/rooms` 和 `/api/asr`，WebSocket 需支持 Upgrade。网关仍只在服务器 `127.0.0.1:18787` 暴露，由反向代理接入；不能把私有部署的 HTTP 隧道链接作为公网麦克风入口。

`HAKISUB_DEPLOYMENT_MODE=public` 要求显式设置 `HAKISUB_ALLOWED_ORIGINS` 为完整 HTTPS Origin（无路径、凭据、通配符或末尾斜杠）。本机/私有模式的回环 HTTP 校验不变。公网与私有模式均关闭网页 Key 管理、禁止无成员令牌 ASR；默认两路 ASR 并发，每路最长15分钟。公网允许最多100个临时房间，每房8人；并发限额不等于账户额度，也不是每日费用限额。面向所有访客提供服务时，六位房间码不能代替账户鉴权。

应用部署覆盖文件为 `deploy/compose.public.yaml`，需与项目根 `compose.yaml` 合并，使用服务器根 `.env` 中非敏感的 `HAKISUB_PUBLIC_ORIGIN=https://hakisub.xdstar.work`。以下仅是应用层命令，不会启动Caddy；仅供备案成功且已经准备好证书和反向代理后的部署：

```bash
sudo -n docker compose -f compose.yaml -f deploy/compose.public.yaml config --quiet
sudo -n docker compose -f compose.yaml -f deploy/compose.public.yaml up -d --no-build --pull never
```

更新前保留原镜像、发布标识及配置。后续管理需始终带相同的两个 Compose 文件；仅使用原文件会恢复私有模式。重建会清空内存房间和识别会话。Key 只在服务端环境文件录入，不上传本机 `.env`，不输出完整容器环境或含成员令牌的 URL。

## 待完成的公网验收

- 从服务器外部确认 HTTPS 证书受信、网页/VAD 模型/WASM 可加载，HTTP 正确跳转。
- 通过 WSS 创建、加入房间和发送合成字幕，确认跨房间隔离与断线清理；验证非法 Origin、无令牌 ASR 被拒，设置接口为404。
- 安全配置服务器 Key 后，由两台设备实际授权麦克风、分别及同时讲话，核对字幕归属、静音断流、断网恢复和用量。模拟连接成功不代表真实语音通过。
- 确认证书自动续期、服务重启后的恢复和资源用量；域名、证书、反向代理、公网端口及实际发布信息在实施后补记。

当前本地验证：`npm test` 全部通过；`npm run build` 通过（沙箱 esbuild EPERM 后获准正常运行）。新增公网测试使用本地 HTTP 传输模拟 HTTPS Origin，未验证实际 TLS。
