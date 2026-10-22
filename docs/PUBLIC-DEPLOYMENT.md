# HakiSub 公网部署

## 2026-10-22 ASR 并发调整（已生效）

按用户要求解除原两路瓶颈，将 `/srv/projects/hakisub/.env` 中 `HAKISUB_MAX_ASR_SESSIONS=2` 改为 `8`。修改前核实运行环境确为 2、容器 healthy；配置差异校验确认只有该参数改变。原环境保存在服务器 `/srv/projects/hakisub/images/asr-concurrency-20261022T145508Z/environment.before`（目录0700、文件0600），不下载或输出密钥。首次预检因 sudo 不传递临时环境覆盖而停止，未改服务器；改用 sudo env 后预检通过。

仅通过既有三份 Compose 配置执行 `up -d --no-deps --no-build --pull never hakisub`，沿用 `hakisub-20261020T173624Z` 镜像。已确认镜像与挂载不变、Caddy 容器未重建；运行容器配置解析结果为 8，健康状态 healthy，外部可信 HTTPS 首页和健康接口均200。重建会断开已有房间连接，需要重新入房并手动开麦。若需回退，只将该参数恢复为2，再用相同 Compose 文件仅重建应用；保留其他环境字段。

本地默认与发布示例同步为8，`npm test`、`npm run build`通过；假上游验证八路成员接入、跨房间第九路及重复成员拒绝、关麦释放名额。网关总上限仍为8，不是每个房间8路；真实豆包配额、多设备讲话及长时间稳定性未在本轮验收。没有发布本地账号功能或本轮性能审查建议。

## 2026-10-21 房间独立链接与分享（已完成，当前运行版本）

当前版本 **hakisub-20261020T173624Z**。进入真实房间后使用`/<六位正式房间号>/`；直达/刷新预填加入，旧985529加入后规范为114514地址。左上图标优先系统分享，回退复制，可手动复制受限地址；不分享房主/成员凭据或Key。返回首页及浏览器前进后退会停止当前会话与麦克风。

npm test与npm run build通过；隔离正式构建浏览器完成直达、刷新、加入、分享复制、返回首页和后退验收。发布包SHA256 `36c7ca646b14e0f74823a49f9bfcaadbbe2c8ce0da6320baae9104d9e9289aa1`，镜像归档SHA256 `fa083dd061cb09091c019823e0ba4d4caad09174f0782e158bd818ff1b0c33a6`，config `49a9815cdab56a558e7f46f0ea89b077f72d17ff053ee6241f19dcce451695b8`。官方固定Node22.23.3/ws8.22.0、32份运行文件、crane和上传哈希通过，隔离无外网/无真实Key容器检查包含数字路径。备份根.env及加密rooms.json后仅重建应用，未触发回退；原114514、985529别名和Key保留，主密钥/卷/Caddy未修改。必要时恢复本次images目录的environment.before并按既有三份Compose文件启动上一镜像，本次无数据迁移。

公网`/114514/`、无尾斜线、旧号和查询参数入口均200、HTML no-cache；HEAD及非法/敏感路径404通过。`index-DhETaCY6.js`与本地构建逐字节一致；两站可信HTTPS/跳转、WSS广播/隔离/清理/Origin、旧设置限制及VAD四资源压缩/缓存/哈希回归通过。未调用真实麦克风或豆包，也未向第三方发送分享。

## 2026-10-20 房间985529换为114514（已完成，历史版本）

用户明确要求原房间无痛换号。预检原985529存在、已配置Key、114514未占用；不读取或展示明文配置。由于AES-GCM的AAD绑定房间号，不能只修改JSON中的code。新迁移方法保留房主摘要、按新号重新加密原Key，并将985529存为同一房间的别名，所有旧成员入口继续有效，进入后显示114514；首页记录与本浏览器房主凭据自动合并。直接输入新号时可用旧入口凭据最多补验一次，不创建新房间、不自动开麦。

