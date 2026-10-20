export type RememberedRoom = { code: string; name: string; ownerToken?: string }
const storageKey = 'hakisub.rooms.v1'

export function loadRememberedRooms(): RememberedRoom[] {
  try {
    const rooms = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(rooms)) return []
    return rooms.filter((room): room is RememberedRoom => room && /^\d{6}$/.test(room.code) && typeof room.name === 'string' && room.name.length <= 20 && (!room.ownerToken || /^[a-f0-9-]{36}$/.test(room.ownerToken))).slice(0, 100).map(({ code, name, ownerToken }) => ({ code, name, ...(ownerToken ? { ownerToken } : {}) }))
  } catch { return [] }
}

export function rememberRoom(rooms: RememberedRoom[], room: RememberedRoom, previousCodes: string[] = []): RememberedRoom[] {
  const related = new Set([room.code, ...previousCodes])
  const previous = rooms.find(value => value.code === room.code && value.ownerToken) ?? rooms.find(value => related.has(value.code) && value.ownerToken)
  const ownerToken = room.ownerToken || previous?.ownerToken
  const next = [{ code: room.code, name: room.name, ...(ownerToken ? { ownerToken } : {}) }, ...rooms.filter(value => !related.has(value.code))].slice(0, 100)
  // 只记住房间和本浏览器的管理凭据，绝不写入API Key、成员令牌或字幕。
  try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* 禁用存储时，本次页面内仍可再次进入。 */ }
  return next
}
