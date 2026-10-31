import { isValidDisplayName, truncateNameToUnits, ROOM_NAME_MAXIMUM_UNITS } from '../accounts/shared/nameRules.mjs'

export const defaultGuestRoomName = number => `游客${String(number).padStart(3, '0')}的房间`

export function defaultAccountRoomName(nickname) {
  // 为后缀预留6单位，也兼容尚未修改过的旧长昵称。
  return `${truncateNameToUnits(nickname, ROOM_NAME_MAXIMUM_UNITS - 6).trimEnd()}的房间`
}

export function isValidRoomName(name) {
  return isValidDisplayName(name, ROOM_NAME_MAXIMUM_UNITS)
}

