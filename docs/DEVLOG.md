# HakiSub 开发日志

日期：2026-10-13（Asia/Shanghai）

任务：为模拟字幕素材补充「时间轴」能力——普通人不填时间就自动排；也可用 `at` / `duration` 手动指定每句开始时间与时长，允许多人重叠。

已完成：
- 新增「素材对话（时间轴）」场景（`script`），按 `lines` 顺序播放台词池。
- 自动时间轴：默认按字数×语速（30ms/字，600～1600ms）算时长，按上一句结束+停顿（500ms）排开始时间；语速/停顿可在素材包可选 `timing` 字段里改。
- 手动时间轴：`lines` 的 `at`/`duration`（毫秒）真正参与调度，可只填其一，可让多人重叠。
- `App.vue` 增加场景下拉项，运行时按素材包角色数自动补齐成员。
- 更新 `docs/SIMULATION-AUTHORING.md` 的自动/手动时间轴说明与示例。
- 保留原有七种测试模式及压力测试固定时序不变。

修改的主要文件：
- `src/simulation/types.ts`、`src/simulation/scenarios.ts`、`src/App.vue`、`materials/example.json`、`docs/SIMULATION-AUTHORING.md`。
- `tests/simulation.test.mjs`、`tests/demo.test.mjs`。

测试结果：
- `npm test`：七个测试脚本全部通过（含自动/手动/混合时间轴与素材对话集成测试）。
- `npm run build`：TypeScript 检查与 Vite 生产构建通过。

未完成或已知问题：
- 未实现随机抽取；手动时间轴只作用于「素材对话（时间轴）」场景，不影响七个固定测试场景。

日期：2026-10-13（Asia/Shanghai）

任务：把集成在网页主程序里的模拟字幕拆成「运行逻辑 / 测试场景 / 素材库」三部分，让不懂编程的人也能独立编辑角色和台词。

已完成：
- 新增 `src/simulation/` 四个模块：`types.ts`（素材包类型与校验）、`engine.ts`（Interim/Final 展开）、`scenarios.ts`（七种场景节奏与说话人分配）、`material.ts`（自动发现并校验素材包）。
- 新增 `materials/example.json`，把原先硬编码在 `App.vue` 和 `stressSimulation.ts` 里的角色、台词、压力测试脚本全部迁移为 JSON。
- `src/App.vue` 不再持有任何角色/台词硬编码，改从素材包读取；`src/stressSimulation.ts` 逻辑已迁移。
- 新增 `docs/SIMULATION-AUTHORING.md` 面向非程序员的素材编写指南（含可复制模板、字段说明、排错与查看效果）。
- 新增 `tests/simulation.test.mjs` 并纳入 `npm test`。

修改的主要文件：
- 新增 `src/simulation/{types,engine,scenarios,material}.ts`、`src/vite-env.d.ts`、`materials/example.json`、`docs/SIMULATION-AUTHORING.md`、`tests/simulation.test.mjs`。
- 修改 `src/App.vue`、`package.json`、`tests/demo.test.mjs`。
- 清空 `src/stressSimulation.ts`（内容已迁移，保留为空壳，见已知问题）。

测试结果：
- `npm test`：七个测试脚本全部通过；原有六种模拟与一分钟压力测试（81 句、24/3 交替、三档时长）行为不变。
- `npm run build`：TypeScript 检查与 Vite 生产构建通过（27 个模块），素材 JSON 已打包进产物。沙箱仍拦截 esbuild 子进程，需在非受限环境重跑构建。

未完成或已知问题：
- 网页仍只使用第一个素材包（按文件名排序）；多包切换/随机抽取尚未实现（本次明确不做）。
- `lines` 的 `at`/`duration` 字段已预留，七种场景暂不使用。
- 工作区文件权限（Everyone 拒绝“删除子文件”）导致无法用命令删除 `src/stressSimulation.ts`，只能清空内容留作空壳。

下一步建议：按 `docs/SIMULATION-AUTHORING.md` 试写一个独立素材包并验证；随后评估多素材包切换与随机抽取。

日期：2026-10-12（Asia/Shanghai）

任务：在现有 Vue 项目中接入豆包 ASR 2.0 小时版单麦克风实时字幕。

已完成：
- 新增本地 Node.js WebSocket 网关、服务端环境变量鉴权、v3 二进制/Gzip 协议与错误帧解析。
- 新增 AudioWorklet 单麦克风采集、16kHz/16-bit/单声道 PCM 重采样和 200ms 分包。
- 浏览器 ASR 与豆包通过统一成员字幕事件接入原有生命周期；使用独立会话和稳定分句 ID，支持 Interim 原位更新、Final 去重和撤回。
- 保留原模拟、浏览器 ASR、布局和字幕计时；在真实麦克风模式下增加来源选择。预览发现窄窗口挤压，已改为独立一行。
- 实现停止/切换/隐藏/离房/断线清理、授权迟到释放、无自动重连、上传积压和会话时长限制。
- 新建 AGENTS.md、架构文档、空值 .env.example；更新 README 和本地同步说明。创建被 Git 忽略的空值 .env，等待用户填写。

修改的主要文件：
- `src/App.vue`、`src/browserAsr.ts`、`src/asrSession.ts`、`src/captionEvents.ts`。
- `src/audioCapture.ts`、`src/audioCapture.worklet.js`、`src/audioResampler.ts`、`src/doubaoAsrClient.ts`。
- `server/index.mjs`、`server/asrGateway.mjs`、`server/doubaoProtocol.mjs`、`server/doubaoResults.mjs`。
- `package.json`、`package-lock.json`、`vite.config.ts`；只新增 ws 运行依赖。
- `tests/doubao.test.mjs`、`tests/audio-capture.test.mjs`，适配并扩展 `tests/demo.test.mjs`、`tests/asr.test.mjs`。
- `README.md`、`AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/local-development.md`、`.env.example`；沿用之前已补充的 `.gitignore`。

测试结果：
- `npm test`：六个测试脚本全部通过。覆盖原有字幕/布局/模拟/浏览器 ASR，以及新协议、真实本地 WebSocket + 假上游、采样率转换、会话去重、取消/异常/权限竞态和资源清理。
- `npm run build`：TypeScript 与 Vite 生产构建通过。沙箱首次阻止 esbuild 子进程，获准在正常环境重跑后成功。
- 注入无效测试密钥标记进行构建，扫描 dist 未发现标记。
- `.env` 和 `.env.local` 被 Git 忽略，`.env` 未被跟踪；开发服务 `/.env` 返回 403。
- 新 `npm run dev` 启动成功；网页 `/` 返回 200；同源 `/api/asr/health` 返回 200 与 `configured:false`。
- 在现有内嵌预览页确认真实麦克风/豆包选项及窄窗口布局。Chrome 自动化连接不可用，未把界面检查视作 Chrome 麦克风验收。

未完成或已知问题：
- 没有真实 API Key，未调用真实豆包服务；真实权限、额度、识别准确率、网络兼容、音频设备与长时间稳定性尚未验收。
- 停止直接取消识别，丢弃未确认句和不足 200ms 的尾部音频。单次会话最多 15 分钟，不自动重连。
- 当前仍上传静音；没有本地 VAD、降噪、声纹、多麦克风、联机或其他显示端。网关仅限本机使用。

下一步建议：先填写 Key 完成真实麦克风验收，记录连续讲话、停顿、断网、关闭及 10 分钟稳定性；确认可用后再评估本地 VAD。

日期：2026-10-13（Asia/Shanghai）

任务：Codex 评审 DeepSeek 的模拟字幕模块拆分与时间轴更新（当前未提交工作区相对 ee3cf9c）。

实际完成：
- 检查 App.vue、simulation 模块、素材示例、测试及文档；本次未修改业务实现，未编辑 DeepSeek 跨会话记忆。
- 认可素材 / 场景 / 事件展开的职责分离，默认素材的既有模拟行为有回归覆盖。
- 发现：素材校验未限制数组长度；interim 为零句或一句、stress 中存在空段均校验通过，随后展开事件抛 TypeError；七段 stress 也校验通过，事件超过固定一分钟边界。
- 发现：eager JSON 模块导入在 Vite 转换阶段即解析，非法 JSON 无法被 discover 的 try/catch 捕获，和编写指南所述房间内错误提示不符。
- 发现：App.vue 仅在没有有效素材包时显示 materialError，多个包中部分校验失败会被静默忽略。
- 文档建议：docs/ARCHITECTURE.md 尚未补充新增模拟模块的数据流；本次仅记录评审意见。

验证结果：
- npm test：七个测试脚本全部通过。
- npm run build：沙箱首次因 esbuild spawn EPERM 失败；获准沙箱外重跑后 TypeScript 与 Vite 构建通过（27 个模块）。
- 内存边界复现：上述三种不完整数组均通过 parseMaterialPack 后抛 TypeError；七段压力素材最后事件为 67490ms。
- 调用本地 Vite JSON 转换器验证非法 JSON，返回 Failed to parse JSON file；未改动实际素材文件。
- 未进行浏览器视觉验收、真实麦克风或真实豆包 API 验收；模拟测试不代表这些验收通过。

建议：先补齐素材边界校验、加载错误隔离与可见提示及相应测试，再作为面向非程序员的素材编辑功能验收。

日期：2026-10-13（Asia/Shanghai）

任务：第一步开发主页可视化豆包 API 设置。

已完成：
- 主页增加设置入口，支持查看配置状态、密码输入保存、更换、确认删除和测试已保存的连接；不回显已保存 Key，不写浏览器存储。
- 本机网关校验设置请求的 Host、Origin、请求令牌及正文，保存时保留其他环境配置，使用临时文件替换；下一次识别直接使用新 Key。进程环境 Key 优先且在页面只读。
- 设置操作与识别互斥；连接测试只检查 WebSocket 握手，不发送音频，支持超时及取消清理，不自动重连。
- 保留现有字幕、模拟素材、浏览器 ASR 及豆包识别流程；未修改 DeepSeek 跨会话记忆。

修改的主要文件：
- 新增 src/components/ApiSettings.vue：设置页面。
- 新增 server/apiKeyStore.mjs、server/apiSettings.mjs：本地配置保存、接口防护及连接测试。
- 修改 src/App.vue、server/index.mjs、server/asrGateway.mjs：入口及动态 Key 接入。
- 新增 tests/api-settings.test.mjs，更新 package.json、README.md、docs/ARCHITECTURE.md。

测试结果：
- npm test：八个测试脚本全部通过，新增覆盖保存/删除/重载、只读环境、非法请求、识别互斥、握手异常和清理、下一次识别使用新 Key。
- npm run build：TypeScript 和 Vite 构建通过（30 个模块）；沙箱首次阻止 esbuild，获准重跑后成功。
- npm run dev：网页 5173 与网关 8787 启动成功，提示尚未配置 Key。
- git diff --check：通过，仅有 Windows 行尾转换提示。

未完成或已知问题：
- 浏览器自动检查被工具 URL 安全策略拦截，未完成视觉与手动交互验收。
- 未使用真实 API Key、未调用真实豆包 API、未完成真实麦克风验收；模拟测试及握手测试不能替代实际识别验收。
- .env 为本机明文文件，尚未加密；当前设置仅供本机，房主共享与多人联机尚未实现。

下一步建议：在主页设置填写真实 Key，保存并测试连接，然后进入房间完成讲话、停止及异常验收；再开发房主授权共享和房间用量限制。

日期：2026-10-13（Asia/Shanghai）

任务：本地诊断豆包 ASR 用量异常，补充默认关闭的会话统计。

已完成：检查实际 AudioContext 采样率、16-bit LE 单声道编码、分包与网关转发、单连接限制、取消与旧回调清理。未发现导致时长翻倍的明确实现问题。增加 Request ID、开始结束时间、PCM 提交/发送完成字节及秒数、最新服务端 audio_info.duration 原值日志；不记录秘密、语音或文字。修正网关“握手后才采集”的不准确注释，实际为握手后才上传；发送回调错误会停止会话。未改变二遍识别配置和 UI。

修改的主要文件：server/asrDiagnostics.mjs、server/asrGateway.mjs、server/index.mjs、tests/doubao.test.mjs、README.md、docs/ARCHITECTURE.md。

测试结果：npm test 全部八个脚本通过。新增本地 WebSocket + 假上游测试：16k/44.1k/48k 每种输入 60 秒均转发 300 包、1920000 PCM 字节，即 60 秒；第二连接拒绝、停止清理、日志默认关闭、缺失 duration、累计 duration 不重复相加均通过。npm run build 首次沙箱 esbuild EPERM，获准重跑通过。

