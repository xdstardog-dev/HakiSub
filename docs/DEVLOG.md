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

