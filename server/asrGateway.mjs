import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import WebSocket, { WebSocketServer } from 'ws'
import { DOUBAO_URL, DOUBAO_RESOURCE_ID, createRecognitionRequest, createAudioPacket, parseRecognitionResponse } from './doubaoProtocol.mjs'
import { createDoubaoResultMapper } from './doubaoResults.mjs'

export function createAsrGateway({ apiKey = '', connectUpstream = (url, options) => new WebSocket(url, options),
  startupTimeoutMs = 15000, idleTimeoutMs = 10000, maxSessionMs = 15 * 60 * 1000 } = {}) {
  const server = createServer((request, response) => {
    if (request.url === '/api/asr/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ configured: !!apiKey.trim() }))
    } else { response.writeHead(404); response.end() }
  })
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 6400, perMessageDeflate: false })
  server.on('upgrade', (request, socket, head) => {
    // 本地网关只接受本项目预览页，避免任意网站调用本机的付费凭据。
    const allowedOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173']
    if (request.url !== '/api/asr' || !allowedOrigins.includes(request.headers.origin) || sockets.clients.size >= 1) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
    }
    sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client))
  })
  sockets.on('connection', client => {
    let upstream, stopped = false, ready = false, startupTimer, idleTimer, sessionTimer
    const sessionId = randomUUID()
    const mapResults = createDoubaoResultMapper(sessionId)
    const send = message => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
    }
    const cleanup = () => {
      if (stopped) return
      stopped = true
      clearTimeout(startupTimer); clearTimeout(idleTimer); clearTimeout(sessionTimer)
      // terminate 立即关闭传输，停止后不再发送积压的音频。
      if (upstream && upstream.readyState !== WebSocket.CLOSED) upstream.terminate()
      if (client.readyState === WebSocket.OPEN) client.close()
    }
    const fail = message => { send({ type: 'error', message }); cleanup() }
    client.on('error', cleanup)
    client.on('close', cleanup)
    if (!apiKey.trim()) { fail('尚未配置豆包 API Key。请在项目根目录 .env 中填写后重启服务。'); return }
    startupTimer = setTimeout(() => fail('连接豆包超时，请检查网络后手动重试。'), startupTimeoutMs)
    sessionTimer = setTimeout(() => fail('本次识别已达到 15 分钟上限，麦克风已关闭；需要继续时请手动开启。'), maxSessionMs)
    const refreshAudioTimeout = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => fail('麦克风音频传输中断，已停止识别，请重新开启。'), idleTimeoutMs)
    }
    try {
      upstream = connectUpstream(DOUBAO_URL, { headers: {
        'X-Api-Key': apiKey.trim(), 'X-Api-Resource-Id': DOUBAO_RESOURCE_ID, 'X-Api-Request-Id': sessionId,
      }, handshakeTimeout: startupTimeoutMs, maxPayload: 1024 * 1024, perMessageDeflate: false })
    } catch { fail('无法连接豆包，请检查网络与服务配置。'); return }
    upstream.on('error', () => { if (!stopped) fail('豆包连接失败，请检查网络、API Key 和服务权限。') })
    upstream.on('unexpected-response', (_request, response) => {
      response.resume()
      if (!stopped) fail(`豆包拒绝连接（HTTP ${response.statusCode}），请检查 API Key、模型权限及额度。`)
    })
    upstream.on('close', () => { if (!stopped) fail('豆包连接已断开，麦克风已关闭，请手动重试。') })
    upstream.on('open', () => {
      if (stopped) return
      upstream.send(createRecognitionRequest(sessionId))
      // 等到握手完成再采集；服务错误由后续二进制响应报告，不声称已经识别成功。
      ready = true; clearTimeout(startupTimer); refreshAudioTimeout()
      send({ type: 'ready' })
    })
    upstream.on('message', (packet, isBinary) => {
      if (stopped) return
      try {
        if (!isBinary) throw Error('需要二进制响应')
        const response = parseRecognitionResponse(packet)
        if (response.errorCode !== undefined) { fail(`豆包识别失败（错误码 ${response.errorCode}），请检查服务配置、额度与音频格式。`); return }
        if (client.bufferedAmount > 128000) { fail('字幕接收过慢，已停止识别，请重新开启。'); return }
        for (const event of mapResults(response.payload)) send(event)
        if (response.isLast) { send({ type: 'ended' }); cleanup() }
      } catch { fail('豆包返回的数据无法解析，已停止识别。') }
    })
    client.on('message', (packet, isBinary) => {
      if (stopped) return
      if (!isBinary) { fail('收到无效的音频消息，已停止识别。'); return }
      if (!ready || packet.length !== 6400) { fail('音频格式错误，需发送 200ms 单声道 PCM。'); return }
      if (upstream.bufferedAmount > 64000) { fail('网络上传过慢，已停止识别，请检查网络。'); return }
      refreshAudioTimeout()
      upstream.send(createAudioPacket(packet))
    })
  })
  return { server, close: async () => {
    for (const client of sockets.clients) client.terminate()
    await new Promise(resolve => sockets.close(resolve))
    if (server.listening) await new Promise(resolve => server.close(resolve))
  } }
}