未完成或已知问题：没有调用付费 API，没有真实麦克风统计；既往 0.12 小时扣量没有会话日志，无法追溯实际上传量，不能确认异常根因。发送回调成功不等于服务端确认，duration 原字段不直接解释为计费用量。无本地 VAD，正常采集时静音仍上传；豆包无自动重连，断线需手动开启。

下一步建议：用户按 README 手动开启诊断，用单次会话日志对照控制台明细；先核对 PCM 秒数，再核对服务端 duration 与 Request ID。二遍识别计量差异仅为待验证假设，未经确认不关闭、不自动执行收费对照测试。

日期：2026-10-13（Asia/Shanghai）

任务：在主页 API 设置卡片加入本地语音用量统计，核对余额查询能力。

已完成：新增每秒本机轮询，显示最近/当前上传、服务启动以来累计、豆包返回音频时长、Request ID；卸载取消轮询，失败提示已有数据可能过期。统计不依赖日志开关、刷新保留、重启网关清零、更换 Key 不清零。余额标注尚未接入，不用估算值冒充余额。官方文档确认存在独立资源包状态、资金余额及 AK/SK 用量查询，未配置管理凭证、未请求账户数据。

修改的主要文件：src/components/AsrUsageStatistics.vue、src/components/ApiSettings.vue、server/asrDiagnostics.mjs、server/asrGateway.mjs、server/apiSettings.mjs、tests/doubao.test.mjs、README.md、docs/ARCHITECTURE.md。

测试结果：npm test 八个脚本全部通过；新增用量接口无缓存、跨站拒绝、密钥不泄露、连续会话累计（60秒+0.2秒）、最近会话状态和 duration 隔离验证。npm run build 通过（33模块）。

未完成或已知问题：未执行收费 API 或真实麦克风测试；未完成浏览器视觉验收。真实余额查询尚未接入，不能承诺现有语音 Key 可查询管理接口。现有服务需重启加载新增后端；本次未自动终止用户可能正在进行的识别。

下一步建议：重启服务后在设置中查看统计；如需真实剩余小时额度，再按官方资源包查询契约与最小只读授权接入，资金余额单独处理。

日期：2026-10-14（Asia/Shanghai）

任务：部署 Windows 本机常驻版。

已完成：增加 npm start 正式模式，在 127.0.0.1:8787 同时提供 dist 网页和本地语音网关；新增静态文件隔离与本机正式 Origin。安装当前用户普通权限的 HakiSub-Local 登录自启计划任务，无时间上限、禁止重复实例、失败最多重试三次。创建桌面 HakiSub.lnk，指定 Chrome 打开8787；启动任务成功，状态 Running。未改动 Key，未自动开启麦克风。

修改的主要文件：server/staticWebsite.mjs、server/index.mjs、server/asrGateway.mjs、server/apiSettings.mjs、scripts/start-local.ps1、scripts/install-local.ps1、tests/static-website.test.mjs、package.json、README.md、docs/ARCHITECTURE.md。

测试结果：npm test 九个脚本全部通过；npm run build 通过。后台任务启动后网页 / 返回200、用量接口返回200、/.env 返回404。静态文件模拟测试覆盖AR入口、路径拒绝、HEAD与方法限制。

未完成或已知问题：未实际重启Windows验收登录触发；未进行Chrome视觉和真实麦克风/豆包付费验收。休眠关机不可用；更新代码需构建并重启任务，移动项目需重新安装任务。常驻版与开发版共享8787，不能同时启动。

下一步建议：日常双击桌面HakiSub；下次登录Windows验证自动启动，再由用户手动验收麦克风。
日期：2026-10-15（Asia/Shanghai）

任务：排查豆包 ASR 2.0 约双倍扣量，先执行本地验证。

结果：复核网关使用 `bigmodel_async`、`volc.seedasr.sauc.duration` 和 `enable_nonstream=true`。本地模拟验证 16k/44.1k/48k 输入各 60 秒时，均只向假上游提交 300 包、1920000 PCM 字节（60 秒）；单连接和停止清理测试通过。当前常驻服务本次启动以来累计上传为 0 秒、无最近会话，不能追溯之前的扣量。尚未验证真实麦克风采集和云端计费，也未证明二遍识别会使计费翻倍。

测试：`npm test` 通过；`npm run build` 在沙箱中因 esbuild 子进程 `EPERM` 失败，按要求在沙箱外重跑通过。未调用付费 API。

下一步：用一次明确起止时间的真实麦克风会话，对比设置页最近上传秒数、Request ID 和控制台同期扣量；若上传时长与扣量接近两倍，再用相同音频和参数开关做受控对照。

同日真实会话补充：用户报告约 2 分钟测试中，控制台额度从 19.66 降至 19.63（单位若为小时，则显示差值为 0.03 小时，约 108 秒）。本机用量接口记录本次会话开始到结束约 98.8 秒，提交及发送回调成功的 PCM 均为 3155200 字节、98.6 秒；最新 `audio_info.duration` 原值为 98200。显示差值受控制台两位小数精度影响，不能当作精确计费秒数，但本次没有表现出约两倍扣量。用户估计的“2 分钟”与网关实际活跃约 99 秒有差异，后续以同一请求的音频字节数为准。静音是否计费尚未真实验证。

同日静默会话补充：用户报告开麦全程未说话后控制台仍显示 19.63。本机记录该会话约 106.7 秒，向上游提交及发送回调成功各 3404800 PCM 字节、106.4 秒，`audio_info.duration` 未返回。故“未扣费”不能归因于客户端未上传音频；但控制台显示精度、结算延迟和具体计量口径尚未排除，不能据此确认静音包永不计费。

同日复测讲话会话：用户报告小时实时额度由 19.63 降至 19.60。本机记录该次会话约 125.6 秒，提交及发送回调成功的 PCM 均为 4006400 字节、125.2 秒，最新 `audio_info.duration` 原值为 124400。显示差值 0.03 小时约 108 秒；考虑两位小数显示误差，本次仍未复现约双倍扣量。未据此推断静默段的最终计费规则。

同日断续讲话会话：同一麦克风连接约 5 分钟，用户每隔约半分钟说一句，小时实时额度由 19.60 降至 19.52（显示差值 0.08 小时，约 288 秒）。本机记录连接约 303.3 秒，提交及发送回调成功的 PCM 均为 9702400 字节、303.2 秒，最新 `audio_info.duration` 原值为 298800。扣量更接近整段上传时长而非仅讲话的短句总时长；两位小数显示仍限制精确比较。本次未出现约双倍计量。纯静音会话未显示扣量与本次结果的差异尚无确定机制解释。

用户补充旧异常会话的实际操作：说话约 3 分钟、空白约 3 分钟，全程没有关闭或重开麦克风。因本实现持续上传包括静音，这相当于约 6 分钟的单次音频上传；先前按“说话 3 分钟”与约 7 分钟额度比较，误把开麦空白时间当成双倍计费。旧会话无日志，约 7 分钟的精确差额仍无法追溯，但现有真实断续讲话测试支持按整段上传时间解释，不支持认定二遍识别翻倍。

日期：2026-10-15（Asia/Shanghai）

任务：豆包模式增加本地自动检测说话，避免长时间开麦时持续上传空白音频。

已完成：新增 `voiceActivityGate.ts`，在 200ms PCM 包上计算音量，连续两个包达门槛后连云端并补送起始缓冲；约 1.6 秒安静后经网关发送空负包，等待最终响应并关闭该连接。浏览器麦克风继续本地采集，下一句自动新建会话；手动关闭仍释放麦克风和连接。网关增加 `finish` 控制消息，UI 显示本地等待说话/识别状态。保留原二遍识别、统一字幕事件和浏览器 ASR 行为。README 与架构说明已更新。

测试：`npm test` 全部通过，新增模拟覆盖纯静音不建连、起始缓冲、安静结束、最终字幕、再次讲话重连与上一连接结束期间的讲话缓存；`npm run build` 通过。沙箱内构建曾被 esbuild 子进程 `EPERM` 阻止，在沙箱外重跑成功。空闲的本机常驻服务已重启，新网关健康检查与正式网页返回正常，用量统计从零开始。

未完成：没有调用真实付费 API，也未完成真实麦克风的音量门槛、尾音与连续讲话验收。音量判定可能因轻声漏触发或环境噪声误触发；未声称精确按说话秒数计费。用户刷新现有网页后才会加载新前端资源。

日期：2026-10-15（Asia/Shanghai）

任务：切换窗口或标签页时保持真实麦克风开启。

已完成：移除 `visibilitychange` 隐藏即停的处理；保留 `pagehide`、离房、模式切换与手动关闭时的清理。AudioContext 在浏览器短暂挂起时先尝试 `resume`，失败再报告采集故障。更新 README 与架构说明。正式网页已重建，常驻服务返回新资源且健康检查正常；此改动无需重启网关，已有浏览器页面需刷新。

测试：`npm test` 全部通过，模拟验证切屏保持麦克风、离页关闭、音频图暂停恢复；`npm run build` 在沙箱内因 esbuild 子进程 `EPERM` 失败，按要求在沙箱外重跑通过。未调用真实 API；切屏后的真实麦克风持续采集仍需用户在 Chrome 中验收，浏览器或系统强制暂停音频时无法保证后台识别。

用户随后报告断续讲话测试中小时实时额度由 19.50 降至 19.48。本地服务自重启以来累计提交音频 137.6 秒，最近一个自动分段会话为 3.2 秒且已结束、服务端 `audio_info.duration` 原值 3200。统计接口仅保留最近会话，不保存各分段列表，故不能把本次余额差值精确归因到所有分段；此次反馈未报告切屏后麦克风被关闭，仍未单独证明后台采集在各种系统状态下都可靠。

日期：2026-10-15（Asia/Shanghai）

任务：优化豆包自动语音检测的句首、短句与重连漏字风险。

诊断：现有采集持续运行，AudioWorklet 主动输出样本，不依赖后台 JS 定时器；漏字风险主要在本地检测和客户端队列。原逻辑按 200ms 整包 RMS 且连续两包达门槛，短字和轻声可能不触发。建连时虽有缓存，但就绪后一次性突发发送；快速连续讲话只用布尔状态记录结束，可能错置结束边界。浏览器收到 `ended` 后立即重连还可能抢在旧 WebSocket 关闭之前，被网关单连接限制拒绝。现有证据不足以认定豆包服务端分句本身漏字。

修改：`voiceActivityGate.ts` 用 20ms 子帧判断短语音，加入可调约 500ms 的环形前置缓冲；`doubaoAsrClient.ts` 用音频包与结束标记组成的有序队列，建连期间持续缓存，连接就绪后借持续采集逐步补发，等待旧连接真正关闭才重连。手动开关、字幕生命周期、省费断流与浏览器 ASR 保持原逻辑。核对了 EasySub 的 `mic-capture.ts`、`audio-worklet-processor.js` 与 AGPL-3.0 许可证：其后台防节流方案是音频线程主动出块，HakiSub 原有 Worklet 已符合这个方向，故未移植其代码。Silero 仓库许可证为 MIT，但本次无需增加模型依赖。

测试：`npm test` 全部通过，新增句首单字、60ms 轻声、短句、短暂停顿、长时间静音重开口、建连延迟、有序且不重复的补发、连续快速开口、尾部 Final 和网关释放连接名额模拟。`npm run build` 沙箱内因 esbuild `EPERM` 失败，在沙箱外重跑通过；正式网页已返回新构建。未调用真实 API 或麦克风，真实声学门槛及云端断句仍待单独验收。

日期：2026-10-15（Asia/Shanghai）

任务：记录一次手动开麦的累计时长与音频发送进度，用于对照间歇讲话测试。用户报告约 15 分钟间余额 19.48→19.43；这只是账户显示的变化，不能仅据此推算每段的计费规则。

修改：网关向当前本地 WebSocket 推送仅含 Request ID、提交音频秒数、发送完成秒数和豆包返回 `audio_info.duration` 的用量事件。客户端传到统一回调，房间按 Request ID 覆盖进度并累计所有自动断句连接；手动开麦时计时与统计清零，关麦后冻结，切换来源/模式或离房清除。无音频、文字或密钥持久化。README 与架构文档补充了字段边界和账单对照方式。

测试：`npm test` 全部通过，覆盖网关事件、客户端转发、多连接累计、同连接去重、关麦后迟到事件和重开重置。`npm run build` 在沙箱内因 esbuild `EPERM` 失败，按要求在沙箱外重跑通过。确认最近识别连接已结束且 8787 端口属于 HakiSub 后重启本地计划任务；健康检查正常，服务已返回新构建，网关累计统计随重启清零。未调用真实 API 或麦克风；页面上的豆包返回时长并非计费字段，仍需用户下一次真实测试核对。
日期：2026-10-15（Asia/Shanghai）

