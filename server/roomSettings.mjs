import { testDoubaoConnection } from './apiSettings.mjs'

export function createRoomSettingsHandler(rooms, { allowedOrigins, getDefaultKey, probe = testDoubaoConnection }) {
  return async (request, response) => {
    const reply = (status, body) => {
      if (!response.destroyed) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(body)) }
    }
    if ((request.headers.origin && !allowedOrigins.includes(request.headers.origin)) || request.headers['sec-fetch-site'] === 'cross-site') { reply(403, { message: '请从房间页面访问配置。' }); return }
    const token = request.headers.authorization?.match(/^Bearer ([a-f0-9-]{36})$/)?.[1]
    const member = token && rooms.findSession(token)
    if (!member) { reply(403, { message: '房间身份已失效，请重新进入房间。' }); return }
    const room = member.room
    const status = () => ({ configured: !!(room.apiKey || getDefaultKey()), source: room.apiKey ? 'room' : getDefaultKey() ? 'server' : 'none', readOnly: !member.owner, busy: room.settingsBusy || [...room.members.values()].some(value => value.mic || value.asr) })
    if (request.method === 'GET') { reply(200, status()); return }
    if (request.method !== 'POST') { reply(405, { message: '不支持的房间配置操作。' }); return }
    if (!allowedOrigins.includes(request.headers.origin) || !member.owner) { reply(403, { message: '只有房间创建者可以修改配置，请使用创建房间的浏览器。' }); return }
    if (status().busy) { reply(409, { message: '请所有成员先关闭麦克风，再修改或测试配置。' }); return }
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') { reply(415, { message: '请求格式不正确。' }); return }
    room.settingsBusy = true
    try {
      let body = '', bytes = 0
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 4096) { reply(413, { message: '配置内容过长。' }); return }
        body += chunk.toString('utf8')
      }
      if (rooms.findSession(token) !== member) { reply(403, { message: '房间身份已失效。' }); return }
      let command
      try { command = JSON.parse(body) } catch { reply(400, { message: '配置格式不正确。' }); return }
      if (command?.action === 'test') {
        const key = room.apiKey || getDefaultKey()
        if (!key) { reply(400, { message: '请先保存 API Key。' }); return }
        const controller = new AbortController(), cancel = () => controller.abort()
        response.once('close', cancel)
        try { reply(200, await probe(key, { signal: controller.signal })) }
        finally { response.off('close', cancel) }
        return
      }
      if (!['save', 'delete'].includes(command?.action) || (command.action === 'save' && (typeof command.apiKey !== 'string' || !command.apiKey.trim()))) { reply(400, { message: '请输入 API Key 后保存。' }); return }
      const key = command.action === 'delete' ? '' : command.apiKey.trim()
      if (key.length > 2048 || /[^\x21-\x7e]|["'`#\\]/.test(key)) { reply(400, { message: 'API Key 格式无效，请重新复制完整密钥。' }); return }
      await rooms.saveConfiguration(room, key)
      reply(200, { ...status(), busy: false, message: key ? '房间配置已保存，下次开麦生效。' : '已移除房间配置。' })
    } catch { reply(500, { message: '房间配置保存失败，原配置仍然保留，请稍后重试。' }) }
    finally { room.settingsBusy = false }
  }
}