维护需先备份根.env和加密rooms.json、停止应用以避免旧进程覆盖新资料，再在无网络的临时容器中通过原服务器环境及数据卷执行`node server/renameRoom.mjs 985529 114514 --apply`，只输出迁移/权限/配置是否保留的布尔结果；新应用启动后验证新旧号属于同房间及配置状态。不增加公开管理接口，不改主密钥、Key内容、Caddy或ASR参数；发生故障需在应用停止时同时恢复本次数据备份和原发布环境，再启动原镜像。房间迁移有短暂重连，字幕不作为历史迁移，用户重新入房并手动开麦。

本地npm test和npm run build通过。新增实际加密与管理员CLI临时数据测试，验证只改JSON会解密失败、目标冲突/非法号不改原文件、换号/重加密/房主保留、旧新号同房与合成字幕广播、别名保留/防占用、脚本预检及重复执行不泄露凭据。CLI子进程在沙箱受限，完整测试获准沙箱外通过。实际Vue逻辑验证直接新号补验及失败最多一次；隔离正式网页用合成房主/假Key完成“旧首页记录→手动输入114514→房内可管理配置→返回首页唯一114514房主入口”，截图artifacts/room-renamed-home-proof.png。没有调用真实麦克风或豆包。

实际版本 **hakisub-20261020T150521Z**，包SHA256 `642a5c3dea267a0f34da2ca8c92191fdd41376a7bcb3ff9dccc538826bb0cc00`，镜像归档SHA256 `4cd6608946f25b287596d922e82ecc329b948f9779e53c218aa58b9e4a678f2a`，config `f9295277137ef164a6cd0384c95bef3cdb90396fa6f014120641bd157f6edf4b`。32份运行文件、固定Node22.23.3/ws8.22.0、crane及上传哈希通过。服务器无网络、无真实Key、非root只读容器分别通过生产网页检查和完整CLI换号/别名/房主/广播测试，再执行真实维护。

维护预检确认目标可用且原Key存在，备份根.env、secrets/server.env和停服后的加密rooms.json至本次images目录，均保留0600。脚本记录maintenance_seconds=3；原Key以新号AAD重新加密，房主摘要和Key内容比较一致，旧985529保存为别名，未增加第二间房，回退未触发。主密钥、Caddy、卷及识别参数不变，应用healthy、node、只读根目录、512MiB/0.75CPU，仅回环18787。

公网真实WSS分别用985529和114514加入，canonicalCode均114514且两位验收成员在同一成员列表；房间状态仍configured:true/source:room，验收成员只读，响应没有Key或房主凭据。新JS `/assets/index-BJ06bT-s.js` 与本地构建一致，两站HTTPS/跳转/资源/模型压缩哈希/WSS广播隔离清理/Origin/旧设置回归通过；未调用麦克风或真实豆包。用户强制刷新后重进一次，首页旧记录自动合并为114514，保留原浏览器管理凭据，麦克风需手动开启。

## 2026-10-20 偶发语音断连修复（上一运行版本）

用户反馈延迟与“无法连接本地语音网关，请运行npm run dev”错误，随后明确现有不到一秒的体感延迟可以接受，取消延迟调优。保留原识别/二遍参数、200ms分包、句首与静音收尾，仅修复连接名额释放和限次传输恢复。发现已结束识别仍在旧Socket关闭期间占成员/并发名额的竞态，模拟测试刻意延迟关闭已复现并覆盖；未获取用户当时握手状态码，不能断定每次断连都由该竞态导致。

网关cleanup立即释放已结束名额，旧close不能清新占位，重复识别仍拒绝。客户端对网页到网关的传输error/close/send失败在30秒内最多恢复两次（250/750ms），保持采集及房间mic:true；只补发未交给旧Socket的队列，丢弃中断Interim、不重放已发送音频，静音无待发队列时不空建云端连接。关麦/离房取消恢复，明确的Key/额度/服务/协议及模型采集错误仍停止。耗尽后显示服务器网关与重进房间的提示，不再让线上用户运行开发命令。

