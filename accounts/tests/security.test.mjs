import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { createPasswordService, normalizeAnswer } from '../server/passwords.mjs'
import { createRequestSecurity } from '../server/requestSecurity.mjs'
const base = {
  development: false, secret: 'synthetic-test-secret-with-at-least-forty-three-characters', origin: 'https://xdstar.work', projectOrigin: 'https://hakisub.xdstar.work',
  trustedProxies: [], limits: { registrationAttempts: 5, registrationSuccesses: 3, dailyWarning: 2 },
  hashing: { memoryCost: 19456, timeCost: 2, parallelism: 1 }, hashConcurrency: 1, hashQueue: 8, sessionMaximumMs: 30 * 86400000, sessionIdleMs: 7 * 86400000,
}
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
