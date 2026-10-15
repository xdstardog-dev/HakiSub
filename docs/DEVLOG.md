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
