import { createHash, createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { isValidDisplayName, NICKNAME_MAXIMUM_UNITS } from '../shared/nameRules.mjs'

export const tokenHash = token => createHash('sha256').update(token).digest('hex')
export function problem(statusCode, message) { const error = Error(message); error.statusCode = statusCode; return error }
export function normalizeUsername(value) { return typeof value === 'string' ? value.trim().toLowerCase() : '' }
export function requireText(value, minimum, maximum, label) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw problem(400, `${label}长度或格式不正确。`)
  return value
}
export function requireNickname(value) {
  const nickname = typeof value === 'string' ? value.trim() : value
  if (!isValidDisplayName(nickname, NICKNAME_MAXIMUM_UNITS)) throw problem(400, '昵称最多8个汉字或16个英文／数字，不能包含换行或控制字符。')
  return nickname
}
export function requirePassword(body) {
  const password = requireText(body.password, 8, 128, '密码')
  if (password !== body.confirmPassword) throw problem(400, '两次输入的密码不一致。')
  return password
}
export function requireQuestions(questions) {
  if (!Array.isArray(questions) || questions.length !== 3) throw problem(400, '请设置三道密保问题及答案。')
  const values = questions.map(item => {
    if (!item || Object.keys(item).some(key => !['question', 'answer'].includes(key))) throw problem(400, '密保格式不正确。')
    return { question: requireText(item.question?.trim(), 3, 100, '密保问题'), answer: requireText(item.answer, 2, 128, '密保答案') }
  })
  if (new Set(values.map(item => item.question.normalize('NFKC').toLowerCase())).size !== 3) throw problem(400, '三道密保问题不能重复。')
  return values
}
export function validatePreset(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration) ||
      Object.keys(configuration).some(key => !['schemaVersion', 'asrProvider', 'adaptiveCards'].includes(key)) ||
      configuration.schemaVersion !== 1 || !['doubao', 'browser'].includes(configuration.asrProvider) || typeof configuration.adaptiveCards !== 'boolean') throw problem(400, '存档只接受识别来源和布局设置，不能保存密钥或房间凭据。')
  return { schemaVersion: 1, asrProvider: configuration.asrProvider, adaptiveCards: configuration.adaptiveCards }
}
function canonicalIp(address) {
  let ip = address?.startsWith('::ffff:') ? address.slice(7) : address
  if (!isIP(ip)) throw problem(400, '无法确认请求来源。')
  if (isIP(ip) === 6) {
    // 使用操作系统的规范地址表达，再按 /64 聚合，避免更换 IPv6 接口地址绕过限制。
    const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
    const [left, right = ''] = normalized.split('::'), before = left ? left.split(':') : [], after = right ? right.split(':') : []
    const groups = normalized.includes('::') ? [...before, ...Array(8 - before.length - after.length).fill('0'), ...after] : before
    ip = groups.slice(0, 4).map(part => part.padStart(4, '0')).join(':') + '::/64'
  }
  return ip
}
export function createRequestSecurity(database, configuration, now = Date.now) {
  const subject = value => createHmac('sha256', configuration.secret).update(value).digest('hex')
  const ipSubject = request => {
    const peer = request.raw.socket.remoteAddress
    const normalizedPeer = peer?.startsWith('::ffff:') ? peer.slice(7) : peer
    const forwarded = request.headers['x-xdstar-client-ip']
    const ip = configuration.trustedProxies.includes(normalizedPeer) && typeof forwarded === 'string' ? forwarded : peer
    return subject(`ip:${canonicalIp(ip)}`)
  }
  const consume = database.transaction((action, key, maximum, duration) => {
    const current = now()
    const count = database.prepare('SELECT COUNT(*) AS count, MIN(created_at) AS first FROM rate_limit_events WHERE action=? AND subject=? AND created_at>?').get(action, key, current - duration)
    if (count.count >= maximum) { const error = problem(429, '尝试过于频繁，请稍后再试。'); error.retryAfter = Math.max(1, Math.ceil((count.first + duration - current) / 1000)); throw error }
    database.prepare('INSERT INTO rate_limit_events VALUES (?,?,?)').run(action, key, current)
  })
  return { subject, ipSubject, consume: (...args) => consume.immediate(...args), canonicalIp }
}