任务：按用户要求整理当前修改并推送 GitHub 仓库。

检查：`npm test` 全部通过；`npm run build` 在沙箱内因 esbuild 子进程 `EPERM` 失败，在沙箱外重跑通过。`git diff --check` 通过。确认 `.env`、`.env.local` 被 Git 忽略，并检查待提交文件未包含这两个环境文件中的实际密钥值。本次未新增功能，未调用真实 API 或麦克风；原有真实验收边界保持不变。

日期：2026-10-15（Asia/Shanghai）

任务：记录网页与安卓 App 必须保留豆包静音自动停止上传的产品要求，并调研 EasySub 与 Silero 的适用范围。

修改：README 增加跨平台共同要求，架构文档补充迁移边界，新增 `docs/cross-platform-audio.md`。明确豆包为产品默认路线、本地监听与云端断流的区别、静音结束与再次讲话恢复的验收要求，以及浏览器 ASR 的 800ms 限制并非已实现功能。记录 EasySub 的采集适配和 Worklet 主动出块、设备端 Silero VAD 候选、网关端检测的权衡和系统挂起时的超时兜底；区分当前已有实现与后续方案。核对了所列两个 EasySub 源码文件及两个项目说明，未复制源码、添加依赖、修改运行逻辑或调整 UI 默认选项，未调用真实 API 或麦克风。

验证：`npm test` 因本机尚未安装依赖、缺少 `typescript` 而未能执行测试；`npm run build` 因缺少 `vue-tsc` 未能执行构建。这些失败不能视为测试通过。本次仅修改文档，未为文档调研安装依赖。文档差异和链接路径已检查；跨浏览器、安卓后台、模型效果及真实用量验收均未进行。

同日要求澄清：在 README 与跨平台设计文档中明确“底层持续采集 + 上传前静音判断 + 每次开口句首保护”。补充首次及再次开口、建连与旧连接收尾期间的有界缓存、有序且不重复补送，以及前置缓冲/尾音允许包含有限静音的语义。扩展文字验收标准，不修改音频运行逻辑；`git diff --check` 通过。依赖缺失未变化，未重复运行已受阻的测试和构建。

日期：2026-10-15（Asia/Shanghai）

任务：落实豆包默认模式下的设备端人声判断、静音停止上传及每次开口的句首保护。

修改：安装并锁定 `onnxruntime-web@1.24.3`，随仓库附带官方 Silero VAD v6.0 模型、SHA-256及许可证；新增独立 Worker、模型流式适配和检测控制器。同源加载运行资源，单线程WASM不要求跨源隔离，不使用Web Speech API判断人声。模型每帧使用512新样本和64历史样本，保留循环状态及跨200ms包的余样本；每包最大概率用于开始0.5/续讲0.35门槛。继续使用约500ms起始缓冲、约1.6秒静音收尾、旧连接实际关闭后的有序重连与补发。保留底层持续采集，不保存用户音频或历史。

故障处理：检测器最多缓存25包且只允许一个在途请求，检查加载/推理超时及陈旧音频；模型失败、通信异常或积压时释放采集、Worker和云端连接，不退回持续上传。停止后忽略迟到结果。AudioContext改用设备默认采样率，仍由输出层重采样到16kHz。真实输入默认来源改为豆包，页面仍以模拟模式开始。新增dev/build资源准备脚本和正式服务器MJS/WASM类型支持，更新README、架构、跨平台设计与资源来源说明；未复制EasySub源码。

验证：`npm test` 全部通过，覆盖模拟与浏览器既有行为、上传队列与断流、首次及再次句首、加载中取消、模型错误/超时/积压/迟到清理、跨包帧连续性及真实模型WASM静音推理。`npm run build` 通过；最初沙箱内esbuild子进程被EPERM阻止，在沙箱外完成构建。最终构建分别通过无头Chrome和Edge检查：模型/Worker/MJS/WASM均同源加载，无跨源隔离和外部CDN；生成的静音模拟麦克风保持采集且零上传，手动关闭与模型加载失败均释放音轨。

公开样本补充：使用Silero官方示例 `https://models.silero.ai/vad_models/en.wav` 做离线模型检查，截取前5秒并与5秒静音交替两遍；20秒输入中41个人声触发包、13.6秒进入上传队列，两段均自动结束并再次触发。该结果只证明此样本的检测及会话边界，不代表中文轻声、短字、噪声准确率或真实计费。样本仅临时下载，未收入仓库。

交付：已构建并以 `npm start` 启动本机正式网页 `http://127.0.0.1:8787/`；当前尚未配置API Key，未开启真实麦克风或调用豆包。未安装登录自启任务、未公网部署、未打包、未提交或推送Git。真实麦克风、噪声、长时间后台、安卓适配与账单仍待单独验收。


日期：2026-10-15（Asia/Shanghai）

任务：制作专门的 HakiSub 产品说明网页，梳理最终功能方向与备忘；用户明确选择独立的私有在线网页。

实际修改：
- 新增 public/product.html、product.css、product.js，整理产品方向、体验示意、13 项功能及验收标准、字幕固定规则、建议路线、5 个待决策问题。
- 区分已有实现、待实测、待实现和待确认；明确多人房间仍为本机演示、真实单路收音、安卓与眼镜边界。新增方向及优先级为讨论草案，非既定需求或排期。
- 支持状态筛选、搜索、空结果提示、折叠问题、打印时展示完整清单，以及浏览器本地备忘保存和 Markdown 导出。备忘不跨设备同步、不修改项目功能状态；不接入麦克风、ASR 或密钥接口。
- 在 sites/hakisub-product/ 建立独立静态网站源码与站点身份，仅发布产品页及样式、脚本和部署声明；保留项目内同内容页面，主应用首页未增加入口。
- 更新 README.md、docs/ARCHITECTURE.md 与生成打包目录忽略规则。保留开始任务前已有的音频、VAD、网关等工作区修改，未编辑 DEEPSEEK-MEMORY.md。

验证结果：
- npm test 全部通过：字幕、模拟、布局、ASR、豆包模拟、音频、VAD、设置及静态服务；未调用真实麦克风或豆包 API。
- npm run build 最终通过。初次沙箱内 esbuild spawn EPERM，经授权在沙箱外构建成功；最终移除临时首页入口后再次构建成功。
- node --check public/product.js 及独立站点脚本通过。
- 浏览器本机页面成功加载，已观察窄屏排版；交互验证：待实测筛选 3/13，搜索“句首”后 1/13，不存在的关键词显示空结果，再恢复全部 13/13。
- 本次未实际验证备忘跨刷新持久化、下载落盘和打印 PDF 成品，未做完整多尺寸矩阵测试；上述限制不视为已通过。
- Sites 源码提交 8359835faa2c925d15cc6f40928f426e4319660a 已同步。打包包装器因 Windows 无可用 bash 命令失败，复用同一准备脚本 prepare-site-build.cjs 加 Windows 原生 tar 生成静态包，包内仅 dist 下 3 个网页资源及 .openai/hosting.json。
- 私有部署返回 succeeded，地址：https://hakisub-product-notebook.white-tick-5797.chatgpt.site 。站点 ID：appgprj_6ad0536b16e08191b92e3dc4114d7a30；部署 ID：appgdep_6ad05ba4caa481919b88faf0f29545c3。
- 已请求在 Codex 打开在线网页，返回 queued；在线登录后视觉效果未另行验收。未提交或推送 HakiSub 主仓库。

日期：2026-10-15（Asia/Shanghai）

任务：按用户要求整理并推送主仓库更新。

检查：重新执行 `npm test`、`npm run build` 均通过，`node --check public/product.js` 与 `git diff --check` 通过；未调用真实麦克风或豆包。提交范围包含本地VAD、静音断流、每次句首保护、固定模型与许可证、测试和产品说明页资源及文档。独立 `sites/hakisub-product/` 工作区已另行同步且无未提交变更，将其从主仓库忽略以避免误加入嵌套Git引用；主仓库保留 `public/product.*` 源文件并明确说明复制边界。密钥、依赖、构建产物及生成的WASM运行资源不纳入提交。

日期：2026-10-15（Asia/Shanghai）

任务：检查并理解今天的更新。

检查范围：今日提交 90a2794 与 f914426，核对音频采集、Silero Worker 与流式帧、检测门槛与句首缓冲、有序上传和静音结束、网关设置与用量统计、模拟素材模块及产品说明页。开始时主仓库工作区干净。本次未修改业务代码，仅追加本检查记录；未编辑 DEEPSEEK-MEMORY.md。

验证：初次 npm test 与 npm run build 因本机缺少新增 onnxruntime-web 依赖失败；npm ci 在沙箱内因缓存缺失失败，获准在沙箱外安装锁定依赖后，npm test 全部通过（含真实模型 WASM 静音推理）。npm run build 在沙箱内遇到 esbuild spawn EPERM，获准在沙箱外重跑通过。未开启真实麦克风、调用豆包、验证在线产品页或调整本机常驻服务；中文轻声、噪声、后台运行、真实计费与安卓仍需独立验收。

日期：2026-10-15（Asia/Shanghai）

任务：排查本机正式网页无法收音，提示“本地语音检测失败，已停止识别；不会自动切换为持续上传”。

原因与处理：确认用户使用 http://127.0.0.1:8787/。端口进程虽从当前 dist 读取新前端，内存中仍为旧静态服务实现，将 .mjs 和 .wasm 均作为 application/octet-stream 返回，导致浏览器拒绝执行模型运行模块。当前磁盘代码已有正确类型，故无需改业务代码。停止并重启 HakiSub-Local 后发现旧 Node 子进程（PID 17988）仍占端口、新任务退出码为1；核实其命令行是 F:\hakiSub\server\index.mjs --production，结束该指定旧进程，再启动任务恢复服务。服务重启清空内存用量，未读取或修改 Key。

验证：重启后实际8787地址的MJS类型为 text/javascript; charset=utf-8，WASM为 application/wasm。临时无头Chrome检查直接使用8787入口引用的Worker，模型成功初始化且10包静音推理通过；临时检查文件已删除。此前本次排查亦通过现有 vad-browser-smoke（模拟静音麦克风、模型与清理检查）；未访问真实麦克风或调用豆包，真实讲话恢复待用户刷新并验收。npm test 与 npm run build 已在同次会话前序检查通过，本次无业务代码修改，未重复运行。仅追加开发记录，未编辑DEEPSEEK-MEMORY.md。


日期：2026-10-15（Asia/Shanghai）

任务：按用户确认的多人同时开麦、分别识别并显示本人卡片目标，开始第一阶段真实房间通信及多成员 ASR 开发。

实际修改：新增 server/roomGateway.mjs 与 src/roomClient.ts，服务端创建/验证六位码、最多8人、成员身份和临时令牌、成员快照、统一字幕/撤回广播、心跳及离房销毁；新成员不补发历史，不保存音频和识别历史。App.vue 新增本地模拟/真实联网入口，联网时按服务端身份定位本人、独立开麦、只更新对应成员卡片、断线/离页停止采集和清空页面；保留本地模拟、浏览器ASR、字幕时间和布局行为。网关在房间令牌下允许每人一路、全局默认最多8路独立豆包会话，关麦/离房撤销本人连接；原本机无令牌入口保留单路兼容，与成员会话互斥。Vite新增房间WebSocket代理，卡片区分远端真实成员状态；README与ARCHITECTURE同步说明已实现范围和部署边界。保留任务开始前已有DEVLOG改动，未编辑DEEPSEEK-MEMORY.md。

验证：npm test 全部通过，新增 rooms.test.mjs 使用真实本地WebSocket和假豆包上游验证创建/加入/满员/销毁、八路并发上限、双路独立音频及识别结果、身份冒用防护、跨房间隔离、无历史补发、关麦/离房清理及令牌失效、客户端消息与清理；demo.test.mjs 补充本人并非首位成员、ASR令牌传递、本人/他人字幕回包、断线停麦和联网不混入模拟模式。npm run build 通过（沙箱内 esbuild spawn EPERM，获准沙箱外重跑通过）。

未验收与下一步：未调用真实麦克风或豆包，未验证账户并发额度、真实双设备同时讲话、串音及长时稳定性。没有部署、推送或重启本机常驻服务；当前进程仍可能是旧网关，不可据新dist判断其支持房间。服务仍绑定127.0.0.1且只允许本机Origin，后续完成公网域名/HTTPS/双WebSocket代理、访问与用量限制、管理员设置保护及禁用公网旧无令牌ASR入口后，再进行真实设备验收。房间临时令牌不写浏览器存储，部署不得记录包含session参数的ASR URL。


