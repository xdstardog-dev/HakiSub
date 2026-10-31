export const DEFAULT_ROOM_AVATAR = 'home'
// 头像只接受预制编号；后续补充图形时，房间资料及接口无需接收SVG或外部地址。
export const ROOM_AVATARS = [
  { id: 'home', label: '房屋', paths: ['m3 10 9-8 9 8v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z', 'M9 21v-9h6v9'] },
  { id: 'cat', label: '猫咪', paths: ['M4 10V3l6 4h4l6-4v7a8 8 0 1 1-16 0Z', 'M8 12h.01M16 12h.01M10 16l2 2 2-2M2 14l5 1m10 0 5-1'] },
  { id: 'coffee', label: '咖啡', paths: ['M4 8h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z', 'M17 9h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2'] },
  { id: 'book', label: '书本', paths: ['M12 5C8 2 5 2 2 3v16c3-1 6-1 10 2 4-3 7-3 10-2V3c-3-1-6-1-10 2Zm0 0v16', 'M5 7h3m8 0h3M5 11h3m8 0h3'] },
  { id: 'star', label: '星星', paths: ['m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z'] },
  { id: 'music', label: '音乐', paths: ['M10 17V5l10-2v12M10 8l10-2', 'M10 17a3 3 0 1 1-3-3c2 0 3 1 3 3Zm10-2a3 3 0 1 1-3-3c2 0 3 1 3 3Z'] },
  { id: 'leaf', label: '叶子', paths: ['M20 3C10 1 2 7 4 15c2 8 16 7 16-12Z', 'M3 22 16 9M8 17v-5m0 5h5'] },
  { id: 'game', label: '游戏', paths: ['M7 7h10c3 0 4 2 5 9 0 4-3 5-6 1H8c-3 4-6 3-6-1 1-7 2-9 5-9Z', 'M7 10v5m-2-2h4m7-2h.01m3 3h.01'] },
]
export const QUICK_ROOM_AVATARS = ROOM_AVATARS.slice(0, 4)
export function isValidRoomAvatar(value) { return typeof value === 'string' && ROOM_AVATARS.some(avatar => avatar.id === value) }
export function normalizeRoomAvatar(value) { return isValidRoomAvatar(value) ? value : DEFAULT_ROOM_AVATAR }
