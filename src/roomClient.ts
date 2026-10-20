import type { CaptionEvent } from './captionEvents'

export type RoomMember = { id: string; name: string; mic: boolean; color: string }
type RoomCallbacks = {
  onJoined: (code: string, memberId: string, ownership: { ownerToken?: string; isOwner: boolean; aliases: string[] }) => void
  onMembers: (members: RoomMember[]) => void
  onCaption: (event: CaptionEvent) => void
  onDiscard: (memberId: string, utteranceId: string) => void
  onError: (message: string) => void
  onClose: () => void
}
export function createRoomClient(callbacks: RoomCallbacks, createSocket = () => new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms`)) {
  let socket: WebSocket | undefined, token = ''
  let connectionTimer: ReturnType<typeof setTimeout> | undefined
  const send = (event: object) => {
    if (socket?.readyState !== 1) return false
    if (socket.bufferedAmount > 128000) { socket.close(); callbacks.onError('房间网络积压，请重新加入。'); return false }
    socket.send(JSON.stringify(event)); return true
  }
  const close = () => {
    clearTimeout(connectionTimer)
    token = ''
    if (!socket) return
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
    socket.close(); socket = undefined
  }
  return {
    connect(type: 'create' | 'join', name: string, code: string, ownerToken?: string) {
      close()
      socket = createSocket()
      connectionTimer = setTimeout(() => {
        close(); callbacks.onError('连接房间超时，请重新加入。'); callbacks.onClose()
      }, 10000)
      socket.onopen = () => { send({ type, name, code, ...(ownerToken ? { ownerToken } : {}) }) }
      socket.onmessage = message => {
        try {
          const event = JSON.parse(message.data)
          if (event.type === 'joined') { clearTimeout(connectionTimer); token = event.token; callbacks.onJoined(event.code, event.memberId, {
            ownerToken: event.ownerToken, isOwner: event.isOwner === true,
            aliases: Array.isArray(event.aliases) ? event.aliases.filter((code: unknown) => typeof code === 'string' && /^\d{6}$/.test(code)) : [],
          }) }
          else if (event.type === 'members') callbacks.onMembers(event.members)
          else if (event.type === 'caption') callbacks.onCaption(event)
          else if (event.type === 'discard') callbacks.onDiscard(event.memberId, event.utteranceId)
          else if (event.type === 'error') callbacks.onError(event.message)
        } catch { close(); callbacks.onError('房间消息无法解析，请重新加入。'); callbacks.onClose() }
      }
      socket.onerror = () => callbacks.onError('无法连接房间服务。')
      socket.onclose = () => { clearTimeout(connectionTimer); token = ''; callbacks.onClose() }
    },
    send,
    getToken: () => token,
    close,
  }
}