本地npm test和npm run build全部通过，新增旧close握手竞态（本机/联网）、双事件去重、迟到回调、两次上限、手动取消、send失败及无空建连回归；真实Vue逻辑验证恢复期间保持本人mic:true。隔离正式构建使用合成人声/真实Worklet与VAD，第一次握手刻意503，页面经过reconnecting后自动恢复上传、返回一条模拟字幕、保持一个活动采集流，手动停止后活动流0；截图artifacts/gateway-recovery-browser.png。未录真实麦克风、未读取用户Key、未调用真实豆包；不声称中断片段完整或承诺实际网络可靠性。

已部署 **hakisub-20261020T144728Z**。发布包SHA256 `93cec73dfee50c01eac3c6c9c67d9d1b670030b2ca738ab37906a79868354a21`，离线镜像归档SHA256 `ba00e0437baeb21f7448a04a89b4b94d23c3b16f7f670b21c93d80c3f4048adc`，config `efd8be574327979135c09f1c9235b611e9cc5d38501ccdbea286a0ca31808a9c`。31份运行文件核对、固定Node22.23.3/ws8.22.0及crane/上传哈希通过；服务器无网络、无真实Key、非root只读临时容器通过生产网页/房间及本机和联网旧close竞态两组验证。切换前备份根.env和加密rooms.json，仅重建应用，回退未触发；房间985529与加密Key保留，主密钥/卷/Caddy未改。

公网JS `/assets/index-B1z7ZHrn.js` 与本地构建逐字节相同，恢复提示存在且原错误提示已删除；模型四资源压缩/缓存/哈希正常。两站可信HTTPS、HTTP跳转、WSS广播/隔离/清理、非法Origin和旧设置关闭回归通过。最终healthy、node、只读根目录、512MiB/0.75CPU、仅127.0.0.1:18787。真实网络、麦克风及豆包识别未额外调用，需用户刷新重进后继续观察断连。

## 2026-10-20 模型加载超时修复（上一运行版本）

用户后续报告“本地语音检测模型加载超时”。服务器原资源均200且健康；旧固定20秒同时包含约14.7MB模型/WASM下载与编译，无法容忍较慢加载。没有采集用户端的实际下载/编译耗时，新增阶段用于区分后续具体失败。现已将模型/WASM预压缩到约5.1MB、添加版本缓存、流式百分比与阶段错误，改为下载停滞30秒/初始化60秒/总准备180秒保护；采集独立限30秒，取消仍立即释放。没有更改用户Key、VAD门槛或转为持续上传。

本地npm test、npm run build通过。生产构建在隔离浏览器中由WASM gzip响应分40秒传输，成功进入等待说话；初始静音零云连接。Windows自带TTS生成普通话样本，实际AudioContext/Worklet/重采样/Silero检测触发一次假ASR连接、505600字节上传及模拟字幕；关麦释放流，重开后缓存命中，WASM服务端下载仍仅一次，静音40秒零新增提交，最终活动流0。另有60秒持续下载/45秒初始化、停滞/总时限、错误长度/压缩头/HTTP失败/取消单元回归。合成人声离线模型测试两次讲话均触发/结束。没有访问真实麦克风、读取用户Key或调用豆包，线上完整真实讲话仍待验收。

已部署 **hakisub-20261020T142427Z**，包SHA256 `530b3a2a16c586cd034e6e0cdc24fe20062602c258013a7548042c8522a8d278`；离线镜像SHA256 `d814ec4037fc0deb7a83bff48e919ac091b84efbba6278735c7eb5337eb42d2c`，config `e394552b5d62f8ec975bf05d83945a621c880679a931527617f834c08f71a858`。31份运行文件核对、crane、服务器哈希和无网络无真实Key隔离Linux容器验证通过，沿用固定Node22.23.3/ws8.22.0。首次镜像下载等待较长，但最终正常完成，没有使用备用拼装方案。切换前备份根.env和加密rooms.json，应用healthy、node、只读根目录、512MiB/0.75CPU、仅回环18787；主密钥/房间卷/Caddy保持原配置，房间985529和加密Key仍存在，未触发回退。

