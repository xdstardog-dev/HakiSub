import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { createMailTestServer, mailToken } from './emailFixtures.mjs'
import { createAccountServer } from '../server/accountServer.mjs'
import { createPasswordService } from '../server/passwords.mjs'
import { backupDatabase } from '../server/admin.mjs'
import { tokenHash } from '../server/requestSecurity.mjs'
import { requireEmail, createEmailService } from '../server/emailService.mjs'
const base = { development: false, secret: 'synthetic-test-secret-with-at-least-forty-three-characters', origin: 'https://xdstar.work', projectOrigin: 'https://hakisub.xdstar.work', trustedProxies: [], limits: { registrationAttempts: 30, registrationSuccesses: 3, dailyWarning: 2 }, hashing: { memoryCost: 19456, timeCost: 2, parallelism: 1 }, hashConcurrency: 1, hashQueue: 8, sessionMaximumMs: 30 * 86400000, sessionIdleMs: 7 * 86400000 }
const registration = username => ({ username, email: username + '@example.test', password: 'correct horse battery', confirmPassword: 'correct horse battery' })
function client(server, ip = '203.0.113.1', origin = base.origin) {
  const cookies = new Map()
  const request = async (url, method = 'GET', payload, extra = {}) => {
    const response = await server.app.inject({ method, url, remoteAddress: ip, headers: { origin, cookie: [...cookies.values()].join('; '), ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, ...(payload === undefined ? {} : { payload }) })
    for (const value of [response.headers['set-cookie'] ?? []].flat()) { const entry = value.split(';')[0]; cookies.set(entry.split('=')[0], entry) }
    return { status: response.statusCode, body: response.json(), headers: response.headers }
  }
  const write = async (url, body, method = 'POST') => { const csrf = await request(url.startsWith('/api/projects/') ? '/api/projects/hakisub/csrf' : '/api/account/csrf'); return csrf.status === 200 ? request(url, method, body, { 'x-csrf-token': csrf.body.token }) : csrf }
  return { cookies, request, write }
}
const confirm = (person, token, purpose = 'register') => person.write('/api/account/email/confirm', { token, purpose })
test('模拟邮件完整注册、三种登录、一次性重置、换绑、限流与隔离', async () => {
  let clock = 1793462400000
  const server = await createMailTestServer({ ...base, databasePath: ':memory:' }, { now: () => clock })
  const a = client(server), guest = client(server, '203.0.113.2')
  try {
    assert.equal((await a.request('/api/account/register', 'POST', registration('alice'))).status, 403)
    assert.equal((await a.write('/api/account/register', { ...registration('alice'), email: 'bad\r\nBCC:x@test.com' })).status, 400)
    assert.equal((await a.write('/api/account/register', { ...registration('alice'), questions: [] })).status, 400)
    const sent = await a.write('/api/account/register', registration('alice'))
    assert.equal(sent.status, 200); assert.equal(sent.body.user, undefined)
    await server.flushMail()
    assert.equal(server.database.prepare('SELECT COUNT(*) n FROM users').get().n, 0)
    assert.equal((await a.write('/api/account/login', { username: 'alice', password: registration('').password })).status, 401)
    const token = mailToken(server, 'register')
    assert.equal(server.database.prepare('SELECT * FROM email_tokens WHERE token_hash=?').get(token), undefined)
    assert.equal((await guest.write('/api/account/email/link-details', { token, purpose: 'register' })).body.username, 'alice')
    assert.deepEqual((await Promise.all([confirm(a, token), confirm(guest, token)])).map(r => r.status).sort(), [200, 400])
    assert.equal((await a.request('/api/account/me')).status, 401)
    const user = server.database.prepare('SELECT * FROM users').get()
    assert.match(user.password_hash, /^\$argon2id\$/); assert.equal(server.database.prepare('SELECT COUNT(*) n FROM security_questions').get().n, 0)
    for (const identifier of ['alice', user.public_uid, 'ALICE@EXAMPLE.TEST']) assert.equal((await a.write('/api/account/login', { username: identifier, password: registration('').password })).status, 200)
    const oldSession = a.cookies.get(server.sessionName)
    assert.equal((await a.write('/api/account/email/request', { email: 'new@example.test', currentPassword: 'wrong' })).status, 400)
    assert.equal((await a.write('/api/account/email/request', { email: 'new@example.test', currentPassword: registration('').password })).status, 200)
    await server.flushMail()
    assert.equal(server.database.prepare('SELECT email FROM users').get().email, 'alice@example.test')
    assert.equal((await a.write('/api/account/login', { username: 'new@example.test', password: registration('').password })).status, 401)
    assert.equal((await confirm(guest, mailToken(server, 'bind'), 'register')).status, 400)
    assert.equal((await confirm(guest, mailToken(server, 'bind'), 'bind')).status, 200)
    await server.flushMail(); assert.ok(server.messages.some(m => m.to === 'alice@example.test' && m.subject.includes('安全通知')))
    a.cookies.set(server.sessionName, oldSession); assert.equal((await a.request('/api/account/me')).status, 401)
    assert.equal((await a.write('/api/account/login', { username: 'alice@example.test', password: registration('').password })).status, 401)
    clock += 3600001
    const response = await guest.write('/api/account/email/reset-request', { username: user.public_uid })
    const unknown = await client(server, '203.0.113.3').write('/api/account/email/reset-request', { username: 'unknown' })
    assert.deepEqual(response.body, unknown.body); assert.equal(response.status, unknown.status)
    await server.flushMail()
    const resetToken = mailToken(server, 'reset', 'new@example.test'), resetBody = { token: resetToken, password: 'new password value', confirmPassword: 'new password value' }
    assert.deepEqual((await Promise.all([guest.write('/api/account/email/reset', resetBody), a.write('/api/account/email/reset', resetBody)])).map(r => r.status).sort(), [200, 400])
    assert.equal((await guest.request('/api/account/me')).status, 401)
    assert.equal((await a.write('/api/account/login', { username: 'new@example.test', password: resetBody.password })).status, 200)
    clock += 3600001
    for (const identifier of ['alice', user.public_uid, 'NEW@example.test']) assert.equal((await guest.write('/api/account/email/reset-request', { username: identifier })).status, 200)
    await server.flushMail()
    const last = mailToken(server, 'reset'); assert.notEqual(last, resetToken)
    assert.equal((await guest.write('/api/account/email/reset-request', { username: 'alice' })).status, 200)
    await server.flushMail(); assert.equal(mailToken(server, 'reset'), last, '跨别名额度耗尽静默抑制邮件')
    clock += 1800001
    assert.equal((await guest.write('/api/account/email/reset', { ...resetBody, token: last })).status, 400)
    assert.equal((await client(server, '203.0.113.4', base.projectOrigin).write('/api/account/email/reset-request', { username: 'alice' })).status, 403)
    server.cleanup(); assert.equal(server.database.prepare('SELECT COUNT(*) n FROM email_tokens').get().n, 0)
  } finally { await server.app.close() }
})
test('真实旧版 SQLite 升级：原始用户、密码、会话及关联不变；自愿绑定后关闭密保', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xdstar-email-migration-')), path = join(directory, 'legacy.sqlite')
  const passwords = await createPasswordService(base.hashing, 1, 8), passwordHash = await passwords.hash('legacy password'), answerHash = await passwords.hash('legacy answer')
  const clock = Date.now(), session = 's'.repeat(43), db = new Database(path)
  // 固定改造前的 v2 建库代码，在磁盘创建真实旧版数据库。
  db.close()
  const { openAccountDatabase } = await import('./fixtures/database-v2.mjs')
  const legacy = openAccountDatabase(path)
  legacy.prepare('INSERT INTO users(id,username,nickname,password_hash,created_at,updated_at,public_uid) VALUES (?,?,?,?,?,?,?)').run('original-internal-id', 'legacy', '旧昵称', passwordHash, clock, clock, '123456')
  for (let i = 0; i < 3; i++) legacy.prepare('INSERT INTO security_questions VALUES (?,?,?,?,1,?)').run('original-internal-id', i, '旧问题' + i, answerHash, clock)
  legacy.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run(tokenHash(session), 'original-internal-id', 1, clock, clock, clock + 86400000)
  legacy.prepare('INSERT INTO user_projects VALUES (?,?,?)').run('original-internal-id', 'hakisub', clock)
  legacy.prepare('INSERT INTO hakisub_room_presets VALUES (?,?,?,1,?,?,?)').run('old-preset', 'original-internal-id', '旧存档', '{"schemaVersion":1,"asrProvider":"browser","adaptiveCards":true}', clock, clock)
  const originals = Object.fromEntries(['users', 'sessions', 'security_questions', 'user_projects', 'hakisub_room_presets'].map(t => [t, legacy.prepare(`SELECT * FROM ${t}`).all()]))
  const backup = join(directory, 'before-upgrade.sqlite'); await backupDatabase(legacy, backup); legacy.close()
  const roomPath = join(directory, 'rooms.json'); await writeFile(roomPath, JSON.stringify({ ownerUid: 'original-internal-id', code: '1234' })); const roomBytes = await readFile(roomPath)
  let server = await createMailTestServer({ ...base, databasePath: path }, { now: () => clock })
  try {
    assert.equal(server.database.pragma('user_version', { simple: true }), 3)
    for (const [table, rows] of Object.entries(originals)) assert.deepEqual(server.database.prepare(`SELECT * FROM ${table}`).all(), rows, table)
    assert.deepEqual(await readFile(roomPath), roomBytes)
    const person = client(server); person.cookies.set(server.sessionName, server.sessionName + '=' + session)
    assert.equal((await person.request('/api/account/me')).status, 200)
    assert.equal((await person.request('/api/projects/hakisub/presets')).body.presets[0].id, 'old-preset')
    for (const username of ['legacy', '123456']) assert.equal((await person.write('/api/account/login', { username, password: 'legacy password' })).status, 200)
    const recover = client(server, '203.0.113.7')
    assert.equal((await recover.write('/api/account/recovery/start', { username: 'legacy' })).body.questions[0], '旧问题0')
    assert.equal((await recover.write('/api/account/recovery/reset', { answers: Array(3).fill('legacy answer'), password: 'recovered password', confirmPassword: 'recovered password' })).status, 200)
    assert.equal((await person.request('/api/account/me')).status, 401)
    await person.write('/api/account/login', { username: '123456', password: 'recovered password' })
    await recover.write('/api/account/recovery/start', { username: 'legacy' })
    await person.write('/api/account/email/request', { email: 'legacy@example.test', currentPassword: 'recovered password' }); await server.flushMail()
    assert.equal((await confirm(recover, mailToken(server, 'bind'), 'bind')).status, 200)
    assert.equal((await recover.write('/api/account/recovery/reset', { answers: Array(3).fill('legacy answer'), password: 'attacker password', confirmPassword: 'attacker password' })).status, 400)
    assert.equal((await person.write('/api/account/login', { username: 'legacy@example.test', password: 'recovered password' })).status, 200)
    assert.notEqual((await recover.write('/api/account/recovery/start', { username: 'legacy' })).body.questions[0], '旧问题0')
    const migrated = server.database.prepare('SELECT * FROM users').get(); assert.equal(migrated.id, 'original-internal-id'); assert.equal(migrated.public_uid, '123456')
    await server.app.close(); server = await createMailTestServer({ ...base, databasePath: path })
    assert.equal((await client(server).write('/api/account/login', { username: 'legacy', password: 'recovered password' })).status, 200)
    const snapshot = new Database(backup, { readonly: true }); assert.equal(snapshot.prepare('SELECT password_hash FROM users').get().password_hash, passwordHash); snapshot.close()
    assert.equal(server.database.pragma('integrity_check', { simple: true }), 'ok')
  } finally { await server.app.close(); await rm(directory, { recursive: true, force: true }) }
})
test('SMTP失败不泄露信息或保留可用令牌；邮箱格式策略', async () => {
  const server = await createAccountServer({ ...base, databasePath: ':memory:' }, { mailer: { async sendMail() { throw Error('synthetic secret must not leak') } } })
  try {
    assert.equal((await client(server).write('/api/account/register', registration('delivery_failure'))).status, 200)
    await server.flushMail(); assert.equal(server.database.prepare('SELECT COUNT(*) n FROM email_tokens').get().n, 0)
    assert.equal(server.database.prepare('SELECT detail FROM security_events').get().detail, '{}')
    assert.equal(requireEmail('Name+tag@EXAMPLE.COM'), 'Name+tag@example.com')
    for (const email of ['a..b@example.test', 'a@-example.test', 'a@example.test\nBCC:a@b.test']) assert.throws(() => requireEmail(email))
    await assert.rejects(createEmailService({}).sendMail({}), /SMTP/)
  } finally { await server.app.close() }
})