日期：2026-10-15（Asia/Shanghai）

任务：按用户要求开展阿里云第一阶段部署前审查和制定方案，服务器变更须另行确认。

实际工作：只读核对房间/字幕广播、成员ASR、采集与VAD、字幕清理、密钥设置、正式与开发启动方式、现有测试及工作区未提交状态。确认当前Node只监听127.0.0.1、Origin固定本机、无成员令牌ASR入口仍开放、共享测试端缺少管理员设置隔离，尚无Docker配置。Windows OpenSSH与ssh-keygen可执行文件已确认存在，未调用SSH、生成/读取密钥或访问服务器。新增docs/DEPLOYMENT-PLAN.md，规划单Node容器+宿主机回环发布+每测试者独立SSH隧道、初始资源和日志限制、服务端env注入、镜像白名单、权限边界、只读检查范围、回滚及分级验收；README/ARCHITECTURE增加方案入口。业务代码与其他项目未改，未编辑DEEPSEEK-MEMORY.md。

验证：本轮npm test全通过；npm run build获准在沙箱外执行并通过（既有esbuild子进程限制）。仅覆盖本地WebSocket、假上游、客户端/UI及音频测试，未调用真实麦克风或豆包。未构建/运行Docker镜像，未核实用户所述服务器版本及余量。尚未部署、修改SSH/安全组/防火墙/端口、创建远程目录或重启服务。下一步待公网IP、SSH端口、现有密钥状态与用户对SSH连接准备及只读环境检查的确认。


日期：2026-10-16（Asia/Shanghai）

任务：SSH已由用户通过MobaXterm验证登录后，准备阿里云私有测试部署包。用户只读输出显示目标目录不存在、sudo docker ps成功且无运行容器；此前截图显示x86_64、可用约1.1GiB内存、2GiB Swap、33GB磁盘余量，尚未由Codex远程独立检查。

实际修改：新增runtimeConfiguration.mjs，默认local保持现状，private-test限制本机Origin、关闭密钥设置与无成员令牌ASR、限制单房间及默认两路并发；index.mjs支持服务端监听配置，网关接收明确策略。新增Dockerfile、白名单.dockerignore、compose.yaml、空Key与发布配置示例；容器非root/只读、512MiB内存且不使用额外Swap、0.75CPU、64PID、日志轮转及自动重启，宿主机只规划127.0.0.1:18787映射。最终镜像只带ws、网关与dist，前端本地预构建。新增无密钥发布包脚本及逐文件SHA256清单，明确使用当前工作区完整代码；新增部署执行手册并更新README/架构/方案状态。未触碰其他项目、DEEPSEEK-MEMORY.md或真实Key。

验证：npm test全部通过（含新deployment.test.mjs，真实本地WebSocket验证私有模式设置404、无令牌拒绝、Origin、单房间及两路并发限制）；npm run build获准沙箱外执行通过；npm run package:private-test成功，发布包hakisub-20261015T160310Z.tar.gz（UTC编号对应北京时间2026-10-16），逐文件清单核验通过，归档列表无实际.env、密钥、Git或其他项目。归档列表读取的tar子进程遇到沙箱EPERM，获准沙箱外只读重跑通过。git diff --check通过。

边界：本机没有Docker运行环境，尚未实测Compose解析、Linux镜像构建或容器运行，基础镜像22-bookworm-slim仍为首次获取标签，启动前须记录并固定RepoDigest。没有连接服务器执行操作，没有创建远程目录、上传、开端口、启动或重启服务；所有远程变更仍待用户确认。没有调用真实麦克风或豆包，双人/8人真实验收待部署后执行。下一步先请求仅创建目标目录、上传校验解压发布包的授权，容器和隧道启动另行确认。


日期：2026-10-16（Asia/Shanghai）

任务：用户询问是否可自动化部署，改为准备一次执行的首次私有部署脚本。

实际修改：新增deploy/start-private-test.sh，无参数仅打印计划，--apply才执行；限制/srv/projects/hakisub及admin身份，拒绝符号链接配置、已有本项目容器和占用的18787端口，保留已有密钥配置；自动初始化空Key环境、锁定Node镜像摘要、静默校验Compose、构建/启动本项目并做HTTP检查。未自动录入Key、创建隧道或修改SSH/防火墙。打包脚本纳入新脚本，更新执行手册；旧已上传发布包不含此脚本，需单独补充上传。

验证：Bash语法校验及默认仅显示计划模式通过（沙箱Bash信号管道被阻止，获准本机沙箱外运行）；npm test、npm run build通过。脚本实际--apply分支和Docker仍未在实机运行验证，不将本地检查视为部署成功。没有连接或修改服务器，容器启动及回环端口映射仍待用户明确确认；不要求用户将口令或私钥交给聊天。


日期：2026-10-16（Asia/Shanghai）

修正首次部署脚本sudo预检：用户截图显示sudo -v要求密码，而sudo -n true无输出。不能据此推断所有sudo命令可免密，移除-v，改为sudo -n docker version实际验证Docker权限；全部Docker操作非交互，权限不足停止且不修改sudoers/SSH。修正条件内命令替换可能掩盖容器/端口查询失败的问题，改为独立赋值后检查。Bash语法及仅显示计划模式、npm test、npm run build通过，Bash/构建获准本机沙箱外运行。尚未远程执行修正版，无真实Docker/ASR验收，用户需先只读确认sudo -n docker权限，再补传修正版脚本。


日期：2026-10-16（Asia/Shanghai）

任务：用户要求优先使用服务器现有阿里云Docker加速器拉取既定Node镜像，失败再考虑本地构建上传；随后要求改为Windows自带OpenSSH直接管理，不再通过MobaXterm转贴命令。服务器文件删除、服务重启与开放端口须事先确认。

实际修改与检查：保持Dockerfile的node:22-bookworm-slim，首次部署脚本增加daemon加速器信息和最多3次拉取，每次90秒、间隔5秒，失败保留配置并停止。README、架构和部署手册同步说明镜像获取顺序、manifest inspect直连与daemon镜像加速器的区别、离线导入后禁止再次构建/拉取，以及实际阻塞。保留工作区原有未提交修改，未编辑DEEPSEEK-MEMORY.md。

连接状态：确认Windows OpenSSH 9.5p1、已有hakisub_aliyun密钥文件路径及known_hosts；未读取或输出私钥内容。通过获准的沙箱外原生SSH建立网络连接并匹配既有服务器指纹，服务器接受现有公钥，认证因私钥未解锁而未完成；复用Pageant代理也未取得可用密钥。按用户直接管理要求，经授权启用本机Windows ssh-agent，状态Running/Automatic，打开标准ssh-add本机隐藏输入窗口；记录时代理尚无identity，等待用户在本机解锁。已在artifacts准备hakisub-server别名片段，遵守“登录成功后建立别名”的顺序，尚未修改用户SSH config或服务器登录配置。

离线准备：本机无Docker；直接curl访问Docker Hub超时，Windows默认代理可访问官方registry。已核验官方原标签Linux/amd64清单可获取，将官方Google go-containerregistry/crane 0.22.1免安装工具下载到忽略的artifacts并按官方checksums校验，未安装/重装Docker，未构建或上传镜像。服务器镜像拉取失败与加速器配置来自用户已有终端输出，Codex尚未成功远程执行拉取，不能将manifest inspect直连超时解释为加速器必然不可用。

验证：npm test全部通过；npm run build在获准沙箱外通过，沙箱内原先因esbuild spawn EPERM失败；Bash语法与默认仅显示计划模式通过。本次仅调整部署脚本与文档，无网关、UI或音频行为变更。无真实API/麦克风、Linux容器构建或运行验收；未删除服务器文件、重启服务或开放端口。下一步在本机密钥解锁后自动执行whoami/hostname只读验证，成功后添加用户级连接别名并继续现有加速器拉取重试。

本轮完成更新（2026-10-16，Asia/Shanghai）：用户已在本机标准窗口解锁原有私钥。Windows自带OpenSSH成功执行whoami与hostname，确认admin和目标主机；随后用CreateNew新建原本不存在的用户SSH配置，建立并验证hakisub-server别名。全程保留既有私钥、known_hosts和服务器SSH登录配置。Windows本机ssh-agent已为Running/Automatic，后续直接使用原生SSH/SCP管理，无需用户转贴服务器命令。

镜像获取实测：Codex通过别名直接核实Docker29.9.1、Composev5.6.0、x86_64、约1125MiB可用内存、33GiB磁盘余量、18787空闲及当前仅hello-world镜像；服务器既有阿里云加速器连续3次docker pull原定node:22-bookworm-slim均返回not found。未修改daemon、Node标签或Docker安装。

离线实际交付：本机按官方checksums验证crane0.22.1，使用Windows默认代理获取原标签的官方Node22.23.3 Linux/amd64基础镜像，固定node@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562。ws8.22.0从官方npm下载并与锁文件SHA512核对；运行文件、Dockerfile及包文件28项与已测试快照hakisub-20261015T160310Z一致。组装最终server/dist/ws应用层，未执行Dockerfile的npm安装阶段，未安装本机Docker。完整归档85,066,240字节，SHA256为b1766599a7f9d4d377845b6c3613e765605b47e212a072aff310c56b6927d38a；crane完整结构校验通过，经原生SCP上传及服务器SHA256复核后docker load成功。原始config摘要836502a049818f093919d09a597827be58e0d7f1324903c7a44d74a1b80d199d与全部六层均核对一致；Docker29 containerd显示manifest ID f9c6bf8ca6a05e8e3f4422d69ee014c97549b55fb2df20bfed86126ba3a4f832，已区分记录。

容器验收：先用无网络、无宿主端口的临时只读容器验证Nodev22.23.3、UID1000、生产网页与VAD模型/MJS/WASM类型、设置404、无令牌ASR403、非许可Origin403、房间创建/加入及合成字幕广播，全部通过；不含真实上游或麦克风。用户明确批准启动和隧道后，Compose以--no-build --pull never创建本项目独立网络及容器hakisub-test-hakisub-1，健康检查healthy。实际资源限制512MiB且无额外Swap、0.75CPU、64PID、非root及只读根目录已核实，宿主端口仅127.0.0.1:18787。首次空闲快照24.9MiB、0.01%CPU，仅为瞬时空闲记录。

访问与收尾：本机隐藏原生SSH进程PID35232建立127.0.0.1:18787到服务器同端口的隧道，http://localhost:18787返回200，实际health configured:false；已请求在Codex打开页面。隧道PID保存在忽略目录artifacts/hakisub-server-tunnel.local，本机重启或进程关闭后需重建；容器独立常驻。项目.env仅将基础镜像字段固定为已验摘要，无服务重启或密钥回显。归档、OFFLINE-IMAGE与DEPLOYMENT-RECEIPT保留在本机artifacts和服务器项目images目录，README/ARCHITECTURE/部署手册与初期方案状态同步。未改安全组、防火墙、SSH登录规则或其他项目，未删除服务器文件、录音、保存识别历史、提交或推送Git。豆包Key配置、真实API/麦克风、双设备同时讲话、串音、长时负载及重启恢复仍待单独验收。


日期：2026-10-16（Asia/Shanghai）

任务：修复私有部署设置页持续显示“正在读取配置”、本机密钥表单及“设置服务不可用，请重启npm run dev”的错误提示。

原因与修改：实测部署health为configured:false、settings为404，这是私有模式关闭网页管理的预期策略；ApiSettings此前把非JSON的404当作开发服务故障，并无条件展示本机表单和用量轮询。现初次GET settings遇404时改查现有health布尔状态，后续刷新只查health，展示服务器统一管理说明，移除该模式的密钥输入/保存/删除/连接测试和用量组件，并在脚本拒绝设置写操作。加载状态区分读取中、可用和不可用，异常/超时可重试；卸载取消请求并忽略迟到404。本机设置、环境密钥只读和保存后清空输入继续保留。没有开放服务端设置接口或改动网关、ASR协议、字幕、音频和布局行为。

验证：新增tests/api-settings-view.test.mjs，以模拟fetch及真实Vue模板渲染检查私有只读、无写入/用量入口、本机保存/环境只读、异常/恢复/超时及卸载取消；纳入npm test。npm test、npm run build全部通过，构建沿用获准沙箱外esbuild执行。使用独立无Key发布快照在本机127.0.0.1:18788临时启动private-test，并在浏览器实际确认无旧错误或表单；该临时预览及测试标签页已清理。README、ARCHITECTURE及部署手册同步更新，未编辑DEEPSEEK-MEMORY.md。

