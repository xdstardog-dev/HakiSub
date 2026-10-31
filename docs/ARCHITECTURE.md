# HakiSub 架构

## 2026-11-01 配套发布

北京时间 01:44:29 已配套发布 `room-ui-20261031T1745Z`，功能源码 `2a188d7`；主站、网关、账号后端与账号前端同步更新，镜像均包含 accounts/shared 共享规则。先备份并隔离演练真实资料副本，再停止双服务制作一致性快照后切换；运行文件哈希网关 60 项、账号 16 项匹配。原 25 房/8 账号、卷和配置保留，Caddy 未重建。最终房间文件 v5、账号 SQLite v2，公网真实 Cookie/UID 登录、PIN/跨设备免输/改码撤权、WSS 打字、头像广播、绑定与工作台管理通过。验收新增 3 个合成账号及 2 个无 Key/关闭 ASR/无入房码房间，最终 11 账号/27 房，合成会话已清理。v5 与旧网关不兼容，恢复限制及备份摘要见[完整发布记录](RELEASE-20261101.md)；下文未部署字样为各阶段历史状态。

## 共用四位 PIN 输入（2026-11-01）

`accounts/shared/PinCodeInput.vue` 同时供 `CreateRoomDialog`、`RoomApiSettings`、`RoomPasswordPrompt`、模拟设置 `ApiSettings` 和账号中心 `OwnedRooms` 使用，放在已有共享目录以兼容账号前端独立构建和打包。组件只负责 `modelValue`、四个字符的渲染与原生输入交互；设置、验证、错误提示、权限及生命周期清理由原父组件负责。移除 RoomApiSettings 原本单独的数字过滤函数；私密创建确认按钮补上四位长度条件，模拟设置的已保存密码改为状态提示，其余接口及提交校验保持。

一个正常尺寸的原生文本 input 覆盖整排字符，保留 inputmode=numeric、maxlength=4、pattern、标签及禁用状态；不创建四个输入槽、不拦截数字键盘或按键、不在输入时切换 DOM 或转移焦点。四个等宽字符用 aria-hidden 隐去重复朗读，空位为灰点、数字继承当前主题。CSS 局部取消边框、背景、横线与焦点矩形，聚焦时灰点加深。过滤仅允许 ASCII 0–9，保留前导零；过滤后按有效数字数恢复光标，粘贴先去除非数字再按当前选择范围截取；IME 合成结束才过滤，避免中断输入法。

房内设置和加入复用原清空逻辑，账号中心切房／重开也不回填已保存密码。浏览器共用 PIN 验收帮助函数检查字符与几何、原生鼠标／触屏聚焦、编辑／粘贴、提交条件及重试；账号中心支持独立 --pin-only 回归。浏览器仿真不代表物理手机软键盘验收，无网关、ASR 或密码校验规则修改。

## 房间头像元数据与交互（2026-11-01）

accounts/shared/roomAvatars.mjs集中定义默认home、四个快捷项、八个首批预制头像与编号校验，配套d.mts类型。RoomAvatarIcon统一绘制可信SVG路径；RoomCard在姓名上方的可用区域居中放大头像，RoomListDialog和房内RoomAvatarControl共用同一图形。后续头像只需扩充此目录，不将SVG、上传文件或远程地址写入房间资料。

RoomAvatarControl独立处理鼠标／触屏500ms长按、10px移动取消、右键、Shift+F10及菜单方向键；短按继续打开原设置，长按后的合成点击不会误开设置。快捷菜单为四头像加“更多”，后者通过原生模态dialog显示完整库，单击头像即保存。框外点击／Escape／窗口变化及卸载关闭并清理手势、监听器和请求；异步操作编号防止离房后的回调更新新界面。组件保留房间设置的无障碍名称。

roomAvatarClient复用/api/rooms/settings读取匿名房主权限；绑定房间再通过现有账号rooms接口确认当前账号拥有该房间。更换以avatar动作提交avatarId，分别复用匿名管理Bearer与账号Cookie／CSRF／HMAC链路，服务端再次执行既有房主鉴权。普通成员可见头像且无法更换。编号在网关白名单校验，通过原串行房间写入后才更新并广播；失败保留原头像、Key和采集状态，avatar与rename一样不停止ASR。账号管理接口和内部签名动作白名单同步扩展，未新增公开管理路由或放宽权限。

roomStore在现有v5资料中保存可选avatarId，旧资料缺省home；其他元数据写入及绑定／换号保留该字段。joined与room-status携带avatarId，App更新当前房间并通过rememberRoom保存最近资料，forgetRoomOwnership清理旧凭据时保留头像。本机缓存缺失／未知编号回退房屋，不改变房间顺序或保存字幕。未入房的首页不会建立额外广播连接，重入取得最新资料；模拟分支仅保留本次会话。

Docker已复制完整accounts/shared目录；私有发布脚本增加roomAvatars.mjs，账号发布脚本原有shared目录复制继续适用。发布需配套更新网关、账号后端及主前端。新增模拟测试覆盖权限、广播、写失败、持久重启、旧资料、取消与不干扰ASR；真实Chrome覆盖两种长按、右键、键盘、更多库、多成员同步、首页／列表／刷新和窄屏。

## 房间与首页共用灰阶配色（2026-11-01）

房间直接复用home.css已有的--home-bg、--home-outer-bg、--room-card-bg、--home-text、--home-secondary-text、--home-light-text及--home-border变量，不引入第二套主题状态。style.css让房内外框和桌面留白分别沿用首页深灰与外部灰底，顶部文字和底部普通主控使用浅色前景，顶部图标按钮使用浅底深色线条。MemberCaptionGrid、MemberModeControl、RoomApiSettings、TypingComposer及回应／音效／模拟设置只调整CSS颜色，浅色表面与中性灰按钮和首页保持一致；传送到body的输入菜单自行指定前景与背景，避免继承旧绿色根文本。房内普通错误提示适配深底；ASR禁用的暗红语义色及原状态逻辑保留。

MemberCaptionGrid的既有grid-empty继续表示全部卡片收起后的空闲状态，以grid-column／grid-row覆盖整个字幕网格，align-self:stretch及align-content:center保持与单人可见卡片同宽高并居中睡猫提示。隔层使用rgb(255 255 255 / 50%)覆盖深外框#41454a，并以同色linear-gradient叠加10%黑色，将原灰色再压暗10%；提示文字、颜文字及currentColor嘴巴SVG统一为#fff，边框／圆角沿用卡片。房屋设置与返回按钮使用--room-card-bg浅底及--home-text深色线条；分享按钮单独使用更深的#c5c7c3灰底，悬停为#d3d5d1、按下为#b6b9b3。底部头像与主控仍在原网格外的dock，收束／恢复、字幕生命周期、动作与采集协议保持。

既有member-controls-browser在480／390／320px比较空闲隔层与恢复单人卡片的矩形范围；房间设置、ASR禁用、打字框长文滚动、回应与音效使用原浏览器套件回归。无新增组件、依赖或服务端修改。

## 房间顶部与复制反馈（2026-10-31）

App的room-heading容纳48px房屋图标设置入口及房间名称／房号，room-actions容纳同尺寸的分享与返回按钮。名称单行省略以保留窄屏操作空间；copy-room是包含数字及重叠方框SVG的整行按钮，保留键盘操作与无障碍名称。房屋入口仍打开settingsOpen，返回继续调用leave。

房间返回首页与房主详细设置返回上一级共用room-back-button样式：48px方形、15px圆角、浅色底、细边框及相同悬停／按下配色，SVG同为26px圆角弯折箭头。RoomApiSettings仅保留返回按钮的右对齐，不再单独定义尺寸和视觉。两处分别沿用leave与backToPersonal及原无障碍名称／Escape和草稿清理。

roomNavigation.shareRoomLink仅调用Clipboard.writeText，不再调用Navigator.share；URL继续通过roomShareUrl剥离查询参数、片段与凭据，只含当前origin和六位房号路径。复制房号与分享共用App的copyMessage及500ms计时器，Teleport到body的固定居中提示采用50%透明黑底白字、pointer-events:none，不参与房间布局。2026-11-01增加Vue Transition：120ms opacity淡入，计时器清空消息后执行240ms渐隐，再移除节点。成功分别提示“复制房间号成功”“复制链接成功”，剪贴板缺失或拒绝时提示“复制失败，请重试”，不打开额外面板。每次点击递增copyOperation并重置提示，离房／卸载同样递增并清理计时器，避免迟到回调覆盖后一次操作或新房间。

既有room-navigation、demo及room-refactor-browser回归覆盖无系统分享、纯净URL、成功／失败、迟到回调、连续操作续时、自动消失、键盘及320／390／1280px排布。浏览器使用隔离内存网关与模拟Clipboard，不操作系统剪贴板或真实ASR。

## 纯键盘入口与简洁输入窗（2026-10-31）

MemberModeControl由typingAvailable派生是否可进入打字，仅本人allowTyping且当前不是typing时开放箭头／长按／右键／键盘展开，进入打字会关闭已打开菜单。卡片与底部复用同一个组件，选项以64×56px纯SVG键盘呈现，原无障碍名称“切换打字”保留；定位根据实际按钮尺寸及56px菜单高度限制在视口内。打字状态的主按钮仍显示键盘、短按仍回闭麦；重新编辑使用原卡片文字区／输入字幕入口，不再提供重复菜单。

新一次真实pointerdown先解除旧长按的合成点击保护，再判断是否需要启动长按；即使滑入打字后浏览器未产生合成click，下一次真实短按仍可正常退出，既有释放／移出取消与Pointer Capture机制不变。

TypingComposer移除可见h2、收起按钮与快捷键／同步说明，role=dialog使用aria-label“打字字幕”。暖浅灰圆角框保持居中，宽度为min(440px, 可见视口宽度−64px)，两侧至少各32px；框内上方textarea独立滚动，下方同色区域放置左侧字数和右侧32px方形发送箭头；点击框外空白或Escape关闭并保留草稿，外部功能按钮继续响应原操作。IME、发送确认与软键盘视口跟随逻辑保留，具体事件传播与清理见下方打字输入窗说明。占位文字为哈基...，使用#92968f中性灰色，正文颜色不受影响。RoomApiSettings只调整关闭状态文案为动态自适应（已关闭），adaptiveCards=false仍接入原固定布局，无存储／服务端结构变化。


## 房主原位编辑与Key操作（2026-10-31）

匿名房主的“绑定当前登录账号”按钮复用dark-button配色，以bind-account-button设为内容区同宽、文字居中，并通过16px上边距与房间密码分隔线分开；沿用原ownerToken显示条件、busy禁用与bindAccount流程，无绑定接口或权限变更。

RoomApiSettings在原name-row内切换strong／input，确认按钮沿用rename文本操作。以编辑行ref判断pointerdown是否在外部，不采用输入框blur取消，避免点击确认时先丢失草稿；已发送的rename等待确认，未提交草稿点击别处／Escape／返回时丢弃。名称长度校验和服务端权限、持久化、广播沿用原机制。

Key编辑表单使用key-input-row把保存按钮放在字段右侧，更换时才显示取消更换和浅色移除入口。移除先打开原生嵌套dialog，默认焦点在取消，主设置在确认时保持模态；只有明确确认后才调用旧delete操作。取消弹窗不删除也不丢当前输入；保存／删除仍立即清空Key，离开设置继续清理明文。非Key操作／刷新不再无条件清空正在编辑的Key。

