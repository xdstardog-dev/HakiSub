import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import { createAccountServer } from '../server/accountServer.mjs'
import { createPasswordService, normalizeAnswer } from '../server/passwords.mjs'
import { clearIpLimit, backupDatabase } from '../server/admin.mjs'
import { createRequestSecurity } from '../server/requestSecurity.mjs'

const base = {
  development: false, secret: 'synthetic-test-secret-with-at-least-forty-three-characters', origin: 'https://xdstar.work', projectOrigin: 'https://hakisub.xdstar.work',
  trustedProxies: [], limits: { registrationAttempts: 5, registrationSuccesses: 3, dailyWarning: 2 },
  hashing: { memoryCost: 19456, timeCost: 2, parallelism: 1 }, hashConcurrency: 1, hashQueue: 8, sessionMaximumMs: 30 * 86400000, sessionIdleMs: 7 * 86400000,
}
const registration = username => ({ username, nickname: '同样的昵称', password: 'correct horse battery', confirmPassword: 'correct horse battery', questions: [
  { question: '第一段秘密短语是什么？', answer: 'ＡＢＣ  Lake' }, { question: '第二段秘密短语是什么？', answer: 'mint cloud' }, { question: '第三段秘密短语是什么？', answer: 'quiet orbit' },
] })
function client(server, ip, origin = base.origin) {
  const cookies = new Map()
  const request = async (url, method = 'GET', payload, extra = {}) => {
    const response = await server.app.inject({ method, url, remoteAddress: ip, headers: { origin, cookie: [...cookies.values()].join('; '), ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, ...(payload === undefined ? {} : { payload }) })
    const values = response.headers['set-cookie']
    for (const value of values ? Array.isArray(values) ? values : [values] : []) { const entry = value.split(';')[0]; cookies.set(entry.split('=')[0], entry) }
    return { status: response.statusCode, body: response.json(), headers: response.headers, raw: response.body }
  }
  const write = async (url, body, method = 'POST', extra = {}) => {
    const csrf = await request(url.startsWith('/api/projects/') ? '/api/projects/hakisub/csrf' : '/api/account/csrf')
    if (csrf.status !== 200) return csrf
    return request(url, method, body, { 'x-csrf-token': csrf.body.token, ...extra })
  }
  return { cookies, request, write }
}
test('账号、三问恢复、持久会话/限流、私人存档与备份', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xdstar-account-test-'))
  const configuration = { ...base, databasePath: join(directory, 'accounts.sqlite') }
  const websiteDirectory = join(directory, 'website')
  await mkdir(websiteDirectory); await writeFile(join(websiteDirectory, 'index.html'), '<!doctype html><title>XDstar fixture</title>')
  let clock = 1792512000000, server = await createAccountServer(configuration, { now: () => clock, websiteDirectory })
  try {
    const page = await server.app.inject({ method: 'GET', url: '/account/' })
    assert.equal(page.statusCode, 200); assert.match(page.headers['content-security-policy'], /script-src 'self'/); assert.match(page.body, /XDstar/)
    const a = client(server, '203.0.113.1'), b = client(server, '203.0.113.2'), guest = client(server, '203.0.113.3')
    assert.equal((await a.request('/api/account/register', 'POST', registration('alice'))).status, 403, '缺少CSRF被拒绝')
    const first = await a.write('/api/account/register', registration('Alice'))
    assert.equal(first.status, 201); assert.equal(first.body.user.username, 'alice')
    assert.match([first.headers['set-cookie']].flat().join(';'), /__Host-xdstar_session=.*HttpOnly; Secure; SameSite=Lax/)
    assert.doesNotMatch([first.headers['set-cookie']].flat().join(';'), /Domain=/)
    assert.equal((await b.write('/api/account/register', registration('ALICE'))).status, 409)
    const second = await b.write('/api/account/register', registration('bob'))
    assert.equal(second.status, 201); assert.equal(second.body.user.nickname, first.body.user.nickname); assert.notEqual(second.body.user.uid, first.body.user.uid)
    const record = server.database.prepare('SELECT * FROM users WHERE username=?').get('alice')
    assert.match(record.password_hash, /^\$argon2id\$/)
    const row = server.database.prepare('SELECT * FROM security_questions WHERE user_id=? ORDER BY slot').get(record.id)
    assert.match(row.answer_hash, /^\$argon2id\$/); assert.equal(row.answer, undefined)
    const cookieToken = a.cookies.get(server.sessionName).split('=')[1]
    assert.equal(server.database.prepare('SELECT token_hash FROM sessions WHERE token_hash=?').get(cookieToken), undefined)
    const preset = { name: '我的字幕设置', configuration: { schemaVersion: 1, asrProvider: 'browser', adaptiveCards: true } }
    const saved = await a.write('/api/projects/hakisub/presets', preset)
    assert.equal(saved.status, 201)
    const id = saved.body.preset.id
    assert.equal((await b.request('/api/projects/hakisub/presets')).body.presets.length, 0)
    assert.equal((await b.write(`/api/projects/hakisub/presets/${id}`, { name: '偷改' }, 'PATCH')).status, 404)
    assert.equal((await b.write(`/api/projects/hakisub/presets/${id}`, {}, 'DELETE')).status, 404)
    assert.equal((await guest.request('/api/projects/hakisub/presets')).status, 401)
    assert.equal((await a.write('/api/projects/hakisub/presets', { ...preset, configuration: { ...preset.configuration, apiKey: 'forbidden' } })).status, 400)
    assert.equal((await a.write('/api/projects/hakisub/presets', { ...preset, userId: second.body.user.uid })).status, 400)
    assert.equal((await a.write('/api/account/nickname', { nickname: '新昵称' }, 'PATCH')).status, 200)
    assert.equal((await a.request('/api/projects/hakisub/presets')).body.presets[0].id, id)
    const project = client(server, '203.0.113.1', base.projectOrigin)
    for (const [key, value] of a.cookies) project.cookies.set(key, value)
    const identity = await project.request('/api/projects/hakisub/identity')
    assert.deepEqual(identity.body.user, { uid: record.id, nickname: '新昵称' }); assert.equal(identity.body.user.username, undefined)
    assert.equal(identity.headers['access-control-allow-origin'], base.projectOrigin)
    assert.equal((await project.request('/api/account/me')).status, 403)
    assert.equal((await project.write('/api/account/nickname', { nickname: '跨域改名' }, 'PATCH')).status, 403)
    assert.equal((await a.request('/api/account/me', 'GET', undefined, { origin: 'https://evil.xdstar.work' })).status, 403)
    for (const path of ['/ap%69/account/me', '/api/projects/hakisub/..%2f..%2faccount/me', '/api//account/me', '/api/account/%6de']) {
      const response = await project.request(path)
      assert.notEqual(response.status, 200, '编码和点路径不能跨越项目授权范围')
    }
    const projectCsrf = await project.request('/api/projects/hakisub/csrf')
    assert.equal((await a.request('/api/account/nickname', 'PATCH', { nickname: '错误范围' }, { 'x-csrf-token': projectCsrf.body.token })).status, 403)
    const otherDevice = client(server, '203.0.113.4')
    assert.equal((await otherDevice.write('/api/account/login', { username: 'alice', password: 'correct horse battery' })).status, 200)
    assert.equal((await otherDevice.request('/api/projects/hakisub/presets')).body.presets[0].id, id)
    const backup = join(directory, 'snapshot.sqlite')
    await backupDatabase(server.database, backup)
    const snapshot = new Database(backup, { readonly: true })
    assert.equal(snapshot.pragma('integrity_check', { simple: true }), 'ok'); assert.equal(snapshot.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2); snapshot.close()
    await assert.rejects(backupDatabase(server.database, backup), /不会覆盖/)
    const cookieCopy = new Map(a.cookies)
    await server.app.close(); server = await createAccountServer(configuration, { now: () => clock, websiteDirectory })
    const restored = client(server, '203.0.113.1'); for (const [key, value] of cookieCopy) restored.cookies.set(key, value)
    assert.equal((await restored.request('/api/account/me')).body.user.uid, record.id, '服务重启后会话和存档保留')
    assert.equal((await restored.request('/api/projects/hakisub/presets')).body.presets.length, 1)
    const recover = client(server, '203.0.113.5')
    const start = await recover.write('/api/account/recovery/start', { username: 'alice' })
    assert.equal(start.status, 200); assert.equal(start.body.questions.length, 3)
    const resetBody = { answers: ['abc lake', 'MINT   cloud', 'quiet orbit'], password: 'new correct horse password', confirmPassword: 'new correct horse password' }
    assert.equal((await recover.write('/api/account/recovery/reset', { ...resetBody, answers: ['wrong', 'mint cloud', 'quiet orbit'] })).status, 400)
    const results = await Promise.all([recover.write('/api/account/recovery/reset', resetBody), recover.write('/api/account/recovery/reset', resetBody)])
    assert.deepEqual(results.map(value => value.status).sort(), [200, 400], '重置挑战仅消费一次')
    assert.equal((await restored.request('/api/account/me')).status, 401)
    assert.equal((await recover.request('/api/account/me')).status, 401, '找回不自动登录')
    assert.equal((await recover.write('/api/account/login', { username: 'alice', password: 'correct horse battery' })).status, 401)
    assert.equal((await recover.write('/api/account/login', { username: 'alice', password: resetBody.password })).status, 200)
    const decoy = client(server, '203.0.113.6')
    assert.equal((await decoy.write('/api/account/recovery/start', { username: 'absent' })).status, 200)
    const wrong = await decoy.write('/api/account/recovery/reset', resetBody)
    assert.equal(wrong.status, 400); assert.equal(wrong.body.message, results.find(item => item.status === 400).body.message)
    const abuse = client(server, '203.0.113.7')
    for (let index = 0; index < 5; index++) assert.equal((await abuse.write('/api/account/login', { username: 'absent', password: 'wrong' })).status, 401)
    assert.equal((await abuse.write('/api/account/login', { username: 'absent', password: 'wrong' })).status, 429)
    const quota = client(server, '203.0.113.8')
    for (let index = 0; index < 3; index++) assert.equal((await quota.write('/api/account/register', registration('quota' + index))).status, 201)
    assert.equal((await quota.write('/api/account/register', registration('quota3'))).status, 429)
    assert.equal(server.database.prepare("SELECT COUNT(*) AS count FROM security_events WHERE kind='registration_growth'").get().count, 1)
    await clearIpLimit(server.database, configuration, '203.0.113.8')
    assert.equal((await quota.write('/api/account/register', registration('quota3'))).status, 201)
    assert.equal(server.database.prepare('SELECT COUNT(*) AS count FROM registration_events').get().count, 6, '人工解除不丢失全站注册计数')
    const retry = client(server, '203.0.113.9')
    for (let index = 0; index < 5; index++) assert.equal((await retry.write('/api/account/register', registration('alice'))).status, 409)
    assert.equal((await retry.write('/api/account/register', registration('another'))).status, 429)
    clock += 600001
    assert.equal((await retry.write('/api/account/register', registration('another'))).status, 201)
    const before = (await recover.request('/api/account/me')).body.user.uid
    const passwordPeer = client(server, '203.0.113.15')
    assert.equal((await passwordPeer.write('/api/account/login', { username: 'alice', password: resetBody.password })).status, 200)
    const preRotation = recover.cookies.get(server.sessionName)
    assert.equal((await recover.write('/api/account/password', { currentPassword: resetBody.password, password: 'rotated password enough', confirmPassword: 'rotated password enough' })).status, 200)
    assert.notEqual(recover.cookies.get(server.sessionName), preRotation)
    assert.equal((await passwordPeer.request('/api/account/me')).status, 401)
    assert.equal((await recover.request('/api/account/me')).body.user.uid, before)
    assert.equal((await recover.write('/api/account/security-questions', { currentPassword: 'rotated password enough', questions: registration('alice').questions })).status, 200)
    assert.equal((await recover.write('/api/account/logout', {})).status, 200)
    assert.equal((await recover.request('/api/account/me')).status, 401)
    clock += 8 * 86400000
    assert.equal((await quota.request('/api/account/me')).status, 401, '闲置过期生效')
    const data = (await readFile(configuration.databasePath)).toString('utf8')
    assert.equal(data.includes('correct horse battery'), false); assert.equal(data.includes('mint cloud'), false)
  } finally {
    await server.app.close()
    const target = resolve(directory)
    assert.ok(target.startsWith(resolve(tmpdir()) + sep))
    await rm(target, { recursive: true, force: true })
  }
})
test('并发注册的用户名唯一和滚动成功额度不能穿透，重启后额度保留', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xdstar-account-race-'))
  let clock = 1792512000000, server = await createAccountServer({ ...base, databasePath: join(directory, 'race.sqlite') }, { now: () => clock })
  try {
    const same = await Promise.all([client(server, '192.0.2.1').write('/api/account/register', registration('same_name')), client(server, '192.0.2.2').write('/api/account/register', registration('SAME_NAME'))])
    assert.deepEqual(same.map(item => item.status).sort(), [201, 409])
    const parallel = await Promise.all(Array.from({ length: 4 }, (_, index) => client(server, '192.0.2.3').write('/api/account/register', registration('parallel' + index))))
    assert.deepEqual(parallel.map(item => item.status).sort(), [201, 201, 201, 429])
    await server.app.close()
    server = await createAccountServer({ ...base, databasePath: join(directory, 'race.sqlite') }, { now: () => clock })
    const after = client(server, '192.0.2.3')
    assert.equal((await after.write('/api/account/register', registration('after_restart'))).status, 429)
    clock += 86400000
    assert.equal((await after.write('/api/account/register', registration('next_window'))).status, 201, '正好24小时后释放最旧成功记录')
  } finally {
    await server.app.close()
    const target = resolve(directory); assert.ok(target.startsWith(resolve(tmpdir()) + sep)); await rm(target, { recursive: true, force: true })
  }
})
test('来源头只信任明确代理、IPv6聚合和精确滚动窗口', () => {
  const db = new Database(':memory:'); db.exec('CREATE TABLE rate_limit_events(action,subject,created_at)')
  let now = 1000
  const security = createRequestSecurity(db, base, () => now)
  const request = (peer, forwarded) => ({ raw: { socket: { remoteAddress: peer } }, headers: { 'x-xdstar-client-ip': forwarded } })
  assert.equal(security.ipSubject(request('::ffff:203.0.113.1', '192.0.2.1')), security.ipSubject(request('203.0.113.1', '192.0.2.2')))
  assert.equal(security.ipSubject(request('2001:db8:1:2::1')), security.ipSubject(request('2001:0db8:0001:0002::a')))
  assert.notEqual(security.ipSubject(request('2001:db8:1:2::1')), security.ipSubject(request('2001:db8:1:3::1')))
  const trusted = createRequestSecurity(db, { ...base, trustedProxies: ['172.18.0.1'] })
  assert.equal(trusted.ipSubject(request('172.18.0.1', '203.0.113.1')), security.ipSubject(request('203.0.113.1')))
  security.consume('a', 'ip', 1, 100); assert.throws(() => security.consume('a', 'ip', 1, 100), /频繁/)
  now = 1100; security.consume('a', 'ip', 1, 100)
  db.close()
})
test('哈希计算队列有硬上限，答案规范化稳定', async () => {
  assert.equal(normalizeAnswer('  ＡＢＣ\t  Lake  '), 'abc lake')
  const passwords = await createPasswordService(base.hashing, 1, 1)
  let release
  const first = passwords.run(() => new Promise(resolve => { release = resolve }))
  const second = passwords.run(() => 2)
  await assert.rejects(passwords.run(() => 3), /繁忙/)
  release(1); assert.deepEqual(await Promise.all([first, second]), [1, 2])
})
