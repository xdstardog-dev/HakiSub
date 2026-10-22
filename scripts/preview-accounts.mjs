import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { readAccountConfiguration } from '../accounts/server/configuration.mjs'
import { createAccountServer } from '../accounts/server/accountServer.mjs'
import { createRoomStore } from '../server/roomStore.mjs'

// 独立预览只使用临时账号库和空Key网关，不连接现有8787服务或生产房间。
const root = fileURLToPath(new URL('../', import.meta.url))
const configuration = await readAccountConfiguration({ XDSTAR_ACCOUNT_SECRET: randomBytes(48).toString('base64url'), XDSTAR_ACCOUNT_DATABASE: fileURLToPath(new URL('../artifacts/account-preview/accounts.sqlite', import.meta.url)), XDSTAR_ACCOUNT_ORIGIN: 'http://127.0.0.1:8790', XDSTAR_HAKISUB_ORIGIN: 'http://127.0.0.1:5179' }, true)
configuration.roomManagementSecret = randomBytes(48).toString('base64url')
configuration.roomGatewayUrl = 'http://127.0.0.1:8791'
const accounts = await createAccountServer(configuration)
const roomStore = await createRoomStore(fileURLToPath(new URL('../artifacts/account-preview/rooms.json', import.meta.url)))
const gateway = createAsrGateway({ allowedOrigins: [configuration.projectOrigin], allowLegacyAsr: false, enableSettings: false, apiKey: '',
  roomStore, roomManagementSecret: configuration.roomManagementSecret,
  connectUpstream: () => { throw Error('隔离预览不连接真实语音服务。') },
  probeRoomKey: async () => ({ ok: false, message: '隔离预览不连接真实语音服务。' }),
})
let vite
try {
  await accounts.app.listen({ host: '127.0.0.1', port: 8790 })
  await new Promise((resolve, reject) => { gateway.server.once('error', reject); gateway.server.listen(8791, '127.0.0.1', resolve) })
  vite = await createServer({ configFile: false, root, plugins: [vue()], define: { 'import.meta.env.VITE_ACCOUNT_ORIGIN': JSON.stringify(configuration.origin) }, server: {
    host: '127.0.0.1', port: 5179, strictPort: true,
    fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/secrets/**', '**/artifacts/**', '**/accounts/server/**'] },
    watch: { ignored: ['**/artifacts/**', '**/secrets/**', '**/accounts/dist/**'] },
    proxy: { '/api/rooms': { target: 'http://127.0.0.1:8791', ws: true }, '/api/asr': { target: 'http://127.0.0.1:8791', ws: true } },
  } })
  await vite.listen()
  console.log('账号预览：http://127.0.0.1:8790/account/')
  console.log('隔离 HakiSub：http://127.0.0.1:5179/（无真实 ASR Key）')
} catch { await accounts.app.close(); await gateway.close(); throw Error('隔离预览启动失败，请检查端口和账号页面构建。') }
const close = async () => { await vite?.close(); await accounts.app.close(); await gateway.close(); process.exit() }
process.on('SIGINT', close); process.on('SIGTERM', close)
