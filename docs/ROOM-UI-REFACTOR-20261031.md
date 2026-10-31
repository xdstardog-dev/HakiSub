# HakiSub 房间内部 UI 重构验收记录

2026-10-31，北京时间。本地实现，未提交、推送或部署；未连接生产服务器、真实房间资料、密钥、麦克风或豆包。开始前核对GitHub origin/main与当前HEAD，均为fa90fde，保留工作区已有首页、账号、房间命名等未提交改动。

## 实现结果

1. 手机与电脑共用最大480px窄框。顶部为房间头像设置入口、独立名称与六位房号、分享、退出；中央使用原1～8人卡片，底部使用原麦克风主控及打字菜单。普通页面移除技术参数、实验复选框及个人存档入口。
2. RoomApiSettings复用为两级设置：普通成员操作发言提示音、快捷回复音效两条0～100%滑块和动态／固定布局；房主额外操作ASR总开关及房主设置。两音量独立，布局默认动态，均本机持久化，不同步给别人。
3. 房主二级页复用现有文本rename及权限链路，不调用数字换号脚本；名称可编辑保存并广播、重启保留。Key首次及更换采用明文输入，提交即清空，保存后只显示掩码；返回上级／关闭／卸载清空输入，不回读已保存原文。房间密码采用滑动开关，开关打开仅进入待保存，四位ASCII数字成功保存才保护；输入过滤非数字，支持0000，关闭失败恢复原保护状态。
4. 每名成员由服务端获得稳定toneSlot（0～7），对应C4、D4、E4、F4、G4、A4、B4、C5；离房释放槽位，新成员复用最小空闲槽，不改变其他成员音高，也不依赖卡片位置。
5. 统一字幕入场函数在入队前检查同成员所有可见字幕，沿用captionOpacity、receiveCaption与expireCaptions。首条非空语音字幕（interim或直接final）且此前完全空白才返回一次入场事件；同ID更新、final确认、尚有字幕时的新句、渐隐期间、打字、快捷回应、布局变化均不重触发。打字字幕本身不触发，但占据可见区域。
6. App消费同一个入场事件，同时触发头像两圈涟漪、整卡scale1→1.015→1呼吸和该成员音阶。卡片动画使用transform，原动态布局继续使用top／height；未改布局算法。减少动态偏好跳过入场动画，静音保留视觉反馈。
7. 发言音采用Web Audio相同sine音色、0.21秒短包络和固定频率，保守增益及幂音量曲线，最多八音，不无限排队。用户交互解锁，未解锁直接丢弃；异常不影响字幕。原快捷回应MP3、逐项配置／回退／缓存／三路有界播放保留，详细试听仅在显式debug=1调试路径显示。

## 文件清单

新增实现模块：

- src/roomPreferences.ts：动态布局与发言音量本机偏好。
- src/captionEntrance.ts：统一字幕入场判定。
- src/speechSound.ts：八音阶短音与播放清理。
- server/roomPassword.mjs：带盐摘要和密码验证。

修改现有实现：

- src/App.vue、src/style.css：窄框布局、头像入口、偏好、统一反馈、暂停状态及清理；移除房内旧存档使用与普通技术控件。
- src/components/RoomApiSettings.vue：普通／房主二级设置及保存交互。
- src/components/MemberCaptionGrid.vue：头像和一次性动画；原卡片顺序、收起、滚动、反应菜单保留。
- src/captionEvents.ts、src/roomClient.ts：可选source和toneSlot统一类型。
- src/accountClient.ts：移除已取消的Key／密码原文响应类型。
- server/roomGateway.mjs：音阶分配与广播、来源标记、摘要密码、取消原文回读。
- server/roomStore.mjs、server/roomAccess.mjs：v5兼容迁移、验证及原访问资格流程。
- server/roomSettings.mjs、server/roomManagement.mjs、accounts/server/accountServer.mjs：拒绝reveal，保留既有房主鉴权。
- accounts/src/OwnedRooms.vue：兼容不能回读Key／密码的管理界面。
- package.json：加入新测试及test:room-refactor:browser入口。
- README.md、accounts/README.md、docs/ARCHITECTURE.md、docs/DEVLOG.md及本记录。

新增测试：tests/caption-entrance.test.mjs、tests/speech-sound.test.mjs、tests/room-password-migration.test.mjs、tests/room-refactor-browser.mjs。

扩展或适配测试：tests/demo.test.mjs、tests/room-settings-view.test.mjs、tests/room-access.test.mjs、tests/room-interactions.test.mjs、tests/room-key-memory.test.mjs、tests/owned-rooms-view.test.mjs、tests/member-controls-browser.mjs、tests/room-interactions-browser.mjs、tests/room-access-browser.mjs、tests/home-browser.mjs、tests/simulation-settings-browser.mjs、accounts/tests/room-access.test.mjs、accounts/tests/room-management.test.mjs。

