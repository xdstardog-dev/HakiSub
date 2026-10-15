import { createAsrGateway } from './asrGateway.mjs'
import { createApiKeyStore } from './apiKeyStore.mjs'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { createStaticWebsite } from './staticWebsite.mjs'
import { readRuntimeConfiguration } from './runtimeConfiguration.mjs'

let configuration
try { configuration = readRuntimeConfiguration() }
catch (error) { console.error(error.message); process.exit(1) }

let keyStore
try { keyStore = await createApiKeyStore(fileURLToPath(new URL('../.env', import.meta.url)), process.env.DOUBAO_API_KEY) }
catch (error) { if (error.code !== 'ENOENT') { console.error('无法读取 .env，请检查文件格式。'); process.exit(1) } }

const production = process.argv.includes('--production')
const websiteDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
if (production) {
  try { await access(new URL('../dist/index.html', import.meta.url)) }
  catch { console.error('请先运行 npm run build，再启动本机正式服务。'); process.exit(1) }
}
const gateway = createAsrGateway({ ...configuration, keyStore, diagnostics: { enabled: process.env.HAKISUB_ASR_DEBUG === '1' },
  serveWebsite: production ? createStaticWebsite(websiteDirectory) : undefined })
let vite
try {
  await new Promise((resolve, reject) => {
    gateway.server.once('error', reject)
    gateway.server.listen(configuration.port, configuration.host, resolve)
  })
  console.log(`HakiSub 已启动（端口 ${configuration.port}，密钥只在服务端读取）。`)
  if (!keyStore.status().configured) console.log(configuration.enableSettings ? '尚未配置 API Key，请在主页设置中填写；仍可使用模拟与浏览器识别。' : '尚未配置 API Key，请管理员配置服务端环境；仍可检查房间连接。')
  if (process.argv.includes('--dev')) {
    const { createServer } = await import('vite')
    vite = await createServer()
    await vite.listen()
    vite.printUrls()
  }
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? '端口被占用，请关闭旧的预览服务后重试。' : '启动失败，请检查端口与项目配置。')
  await gateway.close(); process.exit(1)
}
async function shutdown() { await vite?.close(); await gateway.close(); process.exit(0) }
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
