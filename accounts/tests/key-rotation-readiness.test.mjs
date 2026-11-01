import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccountServer } from '../server/accountServer.mjs'
import { createPasswordService } from '../server/passwords.mjs'

test('账号密钥轮换：原会话和密码有效，旧CSRF拒绝，刷新CSRF恢复；限流subject改变须单独迁移', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xdstar-key-readiness-'))
  const configuration = { development: false, secret: 'synthetic-old-account-secret-at-least-forty-three-characters', databasePath: join(directory, 'account.sqlite'), origin: 'https://account.example', projectOrigin: 'https://project.example', trustedProxies: [], limits: { registrationAttempts: 5, registrationSuccesses: 3, dailyWarning: 100 }, hashing: { memoryCost: 19456, timeCost: 2, parallelism: 1 }, hashConcurrency: 1, hashQueue: 8, sessionMaximumMs: 86400000, sessionIdleMs: 86400000 }
  const passwords = await createPasswordService(configuration.hashing, 1, 8)
  const hash = await passwords.hash('synthetic legacy password')
  let server = await createAccountServer(configuration)
  const cookies = new Map()
  async function request(url, method = 'GET', payload, csrf) {
    const response = await server.app.inject({ url, method, headers: { origin: configuration.origin, cookie: [...cookies.values()].join('; '), ...(payload ? { 'content-type': 'application/json', 'x-csrf-token': csrf } : {}) }, ...(payload ? { payload } : {}) })
    for (const item of [response.headers['set-cookie'] ?? []].flat()) { const value = item.split(';')[0]; cookies.set(value.split('=')[0], value) }
    return { status: response.statusCode, body: response.json() }
  }
  try {
    server.database.prepare('INSERT INTO users(id,username,nickname,password_hash,created_at,updated_at,public_uid) VALUES (?,?,?,?,?,?,?)').run('synthetic-user', 'legacy', '旧用户', hash, Date.now(), Date.now(), '123456')
    let csrf = (await request('/api/account/csrf')).body.token
    assert.equal((await request('/api/account/login', 'POST', { username: 'legacy', password: 'synthetic legacy password' }, csrf)).status, 200)
    csrf = (await request('/api/account/csrf')).body.token
    const session = cookies.get(server.sessionName), previousSubject = server.security.subject('ip:203.0.113.1')
    await server.app.close()
    server = await createAccountServer({ ...configuration, secret: 'synthetic-new-account-secret-at-least-forty-three-characters' })
    assert.equal((await request('/api/account/me')).status, 200)
    assert.equal(cookies.get(server.sessionName), session)
    assert.equal(server.database.prepare('SELECT password_hash FROM users').get().password_hash, hash)
    assert.equal((await request('/api/account/nickname', 'PATCH', { nickname: '新昵称' }, csrf)).status, 403)
    csrf = (await request('/api/account/csrf')).body.token
    assert.equal((await request('/api/account/nickname', 'PATCH', { nickname: '新昵称' }, csrf)).status, 200)
    assert.notEqual(server.security.subject('ip:203.0.113.1'), previousSubject)
    assert.equal((await request('/api/account/login', 'POST', { username: '123456', password: 'synthetic legacy password' }, csrf)).status, 200)
  } finally { await server.app.close(); await rm(directory, { recursive: true, force: true }) }
})
