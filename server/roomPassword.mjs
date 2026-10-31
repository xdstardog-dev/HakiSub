import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const validPasswordHash = value => typeof value === 'string' && /^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(value)
export function hashRoomPassword(password) {
  if (typeof password !== 'string' || !/^\d{4}$/.test(password)) throw Error('入房码需为四位数字。')
  const salt = randomBytes(16).toString('hex')
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString('hex')}`
}
export const hasRoomPassword = room => !!(room.passwordHash || room.accessCode)
export function verifyRoomPassword(room, password) {
  if (typeof password !== 'string' || !/^\d{4}$/.test(password)) return false
  // 兼容内存适配器的旧记录；正式磁盘加载会先迁移为带随机盐的摘要。
  if (!room.passwordHash) return typeof room.accessCode === 'string' && /^\d{4}$/.test(room.accessCode) && timingSafeEqual(Buffer.from(password), Buffer.from(room.accessCode))
  if (!validPasswordHash(room.passwordHash)) return false
  const [, salt, expected] = room.passwordHash.split(':')
  return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(expected, 'hex'))
}
