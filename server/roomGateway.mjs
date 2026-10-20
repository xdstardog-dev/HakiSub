import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

// 房间资料可持久化；成员、令牌、音频与字幕永远只在当前连接内存中。
export function createRoomGateway({ maxRooms = 100, heartbeatMs = 15000, roomStore } = {}) {
  const rooms = new Map(), sessions = new Map()
  for (const record of roomStore?.list() ?? []) rooms.set(record.code, { ...record, members: new Map(), settingsBusy: false })
  const aliases = new Map()
  for (const room of rooms.values()) for (const code of room.aliases ?? []) aliases.set(code, room.code)
  const hash = token => createHash('sha256').update(token).digest('hex')
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false })
  const send = (socket, event) => {
    if (socket.readyState !== WebSocket.OPEN) return
    if (socket.bufferedAmount > 128000) { socket.terminate(); return }
    socket.send(JSON.stringify(event))
  }
  const broadcast = (room, event) => { for (const member of room.members.values()) send(member.socket, event) }
  const publishMembers = room => broadcast(room, { type: 'members', members: [...room.members.values()].map(({ id, name, mic }) => ({ id, name, mic, color: '' })) })
  sockets.on('connection', socket => {
    let member, room, messages = 0, windowStart = Date.now(), messageQueue = Promise.resolve()
    socket.alive = true
    socket.on('pong', () => { socket.alive = true })
    const timeout = setTimeout(() => socket.close(1008, 'join timeout'), 10000)
    const fail = message => send(socket, { type: 'error', message })
    socket.on('error', () => {})
    const handleMessage = async (packet, binary) => {
      try {
        if (socket.readyState !== WebSocket.OPEN) return
        const event = JSON.parse(packet.toString())
        if (!member) {
          if (!['create', 'join'].includes(event.type) || typeof event.name !== 'string' || !event.name.trim() || event.name.trim().length > 20) { fail('请输入有效显示名称。'); return }
          let ownerToken
          if (event.type === 'create') {
            if (rooms.size >= maxRooms) { fail('房间数量已达上限，请稍后重试。'); return }
            let code
            do { code = String(randomInt(100000, 1000000)) } while (rooms.has(code) || aliases.has(code))
            ownerToken = randomUUID()
            room = { code, ownerHash: hash(ownerToken), apiKey: '', members: new Map(), settingsBusy: false, persisting: true }; rooms.set(code, room)
            try { await roomStore?.save(room) }
            catch { rooms.delete(code); room = undefined; fail('无法保存房间，请稍后重试。'); return }
            room.persisting = false
            if (socket.readyState !== WebSocket.OPEN) return
          } else {
            room = typeof event.code === 'string' && /^\d{6}$/.test(event.code) ? rooms.get(aliases.get(event.code) ?? event.code) : undefined
            if (!room || room.persisting) { fail('房间不存在或尚未创建完成。'); return }
          }
          if (room.members.size >= 8) { fail('房间已满，最多允许 8 人。'); return }
          const owner = !!ownerToken || (typeof event.ownerToken === 'string' && event.ownerToken.length === 36 && timingSafeEqual(Buffer.from(hash(event.ownerToken), 'hex'), Buffer.from(room.ownerHash, 'hex')))
          member = { id: randomUUID(), token: randomUUID(), name: event.name.trim(), mic: false, socket, room, owner, asr: undefined }
          room.members.set(member.id, member); sessions.set(member.token, member)
          clearTimeout(timeout)
          send(socket, { type: 'joined', code: room.code, aliases: room.aliases ?? [], memberId: member.id, token: member.token, isOwner: owner, ...(ownerToken ? { ownerToken } : {}) })
          publishMembers(room)
          return
        }
        if (event.type === 'mic' && typeof event.mic === 'boolean') {
          if (event.mic && room.settingsBusy) { fail('房间配置正在更新，请稍后开启麦克风。'); return }
          member.mic = event.mic
          if (!member.mic) member.asr?.terminate()
          publishMembers(room)
        } else if (event.type === 'caption' && member.mic && typeof event.utteranceId === 'string' && event.utteranceId.length <= 160 && typeof event.text === 'string' && event.text.length <= 4000 && ['interim', 'final'].includes(event.state)) {
          // 身份由连接决定，不接受客户端指定其他成员的 memberId。
          broadcast(room, { type: 'caption', memberId: member.id, utteranceId: event.utteranceId, text: event.text, state: event.state })
        } else if (event.type === 'discard' && typeof event.utteranceId === 'string' && event.utteranceId.length <= 160) {
          broadcast(room, { type: 'discard', memberId: member.id, utteranceId: event.utteranceId })
        } else fail('无效的房间消息。')
      } catch { socket.close(1008, 'invalid message') }
    }
    socket.on('message', (packet, binary) => {
      // 在异步磁盘操作入队前限流，避免写入较慢时堆积无限消息。
      if (Date.now() - windowStart > 1000) { windowStart = Date.now(); messages = 0 }
      if (++messages > 80 || binary) { socket.close(1008, 'invalid traffic'); return }
      messageQueue = messageQueue.then(() => handleMessage(packet, binary))
    })
    socket.on('close', () => {
      clearTimeout(timeout)
      if (!member) return
      sessions.delete(member.token); member.asr?.terminate()
      room.members.delete(member.id)
      publishMembers(room)
    })
  })
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.alive) { socket.terminate(); continue }
      socket.alive = false; socket.ping()
    }
  }, heartbeatMs)
  heartbeat.unref()
  return {
    upgrade: (request, socket, head) => sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client)),
    findSession: token => sessions.get(token),
    saveConfiguration: async (room, apiKey) => {
      await roomStore?.save({ ...room, apiKey })
      room.apiKey = apiKey
    },
    close: async () => {
      clearInterval(heartbeat)
      for (const socket of sockets.clients) socket.terminate()
      await new Promise(resolve => sockets.close(resolve))
    },
  }
}
