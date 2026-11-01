import { randomBytes, randomUUID } from 'node:crypto'
import { defaultNickname, isValidAccountName } from '../shared/nameRules.mjs'
import { allocatePublicUid } from './database.mjs'
import { requireEmail } from './emailService.mjs'
import { problem, tokenHash, normalizeUsername, requireNickname, requirePassword, requireText } from './requestSecurity.mjs'

export function registerEmailRoutes({ app, database, configuration, passwords, security, now, mailer, needUser, checkSnapshot, findLoginUser, bodySchema }) {
  const pending = new Set()
  const generic = { message: '如果填写的信息符合条件，邮件将发送到对应邮箱；请检查收件箱或稍后重试。' }
  const invalid = () => problem(400, '链接无效、已过期或已使用，请重新申请。')
  const verifiedEmail = email => database.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND email_verified_at IS NOT NULL').get(email)
  const limitMail = (request, email, user) => {
    security.consume('email_network', security.ipSubject(request), 10, 3600000)
    // 所有用途共享收件地址额度；账号不同标识共用账号额度。
    security.consume('email_destination', security.subject(email.toLowerCase()), 3, 3600000)
    if (user) security.consume('email_account', security.subject(user.id), 3, 3600000)
  }
  const enqueue = operation => {
    if (pending.size >= 16) throw problem(503, '邮件服务繁忙，请稍后重试。')
    const task = new Promise(resolve => setImmediate(resolve)).then(operation).catch(() => {
      database.prepare('INSERT INTO security_events(kind,detail,created_at) VALUES (?,?,?)').run('email_delivery_failed', '{}', now())
    }).finally(() => pending.delete(task))
    pending.add(task)
  }
  const notify = (to, text) => {
    // 通知拥塞不能把已提交的账号变更报告为失败。
    try { enqueue(() => mailer.sendMail({ to, subject: 'XDstar 账号安全通知', text })) }
    catch { database.prepare('INSERT INTO security_events(kind,detail,created_at) VALUES (?,?,?)').run('email_delivery_failed', '{}', now()) }
  }
  const sendToken = async (purpose, email, user, payload, subject) => {
    const token = randomBytes(32).toString('base64url'), hash = tokenHash(token)
    database.transaction(() => {
      database.prepare('DELETE FROM email_tokens WHERE purpose=? AND (email=? COLLATE NOCASE OR user_id=?)').run(purpose, email, user?.id ?? null)
      database.prepare('INSERT INTO email_tokens VALUES (?,?,?,?,?,?,?,?)').run(hash, purpose, user?.id ?? null, user?.auth_version ?? null, email, payload ? JSON.stringify(payload) : null, subject, now() + 1800000)
    }).immediate()
    try {
      // 固定来源与 URL fragment 避免 Host 注入和代理访问日志记录令牌；GET 不消费。
      await mailer.sendMail({ to: email, subject: purpose === 'reset' ? 'XDstar 重置密码' : 'XDstar 验证邮箱',
        text: `操作账号：${payload?.username ?? user.username}。\n请打开链接并确认操作（30分钟内有效，仅可使用一次）：\n${configuration.origin}/account/#${purpose}=${token}\n仅确认本人发起的操作；如果你没有填写注册密码，请勿确认此链接。` })
    } catch {
      database.prepare('DELETE FROM email_tokens WHERE token_hash=?').run(hash)
      throw Error('Email delivery failed')
    }
  }
  const readToken = (value, purpose) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw invalid()
    const row = database.prepare('SELECT * FROM email_tokens WHERE token_hash=? AND purpose=?').get(tokenHash(value), purpose)
    if (!row || row.expires_at <= now()) throw invalid()
    return row
  }
  app.post('/api/account/email/link-details', { schema: bodySchema(['token', 'purpose']) }, async request => {
    security.consume('email_link_details', security.ipSubject(request), 20, 900000)
    if (!['register', 'bind', 'reset'].includes(request.body.purpose)) throw invalid()
    const row = readToken(request.body.token, request.body.purpose)
    const user = row.user_id ? database.prepare('SELECT * FROM users WHERE id=?').get(row.user_id) : null
    if (row.user_id && (!user || user.auth_version !== row.auth_version)) throw invalid()
    // 只有持有有效邮件令牌才显示目标账号，不消费令牌，不采用浏览器当前身份。
    return { username: user?.username ?? JSON.parse(row.payload).username }
  })
  app.post('/api/account/register', { schema: bodySchema(['username', 'nickname', 'email', 'password', 'confirmPassword'], ['username', 'email', 'password', 'confirmPassword']) }, async request => {
    const ip = security.ipSubject(request)
    security.consume('register', ip, configuration.limits.registrationAttempts, 600000)
    const username = normalizeUsername(request.body.username), email = requireEmail(request.body.email)
    if (!isValidAccountName(username)) throw problem(400, '账号需为 3～20 位英文字母、数字或下划线。')
    const suppliedNickname = typeof request.body.nickname === 'string' ? request.body.nickname.trim() : request.body.nickname
    const nickname = requireNickname(suppliedNickname === undefined || suppliedNickname === '' ? defaultNickname(username) : suppliedNickname), password = requirePassword(request.body)
    limitMail(request, email)
    const hash = await passwords.run(() => passwords.hash(password))
    // 即使账号或邮箱重复也经过相同哈希及异步邮件路径，公开响应保持一致。
    enqueue(async () => {
      if (findLoginUser(username) || verifiedEmail(email)) return
      if (database.prepare('SELECT COUNT(*) AS count FROM registration_events WHERE subject=? AND created_at>? AND quota_exempt=0').get(ip, now() - 86400000).count >= configuration.limits.registrationSuccesses) return
      await sendToken('register', email, null, { username, nickname, hash }, ip)
    })
    return generic
  })
  app.post('/api/account/email/request', { schema: bodySchema(['email', 'currentPassword']) }, async request => {
    const user = needUser(request), email = requireEmail(request.body.email)
    requireText(request.body.currentPassword, 1, 128, '当前密码')
    security.consume('sensitive', security.subject(user.id), 5, 900000)
    limitMail(request, email, user)
    if (!await passwords.run(() => passwords.verify(user.password_hash, request.body.currentPassword))) throw problem(400, '当前密码不正确。')
    checkSnapshot(request, user)
    enqueue(async () => {
      if (verifiedEmail(email)) return
      await sendToken('bind', email, user, null, security.subject(user.id))
    })
    return generic
  })
  app.post('/api/account/email/reset-request', { schema: bodySchema(['username']) }, async request => {
    const identifier = normalizeUsername(request.body.username)
    requireText(identifier, 1, 254, '账号、UID或邮箱')
    const user = findLoginUser(identifier)
    security.consume('email_network', security.ipSubject(request), 10, 3600000)
    security.consume('email_identifier', security.subject(identifier), 3, 3600000)
    let allowed = true
    // 私有的跨别名/收件地址额度静默抑制，不能通过429关联账号、UID和邮箱。
    try {
      security.consume('email_destination', security.subject((user?.email_verified_at != null ? user.email : identifier).toLowerCase()), 3, 3600000)
      if (user) security.consume('email_account', security.subject(user.id), 3, 3600000)
    } catch (error) { if (error.statusCode !== 429) throw error; allowed = false }
    enqueue(async () => {
      if (allowed && user?.email_verified_at != null) await sendToken('reset', user.email, user, null, security.subject(user.id))
    })
    return generic
  })
  app.post('/api/account/email/confirm', { schema: bodySchema(['token', 'purpose']) }, async request => {
    security.consume('email_confirm', security.ipSubject(request), 20, 900000)
    if (!['register', 'bind'].includes(request.body.purpose)) throw invalid()
    let oldEmail
    database.transaction(() => {
      const row = readToken(request.body.token, request.body.purpose)
      if (verifiedEmail(row.email)) throw invalid()
      if (row.purpose === 'register') {
        const data = JSON.parse(row.payload)
        if (findLoginUser(data.username)) throw invalid()
        if (database.prepare('SELECT COUNT(*) AS count FROM registration_events WHERE subject=? AND created_at>? AND quota_exempt=0').get(row.subject, now() - 86400000).count >= configuration.limits.registrationSuccesses) throw problem(429, '当前网络近期注册较多，请稍后重试。')
        const id = randomUUID()
        database.prepare('INSERT INTO users(id,username,nickname,password_hash,email,email_verified_at,created_at,updated_at,public_uid) VALUES (?,?,?,?,?,?,?,?,?)').run(id, data.username, data.nickname, data.hash, row.email, now(), now(), now(), allocatePublicUid(database))
        database.prepare('INSERT INTO registration_events(user_id,subject,created_at) VALUES (?,?,?)').run(id, row.subject, now())
        const dayStart = Math.floor((now() + 28800000) / 86400000) * 86400000 - 28800000
        const count = database.prepare('SELECT COUNT(*) AS count FROM registration_events WHERE created_at>=?').get(dayStart).count
        if (count === configuration.limits.dailyWarning + 1) database.prepare('INSERT INTO security_events(kind,detail,created_at) VALUES (?,?,?)').run('registration_growth', JSON.stringify({ count, dayStart }), now())
      } else {
        const user = database.prepare('SELECT * FROM users WHERE id=?').get(row.user_id)
        if (!user || user.auth_version !== row.auth_version) throw invalid()
        oldEmail = user.email_verified_at != null ? user.email : null
        database.prepare('UPDATE users SET email=?,email_verified_at=?,auth_version=auth_version+1,updated_at=? WHERE id=?').run(row.email, now(), now(), user.id)
        database.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id)
        database.prepare('DELETE FROM recovery_challenges WHERE user_id=?').run(user.id)
        database.prepare('DELETE FROM email_tokens WHERE user_id=?').run(user.id)
      }
      database.prepare('DELETE FROM email_tokens WHERE token_hash=?').run(row.token_hash)
    }).immediate()
    if (oldEmail) notify(oldEmail, '你的 XDstar 账号邮箱已更换。如非本人操作，请联系站点维护者。')
    return { message: '邮箱验证完成，请使用原账号密码登录。密保找回已停用。' }
  })
  app.post('/api/account/email/reset', { schema: bodySchema(['token', 'password', 'confirmPassword']) }, async request => {
    security.consume('email_reset', security.ipSubject(request), 10, 900000)
    const password = requirePassword(request.body), snapshot = readToken(request.body.token, 'reset')
    const hash = await passwords.run(() => passwords.hash(password))
    database.transaction(() => {
      const row = readToken(request.body.token, 'reset')
      const user = database.prepare('SELECT * FROM users WHERE id=?').get(row.user_id)
      if (!user || user.auth_version !== row.auth_version || user.email !== row.email || user.email_verified_at == null) throw invalid()
      database.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1,updated_at=? WHERE id=?').run(hash, now(), user.id)
      for (const table of ['sessions', 'recovery_challenges', 'email_tokens']) database.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(user.id)
    }).immediate()
    notify(snapshot.email, '你的 XDstar 账号密码已重置，所有旧会话和恢复链接已失效。如非本人操作，请联系站点维护者。')
    return { message: '密码已重置，请重新登录。' }
  })
  return { flush: async () => { while (pending.size) await Promise.all([...pending]) } }
}
