import { isIP } from 'node:net'
import { allowedAppOrigins } from './apiSettings.mjs'

export function readRuntimeConfiguration(environment = process.env) {
  const mode = environment.HAKISUB_DEPLOYMENT_MODE ?? 'local'
  if (!['local', 'private-test', 'public'].includes(mode)) throw Error('HAKISUB_DEPLOYMENT_MODE 必须是 local、private-test 或 public。')
  const privateTest = mode === 'private-test'
  const publicDeployment = mode === 'public'
  const host = environment.HAKISUB_HOST ?? '127.0.0.1'
  if (!isIP(host)) throw Error('HAKISUB_HOST 必须是 IP 地址。')
  const integer = (name, fallback, maximum) => {
    const value = environment[name] ?? String(fallback)
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) throw Error(`${name} 超出允许范围。`)
    return Number(value)
  }
  let origins = [...allowedAppOrigins]
  if (publicDeployment && !environment.HAKISUB_ALLOWED_ORIGINS) throw Error('公网部署必须明确配置 HTTPS Origin。')
  if (environment.HAKISUB_ALLOWED_ORIGINS !== undefined) {
    origins = environment.HAKISUB_ALLOWED_ORIGINS.split(',').map(value => value.trim())
    for (const origin of origins) {
      let url
      try { url = new URL(origin) } catch { throw Error('HAKISUB_ALLOWED_ORIGINS 格式无效。') }
      // 公网仅接受明确的 HTTPS 来源；本机和隧道继续限制为回环 HTTP。
      const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (publicDeployment) {
        if (url.origin !== origin || url.protocol !== 'https:' || localHost || url.hostname.includes('*')) {
          throw Error('公网 HAKISUB_ALLOWED_ORIGINS 仅允许完整的非本机 HTTPS Origin。')
        }
      } else if (url.origin !== origin || url.protocol !== 'http:' || !localHost) {
        throw Error('HAKISUB_ALLOWED_ORIGINS 仅允许完整的本机 HTTP Origin。')
      }
    }
  }
  return {
    host, port: integer('HAKISUB_PORT', 8787, 65535), allowedOrigins: [...new Set(origins)],
    allowLegacyAsr: mode === 'local', enableSettings: mode === 'local',
    maxAsrSessions: integer('HAKISUB_MAX_ASR_SESSIONS', mode === 'local' ? 8 : 2, 8),
    maxRooms: privateTest ? 1 : 100,
  }
}
