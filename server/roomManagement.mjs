import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

// 独立服务密钥用于房间管理与账号入房授权；签名绑定正文、路由和本次启动，重启后旧请求失效。
export function createRoomManagementHandler(rooms, secret, now = Date.now) {
  if (secret && secret.length < 43) throw Error('房间管理服务密钥长度不足。')
  const audience = randomUUID(), used = new Map()
  const route = '/internal/rooms/manage'
  return async (request, response) => {
    const reply = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(body)) }
    if (!secret) { reply(503, { message: '房间账号管理尚未配置。' }); return }
    if (request.url === '/internal/rooms/challenge' && request.method === 'GET') { reply(200, { audience }); return }
    if (request.url !== route || request.method !== 'POST' || request.headers.origin || request.headers['content-type'] !== 'application/json') { reply(403, { message: '服务认证失败。' }); return }
    try {
      const chunks = []; let bytes = 0
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 8192) { reply(413, { message: '请求过长。' }); return }
        chunks.push(chunk)
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      const signature = request.headers['x-hakisub-signature']
      const expected = createHmac('sha256', secret).update('POST\n' + route + '\n' + raw).digest('hex')
      if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) { reply(403, { message: '服务认证失败。' }); return }
      const envelope = JSON.parse(raw)
      for (const [nonce, expires] of used) if (expires <= now()) used.delete(nonce)
      if (envelope.audience !== audience || !Number.isSafeInteger(envelope.issuedAt) || Math.abs(now() - envelope.issuedAt) > 10000 ||
          !/^[a-f0-9-]{36}$/.test(envelope.nonce) || used.has(envelope.nonce) || used.size >= 10000) { reply(403, { message: '服务请求已失效。' }); return }
      used.set(envelope.nonce, envelope.issuedAt + 10001)
      const command = envelope.command
      if (!command || typeof command.uid !== 'string' || !/^[a-f0-9-]{36}$/.test(command.uid) || !['list', 'bind', 'save', 'delete', 'test', 'asr', 'reveal', 'access-code', 'access'].includes(command.action) ||
          (command.action !== 'list' && (typeof command.code !== 'string' || !/^\d{6}$/.test(command.code)))) { reply(400, { message: '无效的管理请求。' }); return }
      reply(200, await rooms.manageAccount(command))
    } catch (error) { reply(error.statusCode ?? 500, { message: error.statusCode ? error.message : '房间管理服务暂时不可用。' }) }
  }
}
