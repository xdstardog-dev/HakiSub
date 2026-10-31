export type RoomAvatarId = 'home' | 'cat' | 'coffee' | 'book' | 'star' | 'music' | 'leaf' | 'game'
export type RoomAvatar = { id: RoomAvatarId; label: string; paths: string[] }
export const DEFAULT_ROOM_AVATAR: 'home'
export const ROOM_AVATARS: RoomAvatar[]
export const QUICK_ROOM_AVATARS: RoomAvatar[]
export function isValidRoomAvatar(value: unknown): value is RoomAvatarId
export function normalizeRoomAvatar(value: unknown): RoomAvatarId
