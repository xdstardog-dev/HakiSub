import { createAsrGateway } from './asrGateway.mjs'
import { createApiKeyStore } from './apiKeyStore.mjs'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { createStaticWebsite } from './staticWebsite.mjs'
import { readRuntimeConfiguration } from './runtimeConfiguration.mjs'
import { createRoomStore, getRoomEncryptionKey } from './roomStore.mjs'

let configuration
try { configuration = readRuntimeConfiguration() }
catch (error) { console.error(error.message); process.exit(1) }

let keyStore
try { keyStore = await createApiKeyStore(fileURLToPath(new URL('../.env', import.meta.url)), process.env.DOUBAO_API_KEY) }
catch (error) { if (error.code !== 'ENOENT') { console.error('无法读取 .env，请检查文件格式。'); process.exit(1) } }

let roomStore
try {
  const encryptionKey = await getRoomEncryptionKey(fileURLToPath(new URL('../.env', import.meta.url)), process.env.HAKISUB_ROOM_ENCRYPTION_KEY)
  roomStore = await createRoomStore(process.env.HAKISUB_ROOM_STORE_PATH ?? fileURLToPath(new URL('../secrets/rooms.json', import.meta.url)), encryptionKey)
} catch { console.error('无法初始化房间资料，请检查数据目录权限和服务端房间加密主密钥。'); process.exit(1) }
const production = process.argv.includes('--production')
const websiteDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
if (production) {
  try { await access(new URL('../dist/index.html', import.meta.url)) }
  catch { console.error('请先运行 npm run build，再启动本机正式服务。'); process.exit(1) }
}
const gateway = createAsrGateway({ ...configuration, keyStore, roomStore, diagnostics: { enabled: process.env.HAKISUB_ASR_DEBUG === '1' },
  serveWebsite: production ? createStaticWebsite(websiteDirectory) : undefined })
let vite
try {
  await new Promise((resolve, reject) => {
    gateway.server.once('error', reject)
    gateway.server.listen(configuration.port, configuration.host, resolve)
  })
  console.log(`HakiSub 已启动（端口 ${configuration.port}，密钥只在服务端读取）。`)
  if (!keyStore.status().configured) console.log('豆包配置可由创建者在房间内填写；未配置时仍可使用模拟与浏览器识别。')
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
