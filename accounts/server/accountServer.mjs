import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import csrf from '@fastify/csrf-protection'
import staticFiles from '@fastify/static'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { createRoomManagementClient } from './roomManagementClient.mjs'
import { openAccountDatabase, allocatePublicUid } from './database.mjs'
import { createPasswordService, normalizeAnswer } from './passwords.mjs'
import { createRequestSecurity, tokenHash, problem, normalizeUsername, requireText, requireNickname, requirePassword, requireQuestions, validatePreset } from './requestSecurity.mjs'

export async function createAccountServer(configuration, { now = Date.now, passwordService, websiteDirectory } = {}) {
  const database = openAccountDatabase(configuration.databasePath)
  const passwords = passwordService ?? await createPasswordService(configuration.hashing, configuration.hashConcurrency, configuration.hashQueue)
  const security = createRequestSecurity(database, configuration, now)
  const manageRoom = createRoomManagementClient(configuration)
  const app = Fastify({ logger: false, bodyLimit: 16384, requestTimeout: 15000, connectionTimeout: 15000, ajv: { customOptions: { removeAdditional: false } } })
  const secure = !configuration.development
  const sessionName = secure ? '__Host-xdstar_session' : 'xdstar_development_session'
  const recoveryName = secure ? '__Host-xdstar_recovery' : 'xdstar_development_recovery'
  const cookieOptions = { path: '/', httpOnly: true, secure, sameSite: 'lax' }
  const projectPath = '/api/projects/hakisub'
  const userInfo = request => `${request.cookies[sessionName] ?? 'guest'}:${request.url.startsWith(projectPath) ? 'hakisub' : 'account'}`
  await app.register(cookie, { secret: configuration.secret })
  await app.register(cors, { origin: [configuration.origin, configuration.projectOrigin], credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'], maxAge: 300 })
  await app.register(csrf, { cookieKey: secure ? '__Host-xdstar_csrf' : 'xdstar_development_csrf', cookieOpts: { ...cookieOptions, signed: true }, getToken: request => request.headers['x-csrf-token'], getUserInfo: userInfo, csrfOpts: { hmacKey: configuration.secret } })
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer')
    // 授权范围以规范路径为准，拒绝路由解码与原始URL分类不一致的编码/点路径。
    const pathname = request.raw.url.split('?')[0]
    if (!pathname.startsWith('/') || /[%\\]/.test(pathname) || pathname.includes('//') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(pathname)) throw problem(404, '请求路径无效。')
    if (!request.url.startsWith('/api/')) return
    reply.header('Cache-Control', 'no-store')
    const allowed = request.url.startsWith(projectPath + '/') ? [configuration.origin, configuration.projectOrigin] : [configuration.origin]
    if (request.headers.origin && !allowed.includes(request.headers.origin)) throw problem(403, '请从对应站点访问此功能。')
    if (request.headers['sec-fetch-site'] === 'cross-site') throw problem(403, '不允许此跨站请求。')
    if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
      if (!allowed.includes(request.headers.origin)) throw problem(403, '请求来源验证失败，请刷新后重试。')
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw problem(415, '请使用 JSON 请求。')
    }
  })
  app.addHook('onRequest', (request, reply, next) => {
    if (request.url.startsWith('/api/') && ['POST', 'PATCH', 'DELETE'].includes(request.method)) return app.csrfProtection(request, reply, next)
    next()
  })
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : error.statusCode === 503 ? 503 : 500
    if (error.retryAfter) reply.header('Retry-After', error.retryAfter)
    const message = status === 500 ? '账号服务暂时不可用，请稍后重试。' : error.code?.startsWith('FST_CSRF') ? '安全验证已过期，请刷新后重试。' : error.validation ? '填写内容格式不正确，请检查后重试。' : error.message
    reply.code(status).send({ message })
  })
  const bodySchema = (keys, required = keys) => ({ body: { type: 'object', additionalProperties: false, required, properties: Object.fromEntries(keys.map(key => [key, {}])) } })
  const account = path => '/api/account/' + path
  const publicUser = user => ({ uid: user.public_uid, username: user.username, nickname: user.nickname, createdAt: user.created_at })
  const findLoginUser = identifier => database.prepare('SELECT * FROM users WHERE username=? OR public_uid=?').get(identifier, identifier)
  const lookupSession = request => {
    const token = request.cookies[sessionName]
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined
    const user = database.prepare(`SELECT u.*, s.auth_version AS session_version, s.expires_at, s.last_seen_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(tokenHash(token))
    if (!user || user.auth_version !== user.session_version || user.expires_at <= now() || user.last_seen_at + configuration.sessionIdleMs <= now()) return undefined
    if (now() - user.last_seen_at > 60000) database.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(now(), tokenHash(token))
    return user
  }
  const needUser = request => { const user = lookupSession(request); if (!user) throw problem(401, '请先登录，或重新登录已过期的账号。'); return user }
  const issueSession = (user, request, reply) => {
    const old = request.cookies[sessionName]
    if (old) database.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(old))
    const token = randomBytes(32).toString('base64url')
    database.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run(tokenHash(token), user.id, user.auth_version, now(), now(), now() + configuration.sessionMaximumMs)
    reply.setCookie(sessionName, token, { ...cookieOptions, maxAge: Math.floor(configuration.sessionMaximumMs / 1000) })
  }
  const checkSnapshot = (request, snapshot) => {
    const current = needUser(request)
    if (current.auth_version !== snapshot.auth_version || current.password_hash !== snapshot.password_hash) throw problem(409, '账号已在其他操作中更新，请重新登录。')
    return current
  }
  const saveQuestions = (uid, questions, hashes) => {
    database.prepare('DELETE FROM security_questions WHERE user_id=?').run(uid)
    const insert = database.prepare('INSERT INTO security_questions VALUES (?,?,?,?,1,?)')
    questions.forEach((question, slot) => insert.run(uid, slot, question.question, hashes[slot], now()))
  }
  const answersFor = (questions, body) => questions.map(item => {
    const value = normalizeAnswer(item.answer)
    if (value.length < 2 || ['123', '123456', 'password', normalizeUsername(body.username), normalizeAnswer(body.nickname ?? ''), normalizeAnswer(body.password ?? '')].includes(value)) throw problem(400, '请使用不容易猜到的密保答案，避免账号、昵称、密码和常见短语。')
    return value
  })
  const csrfResponse = (request, reply) => ({ token: reply.generateCsrf({ userInfo: userInfo(request) }) })
  app.get(account('csrf'), csrfResponse)
  app.get(projectPath + '/csrf', csrfResponse)
  app.get('/api/account/health', async () => ({ available: true }))
  app.get('/api/account/client-configuration', async () => ({ projectOrigin: configuration.projectOrigin }))
  app.get(account('me'), async request => {
    const user = needUser(request)
    return { user: publicUser(user), projects: database.prepare('SELECT project_key AS key, created_at AS createdAt FROM user_projects WHERE user_id=?').all(user.id) }
  })
  app.get(projectPath + '/identity', async request => {
    const user = lookupSession(request)
    return { user: user ? { uid: user.public_uid, nickname: user.nickname } : null }
  })
  const forwardRoom = (request, command) => {
    const user = needUser(request)
    security.consume('room_management', security.subject(user.id), 60, 60000)
    return manageRoom({ ...command, uid: user.id }, () => {
      if (needUser(request).id !== user.id) throw problem(401, '登录状态已改变，请重新登录。')
    })
  }
  app.get(projectPath + '/rooms', async request => forwardRoom(request, { action: 'list' }))
  app.post(projectPath + '/rooms/:code/bind', { schema: bodySchema(['ownerToken']) }, async request => {
    if (typeof request.body.ownerToken !== 'string' || !/^[a-f0-9-]{36}$/.test(request.body.ownerToken)) throw problem(400, '需要合法的原房主管理凭据。')
    return forwardRoom(request, { code: request.params.code, action: 'bind', ownerToken: request.body.ownerToken })
  })
  app.post(projectPath + '/rooms/:code/access', { schema: bodySchema(['password'], []) }, async request => {
    const user = needUser(request), { password } = request.body
    if (password !== undefined && (typeof password !== 'string' || !/^\d{4}$/.test(password))) throw problem(400, '入房码需为四位数字。')
    security.consume('room_access_network', security.ipSubject(request), 30, 60000)
    security.consume('room_access_account', security.subject(user.id), 20, 60000)
    return forwardRoom(request, { code: request.params.code, action: 'access', ...(password === undefined ? {} : { password }) })
  })
  app.post(projectPath + '/rooms/:code/manage', { schema: bodySchema(['action', 'apiKey', 'enabled', 'accessCode'], ['action']) }, async request => {
    const { action, apiKey, enabled, accessCode } = request.body
    if (!['save', 'delete', 'test', 'asr', 'reveal', 'access-code'].includes(action) || (action !== 'save' && apiKey !== undefined) || (action !== 'asr' && enabled !== undefined) || (action !== 'access-code' && accessCode !== undefined)) throw problem(400, '无效的房间管理操作。')
    return forwardRoom(request, { code: request.params.code, action, ...(action === 'save' ? { apiKey } : {}), ...(action === 'asr' ? { enabled } : {}), ...(action === 'access-code' ? { accessCode } : {}) })
  })
  app.post(account('register'), { schema: bodySchema(['username', 'nickname', 'password', 'confirmPassword', 'questions']) }, async (request, reply) => {
    const ip = security.ipSubject(request)
    security.consume('register', ip, configuration.limits.registrationAttempts, 600000)
    const body = request.body, username = normalizeUsername(body.username)
    if (!/^[a-z0-9_]{3,32}$/.test(username)) throw problem(400, '登录账号需为 3～32 位英文字母、数字或下划线。')
    const nickname = requireNickname(body.nickname), password = requirePassword(body), questions = requireQuestions(body.questions), answers = answersFor(questions, body)
    const checkRegistration = () => {
      if (database.prepare('SELECT COUNT(*) AS count FROM registration_events WHERE subject=? AND created_at>? AND quota_exempt=0').get(ip, now() - 86400000).count >= configuration.limits.registrationSuccesses) throw problem(429, '当前网络近期注册较多，请明天重试或联系站点维护者。')
      if (findLoginUser(username)) throw problem(409, '这个登录账号已被使用，请换一个。')
    }
    checkRegistration()
    const hashes = await passwords.run(async () => {
      const result = [await passwords.hash(password)]
      for (const answer of answers) result.push(await passwords.hash(answer))
      return result
    })
    const user = { id: randomUUID(), username, nickname, auth_version: 1, created_at: now() }
    database.transaction(() => {
      checkRegistration()
      user.public_uid = allocatePublicUid(database)
      database.prepare('INSERT INTO users (id,username,nickname,password_hash,created_at,updated_at,public_uid) VALUES (?,?,?,?,?,?,?)').run(user.id, username, nickname, hashes[0], now(), now(), user.public_uid)
      saveQuestions(user.id, questions, hashes.slice(1))
      database.prepare('INSERT INTO registration_events (user_id,subject,created_at) VALUES (?,?,?)').run(user.id, ip, now())
      const dayStart = Math.floor((now() + 28800000) / 86400000) * 86400000 - 28800000
      const count = database.prepare('SELECT COUNT(*) AS count FROM registration_events WHERE created_at>=?').get(dayStart).count
      if (count === configuration.limits.dailyWarning + 1) database.prepare('INSERT INTO security_events (kind,detail,created_at) VALUES (?,?,?)').run('registration_growth', JSON.stringify({ count, dayStart }), now())
      issueSession(user, request, reply)
    }).immediate()
    reply.code(201)
    return { user: publicUser(user) }
  })
  app.post(account('login'), { schema: bodySchema(['username', 'password']) }, async (request, reply) => {
    const username = normalizeUsername(request.body.username), ip = security.ipSubject(request)
    security.consume('login_ip', ip, 30, 900000)
    security.consume('login_pair', security.subject(ip + ':' + username), 5, 900000)
    const snapshot = findLoginUser(username)
    security.consume('login_account', security.subject(snapshot ? 'user:' + snapshot.id : 'username:' + username), 30, 3600000)
    requireText(request.body.password, 1, 128, '密码')
    const valid = await passwords.run(() => passwords.verify(snapshot?.password_hash ?? passwords.dummyHash, request.body.password))
    const current = snapshot && database.prepare('SELECT * FROM users WHERE id=?').get(snapshot.id)
    if (!valid || !current || snapshot.password_hash !== current.password_hash || snapshot.auth_version !== current.auth_version) throw problem(401, '登录账号或密码不正确。')
    issueSession(current, request, reply)
    return { user: publicUser(current) }
  })
  app.post(account('logout'), { schema: bodySchema([]) }, async (request, reply) => {
    const token = request.cookies[sessionName]
    if (token) database.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token))
    reply.clearCookie(sessionName, cookieOptions)
    return { message: '已退出登录。' }
  })
  app.patch(account('nickname'), { schema: bodySchema(['nickname']) }, async request => {
    const user = needUser(request), nickname = requireNickname(request.body.nickname)
    security.consume('profile', security.subject(user.id), 20, 900000)
    database.prepare('UPDATE users SET nickname=?, updated_at=? WHERE id=?').run(nickname, now(), user.id)
    return { user: publicUser({ ...user, nickname }) }
  })
  app.post(account('password'), { schema: bodySchema(['currentPassword', 'password', 'confirmPassword']) }, async (request, reply) => {
    const user = needUser(request), password = requirePassword(request.body)
    requireText(request.body.currentPassword, 1, 128, '当前密码')
    security.consume('sensitive', security.subject(user.id), 5, 900000)
    const hash = await passwords.run(async () => {
      if (!await passwords.verify(user.password_hash, request.body.currentPassword)) throw problem(400, '当前密码不正确。')
      return passwords.hash(password)
    })
    database.transaction(() => {
      checkSnapshot(request, user)
      database.prepare('UPDATE users SET password_hash=?, auth_version=auth_version+1, updated_at=? WHERE id=?').run(hash, now(), user.id)
      database.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id)
      database.prepare('DELETE FROM recovery_challenges WHERE user_id=?').run(user.id)
      issueSession({ ...user, auth_version: user.auth_version + 1 }, request, reply)
    }).immediate()
    return { message: '密码已更新，其他登录会话已退出。' }
  })
  app.get(account('security-questions'), async request => ({ questions: database.prepare('SELECT question FROM security_questions WHERE user_id=? ORDER BY slot').all(needUser(request).id).map(row => row.question) }))
  app.post(account('security-questions'), { schema: bodySchema(['currentPassword', 'questions']) }, async (request, reply) => {
    const user = needUser(request), questions = requireQuestions(request.body.questions), answers = answersFor(questions, { ...request.body, username: user.username, nickname: user.nickname })
    requireText(request.body.currentPassword, 1, 128, '当前密码')
    security.consume('sensitive', security.subject(user.id), 5, 900000)
    const hashes = await passwords.run(async () => {
      if (!await passwords.verify(user.password_hash, request.body.currentPassword)) throw problem(400, '当前密码不正确。')
      // 不允许将当前登录密码用作恢复答案。
      if (answers.some(answer => answer === normalizeAnswer(request.body.currentPassword))) throw problem(400, '密保答案不能使用当前密码。')
      const result = []
      for (const answer of answers) result.push(await passwords.hash(answer))
      return result
    })
    database.transaction(() => {
      checkSnapshot(request, user)
      saveQuestions(user.id, questions, hashes)
      database.prepare('UPDATE users SET auth_version=auth_version+1, updated_at=? WHERE id=?').run(now(), user.id)
      database.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id)
      database.prepare('DELETE FROM recovery_challenges WHERE user_id=?').run(user.id)
      issueSession({ ...user, auth_version: user.auth_version + 1 }, request, reply)
    }).immediate()
    return { message: '三道密保已更新，旧找回请求已失效。' }
  })
  const decoyQuestions = ['你为自己记住的第一段私密短语是什么？', '你为自己记住的第二段私密短语是什么？', '你为自己记住的第三段私密短语是什么？', '你珍藏而不公开的一段记忆代号是什么？', '你给想象中的地方起的秘密名字是什么？']
  app.post(account('recovery/start'), { schema: bodySchema(['username']) }, async (request, reply) => {
    const username = normalizeUsername(request.body.username)
    requireText(username, 1, 32, '登录账号')
    const user = findLoginUser(username)
    const subject = security.subject(user ? 'user:' + user.id : 'username:' + username)
    security.consume('recovery_start_ip', security.ipSubject(request), 10, 900000)
    security.consume('recovery_start_account', subject, 5, 1800000)
    const actual = user ? database.prepare('SELECT question FROM security_questions WHERE user_id=? ORDER BY slot').all(user.id).map(row => row.question) : []
    const index = parseInt(subject.slice(0, 4), 16) % decoyQuestions.length
    const questions = actual.length === 3 ? actual : Array.from({ length: 3 }, (_, offset) => decoyQuestions[(index + offset) % decoyQuestions.length])
    const token = randomBytes(32).toString('base64url')
    database.transaction(() => {
      const previous = request.cookies[recoveryName]
      if (previous) database.prepare('DELETE FROM recovery_challenges WHERE token_hash=?').run(tokenHash(previous))
      database.prepare('INSERT INTO recovery_challenges (token_hash,subject,user_id,auth_version,questions,expires_at) VALUES (?,?,?,?,?,?)').run(tokenHash(token), subject, actual.length === 3 ? user.id : null, user?.auth_version ?? null, JSON.stringify(questions), now() + 600000)
    }).immediate()
    reply.setCookie(recoveryName, token, { ...cookieOptions, maxAge: 600 })
    return { questions, message: '请回答全部三道问题；问题内容不能作为账号存在的证明。' }
  })
  app.post(account('recovery/reset'), { schema: bodySchema(['answers', 'password', 'confirmPassword']) }, async (request, reply) => {
    const password = requirePassword(request.body), answers = request.body.answers
    if (!Array.isArray(answers) || answers.length !== 3) throw problem(400, '请填写全部三道答案。')
    answers.forEach(answer => requireText(answer, 1, 128, '密保答案'))
    security.consume('recovery_answer_ip', security.ipSubject(request), 10, 900000)
    const token = request.cookies[recoveryName], key = token ? tokenHash(token) : ''
    const invalid = () => problem(400, '答案不正确或找回请求已失效，请稍后重新尝试。')
    const challenge = database.transaction(() => {
      const row = database.prepare('SELECT * FROM recovery_challenges WHERE token_hash=?').get(key)
      if (!row || row.expires_at <= now() || row.attempts >= 5) throw invalid()
      database.prepare('UPDATE recovery_challenges SET attempts=attempts+1 WHERE token_hash=?').run(key)
      return row
    }).immediate()
    security.consume('recovery_answer_account', challenge.subject, 5, 1800000)
    const user = challenge.user_id && database.prepare('SELECT * FROM users WHERE id=?').get(challenge.user_id)
    const records = user ? database.prepare('SELECT answer_hash FROM security_questions WHERE user_id=? ORDER BY slot').all(user.id) : []
    const hash = await passwords.run(async () => {
      const verified = []
      for (let index = 0; index < 3; index++) verified.push(await passwords.verify(records[index]?.answer_hash ?? passwords.dummyHash, normalizeAnswer(answers[index])))
      if (!user || records.length !== 3 || verified.some(value => !value) || user.auth_version !== challenge.auth_version) throw invalid()
      return passwords.hash(password)
    })
    database.transaction(() => {
      const live = database.prepare('SELECT * FROM recovery_challenges WHERE token_hash=?').get(key)
      const current = database.prepare('SELECT auth_version FROM users WHERE id=?').get(user.id)
      if (!live || live.expires_at <= now() || current.auth_version !== challenge.auth_version) throw invalid()
      database.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1,updated_at=? WHERE id=?').run(hash, now(), user.id)
      database.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id)
      database.prepare('DELETE FROM recovery_challenges WHERE user_id=?').run(user.id)
    }).immediate()
    reply.clearCookie(recoveryName, cookieOptions).clearCookie(sessionName, cookieOptions)
    return { message: '密码已重置，旧登录会话均已失效，请重新登录。' }
  })
  const presetRow = row => ({ id: row.id, name: row.preset_name, configuration: JSON.parse(row.configuration), createdAt: row.created_at, updatedAt: row.updated_at })
  app.get(projectPath + '/presets', async request => ({ presets: database.prepare('SELECT * FROM hakisub_room_presets WHERE user_id=? ORDER BY updated_at DESC,id').all(needUser(request).id).map(presetRow) }))
  app.post(projectPath + '/presets', { schema: bodySchema(['name', 'configuration']) }, async (request, reply) => {
    const user = needUser(request), name = requireText(request.body.name?.trim(), 1, 60, '存档名称'), settings = validatePreset(request.body.configuration)
    security.consume('presets', security.subject(user.id), 60, 600000)
    const id = randomUUID()
    database.transaction(() => {
      if (database.prepare('SELECT COUNT(*) AS count FROM hakisub_room_presets WHERE user_id=?').get(user.id).count >= 100) throw problem(409, '最多保留 100 份个人存档，请先删除不需要的存档。')
      database.prepare('INSERT INTO hakisub_room_presets VALUES (?,?,?,1,?,?,?)').run(id, user.id, name, JSON.stringify(settings), now(), now())
      database.prepare('INSERT OR IGNORE INTO user_projects VALUES (?,?,?)').run(user.id, 'hakisub', now())
    }).immediate()
    reply.code(201)
    return { preset: presetRow(database.prepare('SELECT * FROM hakisub_room_presets WHERE id=? AND user_id=?').get(id, user.id)) }
  })
  app.patch(projectPath + '/presets/:id', { schema: bodySchema(['name', 'configuration'], ['name']) }, async request => {
    const user = needUser(request), name = requireText(request.body.name?.trim(), 1, 60, '存档名称')
    security.consume('presets', security.subject(user.id), 60, 600000)
    const row = database.prepare('SELECT * FROM hakisub_room_presets WHERE id=? AND user_id=?').get(request.params.id, user.id)
    if (!row) throw problem(404, '找不到这份存档。')
    const configuration = request.body.configuration === undefined ? row.configuration : JSON.stringify(validatePreset(request.body.configuration))
    database.prepare('UPDATE hakisub_room_presets SET preset_name=?,configuration=?,updated_at=? WHERE id=? AND user_id=?').run(name, configuration, now(), row.id, user.id)
    return { preset: presetRow(database.prepare('SELECT * FROM hakisub_room_presets WHERE id=? AND user_id=?').get(row.id, user.id)) }
  })
  app.delete(projectPath + '/presets/:id', { schema: bodySchema([]) }, async request => {
    const user = needUser(request)
    security.consume('presets', security.subject(user.id), 60, 600000)
    if (!database.prepare('DELETE FROM hakisub_room_presets WHERE id=? AND user_id=?').run(request.params.id, user.id).changes) throw problem(404, '找不到这份存档。')
    return { message: '存档已删除。' }
  })
  const website = websiteDirectory ?? fileURLToPath(new URL('../dist/', import.meta.url))
  if (existsSync(website)) {
    await app.register(staticFiles, { root: website, prefix: '/account/', index: ['index.html'], cacheControl: false, setHeaders(reply) { reply.header('Cache-Control', 'no-store'); reply.header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'") } })
    app.get('/account', async (request, reply) => reply.redirect('/account/'))
  }
  const cleanup = () => database.transaction(() => {
    database.prepare('DELETE FROM rate_limit_events WHERE created_at<?').run(now() - 86400000)
    database.prepare('DELETE FROM registration_events WHERE created_at<?').run(now() - 8 * 86400000)
    database.prepare('DELETE FROM recovery_challenges WHERE expires_at<=?').run(now())
    database.prepare('DELETE FROM sessions WHERE expires_at<=? OR last_seen_at<?').run(now(), now() - configuration.sessionIdleMs)
  })()
  const timer = setInterval(cleanup, 600000); timer.unref()
  app.addHook('onClose', async () => { clearInterval(timer); database.close() })
  return { app, database, security, sessionName, cleanup }
}
