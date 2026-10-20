import argon2 from 'argon2'
import { randomBytes } from 'node:crypto'

export const normalizeAnswer = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
export async function createPasswordService(options, concurrency = 1, queueLimit = 8) {
  if (options.memoryCost < 19456 || options.timeCost < 2) throw Error('Argon2id 参数不得低于配置的安全下限。')
  let active = 0
  const queue = []
  const run = async operation => {
    if (active >= concurrency) {
      if (queue.length >= queueLimit) { const error = Error('账号服务繁忙，请稍后重试。'); error.statusCode = 503; throw error }
      await new Promise(resolve => queue.push(resolve))
    } else active++
    try { return await operation() }
    finally { if (queue.length) queue.shift()(); else active-- }
  }
  const hash = value => argon2.hash(value, { ...options, type: argon2.argon2id })
  const verify = async (encoded, value) => { try { return await argon2.verify(encoded, value) } catch { return false } }
  // 虚拟账号仍走相同哈希验证，避免错误路径变成廉价枚举接口。
  const dummyHash = await hash(randomBytes(32).toString('hex'))
  return { run, hash, verify, dummyHash }
}
