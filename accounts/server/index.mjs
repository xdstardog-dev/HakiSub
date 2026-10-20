import { readAccountConfiguration } from './configuration.mjs'
import { createAccountServer } from './accountServer.mjs'

let server
try {
  const configuration = await readAccountConfiguration(process.env, process.argv.includes('--development'))
  server = await createAccountServer(configuration)
  await server.app.listen({ host: configuration.host, port: configuration.port })
  console.log(`XDstar 账号服务：${configuration.origin}/account/`)
  if (configuration.development) console.log('本地开发模式：仅使用回环 HTTP；未配置稳定密钥时，重启会使开发 CSRF Cookie 和限流索引失效。')
} catch { console.error('账号服务启动失败，请检查依赖、服务端配置、端口和数据库权限。'); process.exitCode = 1 }
const close = async () => { await server?.app.close(); process.exit() }
process.once('SIGINT', close); process.once('SIGTERM', close)
