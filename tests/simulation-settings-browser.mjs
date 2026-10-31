// 用真实开发SFC验证模拟分支；不新增生产测试入口、不读取.env、不连接网关或麦克风。
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { assertPinInput, exercisePinInput } from './pin-input-browser-helpers.mjs'

const { chromium } = await import(process.argv[2] ?? 'playwright')
const root = fileURLToPath(new URL('../', import.meta.url)), output = new URL('../artifacts/simulation-settings/', import.meta.url)
await mkdir(output, { recursive: true })
const server = await createServer({ root, configFile: false, envFile: false, plugins: [vue()], logLevel: 'error', server: {
  host: '127.0.0.1', port: 0, fs: { strict: true, deny: ['.env', '.env.*', '**/secrets/**', '**/.git/**', '**/accounts/server/**', '**/artifacts/**'] },
} })
let browser
const errors = [], posts = []
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  for (const [width, height] of [[480, 900], [320, 568]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 480, isMobile: width < 480 })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== origin) return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      if (request.method() === 'POST') posts.push(url.pathname)
      if (url.pathname === '/api/asr/settings') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
      if (url.pathname === '/api/asr/health') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":false}' })
      throw Error('Unexpected API request: ' + url.pathname)
    })
    const page = await context.newPage(); page.setDefaultTimeout(10000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin)
    await page.waitForFunction(() => !!document.querySelector('#app').__vue_app__?._instance?.setupState?.enter)
    await page.evaluate(() => {
      const state = document.querySelector('#app').__vue_app__._instance.setupState
      state.roomMode = 'simulation'; state.mode = 'create'; state.name = '模拟访客'; state.requestedRoomName = '模拟初始房名'; state.inputMode = 'simulation'; state.enter()
    })
    await page.getByRole('heading', { name: '模拟初始房名', exact: true }).waitFor()
    await page.getByRole('button', { name: '房间设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置', exact: true })
    await settings.waitFor()
    assert.equal(await settings.evaluate(element => element.matches(':modal')), true)
    await settings.getByLabel('房间名称', { exact: true }).fill('本地修改生效')
    await settings.getByRole('button', { name: '保存房间名称', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.room-heading h1').textContent === '本地修改生效')
    const pin = settings.getByLabel('设置四位入房码', { exact: true })
    assert.equal(await pin.getAttribute('type'), 'text')
    await exercisePinInput(page, pin, settings.getByRole('button', { name: '保存入房码', exact: true }))
    await pin.fill('0042'); await settings.getByRole('button', { name: '保存入房码', exact: true }).click()
    await settings.getByText('房间密码已设置；只能更换或移除。', { exact: true }).waitFor()
    await settings.getByRole('button', { name: '返回房间', exact: true }).click()
    await page.getByRole('button', { name: '房间设置', exact: true }).click()
    await settings.getByText('房间密码已设置；只能更换或移除。', { exact: true }).waitFor()
    await assertPinInput(settings.getByLabel('更换四位入房码', { exact: true }))
    assert.equal(await settings.getByText('0042', { exact: true }).count(), 0)
    await settings.getByText('房间名称：本地修改生效', { exact: true }).waitFor()
    await settings.getByLabel('房间名称', { exact: true }).fill('中'.repeat(13))
    assert.equal(await settings.getByRole('button', { name: '保存房间名称', exact: true }).isDisabled(), true)
    await settings.getByLabel('房间名称', { exact: true }).fill('a'.repeat(24))
    await settings.getByRole('button', { name: '保存房间名称', exact: true }).click()
    await settings.screenshot({ path: fileURLToPath(new URL(`settings-${width}.png`, output)) })
    assert.equal(await settings.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    await page.keyboard.press('Escape'); await settings.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '退出房间', exact: true }).click()
    assert.equal(await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.setupState.simulationAccessCode), '')
    await context.close()
  }
  assert.deepEqual(posts, [], '模拟改名及入房码不会提交到真实房间')
  assert.deepEqual(errors, [])
  console.log('通过：真实Vue模拟分支480/320px初始命名、改名标题同步、共用无边框PIN输入/前导零/保存清空/重开不回显、长度边界、弹窗滚动与Escape、离房清理及无房间写请求。未使用真实网关、物理手机键盘或麦克风。')
} finally { await browser?.close(); await server.close() }
