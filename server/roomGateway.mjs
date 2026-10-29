import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { testDoubaoConnection } from './apiSettings.mjs'

// 房间资料可持久化；成员、令牌、音频与字幕永远只在当前连接内存中。
export function createRoomGateway({ maxRooms = 100, heartbeatMs = 15000, roomStore, probe = testDoubaoConnection } = {}) {
  const rooms = new Map(), sessions = new Map()
  for (const record of roomStore?.list() ?? []) rooms.set(record.code, { asrEnabled: true, ...record, apiKey: '', keyState: 'missing', members: new Map(), settingsBusy: false })
  const aliases = new Map()
  for (const room of rooms.values()) for (const code of room.aliases ?? []) aliases.set(code, room.code)
  const hash = token => createHash('sha256').update(token).digest('hex')
  const verifyOwnerToken = (room, token) => typeof token === 'string' && token.length === 36 && timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(room.ownerHash, 'hex'))
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false })
  const send = (socket, event) => {
    if (socket.readyState !== WebSocket.OPEN) return
    if (socket.bufferedAmount > 128000) { socket.terminate(); return }
    socket.send(JSON.stringify(event))
  }
  const broadcast = (room, event) => { for (const member of room.members.values()) send(member.socket, event) }
  const publishMembers = room => broadcast(room, { type: 'members', members: [...room.members.values()].map(({ id, name, mic, mode }) => ({ id, name, mic, mode, color: '' })) })
  const reactionTypes = new Set(['agree', 'disagree', 'question', 'received', 'fun', 'thanks', 'sorry', 'slower', 'repeat', 'wait', 'unclear', 'understood', 'okay'])
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
            room = { code, ownerHash: hash(ownerToken), ownerUid: null, apiKey: '', keyState: 'missing', asrEnabled: true, members: new Map(), settingsBusy: false, persisting: true }; rooms.set(code, room)
            try { await roomStore?.save(room) }
            catch { rooms.delete(code); room = undefined; fail('无法保存房间，请稍后重试。'); return }
            room.persisting = false
            if (socket.readyState !== WebSocket.OPEN) return
          } else {
            room = typeof event.code === 'string' && /^\d{6}$/.test(event.code) ? rooms.get(aliases.get(event.code) ?? event.code) : undefined
            if (!room || room.persisting) { fail('房间不存在或尚未创建完成。'); return }
          }
          if (room.members.size >= 8) { fail('房间已满，最多允许 8 人。'); return }
          const owner = !room.ownerUid && (!!ownerToken || verifyOwnerToken(room, event.ownerToken))
          member = { id: randomUUID(), token: randomUUID(), name: event.name.trim(), mic: false, mode: 'muted', socket, room, owner, asr: undefined, lastTypedAt: 0, lastReactionAt: 0 }
          room.members.set(member.id, member); sessions.set(member.token, member)
          clearTimeout(timeout)
          send(socket, { type: 'joined', code: room.code, aliases: room.aliases ?? [], memberId: member.id, token: member.token, isOwner: owner, ...(ownerToken ? { ownerToken } : {}) })
          send(socket, { type: 'room-status', ...publicStatus(room) })
          publishMembers(room)
          return
        }
        if (event.type === 'mic' && typeof event.mic === 'boolean') {
          member.mic = event.mic
          member.mode = event.mic ? 'microphone' : 'muted'
          if (!member.mic) member.asr?.terminate()
          publishMembers(room)
        } else if (event.type === 'mode' && ['muted', 'typing'].includes(event.mode)) {
          member.mic = false; member.mode = event.mode
          member.asr?.terminate()
          publishMembers(room)
        } else if (event.type === 'typed-caption') {
          if (member.mode !== 'typing' || typeof event.utteranceId !== 'string' || !/^[a-f0-9-]{36}$/.test(event.utteranceId) ||
            typeof event.text !== 'string' || !event.text.trim() || event.text.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(event.text)) {
            fail('打字内容无效：请在打字模式输入 1～1000 个字符。'); return
          }
          if (Date.now() - member.lastTypedAt < 1000) { fail('打字发送过快，请稍后再试。'); return }
          member.lastTypedAt = Date.now()
          // 与语音共用字幕事件和生命周期；连接身份限定句子命名空间。
          broadcast(room, { type: 'caption', memberId: member.id, utteranceId: `typed-${member.id}-${event.utteranceId}`, text: event.text.trim(), state: 'final' })
        } else if (event.type === 'reaction') {
          if (!reactionTypes.has(event.reaction) || typeof event.targetId !== 'string' || event.targetId === member.id || !room.members.has(event.targetId)) {
            fail('无效的回应类型或目标成员。'); return
          }
          if (Date.now() - member.lastReactionAt < 1500) { fail('回应发送过快，请稍后再试。'); return }
          member.lastReactionAt = Date.now()
          broadcast(room, { type: 'reaction', id: randomUUID(), senderId: member.id, targetId: event.targetId, reaction: event.reaction })
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
  const publicStatus = room => ({ code: room.code, bound: !!room.ownerUid, configured: !!room.apiKey, keyState: room.keyState,
    source: room.apiKey ? 'room' : 'none', asrEnabled: room.asrEnabled, busy: room.settingsBusy })
  const problem = (statusCode, message) => Object.assign(Error(message), { statusCode })
  const findRoom = code => rooms.get(aliases.get(code) ?? code)
  const anonymousOwner = member => !!member?.owner && !member.room.ownerUid
  const stopRoomAsr = room => {
    for (const member of room.members.values()) member.asr?.stopRoomAsr?.()
  }
  async function manage(room, command, authorize) {
    authorize()
    if (room.settingsBusy) throw problem(409, '房间配置正在更新，请稍后重试。')
    room.settingsBusy = true
    try {
      authorize()
      const { action } = command
      if (action === 'reveal') return { apiKey: room.apiKey }
      if (action === 'test') {
        if (!room.apiKey) throw problem(400, '请先保存本房间 API Key。')
        const result = await probe(room.apiKey)
        return { ok: result.ok === true, message: result.ok ? '房间 Key 测试通过（连接测试）。' : '房间 Key 测试失败，请检查密钥、权限及网络。' }
      }
      let changes
      if (action === 'save') {
        const key = typeof command.apiKey === 'string' ? command.apiKey.trim() : ''
        if (!key || /^\*+$/.test(key) || key.length > 2048 || /[^\x21-\x7e]|["'`#\\]/.test(key)) throw problem(400, 'API Key 格式无效，请重新复制完整密钥。')
        changes = { apiKey: key, keyState: 'configured' }
      } else if (action === 'delete') changes = { apiKey: '', keyState: 'deleted' }
      else if (action === 'asr' && typeof command.enabled === 'boolean') changes = { asrEnabled: command.enabled }
      // 绑定与旧摘要撤销一起原子落盘；匿名凭据不再能在未来兼容路径中恢复权限。
      else if (action === 'bind') changes = { ownerUid: command.uid, ownerHash: hash(randomUUID()) }
      else throw problem(400, '无效的房间管理操作。')
      // Key只更新本进程内存；元数据写入失败则清掉本房Key，重启也没有凭据可恢复。
      const affectsAsr = action !== 'bind'
      if (affectsAsr) stopRoomAsr(room)
      try {
        if (action === 'asr' || action === 'bind') await roomStore?.save({ code: room.code,
          ownerHash: changes.ownerHash ?? room.ownerHash, ownerUid: changes.ownerUid ?? room.ownerUid,
          asrEnabled: changes.asrEnabled ?? room.asrEnabled, aliases: room.aliases ?? [] })
      }
      catch {
        if (affectsAsr) { room.apiKey = ''; room.keyState = 'missing' }
        broadcast(room, { type: 'room-status', ...publicStatus(room) })
        throw problem(500, affectsAsr ? '房间开关保存失败；本房Key已清除，请修复后重试并重新填写Key。' : '房间绑定保存失败；原匿名房主权限保留，请重试。')
      }
      Object.assign(room, changes)
      if (action === 'bind') for (const member of room.members.values()) member.owner = false
      broadcast(room, { type: 'room-status', ...publicStatus(room), busy: false })
      return { room: { ...publicStatus(room), busy: false }, message: action === 'save' ? 'Key已设置，仅当前后端进程有效，重启后需重新填写。' : action === 'delete' ? '本房Key已删除。' : '房间设置已保存。' }
    } finally { room.settingsBusy = false }
  }
  return {
    upgrade: (request, socket, head) => sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client)),
    findSession: token => sessions.get(token),
    publicStatus, anonymousOwner,
    manageAnonymous: (member, command) => manage(member.room, command, () => {
      if (sessions.get(member.token) !== member || !anonymousOwner(member)) throw problem(403, '只有未绑定房间的合法创建者可以使用原管理凭据。')
    }),
    manageAccount: async command => {
      if (command.action === 'list') return { rooms: [...rooms.values()].filter(room => room.ownerUid === command.uid).map(publicStatus) }
      const room = findRoom(command.code)
      if (!room || room.persisting) throw problem(404, '房间不存在。')
      return manage(room, command, () => {
        if (command.action === 'bind') {
          if (room.ownerUid) throw problem(409, '房间已经绑定账号，不能重复认领。')
          if (!verifyOwnerToken(room, command.ownerToken)) throw problem(403, '需要原房间的合法房主管理凭据。')
        } else if (room.ownerUid !== command.uid) throw problem(403, '只有绑定账号的房主可以管理此房间。')
      })
    },
    close: async () => {
      clearInterval(heartbeat)
      for (const room of rooms.values()) { room.apiKey = ''; room.keyState = 'missing' }
      for (const socket of sockets.clients) socket.terminate()
      await new Promise(resolve => sockets.close(resolve))
    },
  }
}
