import { loadEnvFile } from 'node:process'
import { createAsrGateway } from './asrGateway.mjs'

try { loadEnvFile(new URL('../.env', import.meta.url)) }
catch (error) { if (error.code !== 'ENOENT') { console.error('无法读取 .env，请检查文件格式。'); process.exit(1) } }

const gateway = createAsrGateway({ apiKey: process.env.DOUBAO_API_KEY })
let vite
try {
  await new Promise((resolve, reject) => {
    gateway.server.once('error', reject)
    gateway.server.listen(8787, '127.0.0.1', resolve)
  })
  console.log('本地 ASR 网关：http://127.0.0.1:8787（密钥只在服务端读取）')
  if (!process.env.DOUBAO_API_KEY?.trim()) console.log('尚未配置 DOUBAO_API_KEY，仍可使用模拟与浏览器识别。')
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
