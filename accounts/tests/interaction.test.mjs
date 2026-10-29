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
  return { state: context.model, html: () => renderToString(Vue.createSSRApp({ components: { QuestionFields: { render: () => null }, OwnedRooms: { render: () => null } }, setup: () => context.model, render })) }
}
const account = component('../src/AccountApp.vue', { accountRequest() {}, QuestionFields: {}, OwnedRooms: {} })
account.state.checking.value = false
assert.match(await account.html(), /账号或 UID/)
account.state.navigate('register')
assert.match(await account.html(), /minlength="8"/)
assert.match(await account.html(), /id="password"[^>]*type="password"/)
account.state.visibleSecrets.value.password = true
assert.match(await account.html(), /id="password"[^>]*type="text"/)
account.state.navigate('login'); assert.equal(Object.keys(account.state.visibleSecrets.value).length, 0)
let exported, clicked = false, revoked = false
const questions = [{ question: '合成问题', answer: 'synthetic-security-code' }]
const security = component('../src/QuestionFields.vue', { defineProps: () => ({ questions, recovery: false }), Blob, URL: { createObjectURL(blob) { exported = blob; return 'blob:fixture' }, revokeObjectURL() { revoked = true } }, document: { createElement() { return { click() { clicked = true } } } }, setTimeout(callback) { callback() } })
assert.match(await security.html(), /type="text"/)
security.state.exportAnswers()
assert.equal(clicked, true); assert.equal(revoked, true); assert.match(await exported.text(), /synthetic-security-code/)
console.log('通过：八位数字密码注册/修改/恢复、账号与六位UID登录、UID占用拒绝、v1迁移及重开关联保留、显示按钮、明文安全码与下载。')