连接测试保留现有test接口及服务端probe，新增独立activeAction与connectionTestMessage／Failed用于同一行的进度和结果。成功文字固定key测试通过！，失败原因为同位置提示，不在底部重复显示；未保存的新Key不允许发起测试，避免将已保存Key的结果误当成新草稿的结果。保存／删除／开始更换／新输入会清除旧结果。无新接口、读取原文能力、依赖或数据结构变化，账号绑定与匿名房主两条原管理路径均保留。


## 音量静音恢复与管理分区（2026-10-31）

主面板可见标题和个人偏好说明已移除，dialog改用动态aria-label保留无障碍名称；主面板右上角settings-close显示×，仍以“关闭设置”作为无障碍名称并沿用原关闭清理。房主详细页保留自身标题，右上角仅显示settings-back返回箭头，无正文返回文字或×入口；点击箭头或Escape调用原backToPersonal，清空Key、密码、名称和连接测试草稿并回到主设置，主设置Escape才关闭。owner-entry为深色底白字。

RoomApiSettings在各音量行增加独立的喇叭按钮与禁用状态。快捷回应继续复用SoundPreferences.enabled／volume，点击静音只将enabled设为false而不把volume改成0；发言偏好新增可选speechEnabled字段，沿用hakisub.room-preferences.v1，旧值缺失默认true。静音后的音量仍保留，应用以speechEnabled决定传给speechSound.configure的有效音量是否为0，保存／刷新不丢调试值；手动拖到0时，在当前设置会话保留最近非零音量，点击恢复可回到该值，初始无历史时使用60%。

App的updateSpeechEnabled／updateSpeechVolume在合法用户操作内解锁音频；刷新后原本静音的用户点击恢复，即可接收后续发言提示，不需要再点其他控件。音量／静音配置的同步watch与布局保存watch分离，切换布局不会停止正在播放的短音。原音频节点清理、MP3素材、字幕入场及视觉反馈机制均不变。

布局控件使用原adaptiveCards布尔状态和滑动开关，文案为动态自适应／固定分布；普通成员和房主均可使用。仅合法房主显示owner-management分区，中性浅灰背景区别于个人设置；ASR开关与布局开关共享左侧位置，owner-entry显示房间设置，仍调用原openOwnerSettings进入房主详细页。无网关、权限、API或服务端数据结构变化。


## 贴底头像与主控（2026-10-31，视觉微调）

App房间ASR关闭提示使用“语音转文字功能被关闭了喵！只能打字说话了喵~”，向Grid及底部主控传递房间级microphoneUnavailable；仅此状态给非打字麦克风增加is-asr-disabled暗红／浅红配色及aria-disabled，收起头像徽标同步变红，普通闭麦恢复原灰黑。开麦动作在控件及App双重阻止，指针事件仍用于长按／右键选择打字，打字状态可正常退出。状态广播关闭ASR时停止豆包或浏览器采集、使本人闭麦并同步状态；asr.start同样拦截关闭状态，不允许浏览器回退绕过。重新启用不自动开麦。原模拟模式、打字／回应、权限及字幕生命周期保持，无服务端协议或数据修改。

App把MemberModeControl沿用原逻辑放入MemberCaptionGrid的可选controls插槽。Grid内的member-bottom-dock同时容纳可横向滚动的收起头像与右侧主控，随房间内容高度保持贴底；头像不再渲染外置姓名，原aria-label／title保留身份和操作含义。App用room-main-control类设置主控64×56px与16px圆角，不修改MemberModeControl的手势或模式逻辑。普通状态说明移除，错误提示保留在字幕区上方，模拟／调试信息也置于上方；分享按钮调整至room-identity右侧。

头像贴底后，反应菜单按可用空间向上或向下展开，并与原按压点保持12px间隔，避免触屏长按松手时误触刚出现的菜单。原槽位、字幕、音效、ASR、收束、房主权限与数据结构均不变。

房间右上角room-exit与房主详细页settings-back共用相同造型：26px SVG实心箭头头部及圆角弯折线，44px按钮、12px圆角、1px浅灰边框和平面浅灰底；两处同色，悬停／按下加深，无立体阴影。保留“退出房间”／“返回房间设置”无障碍名称，仍调用原leave或backToPersonal，未改会话清理或导航流程。

`MemberCaptionGrid.vue`在有成员但无展开卡片时以grid将“没人说话喵”和睡猫颜文字分两行居中，间隔10px。猫脸用18px本地等宽字符对称排列，嘴巴以8×5px内联SVG绘制浅双弧线，z／Z缩为9／13px并独立控制阶梯位置，避免字体中的omega过大及组合附标错位；整体以role=img及aria-label提供含义，装饰字符不重复朗读。无成员时仍只显示“暂无成员”，原显示条件与字幕／收束生命周期保持。


## 房间内部 UI 与字幕入场（2026-10-31，本地实现，未部署）

此节为当前本地实现，下方带日期的明文密码、Key回读、固定布局默认和房内存档说明为历史实现。

App继续拥有交互与每成员字幕队列，MemberModeControl、TypingComposer、反应词库和MP3播放器保持原业务逻辑。RoomApiSettings改为同一原生dialog内的personal／owner二级视图：普通成员只操作两条本机音量及布局；房主设置由现有匿名凭据或账号Cookie/CSRF/HMAC管理链路授权。房间名称复用已有rename文本操作，不调用管理员renameRoom数字换号脚本。退出二级页／关闭／卸载清空明文；取消房间与账号服务的reveal动作，不回读Key或密码。Key生命周期仍是进程内存，保存、删除、暂停均沿用stopRoomAsr；暂停广播显示简洁状态并阻止本端新豆包会话，打字与回应独立运行。

roomPreferences.ts保存adaptiveCards与speechVolume，默认true／60；快捷回应继续使用roomInteractions.ts原sound-preferences.v1（enabled、volume）和reactionSound.ts完整素材配置。两个音量独立。旧个人存档组件和账号端接口仍保留兼容数据，但App不再提供房内入口、不加载preset链接来覆盖个人偏好。debug=1显式URL参数才显示已有技术控件；普通路径默认豆包。模拟分支和本机配置保持，用原测试注入，不新增生产模拟入口。

roomGateway在成员加入时查找最小空闲0～7槽，存入成员toneSlot并随members广播；槽位不持久化、不接受客户端编号、不随列表／布局变化。退出仅移除对应成员，其他槽位不变。统一CaptionEvent新增可选source=speech|typing，网关按消息类型赋值；旧typed-句子命名空间仍被识别，UI不依赖豆包结构。

captionEntrance.ts在receiveCaption之前读取同成员所有captionOpacity>0且非空的字幕。首条有效语音且此前无可见字幕才返回true；同ID更新／重复final不返回true；打字参与占位但不触发。expireCaptions和原3／6／10秒保持+2秒渐隐完全不改。App消费一次返回值，同时更新成员入口序号和调用speechSound.play(toneSlot)。Grid只观察序号，不观察interim或布局；Web Animations同时播放头像两圈及card scale1→1.015→1，几何布局仍由原adaptiveLayout和top／height过渡负责。减少动态偏好时不创建动画，取消／卸载释放动画引用。

speechSound.ts提供C4～C5自然大调八个固定频率、同一sine短音及相同包络／0.21秒时长。最大增益0.055，音量按幂曲线映射，最多8音且不排队；独立于原MP3三路有界播放。pointerdown／keydown／入房合法交互解锁，未运行AudioContext、异常设备、静音时直接丢弃，字幕和视觉照常。配置变更停止旧音，离房／卸载释放全部节点与context。

roomPassword.mjs封装随机16字节盐+scrypt32字节摘要和恒时比较。roomStore写v5 passwordHash，不写accessCode；读v1～v4先校验旧记录，再原子迁移非空旧密码，迁移失败不启动，禁止静默把私密房公开。保留accessVersion、accessAccounts、ownerHash／UID、name、aliases和ASR开关。运行时对内存适配器仍可验证旧accessCode，正式磁盘路径不保留原文。房主响应仅requiresPassword，不包含摘要／原码。原5次／分钟限流、票据单次／到期／版本校验、改码撤权、保存失败保留原状态均保留。旧版本会拒绝v5，回退须兼容摘要或受控迁移；账号SQLite结构不变。

新增模块与测试、实际执行结果及人工验收边界见[验收记录](ROOM-UI-REFACTOR-20261031.md)。


## 模拟房间设置与房主明文入房码（2026-10-31，本地修复，未部署）

修复模拟分支只初始化房号、不初始化roomName且标题写死“字幕房间”的遗漏。App在模拟进入时读取指定名称或“显示名称的房间”，标题统一读取roomName；renameSimulationRoom仅在已加入的模拟会话内校验并更新名称，不重建成员、不触发音频或字幕清理。simulationAccessCode同样仅存在当前模拟会话，设置关闭重开保留，离房清空，不写真实房间或浏览器存储。ApiSettings新增可选roomName/accessCode与rename/access-code事件，提供本地元数据表单；用于模拟时为原生可滚动dialog，Escape/返回关闭，原独立使用仍为section并保留语音配置/404健康查询/请求清理。

网关新增ownerStatus，在publicStatus基础上附带当前accessCode（无入房码时为空串），仅用于合法匿名房主设置GET、经过既有鉴权的管理结果和本人绑定房间列表。publicStatus、joined、room-status、成员/字幕广播和access授权响应不含明文码；绑定房主房内页面仍从受Cookie/CSRF/HMAC保护的本人房间列表取管理状态，普通成员只读且不读取明文。RoomApiSettings、OwnedRooms和模拟设置均常驻显示已保存码，编辑输入type=text，无显示/隐藏切换；API Key掩码与按需读取不变，入房验证密码框仍沿用原行为。账号/房间资料结构、访问控制版本和改码撤权行为不变。

单元/SFC/App测试覆盖模拟初始化/改名/校验/事件/不发请求/离房清理和两端明文展示；真实回环网关与SQLite/Cookie/CSRF联调覆盖合法房主重开/重启读取、改码返回新值、成员及广播不含码。simulation-settings-browser以envFile:false的隔离Vite加载真实开发SFC，通过Vue开发实例调用已有模拟入口，在480/320px验证操作，不增加生产测试入口。原room-access-browser及workspace-browser验证联网与账号设置显示、重开/重启保留、只读和原流程。

## 首页房间卡片 V1（2026-10-31，本地实现）

`HomePage.vue`品牌Logo使用本地静态资源`public/hakisub-logo.svg`，由提供的SVG保留原路径与白色细节，仅将#140B53／#4A4284分别替换为现有深灰#41454A／中灰#62666B。`home-logo`在手机和桌面均为56px，采用12px圆角、overflow:hidden及浅色底，内部img填满并裁切；装饰图片alt为空，由品牌链接的无障碍名称提供完整含义。文字仍在上方用`b`显示“哈基字幕”、下方`small`显示“HakiSub”，沿用既有字号和响应式规则；链接仍回首页。首页浏览器回归等待图片解码后检查六视口截图与原交互。

`HomePage.vue`将房间列表入口放在“我的房间”标题右侧，仅显示原列表图标，以`aria-label`保留按钮名称及原展开状态；顶部导航只含账号入口。`home-room-heading`用同一行对齐标题与44px按钮，移动端不再隐藏图标，标题行统一承担左右留白。列表打开、搜索、选房、关闭焦点恢复及轮播位置均沿用原逻辑。

