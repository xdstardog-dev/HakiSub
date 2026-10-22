import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import WebSocket, { WebSocketServer } from 'ws'
import { DOUBAO_URL, DOUBAO_RESOURCE_ID, createRecognitionRequest, createAudioPacket, parseRecognitionResponse } from './doubaoProtocol.mjs'
import { createDoubaoResultMapper } from './doubaoResults.mjs'
import { createApiSettingsHandler, allowedAppOrigins } from './apiSettings.mjs'
import { createAsrDiagnostics } from './asrDiagnostics.mjs'
import { createRoomGateway } from './roomGateway.mjs'
import { createRoomSettingsHandler } from './roomSettings.mjs'
import { createRoomManagementHandler } from './roomManagement.mjs'

export function createAsrGateway({ apiKey = '', keyStore, connectUpstream = (url, options) => new WebSocket(url, options),
  startupTimeoutMs = 15000, idleTimeoutMs = 10000, maxSessionMs = 15 * 60 * 1000, diagnostics = {}, serveWebsite, maxAsrSessions = 8,
  allowedOrigins = allowedAppOrigins, allowLegacyAsr = true, enableSettings = true, maxRooms = 100, roomStore, probeRoomKey, roomManagementSecret } = {}) {
  const rooms = createRoomGateway({ maxRooms, roomStore, probe: probeRoomKey })
  const roomSettingsHandler = createRoomSettingsHandler(rooms, { allowedOrigins })
  const managementHandler = createRoomManagementHandler(rooms, roomManagementSecret)
  const usageStartedAt = new Date().toISOString()
  let totalSubmittedPcmBytes = 0, latestStatistics
  const settingsHandler = keyStore && enableSettings ? createApiSettingsHandler(keyStore, {
    isRecognizing: () => sockets.clients.size > 0,
    getUsage: () => ({ since: usageStartedAt, totalAudioSeconds: totalSubmittedPcmBytes / 32000,
      latest: latestStatistics?.snapshot() ?? null }),
  }) : undefined
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/internal/')) { void managementHandler(request, response); return }
    if (request.url === '/api/rooms/settings') { void roomSettingsHandler(request, response); return }
    if (request.url?.startsWith('/api/asr/settings') && settingsHandler) { void settingsHandler(request, response); return }
    if (request.url === '/api/asr/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ configured: !!(keyStore?.getKey() ?? apiKey).trim() }))
    } else if (serveWebsite && !request.url?.startsWith('/api/')) { void serveWebsite(request, response) }
    else { response.writeHead(404); response.end() }
  })
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 6400, perMessageDeflate: false })
  server.on('upgrade', (request, socket, head) => {
    // 本地网关只接受本项目预览页，避免任意网站调用本机的付费凭据。
    if (request.url === '/api/rooms' && allowedOrigins.includes(request.headers.origin)) { rooms.upgrade(request, socket, head); return }
    let url
    try { url = new URL(request.url, 'http://localhost') }
    catch { socket.destroy(); return }
    const token = url.searchParams.get('session')
    const member = token ? rooms.findSession(token) : undefined
    const activeClients = [...sockets.clients].filter(client => !client.asrStopped)
    const legacyBusy = activeClients.some(client => !client.roomMember)
    if (url.pathname !== '/api/asr' || !allowedOrigins.includes(request.headers.origin) || settingsHandler?.isBusy() ||
      (token ? !member || !member.mic || member.asr || member.room.settingsBusy || !member.room.asrEnabled || !member.room.apiKey || legacyBusy || activeClients.length >= maxAsrSessions : !allowLegacyAsr || activeClients.length >= 1)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
    }
    sockets.handleUpgrade(request, socket, head, client => {
      if (member) {
        client.roomMember = member; member.asr = client
        client.once('close', () => { if (member.asr === client) member.asr = undefined })
      }
      sockets.emit('connection', client)
    })
  })
  sockets.on('connection', client => {
    const sessionApiKey = client.roomMember ? client.roomMember.room.apiKey : (keyStore?.getKey() ?? apiKey)
    let upstream, stopped = false, ready = false, finishing = false, startupTimer, idleTimer, sessionTimer
    const sessionId = randomUUID()
    const statistics = createAsrDiagnostics(sessionId, diagnostics)
    latestStatistics = statistics
    const mapResults = createDoubaoResultMapper(sessionId)
    const send = message => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
    }
    const sendUsage = () => {
      const snapshot = statistics.snapshot()
      send({ type: 'usage', requestId: sessionId,
        submittedAudioSeconds: snapshot.submittedAudioSeconds,
        completedAudioSeconds: snapshot.completedAudioSeconds,
        serverAudioSeconds: snapshot.serverDuration ? snapshot.serverDuration.value / 1000 : null })
    }
    const cleanup = () => {
      if (stopped) return
      stopped = true
      client.asrStopped = true
      clearTimeout(startupTimer); clearTimeout(idleTimer); clearTimeout(sessionTimer)
      // terminate 立即关闭传输，停止后不再发送积压的音频。
      if (upstream && upstream.readyState !== WebSocket.CLOSED) upstream.terminate()
      // 已停止的上游不再占成员或并发名额；不能等待浏览器完成close握手才释放。
      if (client.roomMember?.asr === client) client.roomMember.asr = undefined
      if (client.readyState === WebSocket.OPEN) client.close()
      statistics.end()
    }
    const fail = message => { send({ type: 'error', message }); cleanup() }
    client.stopRoomAsr = () => fail('房主已暂停或更新房间豆包配置，请检查状态后手动开麦。')
    client.on('error', cleanup)
    client.on('close', cleanup)
    if (!sessionApiKey.trim()) { fail(client.roomMember ? '尚未配置豆包 API Key，请房间创建者打开房间内的“豆包配置”并保存。' : '尚未配置豆包 API Key，请打开房间内的豆包配置。'); return }
    startupTimer = setTimeout(() => fail('连接豆包超时，请检查网络后手动重试。'), startupTimeoutMs)
    sessionTimer = setTimeout(() => fail('本次识别已达到 15 分钟上限，麦克风已关闭；需要继续时请手动开启。'), maxSessionMs)
    const refreshAudioTimeout = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => fail('麦克风音频传输中断，已停止识别，请重新开启。'), idleTimeoutMs)
    }
    try {
      upstream = connectUpstream(DOUBAO_URL, { headers: {
        'X-Api-Key': sessionApiKey.trim(), 'X-Api-Resource-Id': DOUBAO_RESOURCE_ID, 'X-Api-Request-Id': sessionId,
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
      // 采集已启动，等握手完成才允许上传；后续二进制响应仍可能报告服务错误。
      ready = true; clearTimeout(startupTimer); refreshAudioTimeout()
      send({ type: 'ready' })
    })
    upstream.on('message', (packet, isBinary) => {
      if (stopped) return
      try {
        if (!isBinary) throw Error('需要二进制响应')
        const response = parseRecognitionResponse(packet)
        statistics.response(response.payload)
        if (response.payload?.audio_info?.duration !== undefined) sendUsage()
        if (response.errorCode !== undefined) { fail(`豆包识别失败（错误码 ${response.errorCode}），请检查服务配置、额度与音频格式。`); return }
        if (client.bufferedAmount > 128000) { fail('字幕接收过慢，已停止识别，请重新开启。'); return }
        for (const event of mapResults(response.payload)) send(event)
        if (response.isLast) { sendUsage(); send({ type: 'ended' }); cleanup() }
      } catch { fail('豆包返回的数据无法解析，已停止识别。') }
    })
    client.on('message', (packet, isBinary) => {
      if (stopped) return
      if (!isBinary) {
        if (packet.toString() !== 'finish' || !ready || finishing) { fail('收到无效的会话结束消息。'); return }
        finishing = true
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => fail('等待最后一句识别超时。'), 5000)
        upstream.send(createAudioPacket(Buffer.alloc(0), true), error => {
          if (error && !stopped) fail('无法结束识别会话。')
        })
        return
      }
      if (finishing) { fail('识别会话正在结束。'); return }
      if (!ready || packet.length !== 6400) { fail('音频格式错误，需发送 200ms 单声道 PCM。'); return }
      if (upstream.bufferedAmount > 64000) { fail('网络上传过慢，已停止识别，请检查网络。'); return }
      refreshAudioTimeout()
      const encodedPacket = createAudioPacket(packet)
      statistics.submitted(packet.length)
      totalSubmittedPcmBytes += packet.length
      upstream.send(encodedPacket, error => {
        if (!error) { statistics.completed(packet.length); sendUsage() }
        else if (!stopped) fail('音频发送失败，已停止识别，请手动重试。')
      })
    })
  })
  return { server, close: async () => {
    await rooms.close()
    for (const client of sockets.clients) client.terminate()
    await new Promise(resolve => sockets.close(resolve))
    if (server.listening) await new Promise(resolve => server.close(resolve))
  } }
}
