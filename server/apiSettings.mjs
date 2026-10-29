import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { DOUBAO_URL, DOUBAO_RESOURCE_ID } from './doubaoProtocol.mjs'

export const allowedAppOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:8787', 'http://localhost:8787']

export function testDoubaoConnection(apiKey, { connect = (url, options) => new WebSocket(url, options), timeoutMs = 8000, signal } = {}) {
  return new Promise(resolve => {
    let socket, finished = false, timer
    const finish = (ok, message) => {
      if (finished) return
      finished = true; clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.terminate()
      resolve({ ok, message })
    }
    const cancel = () => finish(false, '连接测试已取消。')
    if (signal?.aborted) { cancel(); return }
    signal?.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => finish(false, '连接超时，请检查到豆包服务的网络。'), timeoutMs)
    try {
      socket = connect(DOUBAO_URL, { headers: { 'X-Api-Key': apiKey, 'X-Api-Resource-Id': DOUBAO_RESOURCE_ID, 'X-Api-Request-Id': randomUUID() }, handshakeTimeout: timeoutMs, maxPayload: 1024 * 1024 })
      socket.on('open', () => finish(true, 'WebSocket 握手通过。尚未发送音频，请回房间讲话验证实际识别。'))
      socket.on('unexpected-response', (_request, response) => { response.resume(); finish(false, `连接被拒绝（HTTP ${response.statusCode}），请检查语音 API Key、模型权限及额度。`) })
      socket.on('error', () => finish(false, '连接失败，请检查网络、API Key 和语音服务权限。'))
      socket.on('close', () => finish(false, '连接提前关闭，请重试。'))
    } catch { finish(false, '无法开始连接测试，请检查配置。') }
  })
}

export function createApiSettingsHandler(store, { isRecognizing = () => false, probe = testDoubaoConnection, getUsage = () => null } = {}) {
  const csrfToken = randomUUID()
  let busy = false
  const handler = async (request, response) => {
    const reply = (status, body) => {
      if (!response.destroyed) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(body)) }
    }
    // 校验 Host 防 DNS 重绑定；写操作再校验 Origin 和当前进程随机令牌，拒绝跨站表单。
    let hostname
    try { hostname = new URL(`http://${request.headers.host}`).hostname } catch { /* invalid host */ }
    if (!['127.0.0.1', 'localhost'].includes(hostname) || request.headers['sec-fetch-site'] === 'cross-site' ||
      (request.headers.origin && !allowedAppOrigins.includes(request.headers.origin))) { reply(403, { message: '请从本机 HakiSub 页面访问设置。' }); return }
    if (request.url === '/api/asr/settings/usage' && request.method === 'GET') {
      reply(200, getUsage()); return
    }
    if (request.url === '/api/asr/settings' && request.method === 'GET') {
      reply(200, { ...store.status(), csrfToken, busy: busy || isRecognizing() }); return
    }
    if (!['/api/asr/settings', '/api/asr/settings/test'].includes(request.url) || request.method !== 'POST') { reply(405, { message: '不支持的设置操作。' }); return }
    if (!allowedAppOrigins.includes(request.headers.origin) || request.headers['x-hakisub-token'] !== csrfToken) { reply(403, { message: '设置授权已失效，请关闭设置后重新打开。' }); return }
    if (busy || isRecognizing()) { reply(409, { message: '请先停止识别或等待当前设置操作完成。' }); return }
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') { reply(415, { message: '请求格式不正确。' }); return }
    busy = true
    try {
      let body = '', bytes = 0
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 4096) { reply(413, { message: '配置内容过长。' }); return }
        body += chunk.toString('utf8')
      }
      let command
      try { command = JSON.parse(body) } catch { reply(400, { message: '配置格式不正确。' }); return }
      if (!command || typeof command !== 'object') { reply(400, { message: '配置格式不正确。' }); return }
      if (request.url.endsWith('/test')) {
        if (!store.getKey()) { reply(400, { message: '请先保存 API Key。' }); return }
        const controller = new AbortController()
        const cancel = () => controller.abort()
        response.once('close', cancel)
        try { reply(200, await probe(store.getKey(), { signal: controller.signal })) }
        finally { response.off('close', cancel) }
      } else {
        if (store.status().readOnly) { reply(409, { message: '当前由进程环境变量配置，请移除该环境变量后重启再修改。' }); return }
        if (command.action === 'reveal') { reply(200, { apiKey: store.getKey() }); return }
        if (command.action !== 'delete' && (command.action !== 'save' || typeof command.apiKey !== 'string' || !command.apiKey.trim())) { reply(400, { message: '请输入 API Key 后保存。' }); return }
        const key = command.action === 'delete' ? '' : command.apiKey.trim()
        if (/^\*+$/.test(key) || key.length > 2048 || /[^\x21-\x7e]|["'`#\\]/.test(key)) { reply(400, { message: 'API Key 格式无效，请重新复制完整密钥。' }); return }
        await store.save(key)
        reply(200, { ...store.status(), message: key ? '已保存，下次开启识别时生效。' : '已删除本地 API Key。' })
      }
    } catch { reply(500, { message: '无法保存或读取本地配置，请检查 .env 文件权限。' }) }
    finally { busy = false }
  }
  handler.isBusy = () => busy
  return handler
}