服务器外核对新JS `/assets/index-tVTPFNyA.js` 与本地构建一致；四份VAD资源均gzip、Vary及版本缓存正确，压缩与解压后SHA256均和本地相同，总传输5127529字节，HTML仍no-cache。本机本次下载模型245ms、WASM760ms，仅代表这次外部测量，不代表所有设备/网络；两站可信HTTPS、HTTP跳转、WSS广播/隔离/清理、非法Origin和旧设置关闭回归通过。实际麦克风/豆包待用户强制刷新后重进房间、等待就绪再讲话验收。

## 2026-10-20 麦克风慢加载修复（上一运行版本）

运行版本 **hakisub-20261020T140219Z**，修复模型未就绪时超5秒即误报“本地语音检测积压”：加载阶段滚动保留最近600ms，ready后保留原运行队列/超时保护。卡片明确显示准备中，按钮可取消，就绪后才显示开启。本地npm test、npm run build及真实浏览器合成静音验收通过：人为延迟VAD初始化12秒，经过真实AudioContext/Worklet/重采样/Silero推理进入listening，静音继续15秒无积压且云连接0，关闭后idle；未使用真实麦克风或豆包。

发布包SHA256 `b59f7eb7dfe87f2f06e68a0d2434f9d14ee15d3a4dd227d499eff159181a8212`，镜像归档SHA256 `41e49b8f95d87835c2b6dfc914165c894bbb81da6ddfbd1ca7b52be83a668c86`，config摘要`9e82f045419443e077c4b236a5e7d6ee3eeb1afb532650584520feb2b2968c1c`。沿用固定Node22.23.3/ws8.22.0，27份运行文件及crane、上传后SHA256、隔离Linux容器验收通过。部署前根.env和加密房间数据分别备份于本次images目录environment.before、rooms.before.json；主密钥及数据卷不变，只重建应用，Caddy/主站不重启。当前healthy、回环18787；原报错房间985529和加密Key仍存在（仅核查布尔状态，不读取/显示Key）。

公网前端 `/assets/index-CwKlPyyj.js` 与本地构建SHA256相同，包含新准备中及取消开启状态；HTTPS/WSS/资源/Origin/房间广播隔离清理回归通过。真实讲话识别和浏览器设备权限仍需用户实测，不能把合成静音启动验收当作真实API或麦克风验收。用户需刷新页面并重新进入原房间加载新脚本。

## 2026-10-20 房间配置改造（已部署并通过公网验收）

默认联网、房间保留/首页再次进入、房间内创建者配置API Key已完成本地实现和测试。升级需要同步新的compose.yaml、deploy/prepare-room-storage.sh及应用镜像，保留现有Caddy、主站、Origin、服务器默认Key和资源限制。

首次启动新版前，在服务器项目根执行`sh deploy/prepare-room-storage.sh`。它为secrets/server.env生成一次HAKISUB_ROOM_ENCRYPTION_KEY（不显示值），创建固定具名卷hakisub-test_hakisub_room_data并初始化为UID1000可写。应用根文件系统继续只读，只有/app/data及临时目录可写。房间码、创建者凭据摘要和AES-256-GCM加密Key持久化于卷内rooms.json，不写音频/字幕/成员历史。后续升级不可重新生成主密钥或删除此卷；恢复须备份主密钥与数据卷两者。

新接口/api/rooms/settings只允许有效房间成员查看状态，写入/测试还需原创建者身份和明确Origin。旧公网/api/asr/settings继续关闭。识别优先使用当前房间Key，未配置时兼容服务器默认Key；密钥不会返回客户端。旧版临时房间无持久资料，切换时需重新创建；以后全员离开或服务重启后房间和配置仍保留，成员重新加入并手动开麦。

