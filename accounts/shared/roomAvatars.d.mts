export type CatRoomAvatarId = 'cat' | 'cat-white' | 'cat-ginger-tabby' | 'cat-silver-tabby'
  | 'cat-brown-tabby' | 'cat-cream-tabby' | 'cat-mackerel-tabby' | 'cat-tabby-white'
  | 'cat-tuxedo' | 'cat-blaze' | 'cat-mask' | 'cat-cow'
  | 'cat-calico' | 'cat-dilute-calico' | 'cat-tortoiseshell' | 'cat-point'
export type BuildingRoomAvatarId = 'home' | 'building-cabin' | 'building-townhouse' | 'building-apartment'
  | 'building-skyscraper' | 'building-shop' | 'building-castle' | 'building-pagoda' | 'building-dome' | 'building-lighthouse'
export type RoomAvatarId = BuildingRoomAvatarId | 'coffee' | 'book' | 'star' | 'music' | 'leaf' | 'game' | 'game-dice' | 'game-arcade' | CatRoomAvatarId
export type CatRoomAvatar = { id: CatRoomAvatarId; label: string; image: string }
export type RoomAvatar = CatRoomAvatar | { id: Exclude<RoomAvatarId, CatRoomAvatarId>; label: string; paths: string[] }
export type RoomAvatarGroup = { id: 'buildings' | 'cats' | 'games' | 'daily' | 'nature'; label: string; avatars: RoomAvatar[] }
export const DEFAULT_ROOM_AVATAR: 'home'
export const ROOM_AVATARS: RoomAvatar[]
export const ROOM_AVATAR_GROUPS: RoomAvatarGroup[]
export const LEGACY_ROOM_AVATAR_IDS: RoomAvatarId[]
export const ROOM_AVATAR_CHOICES: RoomAvatar[]
export const QUICK_ROOM_AVATARS: RoomAvatar[]
export function isValidRoomAvatar(value: unknown): value is RoomAvatarId
export function normalizeRoomAvatar(value: unknown): RoomAvatarId
