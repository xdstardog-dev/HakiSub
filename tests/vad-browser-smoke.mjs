// 可选浏览器部署检查：node tests/vad-browser-smoke.mjs <playwright模块路径或包名>
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readdir, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStaticWebsite } from '../server/staticWebsite.mjs'

const { chromium } = await import(process.argv[2] ?? 'playwright')
const assets = await readdir(new URL('../dist/assets/', import.meta.url))
const workerFile = assets.find(file => file.startsWith('sileroVad.worker-') && file.endsWith('.js'))
assert.ok(workerFile, '先运行 npm run build')
const server = createServer(createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))))
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const origin = `http://127.0.0.1:${server.address().port}`
let browser
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'hakisub-vad-'))
const audioFile = join(temporaryDirectory, 'silence.wav')
const audio = Buffer.alloc(44 + 48000 * 2 * 8)
audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8)
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22)
audio.writeUInt32LE(48000, 24); audio.writeUInt32LE(96000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34)
audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40)
await writeFile(audioFile, audio)
let cloudConnections = 0
server.on('upgrade', (_request, socket) => { cloudConnections++; socket.destroy() })
try {
  browser = await chromium.launch({ channel: process.env.VAD_BROWSER_CHANNEL ?? 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${audioFile}`] })
  const context = await browser.newContext({ permissions: ['microphone'] })
  await context.addInitScript(() => {
    window.testAudioTracks = []
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints)
      window.testAudioTracks.push(...stream.getTracks())
      return stream
    }
  })
  const page = await context.newPage()
  const failedRequests = [], externalRequests = []
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/api/')) failedRequests.push(response.url()) })
  page.on('request', request => { if (!request.url().startsWith(origin)) externalRequests.push(request.url()) })
  await page.goto(origin)
  const result = await page.evaluate(({ origin, workerFile }) => new Promise((resolve, reject) => {
    const worker = new Worker(`${origin}/assets/${workerFile}`)
    const probabilities = []
    const timer = setTimeout(() => { worker.terminate(); reject(Error('Worker timeout')) }, 30000)
    worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(Error(event.message)) }
    worker.onmessage = event => {
      if (event.data.type === 'error') { clearTimeout(timer); worker.terminate(); reject(Error('VAD initialization/inference failed')); return }
      if (event.data.type === 'result') probabilities.push(event.data.probability)
      if (probabilities.length === 10) {
        clearTimeout(timer); worker.terminate(); resolve({ probabilities, isolated: crossOriginIsolated }); return
      }
      worker.postMessage({ type: 'audio', id: probabilities.length, pcm: new ArrayBuffer(6400) })
    }
    worker.postMessage({ type: 'init', assetBase: `${origin}/vad/` })
  }), { origin, workerFile })
  assert.equal(result.isolated, false, '此实现必须能在无跨源隔离时运行')
  assert.ok(result.probabilities.every(probability => Number.isFinite(probability) && probability < .35))
  assert.deepEqual(failedRequests, []); assert.deepEqual(externalRequests, [])
  await page.getByLabel('使用方式', { exact: true }).selectOption('simulation')
  await page.getByLabel('显示名称', { exact: true }).fill('静音测试')
  await page.locator('form button[type="submit"]').click()
  await page.getByLabel('输入', { exact: true }).selectOption('microphone')
  assert.equal(await page.getByLabel('识别来源').inputValue(), 'doubao')
  await page.getByRole('button', { name: '开启麦克风', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '等待说话' }).waitFor({ timeout: 30000 })
  await page.waitForTimeout(2200)
  assert.equal(cloudConnections, 0, '纯静音不得建立豆包会话')
  assert.equal(await page.evaluate(() => window.testAudioTracks.some(track => track.readyState === 'live')), true, '静音时底层采集仍开启')
  await page.getByRole('button', { name: '关闭麦克风', exact: true }).click()
  assert.equal(await page.evaluate(() => window.testAudioTracks.every(track => track.readyState === 'ended')), true)
  await page.route('**/vad/silero-v6.onnx*', route => route.abort())
  await page.getByRole('button', { name: '开启麦克风', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '语音检测资源下载失败' }).waitFor({ timeout: 30000 })
  assert.equal(cloudConnections, 0, '模型加载失败不能退回持续上传')
  assert.equal(await page.evaluate(() => window.testAudioTracks.every(track => track.readyState === 'ended')), true)
  console.log('通过：正式网页同源Worker/模型/MJS/WASM加载、无跨源隔离与CDN、真实模型静音推理；模拟麦克风持续采集且零上传，手动关闭与模型加载失败均释放采集。未访问真实麦克风或豆包。')
} finally {
  await browser?.close()
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  await unlink(audioFile); await rmdir(temporaryDirectory)
}