部署：生成hakisub-20261015T172741Z快照及Linux/amd64完整镜像，仍使用已固定官方Node22.23.3和ws8.22.0。通过原生SSH/SCP上传到服务器images/对应新版本目录，校验发布包、RELEASE与镜像SHA256并docker load；config摘要3ac01612c299c96c0c2a9d2fab3b5fadc370be9fad91615bc34c2506799f9504核对通过，临时无网络容器全部冒烟检查通过。镜像归档SHA256为bb48897d86439991dfadc277f2b5f05b94cf2fa4a0e129baaa61fb91d7398f52，Docker29 manifest ID为20c61690ace0b9fc5ea831a3097522059f21d240b4f1f988d32504ee16a9e0fc。

用户明确批准更新服务后，仅切换.env发布标识并重建本项目容器，配置健康失败恢复旧版，实际更新成功未触发回滚。新容器healthy、node用户、只读根目录，仍仅127.0.0.1:18787，保留旧镜像和原密钥/资源配置。通过原有SSH隧道刷新用户页面，打开设置并点击刷新，实际显示“尚未配置API Key”及服务器统一管理说明，错误和持续加载已消失；截图保存在忽略目录artifacts/settings-private-deployed.jpg。宿主根目录旧发布文件保留，当前运行版本和新manifest位于images/hakisub-20261015T172741Z。未调用真实豆包或麦克风，未新增公网端口、修改SSH/防火墙、删除服务器文件、提交或推送Git。真实语音仍需服务器安全录入Key后单独验收。

日期：2026-10-16（Asia/Shanghai）

任务：用户要求直接上传服务器，达到他人点击公网链接即可进入的状态。

实际修改：runtimeConfiguration新增public模式，强制明确的非本机HTTPS Origin，拒绝路径、凭据和通配符，保留本机/私有模式校验；公网禁用网页设置及无令牌ASR，默认两路并发、最多100个房间。新增deploy/compose.public.yaml作为现有Compose覆盖文件，保留回环端口和资源配置；发布脚本包含覆盖文件和公网文档。扩展部署测试验证公网配置、合法Origin建房、非法来源/无令牌拒绝及设置404。README、ARCHITECTURE和PUBLIC-DEPLOYMENT同步实际进展。没有改UI、音频或字幕生命周期，未编辑DEEPSEEK-MEMORY.md。

验证：npm test全部通过；npm run build因沙箱esbuild spawn EPERM失败后，获准沙箱外重跑通过。git diff --check通过。发布包hakisub-20261015T174817Z生成成功，完整Linux/amd64镜像沿用已固定官方Node22.23.3和锁定ws8.22.0，crane validate通过。原生SSH确认服务器现有容器健康、80/443无监听；新发布包/镜像经SCP上传到本项目独立images目录，服务器SHA256核验通过，docker load成功。临时无外部网络、无宿主端口、无Key、只读非root容器通过生产HTTP、模型/WASM类型、设置404、无令牌ASR403、非法Origin403、双成员房间及合成字幕广播。详细哈希见PUBLIC-DEPLOYMENT.md和artifacts/OFFLINE-IMAGE.json。

未完成与阻塞：已向用户询问已有域名或无域名情况，尚未收到回复；未确定HTTPS入口、签发证书、安装代理或开放公网端口，因此不能声称已可供他人公网访问。新镜像仅预置，当前常驻仍为hakisub-20261015T172741Z且healthy，无重启。实际health configured:false，服务器Key未配置；未调用真实豆包API或麦克风，真实语音、双设备和公网WSS仍待验收。本机测试的HTTPS Origin字符串不等于TLS验收。没有上传密钥、修改SSH/防火墙、删除服务器文件、Git提交或推送。

日期：2026-10-16（Asia/Shanghai）

任务：按用户新约束为hakisub.xdstar.work准备免费HTTPS/WSS；广州服务器ICP未通过前保持不公开，后端不得新增公网端口。

域名核查：用户02:44:33控制台状态为持有者未实名认证及clientHold等；公共Google DNS对主域名NS、子域名A/AAAA返回NXDOMAIN，直接向记录中的dns17.hichina.com查子域名A/AAAA也未找到。独立RDAP确认注册商阿里云、注册2026-10-15T18:01:20Z/到期2027-10-15T18:01:20Z、NS dns17/dns18.hichina.com及clientHold/clientRenewProhibited/两项转移限制/addPeriod。CAA权威核查未完成：Windows枚举不支持，Node DNS访问ECONNREFUSED；不推断无CAA。公开状态不证明全部Hold原因，已提供实名关联模板、检查邮件/工单、备案与后续DNS步骤；不替用户提交证件或备案材料。

修改：新增deploy/caddy/Caddyfile，指定免费Let's Encrypt、全路径反代回环18787及自动WebSocket，关闭admin/HTTP3，不开访问日志并过滤request。新增独立compose.caddy.yaml，默认public-web profile未启用，ICP确认值默认no，镜像固定为实际验证ID，证书/config持久卷及128MiB/0.25CPU/最小能力限制。新增public.env.example，更新白名单打包脚本、README、ARCHITECTURE和PUBLIC-DEPLOYMENT。没有修改UI/音频/网关，未编辑DEEPSEEK-MEMORY.md。

实际验收：npm test全部通过。npm run build沙箱esbuild EPERM后，最初审批额度不足导致不能升级；恢复后获准重跑通过。打包脚本node --check、git diff --check通过。官方Caddy2.11.6-alpine固定registry清单86d4376a…，核对config和5层、crane validate通过；SCP上传到服务器images/caddy-preparation-20261016后核验归档SHA256并docker load。Docker导入ID b8109060…与原registry/归档manifest不同，纠正初次使用f1349d3c…导致No such image；RootFS全部diff_ids与官方config一致。临时容器仅cap_drop ALL导致带文件能力的Caddy执行EPERM，按生产Compose保留NET_BIND_SERVICE后，在无网络无端口只读128MiB/0.25CPU容器中caddy validate返回Valid configuration；隔离空Key环境三份Compose config --quiet通过。详细完整摘要见PUBLIC-DEPLOYMENT.md及本机/服务器CADDY-IMAGE.json。

边界与收尾：只上传、导入和离线验证Caddy，未安装常驻代理、申请证书、修改DNS或防火墙。最后ss确认80/443无监听，现有hakisub-test-hakisub-1健康且仅127.0.0.1:18787。无真实HTTPS/WSS、证书续期、豆包API或麦克风验收，服务器Key上次实测为空。剩余条件为域名实名、暂停解析原因处理及ICP备案通过，随后才配置A记录/开放80与443/启用Caddy并验收；8787/18787不向公网开放。不提交或推送Git。

日期：2026-10-16（Asia/Shanghai）

任务：按用户要求汇总上述累计更新，完成本次 Git 提交与远端推送前检查。

本次归档范围：多人联网房间、成员身份与独立ASR会话、统一字幕广播及离房清理；本机/私有/公网运行配置与限制；Docker与Compose、无密钥发布包及首次部署脚本；私有部署设置页只读状态和加载异常修复；Caddy免费HTTPS/WSS及备案前默认禁用配置；对应模拟测试、README、架构与部署执行记录。保留模拟模式和既有字幕生命周期，未修改DEEPSEEK-MEMORY.md。

本轮验证：npm test全部通过，包含房间通信、成员隔离、独立音频、部署策略和设置页模拟测试；npm run build首次受沙箱esbuild spawn EPERM限制，经授权沙箱外重跑通过。git diff --check通过；35个待提交文件的常见凭据格式检查未发现可疑内容，环境文件、密钥、artifacts及构建产物保持忽略。git fetch origin成功，提交前HEAD与origin/main一致。本轮仅整理、验证和Git交付，未重新部署或操作服务器。

验收边界：既有记录显示私有测试版已部署；公网应用镜像和Caddy仅准备完成，域名实名、暂停解析原因处理及ICP备案仍待完成。真实HTTPS/WSS、豆包API、麦克风、双设备与长时稳定性未在本轮验收，不能将自动化测试通过视为这些验收完成。

日期：2026-10-20（Asia/Shanghai）

任务：用户确认xdstar.work备案通过（鄂ICP备2026059859号-1），要求HakiSub作为主站小板块；用户选择主站入口卡片跳转hakisub.xdstar.work，确认尚无主页。

实际修改：新增deploy/xdstar/中的独立HTML/CSS/SVG主页，展示HakiSub介绍、入口、明确标注的字幕界面示意及真实备案链接；自适应手机/桌面，无外部字体、脚本、统计或音频。Caddy新增根域名静态服务及仅作用于主站的安全头，保留子域名全路径HTTPS/WSS代理。Compose新增主页只读挂载；发布白名单包含主页目录，public.env示例修正过期的尚未备案注释。README、ARCHITECTURE和公网部署文档同步；未编辑DEEPSEEK-MEMORY.md，未改变应用UI、网关、采集或字幕生命周期。

检查与验证：npm test全部通过；npm run build首次因沙箱esbuild EPERM失败，经授权沙箱外重跑通过。打包脚本node --check、git diff --check通过。浏览器413px手机布局和1280px桌面视口检查无横向溢出，正确显示入口与备案链接，截图保存在artifacts/xdstar-home-mobile.png及xdstar-home-desktop.png。

服务器准备：SSH确认当前私有容器healthy，回环18787及health configured:false，80/443无监听，UFW inactive且INPUT ACCEPT。新主页/配置包SHA256 b2d710076cc8236709334fa485c4372a1f58d01a1187ab6215ce8111688e0a5c经SCP上传至images/xdstar-public-web-20261020并复核，根deploy保留备份后更新。双域名Caddy在无网络无端口临时容器验证成功，三份Compose解析通过；第一次临时命令遗漏caddy程序名，修正后通过。既有公网兼容应用镜像174817Z在无网络无Key非root只读临时容器通过网页、VAD、设置404、非法Origin/无令牌ASR拒绝与双成员合成字幕广播。

上线执行：用户随后完成@/hakisub两条A到8.138.171.235并确认云防火墙TCP80/443放行，权威/公共/服务器DNS复核一致，CAA均ENODATA。根.env备份为images/xdstar-public-web-20261020/environment.before，保留原镜像及deploy备份后，通过已校验的三份Compose启用双站Caddy并切换174817Z公网应用。现应用healthy、非root只读、512MiB/0.75CPU且只映射127.0.0.1:18787；Caddy只读128MiB/0.25CPU，证书/config持久卷及80/443监听，未开放2019或后端公网端口。两个Let's Encrypt YE1证书签发成功，有效期至2027-01-18；实际续期周期尚未经历。

公网验收：服务器外Node及Windows curl开启证书校验，完成两站HTTPS200/HTTP308、主页资源/入口/备案、应用资源及VAD模型/MJS/WASM类型、WSS建房/加入/合成字幕/跨房间隔离/断线清理、非法Origin（包含主站跨源访问）与无令牌ASR403、设置和.env404，全部通过。签发前HTTPS首次握手失败，证书就绪后通过；沙箱代理不可用时获准在沙箱外验收。内置浏览器线上导航两次超时，未声称线上UI已实测；本地视觉及相同页面公网内容均通过，正式主站打开请求返回queued。Key仍configured:false；未调用豆包API、麦克风或两台设备讲话，真实识别及长时稳定性待验收。

发布归档：npm run package:private-test成功生成hakisub-20261020T130656Z（SHA256 8986dd40b908611a2ed0638569f7d0340feac5b4e1f9bc73bd9ce04139ccd97b），清单确认包含三份主页文件；它是本轮构建/文档归档，未制作或部署新应用镜像，运行版本仍174817Z。未上传本机密钥、保存识别历史、修改SSH或其他项目，未提交或推送Git。

日期：2026-10-20（Asia/Shanghai）

任务：按用户要求先改本地再同步服务器：默认真实联网；房间内配置豆包；首页保留房间与房间码，全员退出后仍能再次进入。

本地实现：App默认online，创建后自动打开房内配置，返回首页保留房间入口；rememberedRooms仅保存房间码/显示名/创建者管理凭据，不保存API Key/成员令牌/字幕。roomGateway全员离开不销毁房间；成员关闭仍立即撤销令牌、释放ASR且不补发字幕。随机创建者凭据只发给本人，服务器持久化SHA256摘要，原浏览器再次加入校验管理身份。消息在异步磁盘入队前限流、创建资料保存成功后才允许加入。