`RoomListDialog.vue`弹窗标题为“房间列表”，移除搜索框上方说明及列表行尾箭头。搜索使用SVG图标和带`aria-label`的原生search输入，`home-search-field`统一绘制圆角边线并用`:focus-within`加深；仅在该搜索框内清除输入自身的焦点outline/box-shadow，避免全局输入与模态焦点规则叠出双框，其他表单保留原焦点样式。过滤与整行入房逻辑保持。

`App.vue`保留房间会话、账号身份、创建/加入/入房码与历史导航，新增`entryOpen`只管理原入口表单的弹窗状态。`HomePage.vue`组合导航、卡片和列表，复用`AccountAccess.vue`及原`reenterRoom`；`RoomCard.vue`区分整卡进入的普通卡和仅含居中的“创建房间”和“加入房间”两个按钮的末尾功能卡。首页数据继续使用`rememberedRooms.ts`的真实浏览器缓存，`rememberRoom`原有的移到首位规则即最近访问排序，不新增置顶或后端数据字段。名称缺失时回退房间号；仅缓存入口和已有管理凭据，音频、字幕、API Key不落盘。

`RoomCarousel.vue`使用原生滚动与CSS scroll-snap，首尾通过对称留白完整居中。移动端80vw、最大340px，槽位3:4；`requestAnimationFrame`先批量读取未缩放槽位距中心的距离，再写入0～1进度，CSS将其映射到1～0.9缩放和0～0.4灰色覆盖层。蒙层为覆盖整卡的伪元素，pointer-events:none，卡片整体opacity保持1。指针位移8px阈值拦截拖动后的点击；侧卡点击先居中，当前卡点击入房。手机布局下，触屏继续走浏览器原生滚动；鼠标主键横向拖动则暂停scroll-snap并按位移更新scrollLeft，松手按实际中心距离选最近卡片、恢复吸附。鼠标按下时阻止按钮提前聚焦滚动与文字拖选，手势按横/纵方向区分，仅接管横向鼠标拖动。按需注册window pointermove/up/cancel及blur，横向拖动时捕获指针；移出卡片松手、取消/失焦/尺寸变化时收束，卸载释放监听和捕获。新的主动按下清除旧手势点击抑制，避免拖动后快速点击被误挡；没有新按下的合成点击仍拦截。方向键/Home/End移动焦点并横向居中，Enter走原按钮事件，减少动态效果偏好关闭程序滚动的平滑效果。ResizeObserver处理宽度与断点切换，卸载时释放观察和待执行帧。

768px起共享桌面/平板布局：1120px最大页面、960px内部内容容器、calc(236px * 0.8)即188.8px固定卡宽、6:7槽位、16px间距与原生横向滚动，不使用缩放/蒙层。桌面body用#62666B浅灰、首页shell用#41454A深灰，条件样式仅作用首页；导航、标题及卡片在同一内部容器对齐，手机继续保持全宽。卡片内边距20px、头像44px、名称18px，保证缩小后长名称和操作按钮仍完整显示。`src/home.css`集中保存临时灰阶、圆角、间距、比例和宽度变量，媒体查询断点为768px；脚本读取CSS布局标记，避免再定义独立的JS断点。样式以home类名限定，不改变房内与账号中心布局。

`RoomListDialog.vue`只对已有入口做名称/号码即时过滤，不调用外部搜索；点击列表行复用原入房函数。通用`HomeDialog.vue`用原生dialog提供Escape、模态焦点约束、内部滚动、关闭后的焦点恢复及背景滚动锁定；列表打开时轮播保持挂载，关闭不重建。手机列表接近全屏，桌面600px且限制最大高度。`CreateRoomDialog.vue`显示房间名称、可选“私密房间”和确定；私密选项默认浅灰，aria-pressed=true后深灰并显示四位数字密码框。`JoinRoomDialog.vue`只显示六位房间号及确定，均无共享模式切换和说明文字。私密密码严格四位ASCII数字，保留前导零；提交前复制为本次请求参数并清空输入，取消私密/关闭卸载也清空，不进入localStorage、URL或日志。两个组件向HomeDialog传入home-entry-dialog类，仅入口弹窗最大宽400px，布局最小高320px（含边框约322px），以视口高度限幅，表单上下留白与控件间距加大；房间列表保留600px和原滚动规则，不影响其他弹窗。App自动解析账号昵称/本机历史名称/默认游客，仍调用原`enter`；取消连接沿用已有代次与取消逻辑。直达与历史导航会同步加入表单房号。生产界面不提供模拟或AR预览入口；模拟引擎与测试、AR独立页面保留，个人存档仍有房内及账号中心入口。

`App.createNamedRoom`接收可选密码，以本次enter调用参数传递，不加入共享ref；取消选择后的公开创建不携带密码。沿用roomClient.connect已有的access.password与发送后删除机制。`server/roomGateway.mjs`在create分支先验证可选password，再分配房间，在第一次roomStore.save时一起写入既有accessCode/accessVersion/accessAccounts字段（schema仍v4），持久化完成前保持persisting、拒绝加入，失败删除内存占位。合法创建者仍由原ownerToken获得管理权限，普通状态不返回密码；后续改名/账号绑定保留初始访问控制。公开请求无密码，行为不变。此为既有password字段在create消息中的新用途，部署必须同步更新前端并重启网关，旧网关会忽略该创建参数，不允许仅部署静态前端。

`roomCreation.ts`通过已有POST /api/rooms/settings的rename动作保存创建表单名称，不改变服务器接口或房间协议，成员会话令牌仅在Authorization头。App先保存名称再绑定创建时的账号，避免绑定撤销匿名权限后无法改名；名称失败保留已创建房间和管理凭据，报告明确错误，不重复建房或谎报名称成功。模块提供12秒超时和AbortSignal取消，App在离房/取消/卸载清理请求，以房间与操作代次阻止迟到响应和过期账号绑定。`RoomPasswordPrompt.vue`另开原生dialog，标题固定“这是一个加密房间”，仅有密码输入与确定及关闭按钮，保留四位数字、错误重试、输入清空和账号免输机制；初次要求密码的重复提示不显示，失败时才显示错误。

`tests/home-browser.mjs`以正式构建和隔离内存网关创建真实房间，验证六个视口、跨断点调整、长名/溢出、连续缩放/蒙层、CDP滑动防误触与吸附、无触屏普通浏览器窄窗口鼠标双向拖动/连续缩放/吸附/移出松手/短拖防误入/功能按钮拖动不弹窗/失焦释放及随后正常点击、首尾居中、卡片/列表/键盘本地WebSocket进房、功能卡创建与外部加入、空房间自定义名称建房、独立表单及历史房号同步；新增私密选项颜色/输入清理、首次私密建房、另一浏览器错误重试及前导零验证和密码不入缓存。`room-creation.test.mjs`覆盖命名请求成功/失败/取消/超时/迟到响应，demo模拟覆盖自动昵称、先命名后绑定、失败保留房间及取消隔离；原模拟引擎回归继续保留。原入房码/改名、打字回应和成员控件浏览器测试适配新入口与自动名称，入房码组验证自定义名在绑定后保留及密码流程。截图位于ignored `artifacts/home/`与`artifacts/room-access/`；浏览器移动视口和CDP触摸不等于物理设备、Safari、系统软键盘或真实ASR验收。

## 房间名称（2026-10-31，本地实现，未部署）

`roomNames.mjs`共用单行名称校验与游客默认名。`roomStore.mjs`在v4元数据中增加name、guestNumber、nameCustomized，兼容读取v1～v4，缺名的历史房间使用“房间 六位房间号”，编号默认为0。新房间在网关分配递增编号并保存“游客NNN的房间”；异步写盘前保留编号避免并发重号，重启从已有记录的最大编号继续，改名和管理员换号不重置。名称通过既有串行原子写入持久化，不保存成员、音频、字幕或API Key。旧v4代码不保留新增字段，上线和回退需使用保留名称字段的配套版本。

登录建房沿用创建后自动绑定。账号服务在bind签名命令中从真实会话提供nickname，客户端不能提交UID或昵称参与授权；网关将未自定义名称改为“昵称的房间”，defaultAccountRoomName为后缀预留6单位，按剩余18单位裁短旧长昵称；已经改名则保留，之后账号昵称变化不自动改名。rename动作复用匿名房主Bearer及账号Cookie/CSRF/HMAC授权，拒绝普通成员、其他账号和跨域请求。名称统一去除首尾空白、拒绝控制字符与换行，按中英混合长度限制为24单位。先保存再更新内存、广播，失败保留原名、Key及现有ASR连接；不改变访问控制版本、房间码、别名或成员。

`accounts/shared/nameRules.mjs`由账号服务、网关和两套前端共用，无运行依赖；旁边的d.mts仅提供主前端类型。ASCII码点算1单位，其他Unicode码点（含中文标点、全角字符）算2，按码点遍历避免拆开代理对；这属于产品定义，不计算字体实际宽度，也不按组合字素计数。昵称与房内显示名称上限16单位，房间名24；HTML maxlength分别设16/24，仅作原始输入长度上限，混合校验和禁用提交使用同一规则。新注册账号保留原字母/数字/下划线及最少3位规则，最长从32改20；登录与找回仍兼容历史32位账号。注册允许省略或留空nickname，前后端均从规范化账号取前8个字符，密保答案校验使用最终昵称。修改昵称执行16单位校验；不迁移已有账号和昵称，房内只裁短旧长昵称的显示，保留账号原文。首页旧缓存显示名裁短但不丢房间或房主凭据。两套Docker和打包脚本显式包含shared/nameRules.mjs，服务器路径保持与源码相同的相对关系。

`joined`与`room-status`提供name，`roomClient.ts`转交App独立roomName，离房清空。标题、房内状态、账号概览/列表/管理显示名称并单独保留房间码和原链接；RememberedRoom可选roomName只缓存最近收到的名字，原name仍为成员显示名。RoomApiSettings与OwnedRooms提供房主表单，普通成员只读；名称按文本渲染，长名换行，沿用退出/UID变化的迟到响应隔离。

`name-rules.test.mjs`验证汉字/半角/混合/Unicode边界及默认名；`room-names.test.mjs`以隔离文件和真实回环HTTP/WSS覆盖房名12汉字/24半角边界、并发编号、权限/来源/内容校验、广播隔离、失败原子性、历史版本、重启和换号。账号真实SQLite/Cookie/CSRF测试覆盖20/21位注册、纯数字、默认昵称、混合昵称边界、旧长账号登录/找回及资料保留；room-management验证认证昵称、自定义名绑定保留、跨设备重启和改名不停止假ASR。模板/App模拟及room-access-browser（480/390/320px）、workspace-browser（375/768/1440px）覆盖默认值、实时计数、超限阻止、展示、同步、只读、窄屏及HTML文本转义；真实麦克风、豆包与物理手机另验。

## 四位入房码与账号进房资格（2026-10-31，已部署）

生产发布`room-access-20261030T1733Z`对应功能提交`391fbb0`，北京时间01:46:30配套切换两个服务。基于原Linux镜像复用已核验依赖，仅更新server/dist及package清单，无网络构建；候选容器无生产凭据/卷、无网络、只读根目录，通过网关专项、真实原生SQLite/Argon2账号测试及Cookie/CSRF入房端点测试。生产运行文件52项网关、11项账号哈希匹配，原24房/6账号及配置/卷保留，Caddy未重启。公网真实登录Cookie、跨设备免输、改码撤权、游客验证、收束/回应和WSS打字通过；写入房间v4，账号schema仍v2，最终25房/8账号含新增合成测试资料。已备份并实际解密验证，禁止以不兼容旧网关读取v4；完整归档见[发布记录](RELEASE-20261031.md)。API Key按既有规则随网关重启清空。

