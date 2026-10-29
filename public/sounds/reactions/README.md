# 快捷回应 MP3 槽位

此目录包含已填充的 14 个 MP3 文件，页面从本地同源资源读取，运行时不访问 Kenney 或其他音效网站。全局音效开关、音量、浏览器播放权限及最多3个声音叠加规则继续生效。

## 自己替换素材

1. 把自己的音频真正导出为 MP3，覆盖下表对应文件，保留文件名。不要仅把 WAV/OGG 的后缀改成 `.mp3`。
2. 建议短促、轻柔，约0.1～1秒。加载器每个文件上限1MiB、时长上限5秒；缺失、解码失败、超限会回退到通用 `default.mp3`，通用素材也不可用则静音且仍显示回应气泡。
3. 开发模式保存后刷新页面，打开房间顶部“音效”，选择“试听内容”逐项试听。页面会缓存本次已解码素材，刷新会重新验证文件，替换过程中不会自动补播旧回应。
4. 正式版本需重新执行 `npm run build`，MP3 和配置会复制到 `dist/sounds/reactions/`。只替换源码 `public/` 不会改变已构建的 `dist/`；本任务没有部署生产。

| 文件 | 对应回应 | 初始原素材（Kenney） |
| --- | --- | --- |
| `default.mp3` | 通用提示音、加载失败回退 | `pluck_001.ogg` |
| `agree.mp3` | 赞同 | `confirmation_001.ogg` |
| `disagree.mp3` | 反对 | `error_004.ogg` |
| `question.mp3` | 疑问 | `question_001.ogg` |
| `received.mp3` | 收到 | `confirmation_002.ogg` |
| `fun.mp3` | 闹麻了 | `bong_001.ogg` |
| `thanks.mp3` | 谢谢 | `confirmation_003.ogg` |
| `sorry.mp3` | 抱歉 | `back_001.ogg` |
| `slower.mp3` | 请慢一点 | `minimize_001.ogg` |
| `repeat.mp3` | 请再说一遍 | `switch_001.ogg` |
| `wait.mp3` | 稍等一下 | `tick_001.ogg` |
| `unclear.mp3` | 没听清 | `question_003.ogg` |
| `understood.mp3` | 明白了 | `confirmation_004.ogg` |
| `okay.mp3` | 没关系 | `pluck_002.ogg` |

## 更换文件名或统一音效

`slots.json` 是运行时配置。保持 `version: 1`，`default` 是通用文件名，`reactions` 按回应类型映射文件名。例如把 `fun` 改为 `"my-fun.mp3"`，并将该文件放在此目录；不需要修改 TypeScript。

如果希望所有回应都用同一个音效，把每个 `reactions` 值都改为 `"default.mp3"`。保留配置的 JSON 语法；文件名只接受英文字母、数字、横杠、下划线和 `.mp3` 后缀，不接受外部网址或目录路径。配置不可用时恢复约定的槽位文件名。每次资源请求5秒超时，不把素材请求加入 ASR 通道。

## 初始素材来源与处理

- 作者/音效包：[Kenney — Interface Sounds 1.0](https://kenney.nl/assets/interface-sounds)
- 授权：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)，允许复制、修改、分发及商业使用；原包授权文件保存在 `LICENSE.kenney.txt`。
- 2026-10-29 从官方网站公开下载。原始 OGG 经一次性 FFmpeg 工具转为单声道44.1kHz、96kbps MP3，并把原信号峰值统一到约-12dBFS；运行不依赖 FFmpeg。
- `SOURCES.json` 保留原包哈希、原文件名、原文件/转换后哈希及调整记录，描述初始素材。换成其他来源后请同步更新自己的素材来源与授权说明。

官方包是100个界面短音效，本项目仅取表中14个并非人声配音。当前素材适合作为可替换的初始提示音，真实扬声器/耳机的听感、适当音量仍需自行试听。