房间配置与存储：新增RoomApiSettings原生模态弹窗和roomSettings认证接口，有效成员只看状态，创建者可保存/移除/握手测试，输入提交或卸载后清空；Origin、Bearer权限、大小/格式、全房关麦与更新互斥均由服务端执行。房间Key优先，未设置时兼容旧服务器默认Key并显示来源。roomStore以AES-256-GCM、独立nonce和房间码AAD加密Key，同目录原子替换且串行写入，失败保留旧配置；成员/音频/字幕不落盘。主密钥仅来自服务端环境或根.env，本机首次初始化带锁；Linux初始化脚本在服务器生成主密钥并初始化只读容器的数据卷，Dockerfile和Compose同步。

本地验证：npm test全套通过，新增persistent-rooms及room-settings-view覆盖重启恢复、加密/不回显、房间Key路由、创建者/成员/非法Origin、写失败保旧、忙碌保护、旧令牌失效、真实Vue模板与浏览器存储。npm run build通过（获准沙箱外），未改变音频处理或字幕时间规则，保留模拟/浏览器ASR。隔离生产预览使用无效测试值，浏览器实际完成创建、保存、全员退出、刷新、再次进入及权限恢复；390px手机和桌面配置弹窗无横向溢出，截图在artifacts/room-api-mobile.png、room-api-configuration.png和rooms-home-retained.png。未测试真实API、连接握手或麦克风。

实际部署：生成hakisub-20261020T133934Z，包SHA256 e16a6c611276f5d2802df54fb3011871702fb036df24980d9c5b7fad8e865bdc。官方固定Node22.23.3/ws8.22.0离线镜像归档SHA256 75fd4a6bd71f57770a2699625056950986117acb794206dafc00b06a7eb5cbf0，config摘要058501a67250a2716738e4a4da6dcdc9670f42c1e155e6e8e7443069166bec19，27份运行文件核对及crane validate通过。上传后服务器复核SHA256、docker load及无网络无真实Key临时容器网页/VAD/设置404/Origin/房间验收通过。

备份原根.env/compose/server.env到本次images目录，安全保留原Key；服务器本地生成房间主密钥（不显示），初始化带Compose标签的hakisub-test_hakisub_room_data并同步新compose/init脚本。只重建HakiSub，Caddy/主站不重启，应用healthy、node、只读根目录、512MiB/0.75CPU、回环18787；数据卷仅/app/data可写，服务器环境文件仍0600。旧镜像及环境保留，未触发回退。

公网实际验收：通过可信HTTPS/WSS读取新版JS并创建测试房间，创建者可写而普通成员写入403、状态不回显Key；全员退出后再次加入和配置保留正常。无效合成Key在实际卷内验证非明文，真实重启应用一次后恢复原房间/创建者/配置、旧成员令牌403且无字幕历史，随后移除测试Key。完整两站HTTPS/HTTP跳转/资源/房间广播/隔离/断线清理/非法Origin/旧设置关闭回归通过；首次Windows主站DNS短暂ENOTFOUND，权威/公共DNS核验后重试通过。没有调用真实握手、豆包识别或麦克风；保留少量空测试房间元数据，不存识别历史。主站保持在线，health configured:false指服务器默认Key未配置，房间状态改由新接口提供。

边界：旧版临时房间需重建；新持久资料上限100房（含空房），尚无解散/清理入口。创建者凭据限原浏览器，清除浏览器数据后尚无身份恢复；恢复须同时保留主密钥和数据卷，实际完整备份恢复未演练。真实API/麦克风/双设备/长时稳定性待验收。未编辑DEEPSEEK-MEMORY.md，未提交或推送Git。

日期：2026-10-20（Asia/Shanghai）

任务：修复网页版点击麦克风后停在准备状态，随后报“本地语音检测积压”。截图房间985529；仅只读检查其Key已配置及服务健康，不读取或显示Key。内置浏览器读取线上页超时，没有把它写成线上UI验收。

原因及修改：采集与本地模型同时启动，speechDetector在模型未ready时也用25包/5秒的运行期队列限制，加载稍慢即报积压，20秒模型超时尚未到就已失败。改为模型加载期间只滚动保留最近3包（约600ms）；ready后按序处理这些最近片段，丢弃等待期旧包。运行期积压/陈旧音频/单包超时及加载失败均继续停止并清理，不放开持续上传。本人卡片启动时明确显示“麦克风准备中”，图标和底部按钮都可取消，底部不再在准备中误显示已开启；只有listening才显示麦克风开启。

验证：新增12秒/60包慢加载回归，确认只保留最近3包且不误报积压，原有运行期故障/队列/取消测试继续通过；卡片实际Vue模板验证准备中/取消及开启状态。npm test、npm run build通过，构建获准沙箱外执行。隔离浏览器验收页面使用本页合成静音替代getUserMedia，拦截所有ASR连接，并将真实Worker初始化延迟12秒；实际浏览器AudioContext、Worklet、重采样、Silero WASM推理经过准备状态后进入listening，持续静音15秒未报积压、云连接0，关闭后回到idle。截图artifacts/microphone-startup-fixed.png。没有访问真实麦克风或调用豆包。README和ARCHITECTURE同步，未编辑DEEPSEEK-MEMORY.md。

部署完成：hakisub-20261020T140219Z发布包SHA256 b59f7eb7dfe87f2f06e68a0d2434f9d14ee15d3a4dd227d499eff159181a8212，固定Node22.23.3/ws8.22.0离线镜像SHA256 41e49b8f95d87835c2b6dfc914165c894bbb81da6ddfbd1ca7b52be83a668c86，config 9e82f045419443e077c4b236a5e7d6ee3eeb1afb532650584520feb2b2968c1c。27份运行文件、crane、上传后哈希及无网络/无真实Key临时Linux容器验收通过。备份原根.env及加密rooms.json，只更新发布标识并重建应用，失败回退未触发；主密钥、卷、Caddy和主站保持不变。最终healthy、仅回环18787，截图中的房间985529及其加密Key仍存在。

公网验收：新JS index-CwKlPyyj.js与本地构建逐字节一致、准备中/取消开启文字可用，两站可信HTTPS/HTTP跳转、应用/VAD资源、WSS房间广播/隔离/断线清理与Origin/旧设置限制全部通过。没有自动使用用户Key测试握手、上传音频或调用ASR；真实讲话与设备权限待用户刷新重进后验收。未提交或推送Git。

日期：2026-10-20（Asia/Shanghai）

任务：继续修复用户报告的无检测，用户随后确认错误为“本地语音检测模型加载超时”。明确故障尚在本地VAD准备，未进入豆包；服务器原资源200且容器健康，原始模型2327524字节、WASM12361745字节。旧20秒启动保护无法容忍较慢下载/编译；未获取用户端实际分阶段耗时，不断言具体浏览器故障。线上浏览器读取再次超时，故没有把它写成线上UI验收。

修改：新增vadAssets.ts版本化同源URL和有界流式下载，按解压后长度累计并校验完整字节；Worker并行下载模型/WASM，直接传ORT的wasmBinary和模型字节避免重复请求。页面显示运行库/下载百分比/初始化；speechDetector改为下载30秒无进度、初始化60秒、总准备180秒保护，保留600ms加载滚动缓冲、运行25包/3秒推理/5秒陈旧保护。doubaoAsrClient把采集30秒单独计时，已授权采集不再被旧30秒总启动时限中断；取消/故障仍终止Worker并释放音轨，不降低VAD门槛、不改持续上传。prepare-vad-runtime生成四份gzip，静态服务协商编码并添加Vary/长度，版本化公开资源长期缓存、HTML仍no-cache；打包校验gzip存在，Git忽略生成文件。README、ARCHITECTURE、资源说明和部署记录同步。

本地测试：npm test及npm run build全部通过，构建获准沙箱外执行；新增流式进度/压缩头长度/404/截断/超长/取消、虚拟60秒下载加45秒初始化、停滞/绝对时限/错误阶段/迟到进度、静态gzip协商/禁用q=0/HEAD/缓存回归。可选浏览器脚本同步默认模拟选择及带版本的模型拦截，但未执行该Playwright脚本。

实际隔离浏览器：artifacts/vad-download-bench使用本次dist正式构建，WASM gzip分40秒传输，实际下载/模型初始化通过并进入等待说话；合成静音44秒未建ASR连接。Windows内置TTS普通话经真实AudioContext/Worklet/重采样/Silero后触发一次本地假ASR连接，505600字节输入和模拟字幕返回；截图artifacts/vad-download-speech-proof.png。关闭后流0，重开命中缓存，WASM下载总次数仍1，静音40秒无新增上传，最终两路测试流均释放。离线同样本20秒组合输入46个人声触发包、14秒进入队列、两次开口均结束。全部为合成人声/假ASR，未录真实麦克风、未读取用户Key、未调用真实豆包。

部署：hakisub-20261020T142427Z包SHA256 530b3a2a16c586cd034e6e0cdc24fe20062602c258013a7548042c8522a8d278，镜像归档SHA256 d814ec4037fc0deb7a83bff48e919ac091b84efbba6278735c7eb5337eb42d2c，config e394552b5d62f8ec975bf05d83945a621c880679a931527617f834c08f71a858。固定Node22.23.3/ws8.22.0、31份运行文件、crane和上传哈希、无网络无真实KeyLinux隔离验证均通过。原镜像下载稍慢最终正常完成，没有执行备用基础层拼装。备份根.env和加密房间数据后仅重建应用，回退未触发；原房间985529及其加密Key保留，主密钥/卷/Caddy未改。最终healthy、node、只读根目录、512MiB/0.75CPU、127.0.0.1:18787。

公网验证：index-tVTPFNyA.js与本地逐字节一致；四份资源5127529字节gzip传输，编码/缓存/Vary/压缩及解压哈希均正确，HTML no-cache。两站HTTPS、跳转、资源、WSS房间广播/隔离/清理/Origin/旧设置回归通过。真实设备/麦克风/豆包尚未验收，需用户强制刷新重新入房并等待就绪。未编辑DEEPSEEK-MEMORY.md，未提交或推送Git。

日期：2026-10-20（Asia/Shanghai）

任务及范围：用户反馈延迟和偶发“无法连接本地语音网关，请运行npm run dev”导致停止；后续确认体感不到一秒可接受、取消延迟调优。保留现有识别参数、200ms分包、每步最多补发两个包、500ms句首和1.6秒静音收尾。服务器只读检查healthy、无重启/OOM、低负载；没有当时HTTP握手状态码，不能确认所有断线的实际原因。核对官方双向流式优化版与二遍说明后没有更换接口或参数。

修改：asrGateway在识别cleanup立即标记asrStopped并释放本人占位，升级只统计有效识别；旧Socket的close引用检查保留，避免清掉后续新占位。此前识别已停而Socket关闭握手未完成期间仍占有效名额，可能拒绝下一句。新增gateway-recovery.test让旧客户端pause、不回close帧，验证本机/联网下一句可及时进入、旧close不影响新占位、重复连接仍403。

doubaoAsrClient对网页到网关的传输error/异常close/send异常恢复：250/750ms退避，滚动30秒最多两次，采集/VAD保持；仅保留未交给WebSocket的队列，已发送语音不重放，旧Interim撤销、Final保留；无待发送音频时回本地等待，不空建豆包会话。连接编号和代次防迟到事件、错误及close双事件重复恢复；手动关闭/离房取消计时器；服务端明确错误、模型/采集故障或积压仍停止，耗尽后提示服务器网关和重新入房。App仅豆包reconnecting继续发送mic:true，避免恢复时误广播关麦导致服务器撤销ASR。没有修改浏览器ASR重连行为或字幕生命周期；中断片段可能不完整，不承诺无损恢复。

验证：npm test全套及npm run build通过，构建获准沙箱外。新增模拟覆盖首次握手失败保留有序队列、发送后断线不重放、迟到ready/close、两次上限、手动取消、send异常和无语音不空建连接；真实Vue逻辑覆盖恢复期间本人mic:true。隔离正式构建用系统合成人声、实际AudioContext/Worklet/Silero和假网关，第一次握手503后自动恢复一次、收到一条模拟字幕、采集流保持1，停止后0。首次测试的旁栏观察器选择了错误节点，修正验收脚本后重验，恢复状态已观察、握手失败1、有效连接1、模拟字幕1；截图artifacts/gateway-recovery-browser.png。未访问真实麦克风或豆包，未读取用户Key。README/ARCHITECTURE/部署记录已同步。

