import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { isIP } from 'node:net'

export async function readAccountConfiguration(environment = process.env, development = false) {
  let saved = {}
  try { saved = parseEnv(await readFile(new URL('../../.env', import.meta.url), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw Error('无法读取账号服务配置。') }
  const values = { ...saved, ...environment }
  const number = (key, fallback, maximum = 100000) => {
    const value = values[key] ?? String(fallback)
    if (!/^\d+$/.test(value) || +value < 1 || +value > maximum) throw Error(`${key} 配置无效。`)
    return +value
  }
  const origin = (value, allowLocal) => {
    const url = new URL(value)
    if (url.origin !== value || (url.protocol !== 'https:' && !(allowLocal && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw Error('账号来源必须是完整的 HTTPS Origin。')
    return value
  }
  const secret = values.XDSTAR_ACCOUNT_SECRET || (development ? randomBytes(48).toString('base64url') : '')
  if (secret.length < 43) throw Error('请在服务端环境或根 .env 配置随机 XDSTAR_ACCOUNT_SECRET（至少 32 字节随机值）。')
  const trustedProxies = (values.XDSTAR_ACCOUNT_TRUSTED_PROXIES ?? '').split(',').filter(Boolean)
  if (trustedProxies.some(value => !isIP(value))) throw Error('可信代理必须逐个填写实际验证过的 IP，不接受通配符。')
  const host = values.XDSTAR_ACCOUNT_HOST ?? '127.0.0.1'
  if (!isIP(host)) throw Error('账号监听地址必须是 IP。')
  return {
    development, secret, host, port: number('XDSTAR_ACCOUNT_PORT', 8790, 65535),
    roomGatewayUrl: values.XDSTAR_HAKISUB_GATEWAY_URL,
    roomManagementSecret: values.HAKISUB_ROOM_MANAGEMENT_SECRET,
    origin: origin(values.XDSTAR_ACCOUNT_ORIGIN ?? (development ? 'http://127.0.0.1:8790' : 'https://xdstar.work'), development),
    projectOrigin: origin(values.XDSTAR_HAKISUB_ORIGIN ?? (development ? 'http://127.0.0.1:5173' : 'https://hakisub.xdstar.work'), development),
    databasePath: values.XDSTAR_ACCOUNT_DATABASE ?? fileURLToPath(new URL('../../secrets/accounts.sqlite', import.meta.url)),
    trustedProxies,
    limits: { registrationAttempts: number('XDSTAR_REGISTER_ATTEMPTS', 5), registrationSuccesses: number('XDSTAR_REGISTER_SUCCESSES', 3), dailyWarning: number('XDSTAR_REGISTER_DAILY_WARNING', 100) },
    hashing: { memoryCost: number('XDSTAR_ARGON_MEMORY_KIB', 19456, 262144), timeCost: number('XDSTAR_ARGON_ITERATIONS', 2, 10), parallelism: 1 },
    hashConcurrency: number('XDSTAR_HASH_CONCURRENCY', 1, 2), hashQueue: number('XDSTAR_HASH_QUEUE', 8, 32),
    sessionMaximumMs: number('XDSTAR_SESSION_DAYS', 30, 90) * 86400000,
    sessionIdleMs: number('XDSTAR_SESSION_IDLE_DAYS', 7, 30) * 86400000,
  }
}