没有新增Vue组件；复用MemberModeControl.vue、TypingComposer.vue、MemberCaptionGrid.vue、RoomApiSettings.vue、原ReactionSettings／SoundSettings和账号客户端。captions.ts、adaptiveLayout.ts、音频采集／重采样和豆包协议实现未修改。旧存档组件、账号API和存档数据保留，但房内不再提供入口或按preset链接覆盖个人偏好。未编辑docs/DEEPSEEK-MEMORY.md。

## 数据与兼容

- 成员新增toneSlot，仅存当前房间进程会话，不持久化；CaptionEvent.source为可选字段，仍兼容旧typed-句子ID。服务端决定来源及槽位，客户端不能指定别人的身份或槽位。
- 房间文件写入v5，passwordHash采用随机16字节盐和scrypt32字节结果，不写明文accessCode。读取旧v1～v4非空明文密码时先校验再原子迁移；失败不启动，不把私密房静默开放。
- 保留房主摘要／UID、名称、六位房号、别名、ASR开关、访问版本和已授权账号。原5次／分钟错误限制、单次60秒票据、改码撤权、账号跨设备免输、写失败保留原状态继续生效。账号SQLite schema仍v2。
- 房间Key仍仅存服务端进程内存，重启需重填，无默认Key回退；取消房间及账号链路的reveal。旧独立本机调试配置与环境密钥机制不变。
- 发布需要配套更新网关、账号后端和两套前端。旧网关拒绝v5文件，不能直接回退旧镜像；恢复必须使用支持摘要的版本或受控迁移。未对生产执行迁移。
- 原Web Audio／Web Animations不支持或设备不可用时，字幕继续工作；旧浏览器可能不播放音效或动画。减少动态时仍显示字幕；不会改变其他成员设置。

## 实际测试

通过：

- npm test：完整自动化套件，包括新增入场、音频模拟和密码迁移测试，原字幕、采集、ASR协议、布局、麦克风手势、打字、回应、权限与持久化回归。
- npm run build、npm run build:accounts：两套前端构建。
- npm run test:accounts：真实隔离SQLite、Cookie／CSRF、账号和跨设备入房资格。
- npm run test:room-management：签名管理、绑定／跨设备权限、ASR终止、Key仅内存／失败策略。
- npm run test:room-refactor:browser：实际Chrome的两级设置、名称同步、Key输入／清空／重入、密码输入过滤／0000／启停、偏好独立与刷新、统一入场／静音仍动画／连续识别／渐隐边界／打字占位、多人同时音高、减少动态，以及320／390／1280视口中的窄框边界。
- npm run test:member-controls:browser：480／390／320八成员固定及动态布局、全部收起／恢复、麦克风短按／长按／右键／左滑、草稿与字幕。
- npm run test:room-interactions:browser：原桌面／移动双房间八成员、14个MP3实际解码播放调用、逐项试听／独立静音／偏好、词库、打字、假Web Speech和本人回应。
- npm run test:room-access:browser：改名、同步、重启、只读、长名转义、前导零、账号跨设备／重启免输、改码撤权及关闭。
- npm run test:home:browser：首页六视口、触摸／鼠标轮播、创建／加入、私密建房与密码验证回归。
- npm run test:simulation-settings:browser：480／320px真实Vue模拟分支的名称、模拟码、关闭重开、输入边界和离房清理。
- git diff --check：通过（按仓库Windows换行规则检查）。

浏览器使用现有Playwright与Chrome，没有新增运行依赖；全部服务使用临时端口、合成身份／假ASR或临时文件，不读取.env或现有房间数据。初次沙箱检查因Node／esbuild子进程EPERM失败，允许子进程的执行环境中已通过；旧测试按新入口和取消回读规则适配，未删除原回归能力。

截图已目视检查：artifacts/room-refactor/room-320.png、room-390.png、room-1280.png、personal-settings.png、owner-settings.png、reduced-motion.png。保持灰阶结构，未添加装饰插画、自由拖动、音色编辑器或额外业务功能。

## 人工验收与视觉后续

尚未进行：真实麦克风采集及豆包API识别、物理手机的Safari／Android浏览器与系统键盘、两台物理设备、真实扬声器听感／多人音量平衡。浏览器视口、假Web Speech和Web Audio调用记录不替代这些验收。

当前动画幅度1.015、650ms卡片动画和两圈涟漪、C4～C5统一正弦短音为中性初版。正式配色、动效曲线和音色／音域微调按后续视觉验收决定；本次没有自行增加复杂装饰或更改字幕生命周期。