部署hakisub-20261020T144728Z：包SHA256 93cec73dfee50c01eac3c6c9c67d9d1b670030b2ca738ab37906a79868354a21，镜像归档SHA256 ba00e0437baeb21f7448a04a89b4b94d23c3b16f7f670b21c93d80c3f4048adc，config efd8be574327979135c09f1c9235b611e9cc5d38501ccdbea286a0ca31808a9c。31份运行文件、固定Node22.23.3/ws8.22.0、crane、上传哈希均通过。服务器两个无网络/无Key/非root只读临时容器分别通过生产网页/模型/房间检查和旧close竞态（本机与联网）验证，之后备份根.env和加密rooms.json，仅重建应用，失败回退未触发。原房间985529和加密Key仍存在，主密钥/卷/Caddy不变。

公网JS index-B1z7ZHrn.js与本地一致，恢复文案存在、原npm run dev错误文案消失；四资源压缩/缓存/解压哈希、两站TLS/跳转/WSS广播/隔离/清理/Origin/旧设置限制回归通过。最终healthy、node、只读根目录、512MiB/0.75CPU、回环18787。真实识别/断线和网络效果待用户刷新重进观察，未调用真实API、未编辑DEEPSEEK-MEMORY.md、未提交或推送Git。

日期：2026-10-20（Asia/Shanghai）

任务：按用户明确要求将真实房间985529无痛换为114514。只读预检原房间/配置存在且目标未占用。AAD绑定房间号，单改JSON会破坏Key解密；浏览器房主凭据按旧号码保存，也需同步兼容。

实现：roomStore新增可选aliases兼容旧version 1，校验所有正式/别名六位码互斥；renameRoom经串行原子写入保留ownerHash、以新号AAD重加密同一Key，并将旧号存为别名，不复制第二间房。save保留别名，创建房间避开别名。roomGateway旧新码解析同一room对象，joined仅向成员返回号码别名；未新增公开改号API。rememberRoom合并旧新入口并保留ownerToken；App直接新号但仅有旧凭据时最多补验一次，失败不无限重连。新增服务器CLI renameRoom.mjs默认只读预检，--apply供停服维护使用；脚本仅输出保留状态布尔值，不输出Key/管理凭据，重复执行识别已完成。音频、字幕、识别参数、重连流程未改。

本地测试：npm test和npm run build通过。新增room-renaming.test覆盖实际AES-GCM、只改号解密失败、目标冲突/非法号文件不变、Key不明文/重加密、房主保留、旧新码同房/配置只读权限/合成字幕广播、更新Key保留别名/连续迁移/别名防占用、CLI预检及幂等无泄露。CLI子进程被沙箱限制，获准沙箱外通过同一测试与全套回归；Vue逻辑/rememberedRooms/RoomClient同步测试房主补验、最多一次及入口合并。隔离正式构建实际浏览器用合成资料完成旧985529首页记录→直接114514→可管理原配置→返回首页唯一114514房主入口，截图artifacts/room-renamed-home-proof.png；未使用真实Key/麦克风/豆包。

部署hakisub-20261020T150521Z：包SHA256 642a5c3dea267a0f34da2ca8c92191fdd41376a7bcb3ff9dccc538826bb0cc00，镜像归档SHA256 4cd6608946f25b287596d922e82ecc329b948f9779e53c218aa58b9e4a678f2a，config f9295277137ef164a6cd0384c95bef3cdb90396fa6f014120641bd157f6edf4b；32份运行文件、固定Node22.23.3/ws8.22.0、crane及上传哈希通过。服务器两个无外网/无真实Key/非root只读临时容器通过生产网页检查与完整迁移CLI/别名/房主/广播测试。真实维护前预检原配置、目标空闲、UID1000及备份权限，保存root.env、server.env和停服后rooms.json备份至images目录，仅服务器保留，文件0600。

实际迁移停服窗口3秒：CLI确认同一Key内容、同一ownerHash、旧入口保留，数据量未增加；切换应用并恢复healthy，回退未触发。主密钥/数据卷/Caddy/识别配置不变，node用户、只读根目录、512MiB/0.75CPU、127.0.0.1:18787。真实旧985529与新114514通过公网WSS均返回canonical114514并进入同一成员列表；配置仍room/已配置，验收成员只读、响应无Key。新JS index-BJ06bT-s.js与本地一致，完整HTTPS/WSS/模型压缩/隔离清理/Origin回归通过。检查期间只查看结构/配置布尔值，不记录在场字幕，不调用ASR。保留少量回归空房元数据，无字幕历史；用户刷新重进后首页更新，手动开麦。未编辑DEEPSEEK-MEMORY.md，未提交或推送Git。

日期：2026-10-21（Asia/Shanghai）

任务：联网房间进入后使用独立六位数字地址，左上增加仅图标分享按钮。

修改：roomNavigation.ts解析房间路径、构造不含查询参数/凭据的正式分享URL，并封装系统分享、Clipboard回退、取消与受限结果。App初始直达链接预填房间号及已有显示名；joined后从首页pushState、直达或别名replaceState为正式号。返回首页/前进后退清理房间和麦克风，刷新/关闭及异常断线保留地址，重进仍手动开麦。分享按钮有aria-label/title、复制状态提示和受限时只读地址，离房取消迟到反馈；模拟模式保持原流程且不显示分享按钮。静态服务仅对白名单六位路径提供HTML，其他未知/敏感路径仍404。README、ARCHITECTURE同步。

验证：npm test全套、npm run build通过，新增路径/无凭据URL/系统分享/复制回退/取消/权限失败、历史切换清理/别名规范/刷新保留/迟到分享回归；追加交互回归单独执行通过。实际内置浏览器使用本次dist及隔离网关，/114514/直接打开预填加入，输入合成名称后进入，左上图标无可见文字，点击显示链接已复制，返回首页地址为/、后退到/114514/恢复加入表单而不自动开麦。截图artifacts/room-link-share-proof.png。未采集真实音频、调用豆包或发送第三方分享。

部署：hakisub-20261020T173624Z，包SHA256 36c7ca646b14e0f74823a49f9bfcaadbbe2c8ce0da6320baae9104d9e9289aa1；镜像归档SHA256 fa083dd061cb09091c019823e0ba4d4caad09174f0782e158bd818ff1b0c33a6，config 49a9815cdab56a558e7f46f0ea89b077f72d17ff053ee6241f19dcce451695b8。固定Node22.23.3/ws8.22.0、32份运行文件、crane及上传校验通过；无外网/无真实Key临时容器通过深链接和现有网页/房间/模型检查。备份根.env与加密rooms.json，仅切换应用镜像；旧版本及回退环境保留，未触发回退。房间114514、985529别名和加密Key仍存在，主密钥/数据卷/Caddy保持原状。

公网验证：/114514/、/114514、/985529/及带查询参数直达均200且与根页相同，HEAD正确、HTML no-cache，非法位数/子路径/敏感路径404；index-DhETaCY6.js与本地构建逐字节一致（SHA256 e19130d339afa41c592507dc066fe828b3fe0847b4c9625a825b162a3e1f7aaf），分享图标文案可用。两站可信HTTPS/HTTP跳转、WSS测试房间创建/加入/广播/隔离/清理/非法Origin/旧设置限制及四份VAD资源gzip/缓存/哈希通过。浏览器补验刷新后预填已有名称和房间码，再次进入可复制完整/114514/地址；测试仅隔离网关与合成身份。未编辑DEEPSEEK-MEMORY.md，未提交或推送Git。

日期：2026-10-21（Asia/Shanghai）

任务：xdstar.work统一账号系统；先完成现有架构审查，再按用户补充继续本地开发。保留已有大量未提交改动，不编辑DEEPSEEK-MEMORY.md，不提交或推送Git。

审查：通过现有SSH别名只读核实Star-Hub Ubuntu24.04.5、2CPU/1613MiB、可用约1068MiB、31GiB磁盘余量；仅HakiSub/Caddy两个运行容器，无已运行数据库服务。Node22.23.3/Docker29.9.1，应用healthy/只读根目录/node用户/回环18787，房间卷及0600资料存在；两站可信HTTPS GET200。默认Key health为false不能推断各房间无Key。未读取密钥或房间内容，未写服务器文件或重启服务。GitHub main的package文件落后于本地新增房间测试，保留当前工作区为开发基线。

本地实现：新增accounts独立Fastify/SQLite服务和Vue账号页面，开放注册、大小写不敏感的全局唯一登录账号、可重复/可改昵称、30天最长/7天闲置会话、登录/退出、个人中心、改密码/三问、传统密保重置及会话撤销、email扩展字段。Argon2id及答案NFKC/大小写/空白规范化；会话只存token摘要。使用主站专属HttpOnly/Secure/SameSite=Lax/无Domain Cookie，精确Origin凭据CORS；CSRF绑定会话与account/hakisub范围，项目端只读UID/nickname，不读username。接口拒绝编码/点路径，私人数据按UID查询。

防滥用：SQLite持久事件实现注册5次/10分钟和成功3个/滚动24h；成功配额与插入同事务复检，上海自然日超100只记预警。登录/恢复多层限制、虚拟账号同成本验证、恢复挑战10分钟/5次/一次消费、单路哈希与8个排队上限。仅信任配置的精确代理peer与Caddy覆盖的客户端IP头，IPv6按/64聚合。管理员CLI支持预警、定向IP解除（保留注册日计数）、SQLite一致性备份，备份排他创建不覆盖文件。

HakiSub：新增accountClient、AccountAccess、RoomPresets；默认昵称、独立账号新标签入口、存档保存/列表/改名/删除/链接加载。仅存识别来源及布局，不存Key、ownerToken、member token、音频/字幕；加载不入房或开麦，在线期间禁用加载。UID/房主/成员分离，未来ownerUid可与匿名ownerHash并存，绑定必须另验房主凭据。本轮未实现暂停全房ASR/强制销毁/房间额度熔断，没有更改现有WebSocket、ASR、Key或计费逻辑，也没有扩大生产付费访问。

开源复用：Fastify及cookie/cors/csrf/static插件、argon2、better-sqlite3和原有Vue/Vite。评估Better Auth（现成username注册要求邮箱）、Passport（仍需存储和恢复）、rate-limiter-flexible（基础固定窗口，业务仍需同事务滚动成功额度），保留当前轻量组合，具体复用/自实现及许可证见accounts/THIRD-PARTY.md。LiveKit仅作未来权限分离参考，不引入媒体栈。官方npm审计发现原static8.x路径处理漏洞，升到10.1.6并适配新setHeaders接口；最终运行依赖审计0项。镜像源不支持audit，单次指定官方registry，没有改全局配置。

验证：npm test全部通过；npm run build通过。新增npm run test:accounts通过客户端模拟及4个后端测试组，使用真实SQLite/Argon2id，覆盖跨UID越权、密钥字段拒绝、账号/配额并发、24h边界、重启持久会话/限流、代理伪造/IPv6、哈希队列、密码会话轮换、三问规范化/并发消费/旧会话失效、备份integrity_check和拒绝覆盖。npm run build:accounts通过。初次沙箱内构建/原换房CLI测试受子进程EPERM拦截，获准沙箱外后全量通过；新增测试直接运行node:test文件以避免额外测试子进程。修复版静态页/CSP和编码路径已补HTTP断言。

浏览器：隔离回环8790账号+5179 HakiSub+8791空Key网关，合成账号登录后自动填入“星间旅人”，保存存档、个人中心读取并改名、链接加载返回HakiSub均成功；不自动入房/开麦。进入独立测试房间后成员卡显示nickname，Key为空；退出账号后游客入口/本浏览器创建者凭据仍保留。修复首次登录关联项目列表刷新，最终页面无console warn/error。截图artifacts/account-review/account-presets.png和hakisub-account-room.png。预览网关显式禁止真实上游与Key握手测试；没有访问真实麦克风或豆包。仅不同本地Origin通过，不当成真正跨子域生产验收。

交付与边界：新增审查方案、部署/备份手册、开源选择记录、账号Dockerfile、可选Compose与Caddy候选文件、隔离预览/无密钥打包脚本；README与ARCHITECTURE同步。传统三问的熟人猜测接管和自定义问题枚举风险已明确，不能声称完全消除。Linux原生依赖/容器资源权限、Compose/Caddy实际验证、正式TLS跨子域Cookie/CORS/代理IP、异机加密备份恢复及生产ASR费用保护尚未验收；未部署账号、未覆盖生产配置、未重启现有服务、未开放端口或修改生产密钥。

