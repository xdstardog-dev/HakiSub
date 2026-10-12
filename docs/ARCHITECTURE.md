# HakiSub 架构

`src/` 是 Vue 网页；`server/` 是本地 Node.js 语音网关；`tests/` 包含字幕、布局、浏览器和豆包模拟测试；`docs/` 保存维护说明和实际开发记录。

## 音频到字幕

```text
App.vue（来源选择与麦克风按钮）
  → asrSession.ts（为成员创建独立会话）
     ├─ browserAsr.ts → 浏览器 Web Speech API
     └─ doubaoAsrClient.ts
          ← audioCapture.ts / audioCapture.worklet.js（单麦克风）
          ← audioResampler.ts（16kHz、16-bit LE、单声道，每200ms一包）
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
- 二遍识别使用云端默认断句，不做本地 VAD、不减少静音上传；不保证精确端到端延迟。后备重采样使用覆盖面积平均，保留跨块相位；优先让 AudioContext 以 16kHz 输出。
- 客户端先取得麦克风权限，再创建云端连接，连接就绪前音频不上传、不积压。停止时释放轨道、Worklet、AudioContext、WebSocket 和计时器；迟到的权限结果也释放。未确认字幕丢弃，已确认字幕继续过期。
- 本地网关只绑定 127.0.0.1、限制本项目 Origin、一次只接收一个会话；10 秒无音频、15 分钟会话上限、启动超时、队列积压都会结束连接。无自动重连。公网部署需要另行增加用户鉴权与额度管理。

## 密钥与启动

`server/index.mjs` 从根目录 `.env`（或进程环境）读取 Key。Vite 的网页仅通过同源代理访问网关，禁止把 Key 放入 `VITE_*`、页面或浏览器存储。健康检查只返回是否已配置。程序不保存音频和识别结果，不转发上游原始错误文本。

`npm run dev` 同进程启动网关和 Vite；Ctrl+C 统一关闭。构建预览需 `npm run server` 加 `npm run preview`。浏览器 ASR 的原有有限重连策略保持不变。

## 后续扩展位置（尚未实现）

- VAD、RNNoise：放在采集输出与 `doubaoAsrClient` 上传之间；先定义停送音频时的供应商会话策略，不修改二进制编码器。
- 多麦克风：为每个设备创建独立采集、ASR 会话和 memberId；届时调整当前网关单会话限制。现在没有设备选择或多路功能。
- 串音过滤、声纹验证：音频处理链和字幕事件进入 `captions.ts` 之前接入；不把身份判断混入 UI。
- OBS、眼镜显示端：消费同样的通用字幕事件；当前没有跨端传输。
- 其他 ASR 提供商：在 `asrSession.ts` 中增加适配器，复用字幕事件与生命周期。

官方依据（核对日期 2026-10-12）：
- [实时双向流式识别：参数与鉴权](https://docs.volcengine.com/docs/DoubaoVoice/bidirectional-streaming-automatic-speech-recognition-websocket?lang=zh)
- [v3 二进制协议与错误帧](https://docs.volcengine.com/docs/6561/1354869?lang=zh)
