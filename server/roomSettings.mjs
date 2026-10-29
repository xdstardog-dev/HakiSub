export function createRoomSettingsHandler(rooms, { allowedOrigins }) {
  return async (request, response) => {
    const reply = (status, body) => {
      if (!response.destroyed) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(body)) }
    }
    if ((request.headers.origin && !allowedOrigins.includes(request.headers.origin)) || request.headers['sec-fetch-site'] === 'cross-site') { reply(403, { message: '请从房间页面访问配置。' }); return }
    const token = request.headers.authorization?.match(/^Bearer ([a-f0-9-]{36})$/)?.[1]
    const member = token && rooms.findSession(token)
    if (!member) { reply(403, { message: '房间身份已失效，请重新进入房间。' }); return }
    const status = () => ({ ...rooms.publicStatus(member.room), readOnly: !rooms.anonymousOwner(member) })
    if (request.method === 'GET') { reply(200, status()); return }
    if (request.method !== 'POST') { reply(405, { message: '不支持的房间配置操作。' }); return }
    if (!allowedOrigins.includes(request.headers.origin) || !rooms.anonymousOwner(member)) { reply(403, { message: '请使用合法房主身份；已绑定房间请登录个人中心管理。' }); return }
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') { reply(415, { message: '请求格式不正确。' }); return }
    try {
      const chunks = []; let bytes = 0
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 4096) { reply(413, { message: '配置内容过长。' }); return }
        chunks.push(chunk)
      }
      let command
      try { command = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { reply(400, { message: '配置格式不正确。' }); return }
      if (!['save', 'delete', 'test', 'asr', 'reveal'].includes(command?.action)) { reply(400, { message: '无效的房间管理操作。' }); return }
      const result = await rooms.manageAnonymous(member, command)
      reply(200, { ...status(), ...result, busy: false })
    } catch (error) { reply(error.statusCode ?? 500, { message: error.statusCode ? error.message : '房间操作失败，请重试。' }) }
  }
}