补充收尾：隔离预览显式拒绝.env、secrets、artifacts和账号服务端源码的HTTP访问，并关闭这些目录的开发热更新监听；实际请求首页与App源码200，测试数据库、账号服务端源码和.env均403。预览服务已停止，无遗留8790/8791/5179监听。账号白名单包的21份文件已逐项核对SHA-256且无数据库/密钥路径；Docker默认数据库明确落在/app/data，新Linux镜像仍待隔离验收。
最终账号包：xdstar-accounts-20261020T183940Z（UTC版本标识），21份文件逐项SHA-256通过，归档SHA-256为0b95e5d2d52b17139f70dc23209e3e29f38152354c8b82e76432640b5a4ad986。后端静态文件测试使用隔离fixture，不依赖已有dist；最终账号专项测试再次全部通过。未上传或部署。

日期：2026-10-21（Asia/Shanghai）

按用户要求整理当前工作区提交到原GitHub仓库：包含此前房间持久化/独立URL/语音恢复/部署文档，以及本轮统一账号的源码、测试、锁文件和候选配置。提交前检查Git纳入范围与真实本机密钥值的匹配，不显示密钥；现有.env、.env.local、数据库、依赖、构建目录、截图和镜像/发布包继续保留本地，不强制添加忽略文件。新增SQLite/DB日志及backups目录忽略规则，防止数据库移到其他目录后意外入库。测试结果沿用本轮已通过的npm test、npm run build、npm run test:accounts、npm run build:accounts及官方运行依赖审计0项；此次仅更新Git排除规则与提交记录，没有修改运行逻辑或生产环境。提交/推送的最终哈希与结果以实际Git操作为准。

日期：2026-10-22（Asia/Shanghai）

任务：用户要求调整尚未修改的服务器两路 ASR 限制。只读检查线上根.env及运行容器均为2、public模式、healthy；没有将用户反馈直接视为已证明的所有波动原因。

修改：runtimeConfiguration三模式默认、compose.yaml默认、deploy/release.env.example统一为8；仍允许显式1～8配置，保留每成员一路及既有权限、Origin、Key、15分钟单连接、音频/VAD/字幕/恢复/清理逻辑。部署测试保留显式两路限制覆盖，新增公网默认八路跨房间独立接入、重复成员和第九路拒绝、关麦释放名额。README、ARCHITECTURE和部署手册同步。

验证：npm test全套通过、npm run build通过（因既有Node子进程/esbuild沙箱限制，在获准沙箱外执行）。模拟仅使用假上游与临时数据，未调用真实豆包或麦克风。没有实施此前缓存和内存审查建议。

线上：通过既有hakisub-server SSH别名管理；首次临时环境预检被sudo环境过滤导致差异校验停止，尚未修改；改用sudo env后确认有效Compose配置仅ASR上限变化。备份服务器根.env至/srv/projects/hakisub/images/asr-concurrency-20261022T145508Z/environment.before（目录0700、文件0600），原位原子替换2为8，仅重建hakisub服务，保留回退配置。未触发部署回退；镜像仍hakisub-20261020T173624Z，镜像摘要及挂载不变，Caddy容器ID不变。运行容器内readRuntimeConfiguration结果8，healthy，服务器外部可信HTTPS首页和健康接口200。未读取/输出真实Key或字幕、未部署本地其他功能、未编辑DEEPSEEK-MEMORY.md、未提交或推送Git。真实多人识别与长期稳定性仍待用户实测。

日期：2026-10-22（Asia/Shanghai）

任务：UID房主绑定、跨设备房间Key管理与手动全房豆包ASR开关，仅本地开发验收。本地HEAD及origin/main与GitHub main均为f42d35ef7bb5f0aea083090a58bae2bf8ff2618c；git fetch因.git写权限限制未执行成功，改用git ls-remote核实远程HEAD，无需改工作区。最初已有README、compose.yaml、release.env.example、ARCHITECTURE、DEVLOG、两份部署手册、runtimeConfiguration及deployment测试修改，均保留；本轮只在deployment测试中追加独立房间Key夹具，文档在原改动上补充，不编辑DEEPSEEK-MEMORY。

本轮实际文件及功能：

- server/roomStore.mjs：读取v1/v2、写v2，ownerUid、asrEnabled、configured/missing/deleted持久化；保留AES-256-GCM、房号AAD、别名和原子替换；换号保留新字段。
- server/roomGateway.mjs：统一每房管理互斥、匿名/UID授权、绑定原子撤销旧ownerHash及在线owner、Key与开关变更清理本房ASR、状态广播、失败运行期blocked；浏览器字幕与成员开麦不依赖云端锁。
- server/roomManagement.mjs（新增）：固定管理端点、独立HMAC、完整正文范围、10秒窗口、nonce上限和每次启动audience防重放；不信任来源IP/代理头或浏览器UID。
- server/roomSettings.mjs、server/asrGateway.mjs、server/index.mjs：匿名与账号管理统一使用房间授权，ASR upgrade强制开关/Key/锁校验、立即清理并发名额，联网房间取消默认Key回退；服务端加载独立管理密钥。
- accounts/server/roomManagementClient.mjs（新增）、accounts/server/accountServer.mjs、accounts/server/configuration.mjs：复用主站Cookie/CSRF/Origin和SQLite会话，经网络等待后复查登录，按UID签发有范围的服务请求；列表/绑定/Key与ASR代理，不在账号库复制所有权或Key。
- accounts/src/OwnedRooms.vue（新增）、accounts/src/AccountApp.vue：个人中心真实所有权列表、Key设置/更换/删除/测试、远程暂停/恢复、进入房间；Key清空、不回显，失败不假成功、账号切换/卸载隔离迟到响应。
- src/accountClient.ts、src/App.vue、src/roomClient.ts、src/rememberedRooms.ts、src/components/RoomApiSettings.vue：登录创建后自动申请绑定、匿名旧房手动绑定、当前本机旧凭据清理、绑定后房内经账号代理、房间状态实时刷新；保留游客/模拟/Web Speech及现有字幕生命周期。
- accounts/tests/room-management.test.mjs（新增）、tests/owned-rooms-view.test.mjs（新增）、package.json：新增npm run test:room-management，覆盖双服务真实SQLite/Argon2id/HTTP/WebSocket加假豆包、实际个人中心模板。
- tests/gateway-recovery.test.mjs、tests/rooms.test.mjs、tests/persistent-rooms.test.mjs、tests/room-settings-view.test.mjs、tests/deployment.test.mjs：已有回归改用显式合成房间Key并验证删除无回退/保存失败阻止识别；保留原八路并发测试。
- scripts/preview-accounts.mjs：隔离预览接入临时服务签名与artifacts下的测试房间持久化，继续显式拒绝真实豆包上游和真实Key测试。
- .env.example、deploy/accounts.env.example：仅空占位符和服务地址；README、docs/ARCHITECTURE.md、docs/ACCOUNT-SYSTEM-PLAN.md、docs/ACCOUNT-DEPLOYMENT.md、docs/DEVLOG.md更新权限、迁移、配置、验收及回滚边界。

最终自动验证：npm test全套通过（最终日志artifacts/room-management-review/npm-test.log）；npm run test:accounts通过账号客户端及4组后端测试；npm run test:room-management通过集成与实际模板；npm run build、npm run build:accounts通过；git diff --check无空白错误。早期测试发现旧并发夹具依赖默认Key，改为本房合成Key后通过；沙箱内Vite/esbuild与换号CLI子进程被EPERM阻止，获准沙箱外执行后通过。一次已有测试随机分配到Node禁止端口触发bad port，重新运行通过，未改系统端口策略。全部豆包均为假上游，没有消耗真实API或访问真实麦克风。

浏览器：8790主站账号/5179 HakiSub/8791网关，使用已有隔离合成账号创建房间并自动绑定；个人中心设置合成Key、输入清理、远程暂停/恢复、房内状态同步、删除显示“房主已删除”均成功。修复浏览器发现的弹窗远程状态未刷新问题，最终页面console warn/error为空。截图artifacts/room-management-review/account-desktop.png。viewport覆盖未改变实际1265px视口，未声称手机/窄屏实际验收。测试标签已关闭，8790/8791/5179回环探测均无监听。

最终权限：UID仅长期身份；未绑定房主凭原ownerToken，绑定必须同时有会话和原凭据，成功后随机替换摘要且旧token永久失权；绑定房间由会话UID与ownerUid匹配管理；Member只控制自己麦克风/字幕；房间Key不共享、不回显、不进账号SQLite。绑定状态、Key、开关和114514/985529别名重启恢复已模拟验证，成员令牌不跨重启。

迁移：旧房有Key保持，缺Key不再继承服务器默认Key；默认asrEnabled=true，删除单独为deleted。首次成功保存升级v2，主密钥不变。Key/开关写失败只返回失败、原持久化状态保留，运行期关闭本房付费连接。若磁盘完全不可写，失败锁无法持久化，不能靠重启解除故障；重启前必须修复并成功重试。此物理边界、内网明文只限受控网络、真实Cookie/手机/Linux/费用验收等风险已列入部署手册。

部署/回退：本轮未访问/部署Star-Hub、未修改生产Caddy或env、未重启生产、未删覆数据库/主密钥/数据卷，未提交推送。最小后续方案为隔离副本验证→一致性备份→私有网络双服务密钥→两端镜像配套切换→真实HTTPS双设备验收；回滚优先保留v2授权后端回退前端，不能把新版房间文件强改v1给旧网关，也不能恢复旧Key/ownerToken路径。完整方案在ACCOUNT-DEPLOYMENT本期章节，后续生产操作须另行确认。


日期：2026-10-23（Asia/Shanghai）

按用户决定简化为联网房间Key仅后端进程内存。审查确认原roomStore解密恢复Key以及网关blocked路径；本轮移除加解密/自动主密钥生成，存储读取v1/v2/v3、仅写v3元数据白名单。旧密文/明文/Key状态均忽略，不解密、不加载，首次元数据成功写入剥离全文件旧Key字段。读取不自动改原文件，无房间/身份/别名丢失。网关每次启动强制missing，退出时清除内存Key。Key设置/删除不调用磁盘；开关及绑定仍持久化，沿用服务端UID/匿名授权与每房互斥。换删Key/开关立即清理本房上游；开关写失败保留原状态、清掉当前Key并报失败，无blocked或重启重新授权机制。公网/联网Key无默认回退。

实际修改：server/roomStore.mjs、roomGateway.mjs、asrGateway.mjs、index.mjs、renameRoom.mjs；scripts/preview-accounts.mjs；src/App.vue、roomClient.ts、accountClient.ts、components/RoomApiSettings.vue；accounts/src/OwnedRooms.vue；tests/persistent-rooms.test.mjs、room-renaming.test.mjs、owned-rooms-view.test.mjs、accounts/tests/room-management.test.mjs；新增tests/room-key-memory.test.mjs并接入package.json专项命令。README、ARCHITECTURE、ACCOUNT-SYSTEM-PLAN、ACCOUNT-DEPLOYMENT同步当前规则，旧日期条目保留历史含义。旧加密主密钥环境与部署脚本不删除、不在生产执行。

验证：npm test全套通过（artifacts/room-management-review/npm-test-memory.log）；npm run test:accounts、npm run test:room-management、npm run build、npm run build:accounts及typecheck通过。专项包含旧有效AES密文不可恢复、v1/v2/v3明密文/损坏Key忽略、身份/别名/开关保持、重启缺Key/重填、磁盘实际写失败、Key操作不依赖磁盘、开关失败清Key且重启无付费能力、权限/重放/跨设备/并发/会话立即清理。所有豆包为模拟，无付费API或真实麦克风。未额外进行本轮浏览器/手机或生产真实验收，界面文案由实际Vue模板测试与构建覆盖。

边界：本轮没有访问生产服务器、没有修改生产Caddy/环境/密钥/数据库/卷，没有重启生产或提交推送；保留原工作区修改。不再存在“磁盘失败后重启恢复旧Key”的路径。部署必须配套升级网关与页面并通知房主每次后端重启重填Key；不能回退到恢复磁盘Key的旧后端。

提交整理（2026-10-23，Asia/Shanghai）：用户授权分别本地提交。八路ASR并发已独立提交为52b9788，包含配置、部署测试及对应文档；使用原网关加该提交内容构造独立快照，部署/并发模拟测试通过。其余UID房主管理、跨设备Key管理、ASR开关和Key仅内存规则作为第二条提交，保留此前所有开发与验收记录。仅拆分暂存共享文件，未还原或覆盖工作区源码；敏感文件及生成产物继续忽略。沿用此前已通过的完整测试、账号/房间专项和两端构建；本次没有运行生产操作，也不推送远程。最终两条提交哈希以Git记录为准。
