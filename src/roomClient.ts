import type { CaptionEvent } from './captionEvents'
import type { MemberMode, RoomReaction } from './roomInteractions'

export type RoomMember = { id: string; name: string; mic: boolean; color: string; mode?: MemberMode; toneSlot?: number }
type RoomCallbacks = {
  onJoined: (code: string, memberId: string, ownership: { reconnectToken?: string; ownerToken?: string; isOwner: boolean; aliases: string[]; name?: string; avatarId?: string }) => void
  onMembers: (members: RoomMember[]) => void
  onCaption: (event: CaptionEvent) => void
  onReaction?: (event: RoomReaction) => void
  onDiscard: (memberId: string, utteranceId: string) => void
  onError: (message: string) => void
  onClose: () => void
  onFatal?: (message: string) => void
  onPasswordRequired?: (code: string, message: string) => void
  onAccessRevoked?: (code: string, message: string) => void
  onRoomStatus?: (status: { name?: string; avatarId?: string; bound: boolean; asrEnabled: boolean; configured: boolean }) => void
}
export function createRoomClient(callbacks: RoomCallbacks, createSocket = () => new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms`)) {
  let socket: WebSocket | undefined, token = ''
  let timer: ReturnType<typeof setTimeout> | undefined, retryTimer: ReturnType<typeof setTimeout> | undefined
  let attempt = 0, generation = 0, wanted = false, suspended = false
  let target: { type: 'create' | 'join'; name: string; code: string; ownerToken?: string; access?: { password?: string; accessTicket?: string; reconnectToken?: string } } | undefined
  const detach = () => {
    generation++; clearTimeout(timer); token = ''
    if (!socket) return
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
    socket.close(); socket = undefined
  }
  const close = () => { wanted = false; clearTimeout(retryTimer); retryTimer = undefined; detach() }
  const send = (event: object) => {
    if (!token || socket?.readyState !== 1) return false
    if (socket.bufferedAmount > 128000) { disconnected(); return false }
    try { socket.send(JSON.stringify(event)); return true } catch { disconnected(); return false }
  }
  function disconnected() {
    detach()
    if (!wanted) return
    callbacks.onClose()
    if (!wanted) return
    if (target?.type === 'create') { close(); (callbacks.onFatal ?? callbacks.onError)('建房连接中断，请确认后重试。'); return }
    if (suspended || retryTimer) return
    // 单计时器指数退避；代次隔离旧连接回调，恢复前台可立即检查。
    const delay = Math.min(20000, 1000 * 2 ** Math.min(attempt++, 5))
    retryTimer = setTimeout(() => { retryTimer = undefined; open() }, delay)
  }
  function open() {
    if (!wanted || suspended || !target) return
    detach()
    const current = generation
    try { socket = createSocket() } catch { disconnected(); return }
    const active = socket
    const valid = () => wanted && generation === current && socket === active
    timer = setTimeout(() => { if (valid()) disconnected() }, 10000)
    active.onopen = () => {
      if (!valid() || !target) return
      active.send(JSON.stringify({ ...target, ...target.access, access: undefined }))
      if (target.access) { delete target.access.password; delete target.access.accessTicket }
    }
    active.onmessage = message => {
      if (!valid()) return
      try {
        const event = JSON.parse(message.data)
        if (event.type === 'joined') {
          clearTimeout(timer); attempt = 0; token = event.token
          target = { ...target!, type: 'join', code: event.code, access: { reconnectToken: event.reconnectToken } }
          callbacks.onJoined(event.code, event.memberId, {
            reconnectToken: event.reconnectToken, ownerToken: event.ownerToken, isOwner: event.isOwner === true,
            name: typeof event.name === 'string' ? event.name : undefined,
            avatarId: typeof event.avatarId === 'string' ? event.avatarId : undefined,
            aliases: Array.isArray(event.aliases) ? event.aliases.filter((code: unknown) => typeof code === 'string' && /^\d{6}$/.test(code)) : [],
          })
        } else if (event.type === 'members') callbacks.onMembers(event.members)
        else if (event.type === 'caption') callbacks.onCaption(event)
        else if (event.type === 'reaction') callbacks.onReaction?.(event)
        else if (event.type === 'discard') callbacks.onDiscard(event.memberId, event.utteranceId)
        else if (event.type === 'room-status') callbacks.onRoomStatus?.(event)
        else if (event.type === 'access-revoked') { close(); callbacks.onAccessRevoked?.(event.code, event.message) }
        else if (event.type === 'error') {
          if (['password-required', 'password-incorrect', 'access-rate-limited'].includes(event.reason)) {
            close(); callbacks.onPasswordRequired?.(event.code ?? target?.code ?? '', event.message)
          } else if (!token && event.reason !== 'temporary') {
            close(); (callbacks.onFatal ?? callbacks.onError)(event.message)
          } else if (!token) disconnected()
          else callbacks.onError(event.message)
        }
      } catch { disconnected() }
    }
    active.onerror = () => { if (valid()) disconnected() }
    active.onclose = (event = { code: 1006 } as CloseEvent) => {
      if (!valid()) return
      if (event.code === 4001) { close(); callbacks.onFatal?.('此标签页连接已被替换，请返回首页或重新加入。') }
      else disconnected()
    }
  }
  return {
    connect(type: 'create' | 'join', name: string, code: string, ownerToken?: string, access?: { password?: string; accessTicket?: string; reconnectToken?: string }) {
      close(); suspended = false; attempt = 0; wanted = true
      target = { type, name, code, ownerToken, access }; open()
    },
    suspend() { suspended = true; clearTimeout(retryTimer); retryTimer = undefined; if (wanted) { detach(); callbacks.onClose() } },
    resume() { suspended = false; if (wanted && !token && !socket) { clearTimeout(retryTimer); retryTimer = undefined; open() } },
    send, getToken: () => token, close,
  }
}
