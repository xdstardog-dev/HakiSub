import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { testDoubaoConnection } from './apiSettings.mjs'
import { createRoomAccess } from './roomAccess.mjs'
import { hashRoomPassword, hasRoomPassword, verifyRoomPassword } from './roomPassword.mjs'
import { defaultGuestRoomName, defaultAccountRoomName, isValidRoomName } from './roomNames.mjs'
import { isValidDisplayName, NICKNAME_MAXIMUM_UNITS } from '../accounts/shared/nameRules.mjs'
import { isValidRoomAvatar, normalizeRoomAvatar } from '../accounts/shared/roomAvatars.mjs'

// 房间资料可持久化；成员、令牌、音频与字幕永远只在当前连接内存中。
export function createRoomGateway({ maxRooms = 100, heartbeatMs = 15000, roomStore, probe = testDoubaoConnection } = {}) {
  const rooms = new Map(), sessions = new Map()
  const roomAccess = createRoomAccess({ saveRoom: room => roomStore?.save(room) })
  for (const record of roomStore?.list() ?? []) rooms.set(record.code, { asrEnabled: true, ...record, name: record.name ?? `房间 ${record.code}`, apiKey: '', keyState: 'missing', members: new Map(), settingsBusy: false })
  let nextGuestNumber = Math.max(0, ...[...rooms.values()].map(room => room.guestNumber ?? 0)) + 1
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
  const publishMembers = room => broadcast(room, { type: 'members', members: [...room.members.values()].map(({ id, name, mic, mode, toneSlot }) => ({ id, name, mic, mode, toneSlot, color: '' })) })
  const reactionTypes = new Set(['agree', 'disagree', 'question', 'received', 'fun', 'thanks', 'sorry', 'slower', 'repeat', 'wait', 'unclear', 'understood', 'okay'])
  sockets.on('connection', (socket, address) => {
    let member, room, messages = 0, windowStart = Date.now(), messageQueue = Promise.resolve()
    socket.alive = true
    socket.on('pong', () => { socket.alive = true })
    const timeout = setTimeout(() => socket.close(1008, 'join timeout'), 10000)
    const fail = (message, reason) => send(socket, { type: 'error', message, ...(reason ? { reason, code: room?.code } : {}) })
    socket.on('error', () => {})
    const handleMessage = async (packet, binary) => {
      try {
        if (socket.readyState !== WebSocket.OPEN) return
        if (member && sessions.get(member.token) !== member) return
        const event = JSON.parse(packet.toString())
        if (!member) {
          if (!['create', 'join'].includes(event.type) || typeof event.name !== 'string' || !isValidDisplayName(event.name.trim(), NICKNAME_MAXIMUM_UNITS)) { fail('请输入有效显示名称：最多8个汉字或16个英文／数字。'); return }
          let ownerToken
          if (event.type === 'create') {
            if (event.password !== undefined && (typeof event.password !== 'string' || !/^\d{4}$/.test(event.password))) { fail('入房码需为四位数字。'); return }
            if (rooms.size >= maxRooms) { fail('房间数量已达上限，请稍后重试。'); return }
            let code
            do { code = String(randomInt(100000, 1000000)) } while (rooms.has(code) || aliases.has(code))
            ownerToken = randomUUID()
            const guestNumber = nextGuestNumber++
            // 首次落盘就保存入房码，私密创建没有暂时公开的中间状态。
            const access = event.password === undefined ? {} : { passwordHash: hashRoomPassword(event.password), accessVersion: randomUUID(), accessAccounts: [] }
            room = { code, name: defaultGuestRoomName(guestNumber), guestNumber, nameCustomized: false, ownerHash: hash(ownerToken), ownerUid: null, apiKey: '', keyState: 'missing', asrEnabled: true, ...access, members: new Map(), settingsBusy: false, persisting: true }; rooms.set(code, room)
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
          if (room.settingsBusy) { fail('房间设置正在更新，请稍后重试。'); return }
          const accountUid = roomAccess.consumeTicket(room, event.accessTicket)
          if (!owner && !accountUid) {
            try { roomAccess.verifyCode(room, event.password, `network:${address}`) }
            catch (error) { fail(error.message, error.reason); return }
          }
          // 槽位归属连接身份；离房只释放自己的槽位，不重编号其他成员。
          const toneSlot = Array.from({ length: 8 }, (_, index) => index).find(slot => ![...room.members.values()].some(member => member.toneSlot === slot))
          member = { id: randomUUID(), token: randomUUID(), name: event.name.trim(), mic: false, mode: 'muted', toneSlot, socket, room, owner, accountUid, asr: undefined, lastTypedAt: 0, lastReactionAt: 0 }
          room.members.set(member.id, member); sessions.set(member.token, member)
          clearTimeout(timeout)
          send(socket, { type: 'joined', code: room.code, name: room.name, avatarId: normalizeRoomAvatar(room.avatarId), aliases: room.aliases ?? [], memberId: member.id, token: member.token, isOwner: owner, ...(ownerToken ? { ownerToken } : {}) })
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
          broadcast(room, { type: 'caption', source: 'typing', memberId: member.id, utteranceId: `typed-${member.id}-${event.utteranceId}`, text: event.text.trim(), state: 'final' })
        } else if (event.type === 'reaction') {
          if (!reactionTypes.has(event.reaction) || typeof event.targetId !== 'string' || !room.members.has(event.targetId)) {
            fail('无效的回应类型或目标成员。'); return
          }
          if (Date.now() - member.lastReactionAt < 1500) { fail('回应发送过快，请稍后再试。'); return }
          member.lastReactionAt = Date.now()
          broadcast(room, { type: 'reaction', id: randomUUID(), senderId: member.id, targetId: event.targetId, reaction: event.reaction })
        } else if (event.type === 'caption' && member.mic && typeof event.utteranceId === 'string' && event.utteranceId.length <= 160 && typeof event.text === 'string' && event.text.length <= 4000 && ['interim', 'final'].includes(event.state)) {
          // 身份由连接决定，不接受客户端指定其他成员的 memberId。
          broadcast(room, { type: 'caption', source: 'speech', memberId: member.id, utteranceId: event.utteranceId, text: event.text, state: event.state })
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
  const publicStatus = room => ({ code: room.code, name: room.name, avatarId: normalizeRoomAvatar(room.avatarId), bound: !!room.ownerUid, configured: !!room.apiKey, keyState: room.keyState,
    source: room.apiKey ? 'room' : 'none', asrEnabled: room.asrEnabled, busy: room.settingsBusy, requiresPassword: hasRoomPassword(room) })
  const ownerStatus = room => publicStatus(room)
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
      else if (action === 'rename') {
        const name = typeof command.name === 'string' ? command.name.trim() : command.name
        if (!isValidRoomName(name)) throw problem(400, '房间名称最多12个汉字或24个英文／数字，不能包含换行或控制字符。')
        changes = { name, nameCustomized: true }
      }
      else if (action === 'avatar') {
        if (!isValidRoomAvatar(command.avatarId)) throw problem(400, '请选择有效的预制房间头像。')
        changes = { avatarId: command.avatarId }
      }
      else if (action === 'asr' && typeof command.enabled === 'boolean') changes = { asrEnabled: command.enabled }
      else if (action === 'access-code') {
        if (typeof command.accessCode !== 'string' || (command.accessCode !== '' && !/^\d{4}$/.test(command.accessCode))) throw problem(400, '入房码需为四位数字。')
        if ((!command.accessCode && !hasRoomPassword(room)) || (command.accessCode && verifyRoomPassword(room, command.accessCode))) return { room: { ...ownerStatus(room), busy: false }, message: '入房码未改变。' }
        changes = { passwordHash: command.accessCode ? hashRoomPassword(command.accessCode) : '', accessCode: undefined, accessVersion: randomUUID(), accessAccounts: [] }
      }
      // 绑定与旧摘要撤销一起原子落盘；匿名凭据不再能在未来兼容路径中恢复权限。
      else if (action === 'bind') {
        changes = { ownerUid: command.uid, ownerHash: hash(randomUUID()) }
        // 昵称由账号服务的真实会话提供；绑定不覆盖房主已经自定义的名称。
        if (!room.nameCustomized && typeof command.nickname === 'string') {
          const name = defaultAccountRoomName(command.nickname)
          if (isValidRoomName(name)) changes.name = name
        }
      }
      else throw problem(400, '无效的房间管理操作。')
      // Key只更新本进程内存；元数据写入失败则清掉本房Key，重启也没有凭据可恢复。
      const affectsAsr = !['bind', 'access-code', 'rename', 'avatar'].includes(action)
      if (affectsAsr) stopRoomAsr(room)
      try {
        if (['asr', 'bind', 'access-code', 'rename', 'avatar'].includes(action)) await roomStore?.save({ ...room, ...changes })
      }
      catch {
        if (affectsAsr) { room.apiKey = ''; room.keyState = 'missing' }
        broadcast(room, { type: 'room-status', ...publicStatus(room) })
        if (action === 'rename') throw problem(500, '房间名称保存失败，原名称保留，请重试。')
        if (action === 'avatar') throw problem(500, '房间头像保存失败，原头像保留，请重试。')
        throw problem(500, action === 'access-code' ? '入房码保存失败，原设置保留，请重试。' : affectsAsr ? '房间开关保存失败；本房Key已清除，请修复后重试并重新填写Key。' : '房间绑定保存失败；原匿名房主权限保留，请重试。')
      }
      Object.assign(room, changes)
      if (action === 'bind') for (const member of room.members.values()) {
        if (member.owner) member.accountUid = command.uid
        member.owner = false
      }
      if (action === 'access-code' && hasRoomPassword(room)) {
        for (const member of room.members.values()) {
          if (anonymousOwner(member) || (room.ownerUid && member.accountUid === room.ownerUid)) continue
          sessions.delete(member.token); member.asr?.terminate(); room.members.delete(member.id)
          send(member.socket, { type: 'access-revoked', code: room.code, message: '房主已设置或更改入房码，请重新验证。' })
          member.socket.close(1008, 'room access changed')
        }
        publishMembers(room)
      }
      broadcast(room, { type: 'room-status', ...publicStatus(room), busy: false })
      return { room: { ...ownerStatus(room), busy: false }, message: action === 'save' ? 'Key已设置，仅当前后端进程有效，重启后需重新填写。' : action === 'delete' ? '本房Key已删除。' : action === 'rename' ? '房间名称已保存。' : action === 'access-code' ? hasRoomPassword(room) ? '入房码已保存，其他成员需重新验证。' : '已移除入房码，成员可直接加入。' : '房间设置已保存。' }
    } finally { room.settingsBusy = false }
  }
  return {
    upgrade: (request, socket, head) => sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client, request.socket.remoteAddress ?? 'unknown')),
    findSession: token => sessions.get(token),
    publicStatus, ownerStatus, anonymousOwner,
    manageAnonymous: (member, command) => manage(member.room, command, () => {
      if (sessions.get(member.token) !== member || !anonymousOwner(member)) throw problem(403, '只有未绑定房间的合法创建者可以使用原管理凭据。')
    }),
    manageAccount: async command => {
      if (command.action === 'list') return { rooms: [...rooms.values()].filter(room => room.ownerUid === command.uid).map(ownerStatus) }
      const room = findRoom(command.code)
      if (!room || room.persisting) throw problem(404, '房间不存在。')
      if (command.action === 'access') return roomAccess.authorizeAccount(room, command.uid, command.password)
      return manage(room, command, () => {
        if (command.action === 'bind') {
          if (room.ownerUid) throw problem(409, '房间已经绑定账号，不能重复认领。')
          if (!verifyOwnerToken(room, command.ownerToken)) throw problem(403, '需要原房间的合法房主管理凭据。')
        } else if (room.ownerUid !== command.uid) throw problem(403, '只有绑定账号的房主可以管理此房间。')
      })
    },
    close: async () => {
      clearInterval(heartbeat)
      roomAccess.clear()
      for (const room of rooms.values()) { room.apiKey = ''; room.keyState = 'missing' }
      for (const socket of sockets.clients) socket.terminate()
      await new Promise(resolve => sockets.close(resolve))
    },
  }
}