`roomStore.mjs`写v4、兼容读取v1～v4；新增accessCode（空或四位数字，按用户明确要求明文）、accessVersion（变更时随机UUID）和accessAccounts（已验证的内部账号ID）。所有字段仅属于本房间，原子写入/权限沿用既有房间存储，不复制API Key或字幕。读写及维护换号保留进房码/版本/账号资格；旧程序拒绝v4以避免忽略访问控制。账号SQLite schema保持v2，不新增Key或所有权镜像。每房间记住最多5000个账号。

`roomAccess.mjs`在网关实例中管理四位码校验、基础错误限流和60秒单次入场票据。已验证账号资格持久化，票据/错误窗口只在内存；正常重启后通过账号服务重新签票即可继续免输。游客直接在WSS首条join消息提交password；登录用户调用账号`POST /api/projects/hakisub/rooms/:code/access`（仅允许可选password），账号服务从Cookie取真实内部UID，保留CSRF/来源/登录会话检查，经既有HMAC签名通道发送action=access。网关验证本房间资格或四位码，成功落盘资格后才签发票据；前端再以accessTicket加入。票据绑定房间对象、账号、当前版本及到期时间，成功使用后删除；客户端提交UID不能授予资格。账号服务另按网络/账号限制请求频率；网关错误按房间及账号或实际连接来源跨重连累计5次/分钟，不依赖前端计时。

`roomGateway.mjs`在分配成员/临时ASR令牌、发送room-status和成员列表之前验证。缺码/错码/限流通过结构化error.reason返回，旧客户端仍按普通错误失败；普通客户端只收到requiresPassword布尔值，不能读取入房码或账号资格。合法匿名房主凭据和经签票证明的绑定房主可直接进入管理。新增access-code管理动作仅房主可用，空字符串移除；新码与原码相同不撤权，不同则先原子保存，再旋转版本、清空账号资格、同步删除非房主成员/ASR令牌并关闭其音频与房间连接；已排队旧成员消息也检查令牌失效。保存失败保留旧入房码/资格和ASR Key。API Key仍仅内存，原暂停/关闭/清理协议保留。

`roomClient.ts`仅在WSS首条消息携带password或accessTicket，发送后清空参数，不放URL。App维护入房操作代次及可取消账号请求，取消/离房/卸载丢弃迟到授权，账号切换后不使用旧账号票据。RoomPasswordPrompt使用原生dialog、四位数字输入/前导零、错误与忙碌状态、提交/卸载清空；access-revoked停止音频和清空字幕/草稿后返回弹窗。RoomApiSettings与账号OwnedRooms提供设置/更换/移除，普通成员只读；界面统一改名“房间设置”。无新运行依赖，无音频/字幕历史保存。

测试分层：room-access.test.mjs真实回环HTTP/WSS＋假ASR覆盖验证前不泄露、房主/账号/房间边界、单次票据/到期、跨重连限流、资格与入房码重启/换号保留、改码在线撤权及失败原子性；accounts/tests/room-access.test.mjs使用隔离真实SQLite/Argon2/Cookie/CSRF和签名服务，覆盖跨设备、双服务重启、退出、伪造UID和改码失效。App、roomClient、两处设置和RoomPasswordPrompt模拟覆盖取消/账号切换/迟到响应/清理。浏览器room-access-browser.mjs使用正式构建和真实隔离网关、合成账号身份代理签名，在480/390/320px验证完整流程并保存截图；真实Cookie边界由账号集成测试覆盖，未将合成浏览器身份当作生产Cookie验收。主测试、账号/房主测试、主/账号构建、新旧交互与账号工作台浏览器回归均需运行；真实设备/麦克风/豆包另验。

## 角色收束与输入方式（2026-10-30实现，10月31日已部署）

`memberContraction.ts`维护每成员独立的空白闭麦起点和收束状态；只有闭麦且无可见字幕时连续5秒才收束，新字/开麦/打字清零并展开，渐隐未结束仍计为有字。成员离开删除状态，只有点击本人的头像才展开和重启计时；restoreMember按selfId拒绝他人ID，普通点击与键盘激活均不能展开他人卡片。状态仅存在本端内存，不改变房间协议、ASR、音频和`captions.ts`。`MemberCaptionGrid.vue`统一读取同一轮更新后的字幕和时钟，避免逐项prop更新用旧时钟提前开始计时；固定/动态布局只分配展开成员，原成员顺序保留，底部独立单行头像栏横向滚动。全员收束提示点击自己的头像；他人头像标签仅提示长按/右键回应，继续接收回应标记和菜单，点击及回应均不触发展开。指针按住、菜单、键盘焦点及本人ASR准备/重连/错误保护卡片；普通指针焦点不阻止闭麦后的收束。卸载/窗口失焦清理按压和长按计时器，原字幕强调和滚动观察器保留。

`MemberModeControl.vue`被卡片及底部常驻控件复用，只发出toggleMic/selectTyping/menuOpen意图。App负责实际ASR开关、模式广播和打字输入窗：短按开麦/闭麦互换，typing短按先回muted；明确选中打字后先停止旧ASR、丢弃interim、保留final与草稿，再广播typing并自动打开输入窗。原会话代次继续隔离迟到回调。每个模式控件独立保存按压/菜单状态，Pointer Capture支持长按500ms后拖入左侧目标，松手命中才提交，移出取消；长按原地松手保留菜单并抑制合成click。系统触屏contextmenu不提前展开，右键只展开不切模式。菜单Teleport至body避免卡片裁剪，限制视口边界，支持显式展开按钮、方向键/菜单键/Shift+F10、Escape与外部点击；卸载清理计时器和窗口监听。

验证：`caption-grid.test.mjs`覆盖连续5秒空白计时/新字清零/渐隐/同轮时钟快照/恢复顺序/焦点保护/成员清理；`member-mode-control.test.mjs`覆盖实际SFC模板及长按、拖入确认、移出取消、合成点击抑制、键盘、禁用和卸载；App模拟回归短按及显式打字、草稿和ASR停止。`test:member-controls:browser`使用隔离内存网关、假Web Speech和Chrome时钟在480/390/320px覆盖八成员、原生鼠标/CDP模拟触摸、底部恢复、单行滚动与固定/动态边界，输出本地截图；旧双房间八成员浏览器回归同步更新新入口。无新运行依赖，真实物理手机/麦克风/豆包另验。

## 生产宿主机维护（2026-10-29）

