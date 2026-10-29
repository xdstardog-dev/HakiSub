import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
import { openAccountDatabase, allocatePublicUid } from '../server/database.mjs'
import { createAccountServer } from '../server/accountServer.mjs'

const directory = mkdtempSync(join(tmpdir(), 'account-interaction-'))
try {
  const path = join(directory, 'migration.sqlite')
  let database = openAccountDatabase(path)
  const internalId = '11111111-1111-1111-1111-111111111111'
  database.prepare('INSERT INTO users(id,username,nickname,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(internalId, '100000', 'Legacy', 'fixture-hash', 1, 1)
  database.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run('fixture-token-hash', internalId, 1, 1, 1, 100)
  database.prepare('INSERT INTO user_projects VALUES (?,?,?)').run(internalId, 'hakisub', 1)
  database.prepare('INSERT INTO hakisub_room_presets VALUES (?,?,?,1,?,?,?)').run('preset', internalId, 'Legacy preset', '{}', 1, 1)
  database.exec('DROP INDEX users_by_public_uid; ALTER TABLE users DROP COLUMN public_uid; DELETE FROM schema_migrations WHERE version=2; PRAGMA user_version=1')
  database.close()
  database = openAccountDatabase(path)
  const migrated = database.prepare('SELECT * FROM users').get()
  assert.match(migrated.public_uid, /^\d{6}$/); assert.notEqual(migrated.public_uid, '100000'); assert.equal(migrated.id, internalId)
  for (const table of ['sessions', 'user_projects', 'hakisub_room_presets']) assert.equal(database.prepare(`SELECT user_id FROM ${table}`).get().user_id, internalId)
  assert.equal(database.pragma('foreign_key_check').length, 0)
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok')
  const second = allocatePublicUid(database); assert.notEqual(second, migrated.public_uid)
  database.close(); database = openAccountDatabase(path)
  assert.equal(database.prepare('SELECT public_uid FROM users').get().public_uid, migrated.public_uid)
  database.close()
} finally { rmSync(directory, { recursive: true, force: true }) }

const configuration = {
  development: true, databasePath: ':memory:', secret: 'synthetic-interaction-test-secret-with-at-least-43-chars', origin: 'http://localhost:8790', projectOrigin: 'http://localhost:5179',
  trustedProxies: [], limits: { registrationAttempts: 30, registrationSuccesses: 20, dailyWarning: 100 },
  hashing: { memoryCost: 19456, timeCost: 2, parallelism: 1 }, hashConcurrency: 1, hashQueue: 8, sessionMaximumMs: 86400000, sessionIdleMs: 86400000,
}
const server = await createAccountServer(configuration)
const cookies = new Map()
async function request(url, method = 'GET', payload) {
  let token
  if (method !== 'GET') token = (await request('/api/account/csrf')).body.token
  const response = await server.app.inject({ url, method, headers: { origin: configuration.origin, cookie: [...cookies.values()].join('; '), ...(payload ? { 'content-type': 'application/json', 'x-csrf-token': token } : {}) }, ...(payload ? { payload } : {}) })
  for (const cookie of [response.headers['set-cookie'] ?? []].flat()) { const entry = cookie.split(';')[0]; cookies.set(entry.split('=')[0], entry) }
  return { status: response.statusCode, body: response.json() }
}
try {
  const registration = { username: 'eight_digits', nickname: '合成用户', password: '12345678', confirmPassword: '12345678', questions: [1, 2, 3].map(number => ({ question: '合成密保问题' + number, answer: 'synthetic answer ' + number })) }
  assert.equal((await request('/api/account/register', 'POST', { ...registration, password: '1234567', confirmPassword: '1234567' })).status, 400)
  const registered = await request('/api/account/register', 'POST', registration)
  assert.equal(registered.status, 201); assert.match(registered.body.user.uid, /^\d{6}$/)
  const uid = registered.body.user.uid
  await request('/api/account/logout', 'POST', {})
  assert.equal((await request('/api/account/login', 'POST', { username: uid, password: '12345678' })).status, 200)
  assert.equal((await request('/api/account/register', 'POST', { ...registration, username: uid })).status, 409)
  assert.equal((await request('/api/account/password', 'POST', { currentPassword: '12345678', password: '87654321', confirmPassword: '87654321' })).status, 200)
  await request('/api/account/logout', 'POST', {})
  assert.equal((await request('/api/account/login', 'POST', { username: 'eight_digits', password: '87654321' })).status, 200)
  await request('/api/account/logout', 'POST', {})
  assert.equal((await request('/api/account/recovery/start', 'POST', { username: uid })).status, 200)
  assert.equal((await request('/api/account/recovery/reset', 'POST', { answers: registration.questions.map(entry => entry.answer), password: '24681357', confirmPassword: '24681357' })).status, 200)
  assert.equal((await request('/api/account/login', 'POST', { username: uid, password: '24681357' })).status, 200)
} finally { await server.app.close() }

function component(path, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8'), { descriptor } = parse(source)
  const bindings = Object.keys(compileScript(descriptor, { id: 'interaction-test' }).bindings)
  const script = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  const context = vm.createContext({ ...Vue, onMounted() {}, onUnmounted() {}, window: { addEventListener() {}, removeEventListener() {} }, ...globals })
  vm.runInContext(script + '\nglobalThis.model = {' + bindings.join(',') + '}', context)
  const render = new Function('Vue', compile(descriptor.template.content, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
  return { state: context.model, html: () => renderToString(Vue.createSSRApp({ components: { QuestionFields: { render: () => null }, OwnedRooms: { render: () => null }, AccountNavigation: { render: () => null } }, setup: () => context.model, render })) }
}
const account = component('../src/AccountApp.vue', { accountRequest() {}, QuestionFields: {}, OwnedRooms: {}, AccountNavigation: {} })
account.state.checking.value = false
assert.match(await account.html(), /账号或 UID/)
account.state.navigate('register')
assert.match(await account.html(), /minlength="8"/)
assert.match(await account.html(), /id="password"[^>]*type="password"/)
account.state.visibleSecrets.value.password = true
assert.match(await account.html(), /id="password"[^>]*type="text"/)
account.state.navigate('login'); assert.equal(Object.keys(account.state.visibleSecrets.value).length, 0)
// 第一步仅前端验证，往返步骤和注册失败不丢失填写内容。
const calls = [], fixtureUser = { uid: '123456', username: 'fixture_user', nickname: '合成昵称', createdAt: 1 }
let rejectRegistration = true, rejectIdentity = false, identityResponse
const workflow = component('../src/AccountApp.vue', {
  QuestionFields: {}, OwnedRooms: {}, AccountNavigation: {},
  accountRequest: async (url, method, body) => {
    calls.push({ url, method, body })
    if (url.endsWith('/register') && rejectRegistration) throw Error('合成注册失败')
    if (url.endsWith('/me') && identityResponse) return identityResponse
    if (url.endsWith('/me') && rejectIdentity) throw Error('合成网络错误')
    return { user: fixtureUser, projects: [], presets: [], message: '操作成功', questions: ['问题一', '问题二', '问题三'] }
  },
})
const state = workflow.state
state.checking.value = false; state.navigate('register')
state.username.value = 'fixture_user'; state.nickname.value = '合成昵称'; state.password.value = 'fixture-password'; state.confirmPassword.value = 'different-password'
state.nextRegistrationStep(); assert.equal(state.registrationStep.value, 1); assert.match(state.error.value, /不一致/)
state.confirmPassword.value = state.password.value; state.nextRegistrationStep()
assert.equal(state.registrationStep.value, 2); assert.equal(calls.length, 0)
state.questions.value[0].answer = 'synthetic answer'
assert.doesNotMatch(await workflow.html(), /id="username"/)
state.previousRegistrationStep(); assert.equal(state.password.value, 'fixture-password'); assert.equal(state.questions.value[0].answer, 'synthetic answer')
state.nextRegistrationStep(); await state.authenticate(true)
assert.match(state.error.value, /合成注册失败/); assert.equal(state.registrationStep.value, 2); assert.equal(state.password.value, 'fixture-password'); assert.equal(state.questions.value[0].answer, 'synthetic answer')
rejectRegistration = false; await state.authenticate(true)
assert.equal(state.view.value, 'center'); assert.equal(state.password.value, ''); assert.equal(state.questions.value[0].answer, '')
assert.equal(calls.filter(call => call.url.endsWith('/register')).length, 2)
assert.doesNotMatch(await workflow.html(), /id="current-password"|id="new-nickname"|id="security-password"/)
state.navigate('profile'); assert.match(await workflow.html(), /唯一身份编号/); assert.doesNotMatch(await workflow.html(), /id="current-password"/)
state.nickname.value = '尚未保存的昵称'; await state.refreshIdentity(); assert.equal(state.nickname.value, '尚未保存的昵称')
rejectIdentity = true; await state.refreshIdentity(); assert.equal(state.user.value.uid, fixtureUser.uid, '临时网络失败不清除会话')
rejectIdentity = false; state.navigate('security'); state.securityPassword.value = 'questions-only-password'
assert.equal(state.currentPassword.value, '', '密码与密保表单不共享验证输入')
await state.changeQuestions(); assert.equal(calls.at(-1).body.currentPassword, 'questions-only-password')
state.navigate('presets'); await new Promise(resolve => setImmediate(resolve)); assert.match(await workflow.html(), /还没有房间存档/)
await state.logout(); assert.equal(state.user.value, null); assert.equal(state.view.value, 'login'); assert.equal(state.securityPassword.value, ''); assert.equal(state.presets.value.length, 0)
state.navigate('recovery'); await state.startRecovery(); state.questions.value[0].answer = 'synthetic answer'; state.password.value = 'fixture-password'; state.confirmPassword.value = 'fixture-password'
await state.resetPassword(); assert.equal(state.view.value, 'login'); assert.equal(state.password.value, '')
// 退出后迟到的身份响应不能把旧账号重新挂回页面。
identityResponse = new Promise(resolve => { globalThis.resolveIdentity = resolve })
const pendingIdentity = state.refreshIdentity(); state.clearIdentity(); globalThis.resolveIdentity({ user: fixtureUser, projects: [] }); await pendingIdentity
assert.equal(state.user.value, null)
let exported, clicked = false, revoked = false
const questions = [{ question: '合成问题', answer: 'synthetic-security-code' }]
const security = component('../src/QuestionFields.vue', { defineProps: () => ({ questions, recovery: false }), Blob, URL: { createObjectURL(blob) { exported = blob; return 'blob:fixture' }, revokeObjectURL() { revoked = true } }, document: { createElement() { return { click() { clicked = true } } } }, setTimeout(callback) { callback() } })
assert.match(await security.html(), /type="text"/)
security.state.exportAnswers()
assert.equal(clicked, true); assert.equal(revoked, true); assert.match(await exported.text(), /synthetic-security-code/)
console.log('通过：八位密码与账号/UID认证、迁移关联、两步注册往返与失败重试、分区导航、昵称草稿、会话刷新/退出与迟到响应隔离、恢复、密码显示及密保下载。')
