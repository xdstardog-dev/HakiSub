// 使用已安装的外部 Playwright，真实 Chrome + 隔离内存网关，不读取 .env。
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { createStaticWebsite } from '../server/staticWebsite.mjs'
const { chromium } = await import(process.argv[2] ?? 'playwright')
const origins = [], errors = []
const gateway = createAsrGateway({ allowedOrigins: origins, allowLegacyAsr: false,
  serveWebsite: createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))),
  connectUpstream() { throw Error('不得访问真实ASR') },
})
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const origin = `http://127.0.0.1:${gateway.server.address().port}`; origins.push(origin)
let browser
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message))
  async function create() {
    await page.getByRole('button', { name: '创建房间', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByLabel('输入房间名称', { exact: true }).fill('复制验收')
    await page.locator('form button[type=submit]').click(); await page.locator('.room-bottom-bar').waitFor()
    return /\d{6}/.exec(new URL(page.url()).pathname)[0]
  }
  const codeButton = page.getByRole('button', { name: '复制房间号', exact: true })
  const shareButton = page.getByRole('button', { name: '分享房间链接', exact: true })
  const toast = page.locator('.room-copy-toast')
  await page.goto(origin); const code = await create()
  assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, focus: document.hasFocus(), api: typeof navigator.clipboard.writeText })), { secure: true, focus: true, api: 'function' })
  // 首次按钮写入前不授予权限、不替换API；之后仅授权读取以核对系统剪贴板。
  await codeButton.click(); await page.getByText('复制房间号成功', { exact: true }).waitFor()
  await context.grantPermissions(['clipboard-read'])
  const readClipboard = () => page.evaluate(() => navigator.clipboard.readText())
  assert.equal(await readClipboard(), code)
  await page.evaluate(() => history.replaceState(null, '', location.pathname + '?ownerToken=secret&memberToken=private#credential'))
  await shareButton.click(); await page.getByText('复制链接成功', { exact: true }).waitFor()
  assert.equal(await readClipboard(), `${origin}/${code}/`)
  await page.evaluate(() => { window.nativeClipboard = navigator.clipboard; window.nativeCopy = document.execCommand; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }) })
  await codeButton.click(); await page.getByText('复制房间号成功', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.nativeClipboard.readText()), code, '真实execCommand写入并读回')
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('denied', 'NotAllowedError') } } }))
  await shareButton.click(); await page.getByText('复制链接成功', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.nativeClipboard.readText()), `${origin}/${code}/`)
  await page.evaluate(() => { document.execCommand = () => false })
  await shareButton.click()
  const dialog = page.getByRole('dialog', { name: '手动复制房间链接' })
  await dialog.waitFor(); await toast.waitFor({ state: 'detached' })
  assert.equal(await page.getByLabel('房间链接', { exact: true }).inputValue(), `${origin}/${code}/`)
  await page.getByRole('button', { name: '全选', exact: true }).click()
  await mkdir(new URL('../artifacts/room-copy/', import.meta.url), { recursive: true })
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/room-copy/manual-copy.png', import.meta.url)) })
  assert.equal(await page.getByLabel('房间链接', { exact: true }).evaluate(element => element.value.slice(element.selectionStart, element.selectionEnd)), `${origin}/${code}/`)
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); document.execCommand = undefined })
  await codeButton.click(); await page.getByRole('dialog', { name: '手动复制房间号' }).waitFor()
  assert.equal(await page.getByLabel('房间号', { exact: true }).inputValue(), code)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  assert.equal(await page.locator('textarea[aria-label="临时复制文本"]').count(), 0)
  await page.evaluate(() => { window.pendingCopies = []; window.fallbackCalls = 0; document.execCommand = () => { window.fallbackCalls++; return true }; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise((resolve, reject) => window.pendingCopies.push({ resolve, reject })) } }) })
  await codeButton.click(); await shareButton.click()
  await page.evaluate(() => window.pendingCopies[1].resolve())
  await page.getByText('复制链接成功', { exact: true }).waitFor()
  await page.evaluate(() => window.pendingCopies[0].reject(Error('late')))
  assert.equal(await toast.innerText(), '复制链接成功')
  assert.equal(await page.evaluate(() => window.fallbackCalls), 0)
  await codeButton.click(); await page.locator('.room-exit').click(); await create()
  await page.evaluate(() => window.pendingCopies[2].resolve())
  await toast.waitFor({ state: 'detached' })
  assert.equal(await toast.count(), 0); assert.equal(await page.locator('.manual-copy-dialog').count(), 0)
  await codeButton.click(); await page.locator('.room-exit').click()
  await page.evaluate(() => window.pendingCopies[3].reject(Error('late denial')))
  await toast.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => window.fallbackCalls), 0)
  assert.equal(await toast.count(), 0); assert.equal(await page.locator('.manual-copy-dialog').count(), 0)
  assert.deepEqual(errors, [])
  console.log('通过：真实Chrome原生复制与读取、真实execCommand写入与读取；缺失API/权限异常/备用失败/均不可用/手动全选/Escape/临时DOM清理/连续点击/离房及换房迟到结果/链接无凭据。390px为桌面仿真，非真实手机。')
} finally { await browser?.close(); await gateway.close() }