test('Nodemailer SMTP配置强制TLS、超时与服务端发件人', async () => {
  let options, message
  const service = createEmailService({ smtp: { host: 'smtp.example.test', port: 587, secure: false, user: 'fixture', password: 'fixture-only', from: 'account@example.test' } }, configuration => {
    options = configuration; return { async sendMail(value) { message = value }, close() {} }
  })
  await service.sendMail({ to: 'person@example.test', text: 'fixture', from: 'forged@example.test' })
  assert.equal(options.requireTLS, true); assert.equal(options.tls?.rejectUnauthorized, undefined)
  assert.equal(options.disableFileAccess, true); assert.equal(options.disableUrlAccess, true)
  assert.equal(message.from, 'account@example.test'); assert.equal(options.logger, false)
  service.close()
})
test('验证事务复检注册额度/唯一性、重复信息通用响应、密码轮换撤销邮件及私有存档隔离', async () => {
  let clock = Date.now()
  const server = await createMailTestServer({ ...base, databasePath: ':memory:', limits: { ...base.limits, registrationSuccesses: 1 } }, { now: () => clock })
  try {
    const a = client(server), b = client(server, '203.0.113.2')
    for (const username of ['quota_one', 'quota_two']) {
      assert.equal((await a.write('/api/account/register', registration(username))).status, 200)
      await server.flushMail()
    }
    const tokens = ['quota_one', 'quota_two'].map(name => mailToken(server, 'register', name + '@example.test'))
    assert.deepEqual((await Promise.all(tokens.map(token => confirm(a, token)))).map(r => r.status).sort(), [200, 429])
    const user = server.database.prepare('SELECT * FROM users').get(), original = { ...user }
    const mailCount = server.messages.length
    const duplicate = await b.write('/api/account/register', { ...registration('duplicate'), email: user.email.toUpperCase() })
    const duplicateName = await b.write('/api/account/register', { ...registration(user.username), email: 'different@example.test' })
    assert.equal(duplicate.status, 200); assert.deepEqual(duplicate.body, duplicateName.body)
    await server.flushMail(); assert.equal(server.messages.length, mailCount)
    assert.deepEqual(server.database.prepare('SELECT * FROM users').get(), original)
    const login = await a.write('/api/account/login', { username: user.public_uid, password: registration('').password })
    assert.equal(login.status, 200)
    assert.match([login.headers['set-cookie']].flat().join(';'), /HttpOnly; Secure; SameSite=Lax/)
    const saved = await a.write('/api/projects/hakisub/presets', { name: '旧偏好', configuration: { schemaVersion: 1, asrProvider: 'browser', adaptiveCards: true } })
    assert.equal(saved.status, 201)
    assert.equal((await b.request('/api/projects/hakisub/presets')).status, 401)
    clock += 3600001
    await b.write('/api/account/email/reset-request', { username: user.public_uid }); await server.flushMail()
    const reset = mailToken(server, 'reset')
    await a.write('/api/account/email/request', { email: 'pending@example.test', currentPassword: registration('').password }); await server.flushMail()
    const bind = mailToken(server, 'bind')
    assert.equal((await a.write('/api/account/password', { currentPassword: registration('').password, password: 'rotated password', confirmPassword: 'rotated password' })).status, 200)
    assert.equal((await confirm(b, bind, 'bind')).status, 400)
    assert.equal((await b.write('/api/account/email/reset', { token: reset, password: 'unwanted password', confirmPassword: 'unwanted password' })).status, 400)
    assert.equal((await a.request('/api/projects/hakisub/presets')).body.presets[0].id, saved.body.preset.id)
    assert.equal((await a.write('/api/account/register', { ...registration('bad_nickname'), nickname: 123 })).status, 400)
  } finally { await server.app.close() }
})