本地验证：npm test及npm run build通过（构建获准沙箱外执行）。新增持久化/重启/权限/房间Key隔离/不回显/写失败回退/旧令牌失效测试，以及实际Vue模板和首页存储测试。隔离无真实Key的本地生产预览中，实际浏览器完成创建→保存无效测试值（未调用连接测试）→全员退出→刷新→首页再次进入→管理权限与配置恢复；桌面与390px手机原生模态弹窗可用、无横向溢出。真实API和麦克风没有验收。

实际发布版本 **hakisub-20261020T133934Z**：发布包SHA256 `e16a6c611276f5d2802df54fb3011871702fb036df24980d9c5b7fad8e865bdc`；完整Linux/amd64镜像归档SHA256 `75fd4a6bd71f57770a2699625056950986117acb794206dafc00b06a7eb5cbf0`，config摘要`058501a67250a2716738e4a4da6dcdc9670f42c1e155e6e8e7443069166bec19`。沿用固定官方Node22.23.3基础摘要和ws8.22.0，27份运行文件与本地已测试快照逐项一致；crane validate、SCP后服务器SHA256及无网络/无真实Key临时容器验收均通过。

部署目录 `/srv/projects/hakisub/images/hakisub-20261020T133934Z`，原根.env、compose和server.env分别保留environment.before、compose.before.yaml、server.before.env（保留0600，不输出）。在服务器本地生成主密钥并初始化带Compose归属标签的数据卷；仅重建应用，Caddy及主站未重启。当前应用healthy、node用户、只读根目录、512MiB/0.75CPU，仅127.0.0.1:18787，写入限/app/data数据卷及临时目录。原豆包默认Key原样保留，实际health configured:false。

真实公网验收通过：新版JS、房内创建者保存配置/普通成员只读且拒绝写入、配置不回显、全员退出后重新加入；使用无效合成Key验证磁盘没有明文，实际重启应用一次后仍能恢复原房间、创建者权限和Key，旧成员令牌失效，不补发字幕。结束时已移除测试Key，没有请求真实豆包握手或麦克风。完整HTTPS/WSS/资源/Origin/清理回归通过；其中一次Windows DNS解析主站短暂ENOTFOUND，权威及公共DNS复核正确后重试通过。测试留下少量空房间元数据，不包含音频、字幕或真实Key。真实API/麦克风/双设备讲话、备份恢复及长期运行仍未验收；模拟与容器成功不能替代这些验收。

## 2026-10-20 主站及 HakiSub 已上线（当前状态）

用户确认 `xdstar.work` 已获批，备案号为 **鄂ICP备2026059859号-1**，当前没有主页。按用户选择新增 `https://xdstar.work/` 的静态主页，HakiSub 作为其中一张工具入口卡片，链接 `https://hakisub.xdstar.work/`。页脚展示用户提供的真实备案号并链接工信部；不把备案信息当作DNS、TLS或真实语音验收结果。

主页文件为 `deploy/xdstar/index.html`、`styles.css`、`favicon.svg`，不依赖外部字体、脚本、统计或音频服务。卡片中的字幕标明为界面示意；应用继续主动开麦、内存字幕及本地模拟行为。同一 Caddy 提供主站静态文件和子域名代理；新增只读目录挂载，证书卷、日志策略、资源限制和后端回环端口保留。主站的 CSP 仅作用于主站，不影响子域名模型、Worker或WASM。

本轮实际检查及准备：

