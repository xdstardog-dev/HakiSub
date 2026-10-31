export const ACCOUNT_NAME_MAXIMUM_LENGTH = 20
export const NICKNAME_MAXIMUM_UNITS = 16
export const ROOM_NAME_MAXIMUM_UNITS = 24

export function isValidAccountName(value) {
  return typeof value === 'string' && value.length <= ACCOUNT_NAME_MAXIMUM_LENGTH && /^[A-Za-z0-9_]{3,}$/.test(value)
}

export function countNameUnits(value) {
  // 英文、数字和半角符号占1单位，其余Unicode字符占2；按码点遍历，避免拆开代理对。
  let units = 0
  for (const character of value) units += character.codePointAt(0) <= 0x7f ? 1 : 2
  return units
}

export function isValidDisplayName(value, maximumUnits) {
  return typeof value === 'string' && value.length > 0 && value === value.trim() &&
    !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value) && countNameUnits(value) <= maximumUnits
}

export function truncateNameToUnits(value, maximumUnits) {
  let result = '', units = 0
  for (const character of value) {
    const width = countNameUnits(character)
    if (units + width > maximumUnits) break
    result += character; units += width
  }
  return result
}

export const defaultNickname = account => account.trim().toLowerCase().slice(0, 8)