2026-10-31仅复查占用和容器状态，未修改生产文件或服务：根分区19%已用、约30.3GiB可用，三个容器运行且网关/账号healthy。发布归档合计约205MiB；Docker显示553.3MB构建缓存，其中大部分标记SHARED，不能视为独立可回收空间。维持现有镜像/持久卷/备份，当前无需紧急清理。详见[复查记录](PRODUCTION-MAINTENANCE-20261029.md#2026-10-31-只读空间复查)。

应用镜像、四个持久卷、Compose及代理/密钥结构保持。升级14个系统/Docker包，补装linux-virtual元包，重启后运行6.8.0-147-generic、Docker29.9.2、Compose5.6.1；宿主机及生产容器无PHP。原5账号全记录/23房、SQLite完整性、秘密配置和证书核验通过，自检后6账号/24房，房间Key遵循重启后失效规则。清理已核验的重复镜像.tar、相同临时文件、构建/APT缓存、hello-world及过期journal，释放约1.97GB；回滚镜像/源码/备份保留，历史九份.tar路径需要时从保留镜像重新导出。保留cloud-init hold及待云平台确认的RETBleed警告。详见[维护记录](PRODUCTION-MAINTENANCE-20261029.md)。

## XDstar 账号工作台（2026-10-29，已部署）

19:43:06（北京时间）发布`account-workspace-20261029T1139Z`，功能源码`bb5447df91bf339f92247f7e2d4b270be6984706`。基于原账号Linux镜像仅替换dist，后端逐项哈希与依赖配置一致；单独重建accounts，HakiSub/Caddy容器ID未变，原账号卷、schema v2及23房/4账号身份保留。线上新建一个明确标记的合成自检账号，最终5账号/23房；真实HTTPS静态资源3项匹配，三视口工作台/抽屉、注册/UID登录/退出、host-only Secure/HttpOnly Cookie与跨子域凭据CORS通过。真实手机及麦克风/豆包未验；加密备份与只回退账号镜像的入口见ACCOUNT-DEPLOYMENT。

重构范围仅 `accounts/src/` 和前端测试/文档，无新运行依赖。`AccountApp.vue` 保留账号 API 调用，使用内存 view 组织总览/房间/存档/资料/安全五个页面；未登录时是登录主入口及注册、恢复文字链接。注册由 registrationStep 控制两个表单，第一步只做前端验证，第二步复用 QuestionFields 后一次提交原注册接口。步骤切换不清空输入，账号请求失败保留待修正内容，成功提交按操作清理对应密码/答案；跨页及退出清理敏感状态。密码与密保的验证密码分别保存。身份刷新使用代次丢弃迟到响应，暂时网络错误保留当前身份，同 UID 刷新不覆盖昵称草稿，401 清理会话并返回登录。

`AccountNavigation.vue` 只提供共用导航与退出事件。桌面 CSS 为固定 240px 左栏，右侧自适应、最大 1180px；900px 以下显示顶部栏与原生 dialog 抽屉，85vw/最大320px，不挤压内容。showModal 提供顶层与背景 inert/焦点约束，手动保存/恢复 body 样式及 scrollY，close/Escape/遮罩/导航/卸载/切换桌面均释放滚动锁和恢复焦点。页面切换后聚焦标题，保留 aria-current、状态播报、输入标签、可见焦点及减少动画支持。

`OwnedRooms.vue` 复用原有列表和 manage API：总览最多三张状态摘要；我的房间显示完整卡片列表，选中后只挂载该房间的 ASR、Key 和安全说明。返回列表、模式/UID变化、刷新或卸载均清理原文/输入/确认状态并隔离迟到响应；房间 API 返回401通知根组件清理身份。Key保存/替换/显示/隐藏/测试/确认删除及ASR切换仍由原接口按UID鉴权，CSRF封装未变。房间存档与真实房主身份仍是独立边界。HakiSub `src/`、服务器、数据库、音频/ASR、权限和Key持久规则均未修改。

测试分层：账号与房主套件使用真实隔离 SQLite/Argon2 与假上游校验认证/CSRF/权限；SFC测试覆盖注册往返、失败重试、页面分区、敏感清理与迟到响应；可选 workspace-browser.mjs 在正式构建和无头Chrome下使用合成API，覆盖375/768/1440px完整交互、滚动/焦点/视口切换及截图。真实手机/真实Key/麦克风/豆包未在此轮验收；生产跨子域Cookie结果见本节上线记录。

## 打字与快捷回应（2026-10-29已部署；本人回应扩展本地完成，未部署）

生产于北京时间17:04部署`captions-20261029T0853Z`，源代码`b8afe0ca719b15a3b8126b20fae3b051864492c9`。只更新网关镜像及前端，账号源码/构建11项与生产逐字节一致，账号/Caddy容器未重建，数据卷与凭据保留。原21房/4账号身份验证保留；独立公网验收新增2间空测试房，总23房。HTTPS页面/音效28项哈希一致、公网WSS八人及正式浏览器打字/回应/词库/MP3试听通过；真实麦克风/豆包与物理手机另验。加密备份、镜像和回滚见ACCOUNT-DEPLOYMENT本期记录。

沿用 `MemberCaptionGrid.vue` 卡片、`App.vue` 每成员 ASR 会话、`roomClient.ts` 和 `/api/rooms`，不引入聊天系统。保留 `mic` 字段及旧 ASR 消息；成员广播新增 `mode: microphone | muted | typing`。`mic` 开关同步 mode，`mode` 只接受 muted/typing 并关闭当前成员 ASR。客户端切换前停止采集和 ASR，保留已确认字幕、丢弃 Interim；ASR 回调增加会话代次校验，停止后的旧回调不能修改新会话或打字状态。房间/识别来源/模拟功能继续使用既有生命周期。

打字草稿在 App 内存保存，逐字输入不发网络。`typed-caption` 带 UUID 句子请求 ID 和文字；网关按连接身份验证 typing 状态、非空/1000 UTF-16 长度/控制字符以及每连接 1 秒间隔，广播普通 `caption(final)`，句子 ID 加入服务端成员命名空间。UI 统一交给未改动的 `captions.ts`，等待自己的回包确认再清空对应草稿，期间新编辑不会被旧确认覆盖；错误或 10 秒未确认保留草稿。切换模式保留草稿，离房/断线清空。

卡片仅发送本人 `editTyped` 入口事件，App 按当前 typing 状态挂载 `TypingComposer.vue`。输入窗使用全局 fixed 定位，桌面位于页面中下方，触屏在可见视口底部留 12px 间隔；监听 `visualViewport.resize/scroll`，以 height/width/offsetTop/offsetLeft 跟随软键盘及 iOS 聚焦平移，没有该 API 则跟随 window.resize。宽高限制在可见区域内，考虑 safe-area，textarea 使用16px字体避免手机聚焦放大。外观为单个白色圆角框，不显示标题或收起按钮；textarea与底部白色操作区通过flex分开，正文独立滚动，左下字数、右下32px方形SVG发送箭头不会被长文字覆盖。打开时 preventScroll 聚焦，发送按钮阻止 pointerdown 转移焦点以维持键盘。window捕获阶段监听框外click，收起编辑器并保留打字模式与草稿；空白点击停止继续传播，防止自己卡片的同一次click再次打开编辑器，按钮和链接等控件仍响应原操作。Escape也可收起；卸载清理视口与click监听。草稿继续按 App 生命周期管理。textarea 使用 composition 标志、isComposing、旧 keyCode 229 和 compositionend 后 50ms 保护处理选字事件顺序；Shift+Enter 保留换行。此输入窗只编辑待发送字幕，不展示聊天历史。

`reaction` 只发送 targetId 与固定词库中的类型；网关完全从 socket 取 senderId，验证目标是本房在线成员（本地新版允许本人），每连接 1.5 秒限流，服务端分配事件 UUID 后只广播本房。本人目标与他人目标共用冷却，不接受跨房间或已离线目标；App对本人目标显示“表情 昵称：所选词”，对他人的原有措辞保留。回应不依赖 mic、字幕或布局，成员列表仍是唯一目标来源。客户端在独立有界数组保存最多 24 条事件，每卡最多显示最新 3 个气泡，共用 50ms 时钟在收到后 2.6 秒移除，不进入字幕生命周期。离房、目标离线清理。两类新消息继承现有总流量/载荷/Origin/背压/会话撤销保护，不写磁盘，也不向新加入者补发。

回应菜单最多显示个人选择的5项，底部左取消、右设置。`ReactionSettings.vue` 使用原生dialog和独立选择草稿，从13项固定词库勾选1～5项，选满禁用未选项，支持恢复默认/取消/保存。App管理本人偏好并传给卡片；`roomInteractions.ts` 提供词库、默认5项、去重/白名单/数量归一化及 `hakisub.reaction-selection.v1` 本地存储，仅保存回应类型，不含成员身份或消息。存储损坏/不可用时回退默认，保存失败仍在当前页面生效并提示。个人选择不发网络、不开启账号同步，其他成员无论自己是否勾选都按完整词库渲染收到的回应。网关白名单与词库配套扩展，真实WebSocket测试遍历全部13种，原发送者/房间/限流校验保留；前后端需配套更新并重启网关。

`roomInteractions.ts` 集中 UI 事件类型、固定选项、边界常量、IME判断、回应/音效偏好校验及浏览器存储；实际音频素材加载和播放独立在 `reactionSound.ts`。卡片桌面通过 contextmenu 右键打开回应，手机 Pointer Events 长按500ms打开，自己的卡片和收起头像同样可作为目标；左键/轻触不绑定回应，自己的普通点击继续打字或展开。移动超过10px/结束/取消撤销定时器。卡片捕获阶段跳过麦克风/输入方式控件、打字入口按钮及编辑控件，保留它们的原有手势；长按成功后在捕获阶段拦截一次合成click，新一次pointerdown恢复普通点击，避免误打字或展开。触屏系统contextmenu仅preventDefault，不提前打开或重定位；所有卡片配合touch-callout和user-select防止系统菜单，自己的textarea保留原生编辑菜单。菜单固定在视口内，可取消/Escape/外部点击关闭，卸载移除监听器与定时器。本人回应扩展需要配套部署前端和网关，旧网关仍拒绝本人目标。

全局音效入口在房间顶部，`SoundSettings.vue` 使用原生dialog提供即时开关、音量、按槽位试听及加载/就绪/受限/静音状态。App持有设备级 `SoundPreferences`，所有有效回应统一经过同一音频引擎，不按卡片/目标/麦克风状态过滤，但把reaction类型交给对应MP3槽位。`hakisub.sound-preferences.v1`只持久化enabled和0～100音量；读取校验/损坏回退默认开启60%，写失败仅提示本页已生效，无房间协议或账号同步。音量线性映射到素材增益，最多3个加载中或播放中的声音；关闭/零音量不加载播放，配置变化立即停止旧声音，离房/卸载释放全部节点与AudioContext。resume与异步加载/解码均检查context和操作代次，迟到授权/下载/解码不补播；拒绝/不支持/设备失败均返回状态，不向字幕或WebSocket抛错。试听不发房间消息、不启动采集。

`public/sounds/reactions/`提供14个已填充MP3和运行时`slots.json`，默认通用文件加13种回应。只允许同目录ASCII MP3文件名，禁止远程URL、其他目录与任意供应商结构；配置缺失或损坏回退约定文件名。fetch同源/no-cache，配置限16KiB，音频流有界读取1MiB、单请求5秒超时，decodeAudioData后验证0～5秒；专属素材缺失/损坏/超限回退通用MP3，通用也失败则静音并提示。Promise缓存去重相同文件下载/解码，刷新或离房清理；取消请求和过期任务不会晚到播放。server/staticWebsite.mjs增加audio/mpeg与JSON/TXT MIME，构建和现有打包自动包含public复制的dist素材。原WebAudio振荡器已移除，使用AudioBufferSourceNode播放本地下载素材；没有运行时FFmpeg或第三方请求。

素材来自Kenney官方Interface Sounds 1.0（CC0），原包License.txt随目录保留，SOURCES.json记录原包SHA256、原文件名/哈希、转码后哈希及增益调整；原OGG经一次性FFmpeg/libmp3lame转为单声道44.1kHz/96kbps MP3，原信号峰值统一约-12dBFS，总60497字节。README给出槽位替换、统一映射、刷新/重新构建步骤。tests/sound-settings.test.mjs验证实际MP3槽位/配置、异步去重、回退/边界/超时/取消/迟到解码，以及音量/静音/授权/设备失败模拟；Chromium脚本从正式静态服务读取并解码全部14个素材，核对MIME/时长/非静音/峰值，统计原生BufferSource.start验证默认/逐项试听、同房旁观成员播放、跨房隔离及偏好恢复，不把调用成功等同于物理听感验收。

验证入口：`npm test` 包括新增真实双房间/八成员 WebSocket 完整词库联调、卡片模板与事件、个人回应选择/上限/持久化/存储失败、悬浮输入窗及键盘视口/IME 模拟、App/ASR 生命周期、提示音失败模拟；`npm run test:room-interactions:browser -- <playwright>` 使用构建产物和临时网关验证菜单取消/设置布局、个人词库选项/刷新恢复/成员偏好隔离/新词广播、桌面右键/左键不弹菜单、移动长按、全局输入窗、模拟软键盘视口升降平移、八人发送、IME 合成事件和语音模拟回归。物理多设备、真实软键盘/系统 IME、真实音频与 ASR 单独人工验收。

## 公开 UID 与交互（2026-10-25，已部署）

`interaction-20261025T1510Z` 于北京时间23:23配套上线。账号库事务迁移至v2，增加唯一 `users.public_uid`，给旧账号分配100000～999999的六位字符串，避开现有数字账号名；注册也拒绝占用已分配UID的账号名。公开身份仅返回短UID，账号/UID均经密码验证登录和启动找回，账号限流归一到内部ID。`users.id`、全部外键、会话和房间 `ownerUid` 继续使用原UUID，服务签名授权只取服务端会话中的内部ID，无需修改房间所有权或重新绑定。密码统一8～128字符，Argon2id、Origin/CSRF、限流和会话撤销保留。

密码字段提供独立显示开关，切页/提交结束清理输入及开关。当前安全码是三道密保答案，默认明文，只导出本地当次填写内容；后端继续只存哈希，不新增可逆密保存储。

Key输入分开保存草稿、配置状态掩码、临时查看原文；保存后清除草稿并显示 `********`。空草稿和全星号不得提交，服务端也拒绝全星号。新增 `reveal` 经现有POST/Origin/CSRF/HMAC和当前房主校验，仅点击时返回原文，不进入成员广播、普通状态、日志、磁盘或浏览器持久存储。账号代理在上游返回后再次验证会话；匿名凭据绑定后被撤权，游客/成员/其他账号不能查看。隐藏、刷新、卸载和账号切换清理原文。只读成员没有输入和显示按钮；本机设置沿用本机Origin/令牌保护，环境只读Key不提供查看。

生产原3个账号、20间房及密保/存档/项目关联经备份副本迁移和上线逐项核对保留。SQLite integrity_check与foreign_key_check通过。回滚与验收见ACCOUNT-DEPLOYMENT；真实豆包、麦克风与手机另验。后文记录此前阶段。

> 2026-10-23 生产状态：Star-Hub 已运行 main `d1f237b`，包含 `52b9788`，发布 `deploy-20261022T1748Z`。账号服务与 HakiSub 独立进程，分别仅回环映射 18788/18787，同一私有 Docker 网络通过 HMAC 管理通信；原 Caddy 提供主站与子域 HTTPS，公网 `/internal`、`/internal/*` 明确返回 404。主站会话 Cookie 为 host-only、Secure、HttpOnly，通过主站 BFF 校验 UID，子域不持有账号凭据。UID/房主/别名/ASR 开关持久化，房间 Key 仅内存，启动后全部缺 Key，旧磁盘 Key 永不恢复、无默认回退。生产原有 19 间房元数据保留，首次成功元数据写入已迁移为 v3；详见 ACCOUNT-DEPLOYMENT 的本期记录。后文早期“本地未部署”字样仅描述当时阶段。

## UID 房主与远程房间管理（2026-10-22，本地未部署）

`accounts/server/accountServer.mjs` 复用主站 HttpOnly、Secure、host-only Cookie / CSRF / 精确 Origin。所有管理路径位于 `/api/projects/hakisub/rooms`；HakiSub 子域通过带凭据 CORS 请求主站，Cookie 仍只发给主站。客户端不提交 UID、不复制 Cookie 或长期 token。`GET rooms` 只返回当前账号真正拥有的房间，个人偏好存档与本机入口继续单独管理。

账号服务只从有效 SQLite 会话取 UID，网络等待后重查会话，通过 `roomManagementClient.mjs` 签发限定房间操作。独立 `HAKISUB_ROOM_MANAGEMENT_SECRET` 对 `POST\n/internal/rooms/manage\n<完整JSON正文>` 做 HMAC-SHA256。正文包含 UID、动作、房间码、时间、一次性 nonce 和每次网关启动随机 audience；10 秒时间窗、常量时间签名比较、nonce 缓存上限及重启失效防止篡改/重放。请求不重定向、不接受浏览器 Origin，响应不含 Key/ownerHash/ownerToken。内部接口即使误入反代也必须校验签名；生产仍不得公开代理 `/internal/*`。双服务只通过回环/隔离容器网络或受信 TLS 通信，不允许公网明文传递 Key。账号故障/过期/缺配置拒绝管理，无成员权限降级。管理请求已经发出后不作跨服务分布式撤销；请求有效期最多10秒，不向浏览器签发可复用授权票据。

`roomGateway.mjs` 是唯一所有权与运行状态权威：匿名房间用 ownerHash 核对原凭据；绑定同时验证服务器认证的 UID 和原 ownerToken，原子保存 ownerUid 并随机替换 ownerHash，撤销所有在线成员缓存的匿名 owner。绑定失败不撤销；已绑定拒绝重复认领（含同 UID），不提供解绑/转移。绑定后匿名设置 POST 一律403，账号管理每次核对 ownerUid，普通 memberId/token 只代表在线成员。登录后创建复用“创建匿名真实房间 → 服务器核验绑定”流程；若账号不可用，明确提示绑定未完成并保留可重试的匿名房主凭据。

`roomStore.mjs` 读取v1/v2/v3，写v3白名单元数据：code、aliases、ownerHash、ownerUid、asrEnabled。旧encryptedKey/apiKey/keyState忽略且不解密，不需要旧加密主密钥。首次成功元数据写入剥离全文件旧Key字段；读取不自动改写源文件。网关加载记录后强制apiKey为空、keyState=missing，即使传入旧适配器也不恢复Key。configured/deleted/missing仅当前进程内存状态，后端启动重置为missing。

房内匿名设置与账号远程操作共用每房互斥管理函数，冲突409。Key设置/删除仅更改网关内存，不调用持久存储；绑定/开关只提交元数据。换删Key、切换开关时先锁定并同步清理本房客户端/上游和并发占位。开关持久化失败返回500，保持原开关并清除当前Key，广播缺Key状态；无blocked或重启重新授权状态。重启即缺Key，不能因磁盘故障恢复付费能力。

ASR WebSocket upgrade 强制检查成员、开麦、房间锁、asrEnabled、本房内存Key和并发。恢复开关不会自动开麦，Key测试仍只检查握手。身份、跨设备管理、Cookie/签名授权、成员广播与模拟/Web Speech规则不变。

自动验证：`npm run test:room-management` 使用真实 SQLite/Argon2id/HTTP/WebSocket 和假豆包，另渲染实际个人中心模板；现有四条测试/构建命令仍须执行。真实跨子域 TLS/Cookie、真机/麦克风/云端识别及容器资源验收单独记录。

ASR 并发配置（2026-10-22）：`runtimeConfiguration.mjs` 三种部署模式默认均为 8 路，`HAKISUB_MAX_ASR_SESSIONS` 仍只接受 1～8，Compose 与发布示例同步默认 8。此上限为网关跨房间的全局有效识别连接数，每成员一路、无令牌入口限制、Origin、Key、超时和停止清理逻辑不变。线上原镜像已通过显式环境配置从 2 改为 8，无需发布本地其他功能。部署模拟覆盖默认八路、显式两路覆盖、跨房间第九路拒绝、同成员重复拒绝以及关麦后释放名额；后文默认两路是历史记录。

统一账号（2026-10-21，本地完成，未部署）：`accounts/server/` 是独立 Fastify/SQLite 服务，使用成熟 Cookie/CORS/CSRF 插件、Argon2id 与 better-sqlite3，不修改实时网关或豆包协议。主站专属 `__Host-xdstar_session` Cookie（无Domain）只发送给主站；HakiSub 的 `accountClient.ts` 通过精确 Origin 凭据 CORS 请求最小身份和本人存档，不读取 username 或长期认证 token。账号设置只接受主站 Origin；CSRF 绑定会话与 account/hakisub 作用域。SQLite 保存密码/答案哈希、会话 token 摘要、找回挑战、私人配置及持久限流；注册成功配额与插入同事务复检，哈希计算有单路与有界队列。

`AccountAccess.vue` 定期/回到页面时刷新身份；App 仅在未入房且用户未手改显示名时填昵称，不更换 memberId。`RoomPresets.vue` 保存/同步/改名/加载/删除识别来源和布局，严格排除 API Key、ownerToken、成员token、音频字幕。个人中心链接携带的 preset UUID 仍由服务端按当前 UID 授权，加载不会自动入房或开麦。主站页面独立构建至 `accounts/dist/`，HakiSub 主体布局和字幕生命周期保留。`scripts/preview-accounts.mjs` 使用独立测试库、空Key内存网关和5179/8790回环端口，不连接现有8787或生产。

UID、Room Owner、Member 三者独立：UID关联长期数据，ownerUid关联已绑定房间；未绑定房间继续使用独立匿名凭据。绑定必须同时验证账号会话和本房管理凭据，不能按昵称、房间号或存档认领。房主手动暂停全房豆包ASR已在本地实现，销毁、费用额度/熔断未实施。可选 `compose.accounts.yaml` 和 Caddy 候选文件尚未启用。Linux原生依赖、真实跨子域Cookie及生产费用保护另验；完整风险、数据表和方案见 [账号审查](ACCOUNT-SYSTEM-PLAN.md)，执行见 [账号部署](ACCOUNT-DEPLOYMENT.md)。

房间URL及分享（2026-10-21，复制交互于2026-10-31更新）：`roomNavigation.ts`严格解析六位数字路径并构造只含origin和正式房间号的分享URL；App在服务器joined确认后从首页pushState，直达/别名路径则replaceState为规范的`/<code>/`。初始深链接及popstate只预填加入信息，不自动连接或开麦；后退/前进先清理成员会话、采集和字幕。pagehide保留路径以支持刷新，断线保留房间路径供重进，返回首页按钮才切换根路径。分享按钮直接写入Clipboard，以窗口中央短暂提示反馈成功或失败；异步结果通过操作编号避免离房后更新。模拟房间不提供联网分享入口。生产静态服务仅额外白名单匹配六位房间路径（可含尾斜线），仍拒绝其他未知路径，资源/API使用根路径。

房间换号（2026-10-20）：roomStore的version 1记录增加可选aliases，加载时校验其六位码、去重及与所有正式房间号互斥；旧资料无aliases兼容。renameRoom在串行原子提交中保留ownerHash、解密原Key后以新号为AAD重新加密，删除旧正式记录并保存旧号别名；冲突/非法目标不覆盖资料，保存配置不丢别名。gateway在加入时把别名解析到同一room对象，创建时避开所有别名，不产生第二份成员/配置。joined仅向本房成员提供号码别名，无新增公开管理API。

前端rememberRoom按正式号及服务器返回的别名合并本地入口，保留当前浏览器的ownerToken；直接输入新号而本机只有旧号凭据时，App最多重新加入一次以补验原房主身份，不自动开麦。普通成员不会获得房主凭据，失效凭据不无限重试。服务器CLI renameRoom.mjs默认--check，--apply仅供停止应用后的维护窗口；要求预先备份加密数据及环境，重复执行识别已迁移状态，不回显Key/管理凭据。不修改字幕、音频、识别或重连参数。

语音传输恢复（2026-10-20）：用户取消延迟调优，仅修复断连。`asrGateway.mjs`在识别cleanup时先标记asrStopped、终止上游并释放本人asr引用，升级校验只统计尚未结束的连接；旧close回调通过引用相等检查不能清除新连接的占位。测试让旧客户端暂停接收close，验证本机和联网成员在旧握手未完成时均可建下一句，同时重复/超并发仍403。

`doubaoAsrClient.ts`对浏览器到网关的error/异常close/send异常做250/750ms退避，30秒内最多两次；每连接编号与代次隔离迟到回调，关麦/离房撤销计时器。保留已有10秒有界未发送队列，成功交给WebSocket的音频不重放，清除旧Interim而保留Final；没有未发语音时回到本地等待，下次开口再建连。`App.vue`仅豆包reconnecting继续广播mic:true，避免恢复状态误关麦导致服务器撤销连接。服务端明确的配置/协议/上游错误仍安全停止，不无限重试；中断片段可能缺失，不宣称恢复全部音频。识别参数/检测/上传节奏/字幕生命周期不变。

模型加载超时修复（2026-10-20）：旧20秒固定启动时限同时包含运行库、约14.7MB模型/WASM下载和编译，慢连接无法完成且无阶段提示。`vadAssets.ts`提供同源版本URL及有界流式下载，按浏览器解压后的实际字节累计进度并校验长度，模型与WASM并行下载；Worker把已下载字节直接交给ORT，避免重复下载，运行库/下载/初始化分别汇报状态。`speechDetector.ts`下载30秒无进度、初始化60秒、总准备180秒保护；`doubaoAsrClient.ts`把采集30秒保护独立计时，采集完成后不再打断模型准备，取消/故障仍终止Worker并释放音轨。进度与公开资源缓存不包含音频、识别文字或密钥。

`prepare-vad-runtime.mjs`生成四份gzip副本（模型/WASM合计约5.1MB），正式静态服务按Accept-Encoding提供预压缩响应、保留原MIME、Content-Length/Vary；只有带版本的已知VAD资源使用长期缓存，HTML仍no-cache。打包校验原件与gzip均存在；模型/ORT升级需同步`vadAssets.ts`版本和长度。运行时仍单线程、独立Worker、无CDN/跨源隔离要求。下段20秒时限为此前修复的历史状态，以本节为准。

麦克风启动修复（2026-10-20）：此前采集与VAD加载并行，但speechDetector把模型未就绪时的音频也放入25包运行队列，首次加载超过5秒就提前报积压。初始化阶段改为最多3包滚动缓冲（约600ms），ready后只处理最近句首片段；模型加载20秒超时、运行时25包上限/陈旧音频/单包超时和故障释放继续保留。UI通过startingMemberId仅给本人的卡片展示“准备中”，按钮为“取消开启”，均就绪后才显示开启；不预先广播开麦、不提前连云端。回归测试覆盖12秒/60包加载及原有运行期故障；真实浏览器用合成静音、延迟Worker初始化12秒，实际AudioContext/Worklet/重采样/模型推理成功切换listening且云连接为0，关闭后恢复idle。未访问真实麦克风或豆包。

房间流程改造（2026-10-20，已部署hakisub-20261020T133934Z并通过公网及真实服务重启验收）：默认online；`rememberedRooms.ts`只在浏览器保存房间码、显示名及创建者管理凭据，首页再次进入发起新的join并始终保持麦克风关闭。`roomGateway.mjs`在全员离开后保留房间，成员令牌仍立即撤销；重进不恢复音频或字幕。创建者随机凭据只在创建响应发给本人，服务端保存SHA256摘要，重新加入时校验，其他成员不能冒用配置权限。

`RoomApiSettings.vue`在房间内使用原生模态dialog，提供密码输入、保存/移除、握手测试、绑定及状态刷新；关闭/离房清空输入并取消请求。`roomSettings.mjs`通过成员Bearer、Origin和匿名创建者权限管理未绑定房间；绑定后走账号服务代理。每房管理互斥，配置写入期间阻止新豆包会话并清理旧会话；浏览器字幕广播不受该锁控制，不要求其他成员退出。仅返回状态，不返回Key。联网房间仅使用本房Key；旧本机设置API保留给模拟房间。

当前roomStore仅持久化房间元数据，不持久化Key、成员、识别文字或音频。旧版AES-256-GCM字段从不加载；错误/缺失加密主密钥不再阻止元数据读取，但损坏身份/别名/开关或冲突记录仍拒绝加载。改号只保留元数据与别名，不再解密/重加密Key。旧初始化脚本及生产卷不在本轮执行或修改。

主站已上线（2026-10-20）：用户确认备案通过（鄂ICP备2026059859号-1），选择 `xdstar.work` 主站入口卡片链接 `hakisub.xdstar.work`。`deploy/xdstar/` 包含无脚本、无第三方字体的独立 HTML/CSS/SVG 主页；由同一 Caddy 只读挂载 `/srv/xdstar` 并提供文件服务，主站无需启动另一 Node 进程。子域名原样代理到回环18787，Origin只允许子域名，不共享主站状态，不新增iframe、音频采集或ASR接口。主站配置禁止脚本/表单/嵌入，应用的Worker/WASM策略不受该站头影响；打包脚本递归包含主页资源。用户已完成DNS并确认云防火墙放行；两站Let's Encrypt证书签发成功，可信HTTPS、HTTP跳转、VAD资源及公网WSS房间/合成字幕/隔离/清理均通过服务器外部验收。常驻应用已切换174817Z公网镜像，仍512MiB/0.75CPU、非root只读、回环18787；Caddy128MiB/0.25CPU、只读根目录与证书持久卷，管理API关闭。旧环境和镜像保留供回退，真实Key/麦克风/双设备及续期周期尚未验收。下述2026-10-16域名阻塞和私有部署为历史记录，最新状态见PUBLIC-DEPLOYMENT.md。

域名与TLS准备（2026-10-16）：入口固定为hakisub.xdstar.work，用户要求ICP备案前不公开广州节点。新增独立Caddy Compose profile与固定域名配置，预期在Linux宿主网络反向代理现有127.0.0.1:18787，免费Let's Encrypt自动签发/续期，保留证书卷，关闭管理API和HTTP/3，不启用访问日志并过滤运行日志的request字段。启用前要求实际备案成功及确认字段，默认不启动；后端端口保持回环。官方Caddy2.11.6镜像已校验上传，在无网络无端口临时容器通过配置validate，隔离Compose解析通过；TLS签发、WSS与续期未实测，未改常驻服务。用户控制台确认域名未实名，公共DNS/RDAP证实暂停解析；操作步骤及精确镜像摘要见PUBLIC-DEPLOYMENT.md。

公网部署扩展（2026-10-16）：`runtimeConfiguration.mjs` 新增 `public` 模式，要求显式非本机 HTTPS Origin，继续禁用网页设置及无成员令牌 ASR，默认两路并发；本机/私有模式行为保留。`deploy/compose.public.yaml` 覆盖网关模式和来源，保留宿主机回环端口及原有资源限制，预期由同源 TLS 反向代理转发网页与两条 WebSocket。公网入口尚未部署，实际状态见 [公网部署](PUBLIC-DEPLOYMENT.md)。音频、字幕生命周期、UI、Key读取方式均未改变。

阿里云第一阶段已于2026-10-16部署：单个Node容器经宿主机127.0.0.1:18787及本机SSH隧道供授权人员测试，健康检查通过。容器内已验证正式网页、模型资源、房间WebSocket创建/加入/字幕广播和私有访问限制；API Key为空，真实ASR及双设备讲话待验收。执行记录见 [受控测试部署手册](PRIVATE-TEST-DEPLOYMENT.md)，初期背景见 [部署审查与方案](DEPLOYMENT-PLAN.md)。

`server/runtimeConfiguration.mjs` 只从服务端进程环境读取部署模式、监听地址、端口、允许的本机Origin与1～8路ASR上限；非法值在启动前拒绝。默认local保持既有本机行为，private-test关闭密钥设置接口和无成员令牌ASR，限制一个房间、默认两路ASR。Compose显式设置容器内0.0.0.0:8787，宿主机只映射127.0.0.1:18787，Origin只接受测试电脑的localhost:18787/127.0.0.1:18787。默认模式不会因新增Docker支持而扩大本机监听。

Dockerfile不在服务器构建前端；按锁文件安装Linux依赖，最终镜像仅复制ws、server和已构建的dist。Compose以非root、只读文件系统运行，配置512MiB内存上限且不额外使用Swap、0.75CPU、日志轮转与unless-stopped。Key由服务器secrets/server.env在运行时注入，不进入构建上下文。打包脚本按白名单生成版本包及校验清单，包含尚未提交代码；不依赖远端Git已更新。当前使用本机Windows OpenSSH、现有密钥代理和hakisub-server别名直接管理；不修改服务器登录配置。

本次镜像获取：服务器现有阿里云加速器连续3次返回not found，本机以已校验的官方crane工具、原版Node22.23.3 Linux/amd64基础层和锁文件同版纯JS ws组装完整运行镜像，无需本机Docker；这次没有执行Dockerfile的npm安装阶段。应用文件来自与当前测试结果一致的发布快照，基础层及ws完整性分别校验。通过SCP上传、SHA256复核及docker load导入后，先运行无网络/无宿主端口的临时容器验证，再经用户确认以--no-build --pull never启动Compose。Node基础摘要已记入发布配置，未修改Docker全局配置、Node主版本或其他项目。Docker29的containerd存储以manifest摘要显示镜像ID，须与归档config摘要区分记录。

`src/` 是 Vue 网页；`server/` 是本地 Node.js 语音网关；`tests/` 包含字幕、布局、浏览器和豆包模拟测试；`docs/` 保存维护说明和实际开发记录。

## 产品说明页面

`public/product.html` 是独立的产品方向与功能范围备忘录，样式与交互分别位于 `public/product.css`、`public/product.js`。Vite 开发时直接提供，构建后原样复制到 `dist/`，正式静态服务无需新路由。该页面不接入音频、ASR、字幕状态或任何密钥接口。功能清单在 `product.js` 中维护，区分代码实现与真实验收状态；路线与未确认功能显式标为建议或讨论项。

用户选择的独立私有在线版使用 `sites/hakisub-product/` 的独立 Sites 源码仓库与身份，静态资源位于其 `dist/`；与 `public/product.*` 同步维护，仅将返回本机应用的链接改为页内导航。发布只包含这三个静态文件与部署声明，不包含主项目、密钥、语音模型或运行时。网站以私有方式部署，后续更新复用既有站点身份。

讨论备忘仅在用户点击保存时写入当前源的 localStorage，键为 `hakisub.product.discussion-note.v1`，不保存识别内容、不跨端同步；存储失败时提示导出 Markdown。打印时临时展示完整功能清单、展开讨论问题，打印结束后恢复原筛选和折叠状态。此页面不代表新的联网房间或跨平台实现。

## 房间通信

新增 server/roomGateway.mjs 管理 /api/rooms WebSocket、内存房间、成员和临时会话令牌。服务端生成不冲突的六位数字码，每房最多 8 人、最多 100 个房间；只有创建/加入成功后才能发送成员消息。成员身份从连接确定，客户端提交其他 memberId 不会冒用他人身份。心跳每 15 秒检查连接，连续未响应会终止连接、撤销令牌和释放该成员 ASR；最后一人离开清空成员，房间资料与配置继续保留。不持久化音频、字幕或成员历史，也不补发旧字幕。

src/roomClient.ts 处理创建/加入、成员快照、统一字幕及撤回事件、连接超时和清理。App.vue 按服务端 selfId 查找本人，不能用成员数组首位代表本人。联网模式与本地模拟分开；麦克风仍由用户主动开启。识别回调把统一 CaptionEvent 发到房间，服务端绑定 memberId 后广播，各页面交给原 captions.ts 维护 interim/final 和过期。成员关麦清理未确认字幕，离房移除该成员全部字幕；整个房间连接中断则停止本机采集并清空页面。

asrSession.ts 将仅存在内存的房间令牌传给 doubaoAsrClient.ts，ASR 通过 /api/asr?session=令牌 绑定到已开麦成员。网关拒绝无效令牌、同一成员第二路、超出全局上限、房间暂停/锁定/缺Key的连接，每路上游、超时、结果映射和用量独立。旧无令牌入口只保留本机单设备兼容，与成员会话互斥。联网房间无默认Key回退；尚无账户额度隔离。令牌是临时成员凭据，不是豆包Key；部署时不应记录带查询参数的ASR URL。

本地默认仍只监听127.0.0.1；已部署私有容器监听0.0.0.0，宿主发布限于127.0.0.1，Origin只接受SSH隧道的本机页面，并禁用无令牌入口和设置接口。公网Origin、HTTPS反向代理、正式用户/管理员授权和用量策略留待下一阶段。模拟测试覆盖真实本地双路WebSocket与假豆包上游、独立音频及结果、成员与房间隔离、满员、关麦离房和客户端/UI清理；容器实测不等于真实API、多设备、串音、额度或长时运行验收。

## 音频到字幕

```text
App.vue（来源选择与麦克风按钮）
  → asrSession.ts（为成员创建独立会话）
     ├─ browserAsr.ts → 浏览器 Web Speech API
     └─ doubaoAsrClient.ts
          ← audioCapture.ts / audioCapture.worklet.js（单麦克风）
          ← audioResampler.ts（16kHz、16-bit LE、单声道，每200ms一包）
          → speechDetector.ts → sileroVad.worker.ts / sileroVadModel.ts（本地人声概率）
          → voiceActivityGate.ts（起始缓冲、概率门槛、安静判停）
          → /api/asr → server/asrGateway.mjs
          → doubaoProtocol.mjs → 豆包 ASR 2.0 WebSocket
          ← doubaoResults.mjs（供应商分句转成通用事件）
  → captionEvents.ts（memberId / utteranceId / text / interim或final）
  → App.vue → captions.ts → MemberCaptionGrid.vue
```

`captions.ts` 是唯一字幕生命周期实现：Interim 原位更新、不计时；Final 确认后按字数保留 3/6/10 秒，再渐隐 2 秒。模拟模式仍直接使用它。

## 协议与会话边界

- 网关固定连接 `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`；资源为 `volc.seedasr.sauc.duration`。请求头为 `X-Api-Key`、`X-Api-Resource-Id`、随机 `X-Api-Request-Id`。
- v3 二进制：四字节头、可选响应序号、大端长度、Gzip 负载。首包为 JSON 配置，随后为 PCM 包；解析响应和供应商错误帧，验证长度及压缩类型。末包标志与负序号按协议解析。用户停止是立即取消连接，不等待最终补字。
- `show_utterances=true`、`result_type=full`、`enable_nonstream=true`。默认模型支持普通话，双向接口不传旧文档中 nostream 专用的 `language`。
- 全量响应的已确认分句是稳定前缀。用会话 ID + 分句顺序映射 Interim/Final，避免文字和临时时间戳修订造成重复。仅 `definite=true` 触发 Final；不会凭静音时间猜 Final。累计历史只在当前响应解析，不保存文本历史；映射器只保留计数。
- 二遍识别仍使用云端默认分句；本地人声检测只决定上传和会话边界，不代替云端的 definite 标记。独立 Worker 内以单线程 ONNX Runtime Web 运行固定 Silero v6：每帧 512 个16kHz样本、64个历史样本和独立循环状态，跨200ms包保留余样本，不逐包补零或丢弃。每包取最大人声概率，起始/续讲门槛0.5/0.35。环形缓冲保留可配置的约500ms触发前音频；安静约1.6秒后发空负包，等待云端末包与 Final，并在旧连接实际关闭后才为下一句建连。采集保持开启。模型可能误判或漏判，不保证精确端到端延迟或精确省费。AudioContext 使用设备默认采样率，输出由覆盖面积平均重采样到16kHz并保留跨块相位，避免强制上下文采样率带来的兼容性问题。
- `speechDetector.ts` 保留原始PCM用于句首与上传，仅将副本转移给Worker；一次只派发一个推理请求。模型未就绪时只滚动保留最近3包（600ms），就绪后包含在途包在内最多缓存25包（5秒）；下载停滞30秒、初始化60秒/总准备180秒、单包推理3秒或音频陈旧5秒保护触发时停止，不退回持续上传。Worker、模型和WASM从同源加载，固定单线程无需跨源隔离。`prepare-vad-runtime.mjs` 在dev/build前校验模型SHA-256并准备固定版本运行资源和gzip副本，许可证随资源部署。手动停止销毁整个Worker，循环状态与缓冲不跨会话或成员共享。
- 客户端先取得麦克风权限，本地检测到说话后才创建云端连接；握手期间最多暂存约 10 秒音频，超限安全停止。音频和每段结束标记共用有序队列，握手完成后最多按每个采集包补发两个旧包，避免一次突发推送；采集继续推进队列，不靠后台 JS 定时器。停止时释放轨道、Worklet、AudioContext、WebSocket 和计时器；迟到的权限结果也释放。未确认字幕丢弃，已确认字幕继续过期。
- 页面切换到后台不主动停止采集；浏览器音频图若进入 suspended 状态，会尝试 resume，失败则显示采集错误。`pagehide`、离房、模式切换和手动关闭仍完整清理。后台运行是否持续由浏览器和系统决定，仍需真实麦克风验收。
- 本地网关只绑定 127.0.0.1、限制本项目 Origin、旧本地入口一次只接收一个会话；绑定房间成员的入口每人最多一路，全网关默认最多 8 路；收到前端 `finish` 控制消息后发送空负包，等待上游最终响应再结束会话。10 秒无音频、15 分钟会话上限、启动超时、队列积压都会结束连接；明确服务错误需手动处理，网页到网关的传输故障限次恢复，正常分句结束后可自动新建下一会话。结束识别立即释放有效名额，不让关闭中的旧Socket阻挡下一句。公网部署需要另行增加用户鉴权与额度管理。

## 密钥与启动

正式模式 `npm start` 由同一 Node HTTP 服务在 127.0.0.1:8787 提供 `dist/` 静态页面、设置接口和 ASR WebSocket，无需 Vite。`staticWebsite.mjs` 只读取构建目录，限制方法、拒绝点文件与路径越界；`/glasses` 返回入口页。允许的本机 Origin 包含 8787，开发模式仍保留 5173/4173。

Windows `scripts/install-local.ps1` 安装当前用户登录触发的 `HakiSub-Local` 计划任务及 Chrome 桌面快捷方式；`start-local.ps1` 隐藏启动 Node 并等待退出，供任务计划程序追踪生命周期。任务不自动启麦、不保存声音，重启会清空内存用量。此方案不是云部署，不能在本机关闭时供其他设备使用。

常驻网页从磁盘读取dist，网关模块则只在Node进程启动时加载；仅构建或刷新可能形成新页面与旧协议实现并行，例为本人回应已出现在菜单而旧网关仍拒绝targetId等于senderId。更新后必须让原任务对应的Node实际退出，再启动并核对新PID及健康检查。Windows停止任务后可能留下旧子进程，应核实8787监听PID及本项目脚本路径后仅清理该进程，避免误停其他Node服务。验收本人回应需覆盖实际运行实例；隔离测试通过不能证明常驻进程已更新。

`server/index.mjs` 通过 `apiKeyStore.mjs` 从根目录 `.env`（或优先的进程环境）读取 Key。禁止把 Key 放入 `VITE_*`、前端构建产物或浏览器存储。健康检查只返回是否已配置。程序不保存音频和识别结果，不转发上游原始错误文本。

主页 `components/ApiSettings.vue` → 同源 `/api/asr/settings` → `server/apiSettings.mjs` → `apiKeyStore.mjs` → 根目录 `.env`。用户输入仅用于提交到本机网关，服务端不回传原值；保存采用临时文件替换，保留其他配置，成功后更新内存，下次识别使用新 Key。文件为明文，Git 忽略不等于加密；进程环境提供的 Key 在页面只读。

上述设置写入仅用于提供该接口的本机模式。`ApiSettings.vue`在初次读取设置返回404时，改为查询现有 `/api/asr/health` 的configured布尔值，显示服务器统一管理说明；后续刷新只请求health，不渲染密钥表单、删除/测试入口或AsrUsageStatistics，脚本也拒绝执行设置写操作。不改变服务器404策略，不通过前端打开管理员权限。加载状态区分读取中、可用及不可用，网络/响应/超时错误不会永久显示“正在读取配置”；离开时取消请求并忽略迟到响应。`tests/api-settings-view.test.mjs`用模拟HTTP请求与实际Vue模板渲染覆盖私有只读、本机保存和环境只读、重试/超时/卸载行为。

设置接口校验本机 Host、允许的 Origin、JSON 类型及随机请求令牌；变更和连接测试互斥，识别期间拒绝操作，设置操作期间拒绝新识别连接。连接测试只进行带鉴权头的 WebSocket 握手，超时或页面离开即清理，不发送音频、不自动重连，也不证明实际识别成功。这些约束面向本机服务，不能替代公网用户鉴权、房主授权及额度管理。

`npm run dev` 同进程启动网关和 Vite；Ctrl+C 统一关闭。构建预览需 `npm run server` 加 `npm run preview`。浏览器 ASR 的原有有限重连策略保持不变。

## 用量诊断

`AsrUsageStatistics.vue` 在设置卡片内轮询本机 `/api/asr/settings/usage`，沿用设置接口的 Host/Origin 限制。网关只保留最近一个会话的统计对象和启动以来累计 PCM 字节数，无历史列表、不落盘。统计独立于日志开关；累计不因换 Key 清零，不能视作账户统计。页面按官方毫秒单位换算 `audio_info.duration`，仍不视作扣量或余额。

房间里的“本次开麦”统计由 `App.vue` 在手动开启豆包麦克风时清零；首次进入监听状态启动墙钟计时，关闭或报错冻结。网关在音频发送完成及收到 `audio_info.duration` 时通过本地 WebSocket 发送仅含 Request ID 与三个时长值的 `usage` 事件。前端按 Request ID 覆盖进度，再对自动分句连接求和，避免重复累计。提交值表示交给上游发送，完成值表示本地 WebSocket 发送回调成功，豆包返回值取各连接最新响应中的时长字段，均不是账单查询。切换来源、模式或离房时清除内存统计；服务端仍不保存分段历史。

官方管理查询与识别链路分离：[资源包状态接口目录](https://api.volcengine.com/api-docs/?serviceCode=speech_saas_prod&version=2025-05-20)、[用量查询及 AK/SK 签名示例](https://docs.volcengine.com/docs/DoubaoVoice/Callvolumequeryinterfacedescription?lang=zh)、[资金余额查询](https://docs.volcengine.com/docs/BillingCenter/QueryBalanceAcct-Queryuseraccountbalanceinformation?lang=zh)。本次仅核对文档，未接入管理凭证或调用这些账户接口；资源包小时额度与现金余额应分别查询和显示。

用量诊断由 `server/asrDiagnostics.mjs` 负责，仅由网关在上游音频发送边界统计 PCM 字节和发送完成回调。`HAKISUB_ASR_DEBUG=1`（进程环境）开启元数据日志；默认关闭。不将 Gzip 长度当成音频长度，不累计多次响应中的 `audio_info.duration`，也不将本地发送成功解释为云端计费确认。日志不含音频、识别文字和鉴权信息。

## 跨平台迁移约束

豆包是产品默认识别路线，真实输入的初始识别来源已设为豆包；页面默认真实联网，仍要求手动开麦；模拟模式可选。网页版和安卓 App 必须保留设备本地检测、讲话触发上传、静音结束云端会话和再次讲话恢复的完整状态转换；浏览器 ASR 仅为可选适配器，不作为自动停止上传的实现基础。当前网页已接入 Silero 模型 VAD，用户报告的省费效果不等于精确计费或跨平台验收结论。

迁移时分离平台采集适配器、VAD 判定、上传会话控制和统一字幕事件；现有字幕生命周期继续复用。设备端停止向网关发送与网关停止向豆包发送分别验证。客户端挂起、失联或音频中断时由网关超时清理上游连接；不能依赖后台页面一定能够主动发送结束消息。当前已有无音频超时与会话上限，尚无网关端声学 VAD。

详细设计依据、EasySub 与 Silero 参考、环境边界及迁移验收见 [跨平台语音与自动停止上传](cross-platform-audio.md)。网页已接入模型，尚未进行安卓适配或公网部署。

## 后续扩展位置（尚未实现）

- VAD调优、RNNoise：Silero推理在 `sileroVadModel.ts`，概率门槛与缓冲在 `voiceActivityGate.ts`；后续按真实声学测试调优，不修改二进制编码器或字幕生命周期。RNNoise尚未接入。
- 设备选择：联网成员已有独立采集、ASR 会话和 memberId；单台设备的多麦克风选择和路由尚未实现。
- 串音过滤、声纹验证：音频处理链和字幕事件进入 `captions.ts` 之前接入；不把身份判断混入 UI。
- OBS、眼镜显示端：消费同样的通用字幕事件；尚未接入这些显示端；房间内已可跨连接同步字幕。
- 其他 ASR 提供商：在 `asrSession.ts` 中增加适配器，复用字幕事件与生命周期。

官方依据（核对日期 2026-10-12）：
- [实时双向流式识别：参数与鉴权](https://docs.volcengine.com/docs/DoubaoVoice/bidirectional-streaming-automatic-speech-recognition-websocket?lang=zh)
- [v3 二进制协议与错误帧](https://docs.volcengine.com/docs/6561/1354869?lang=zh)

本次房间链接功能已部署hakisub-20261020T173624Z，线上index-DhETaCY6.js与本地构建逐字节一致；公网房间路径/HEAD/no-cache/非法路径、HTTPS/WSS及VAD资源回归通过，隔离浏览器实际完成直达/刷新/分享复制/历史切换。原114514及985529别名、配置保留，未调用真实ASR。
