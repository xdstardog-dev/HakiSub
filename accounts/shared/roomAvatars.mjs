export const DEFAULT_ROOM_AVATAR = 'home'
// 头像只接受预制编号；后续补充图形时，房间资料及接口无需接收SVG或外部地址。
const houseAvatar = { id: DEFAULT_ROOM_AVATAR, label: '房屋', paths: ['m3 10 9-8 9 8v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z', 'M9 21v-9h6v9'] }
const buildingRoomAvatars = [
  houseAvatar,
  { id: 'building-cabin', label: '木屋', paths: ['M2 19 12 4l10 15H2Zm7 0v-5h6v5M18 12V6h2v9'] },
  { id: 'building-townhouse', label: '联排住宅', paths: ['M2 21V9l5-5 5 5v12H2Zm10 0V9l5-5 5 5v12H12ZM6 12h2m8 0h2M6 21v-5h2v5m8 0v-5h2v5'] },
  { id: 'building-apartment', label: '公寓', paths: ['M5 21V3h14v18H5Zm5 0v-4h4v4M8 7h2m4 0h2M8 11h2m4 0h2'] },
  { id: 'building-skyscraper', label: '摩天楼', paths: ['M3 21h18M5 21V9h5M10 21V5l9-3v19M13 8h3m-3 4h3m-3 4h3M5 13h2m-2 4h2'] },
  { id: 'building-shop', label: '街边商铺', paths: ['M4 12v9h16v-9M2 10l2-6h16l2 6a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2ZM8 21v-5h4v5m3-5h2'] },
  { id: 'building-castle', label: '城堡', paths: ['M3 21V5h3v3h2V5h3v6h2V5h3v3h2V5h3v16H3Zm6 0v-4a3 3 0 0 1 6 0v4'] },
  { id: 'building-pagoda', label: '宝塔', paths: ['m7 8 5-5 5 5H7Zm2 0v3m6-3v3M5 14l3-3h8l3 3H5Zm2 0v3m10-3v3M3 20l3-3h12l3 3H3Z'] },
  { id: 'building-dome', label: '圆顶馆', paths: ['M2 12h20M4 12a8 8 0 0 1 16 0M5 12v9h14v-9M9 21v-5h6v5M12 2v2'] },
  { id: 'building-lighthouse', label: '灯塔', paths: ['M7 21h10l-2-12H9L7 21ZM8 9V5l4-3 4 3v4H8Zm4-4v4M3 6h2m14 0h2M10 21v-4h4v4'] },
]
const dailyRoomAvatars = [
  { id: 'coffee', label: '咖啡', paths: ['M4 8h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z', 'M17 9h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2'] },
  { id: 'book', label: '书本', paths: ['M12 5C8 2 5 2 2 3v16c3-1 6-1 10 2 4-3 7-3 10-2V3c-3-1-6-1-10 2Zm0 0v16', 'M5 7h3m8 0h3M5 11h3m8 0h3'] },
  { id: 'music', label: '音乐', paths: ['M10 17V5l10-2v12M10 8l10-2', 'M10 17a3 3 0 1 1-3-3c2 0 3 1 3 3Zm10-2a3 3 0 1 1-3-3c2 0 3 1 3 3Z'] },
]
const natureRoomAvatars = [
  { id: 'star', label: '星星', paths: ['m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z'] },
  { id: 'leaf', label: '叶子', paths: ['M20 3C10 1 2 7 4 15c2 8 16 7 16-12Z', 'M3 22 16 9M8 17v-5m0 5h5'] },
]
const gameRoomAvatars = [
  { id: 'game', label: '游戏', paths: ['M7 7h10c3 0 4 2 5 9 0 4-3 5-6 1H8c-3 4-6 3-6-1 1-7 2-9 5-9Z', 'M7 10v5m-2-2h4m7-2h.01m3 3h.01'] },
  { id: 'game-dice', label: '骰子', paths: ['M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z', 'M7.5 7.5h.01m9 0h.01M12 12h.01m-4.5 4.5h.01m9 0h.01'] },
  { id: 'game-arcade', label: '街机', paths: ['M6 21v-6l2-4V3h10v10l2 3v5H6Zm5-15h4v4h-4Zm-3 9h10m-6 3h3'] },
]
const originalCatAvatar = { id: 'cat', label: '猫咪', image: '/hakisub-favicon.svg' }
const catRoomAvatars = [
  ['cat-white', '白猫'],
  ['cat-ginger-tabby', '橘狸花猫'],
  ['cat-silver-tabby', '银灰狸花猫'],
  ['cat-brown-tabby', '棕狸花猫'],
  ['cat-cream-tabby', '奶油虎斑猫'],
  ['cat-mackerel-tabby', '深灰虎斑猫'],
  ['cat-tabby-white', '狸花加白猫'],
  ['cat-tuxedo', '燕尾服猫'],
  ['cat-blaze', '白鼻线奶牛猫'],
  ['cat-mask', '黑面罩猫'],
  ['cat-cow', '单眼斑奶牛猫'],
  ['cat-calico', '三花猫'],
  ['cat-dilute-calico', '淡三花猫'],
  ['cat-tortoiseshell', '玳瑁猫'],
  ['cat-point', '暹罗猫'],
].map(([id, label]) => ({ id, label, image: `/room-avatars/${id}.svg` }))
const retiredCatIds = new Set(['cat-tuxedo', 'cat-blaze'])
// 已保存的两款黑白猫继续显示，但从选择器移除。
export const ROOM_AVATAR_GROUPS = [
  { id: 'buildings', label: '建筑', avatars: buildingRoomAvatars },
  { id: 'cats', label: '猫咪', avatars: [originalCatAvatar, ...catRoomAvatars.filter(({ id }) => !retiredCatIds.has(id))] },
  { id: 'games', label: '游戏', avatars: gameRoomAvatars },
  { id: 'daily', label: '日常', avatars: dailyRoomAvatars },
  { id: 'nature', label: '自然', avatars: natureRoomAvatars },
]
export const ROOM_AVATAR_CHOICES = ROOM_AVATAR_GROUPS.flatMap(({ avatars }) => avatars)
export const ROOM_AVATARS = [...ROOM_AVATAR_CHOICES, ...catRoomAvatars.filter(({ id }) => retiredCatIds.has(id))]
export const LEGACY_ROOM_AVATAR_IDS = [DEFAULT_ROOM_AVATAR, originalCatAvatar.id, ...dailyRoomAvatars.map(({ id }) => id), ...natureRoomAvatars.map(({ id }) => id), 'game']
export const QUICK_ROOM_AVATARS = [houseAvatar, originalCatAvatar, ...dailyRoomAvatars.slice(0, 2)]
export function isValidRoomAvatar(value) { return typeof value === 'string' && ROOM_AVATARS.some(avatar => avatar.id === value) }
export function normalizeRoomAvatar(value) { return isValidRoomAvatar(value) ? value : DEFAULT_ROOM_AVATAR }
