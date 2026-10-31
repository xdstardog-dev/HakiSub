import { isValidDisplayName, truncateNameToUnits, NICKNAME_MAXIMUM_UNITS, ROOM_NAME_MAXIMUM_UNITS } from '../accounts/shared/nameRules.mjs'
import { isValidRoomAvatar } from '../accounts/shared/roomAvatars.mjs'

export type RememberedRoom = { code: string; name: string; roomName?: string; ownerToken?: string; avatarId?: string }
const storageKey = 'hakisub.rooms.v1'

export function loadRememberedRooms(): RememberedRoom[] {
  try {
    const rooms = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(rooms)) return []
    return rooms.filter((room): room is RememberedRoom => room && /^\d{6}$/.test(room.code) && typeof room.name === 'string' && room.name.length <= 20 && (!room.ownerToken || /^[a-f0-9-]{36}$/.test(room.ownerToken))).slice(0, 100).map(({ code, name, ownerToken, roomName, avatarId }) => ({ code, name: truncateNameToUnits(name, NICKNAME_MAXIMUM_UNITS).trimEnd(), ...(ownerToken ? { ownerToken } : {}), ...(isValidDisplayName(roomName, ROOM_NAME_MAXIMUM_UNITS) ? { roomName } : {}), ...(isValidRoomAvatar(avatarId) ? { avatarId } : {}) }))
  } catch { return [] }
}

export function rememberRoom(rooms: RememberedRoom[], room: RememberedRoom, previousCodes: string[] = []): RememberedRoom[] {
  const related = new Set([room.code, ...previousCodes])
  const previous = rooms.find(value => value.code === room.code && value.ownerToken) ?? rooms.find(value => related.has(value.code) && value.ownerToken)
  const ownerToken = room.ownerToken || previous?.ownerToken
  const roomName = room.roomName ?? rooms.find(value => related.has(value.code))?.roomName
  const avatarId = room.avatarId ?? rooms.find(value => related.has(value.code))?.avatarId
  const next = [{ code: room.code, name: room.name, ...(roomName ? { roomName } : {}), ...(ownerToken ? { ownerToken } : {}), ...(isValidRoomAvatar(avatarId) ? { avatarId } : {}) }, ...rooms.filter(value => !related.has(value.code))].slice(0, 100)
  // 只记住房间和本浏览器的管理凭据，绝不写入API Key、成员令牌或字幕。
  try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* 禁用存储时，本次页面内仍可再次进入。 */ }
  return next
}

export function forgetRoomOwnership(rooms: RememberedRoom[], code: string): RememberedRoom[] {
  const next = rooms.map(room => room.code === code ? { code: room.code, name: room.name, ...(room.roomName ? { roomName: room.roomName } : {}), ...(isValidRoomAvatar(room.avatarId) ? { avatarId: room.avatarId } : {}) } : room)
  try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* 服务器已经撤销原凭据，本地清理失败不恢复权限。 */ }
  return next
}