- 原生SSH确认私有应用 `hakisub-test:hakisub-20261015T172741Z` 仍healthy、仅127.0.0.1:18787；80/443无监听。宿主UFW inactive、INPUT ACCEPT；这不代表阿里云云防火墙已放行。health为configured:false，未调用真实豆包。
- 公共DNS已能得到 dns17/dns18.hichina.com 的NS委派；主域名A查询无记录、子域名A查询NXDOMAIN。未重复RDAP查询，不沿用历史clientHold判断当前域名状态。
- 用户需在云解析新增 `@`、`hakisub` 两条A，均指向 `8.138.171.235`，并确认广州实例TCP80/443允许入站。不增加AAAA，不开放8787/18787，不覆盖其他记录或SSH规则。本机没有可用的阿里云控制台登录会话，已向用户请求这两项操作。
- 发布包 `xdstar-public-web-20261020.tar.gz` SHA256为 `b2d710076cc8236709334fa485c4372a1f58d01a1187ab6215ce8111688e0a5c`，上传到 `/srv/projects/hakisub/images/xdstar-public-web-20261020` 并复核一致；原deploy目录备份在该目录的 `deploy-before`。新配置复制到根deploy，未重启服务或改运行环境。
- 双域名Caddy在无网络、无宿主端口临时容器返回 `Valid configuration`，三份Compose合并解析通过。首次临时命令遗漏caddy程序名而失败，改为 `caddy validate` 后通过。公网兼容应用镜像174817Z同样经无网络、无Key、非root/只读临时容器通过网页、模型资源、设置404、无令牌ASR/非法Origin拒绝、双成员房间及合成字幕广播；不代表公网WSS或真实识别通过。
- `npm test`、`npm run build`通过；构建首次受esbuild沙箱EPERM拦截，经授权沙箱外重跑通过。主页在413px手机布局及1280px桌面视口检查无横向溢出，入口和备案链接正确；截图在忽略目录artifacts中。

之后用户完成两条A记录并确认80/443已放行，权威DNS和Google公共DNS、服务器解析均核验指向8.138.171.235；CAA查询均ENODATA。已在保留原.env（发布目录environment.before）及旧镜像后切换到174817Z公网应用，并启动Caddy。两站均已取得Let's Encrypt YE1证书：主站有效至2027-01-18 12:10:24 UTC，子域名至12:10:23 UTC；自动续期由常驻Caddy及证书卷负责，未经历一次实际续期周期。后端仍为127.0.0.1:18787、healthy、非root只读及512MiB/0.75CPU；Caddy只读128MiB/0.25CPU，宿主新增80/443监听，无2019或UDP443监听。

公网验收由服务器外部的Node客户端及Windows curl完成，均开启证书校验：两站HTTPS200、两站HTTP308到对应HTTPS、主站CSS/SVG及真实备案/子域名链接、应用JS/CSS及ONNX/MJS/WASM类型、WSS创建/加入/合成字幕、跨房间隔离和成员断线清理、非法Origin（包括主站跨源访问）及无令牌ASR403、设置及.env404全部通过。验收没有调用真实ASR或麦克风；health仍configured:false。证书签发完成前一次HTTPS握手失败，签发后严格重测通过；沙箱网络代理不可用时通过获准沙箱外命令执行公网验收。内置浏览器导航线上页面连续超时，未把它写成线上UI已实测；本地手机/桌面视觉检查及相同静态文件的公网内容验收已完成。已请求在Codex打开正式主站，UI返回queued。

现在可访问 [XDstar 主站](https://xdstar.work/) 和 [HakiSub](https://hakisub.xdstar.work/)。服务器Key须单独安全配置，真实API/麦克风/双设备讲话及长期稳定性仍待验收；不把连接验收写成真实识别已完成。无密钥新发布包hakisub-20261020T130656Z已生成并核对包含三份主页资源，该包未作为新应用镜像部署，实际运行仍174817Z。

后续管理使用同一项目和以下三个配置文件，不要只带根文件恢复为私有模式：

```bash
sudo -n docker compose -f compose.yaml -f deploy/compose.public.yaml -f deploy/compose.caddy.yaml --profile public-web config --quiet
sudo -n docker compose -f compose.yaml -f deploy/compose.public.yaml -f deploy/compose.caddy.yaml --profile public-web up -d --no-build --pull never
```

`HAKISUB_PUBLIC_ORIGIN` 仍为 `https://hakisub.xdstar.work`，主站只导航到应用，不调用应用接口。公网确认字段示例保持no；实际启用时依据用户本次备案确认设置yes。网页更新需上传 `deploy/xdstar/`；Caddy配置变化因管理API关闭需要重建Caddy，注意现有WebSocket会断开。

## 2026-10-16 历史准备记录

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
