// 构建后运行；参数可指定本机已有的 Playwright 模块路径，不新增项目依赖。
// 所有账号与房间响应均为合成数据，不读取 .env，不访问生产或真实豆包。
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const { chromium } = await import(process.argv[2] ?? 'playwright')
const output = fileURLToPath(new URL('../../artifacts/account-workspace/', import.meta.url))
await mkdir(output, { recursive: true })
const root = fileURLToPath(new URL('../dist/', import.meta.url))
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const relative = pathname === '/account/' ? 'index.html' : pathname.replace(/^\/account\//, '')
    const path = resolve(root, relative)
    if (!path.startsWith(resolve(root) + '/') && !path.startsWith(resolve(root) + '\\')) throw Error('invalid path')
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html')
    response.end(await readFile(path))
  } catch { response.writeHead(404); response.end() }
})
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const origin = `http://127.0.0.1:${server.address().port}`
let browser
const errors = []
const fixtureUser = { uid: '123456', username: 'fixture_user', nickname: '小地', createdAt: 1793000000000 }
const fixtureRoom = { code: '114514', bound: true, configured: true, keyState: 'configured', asrEnabled: true, busy: false }
async function openPage(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 768, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  page.on('pageerror', issue => errors.push(issue.message))
  const state = { loggedIn: false, user: { ...fixtureUser }, rooms: [{ ...fixtureRoom }, { ...fixtureRoom, code: '654321', configured: false, asrEnabled: false }], presets: [{ id: 'fixture-preset', name: '日常交流', updatedAt: 1793000000000 }], calls: [], failNextRegistration: true, failNextSave: false }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const path = url.pathname, body = request.postDataJSON(), method = request.method()
    state.calls.push({ path, body, method })
    const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/csrf')) return send({ token: 'synthetic-csrf' })
    if (method !== 'GET') assert.equal(request.headers()['x-csrf-token'], 'synthetic-csrf')
    if (path.endsWith('/client-configuration')) return send({ projectOrigin: origin })
    if (path.endsWith('/me')) return state.loggedIn ? send({ user: state.user, projects: [] }) : send({ message: '尚未登录' }, 401)
    if (path.endsWith('/register')) {
      if (state.failNextRegistration) { state.failNextRegistration = false; return send({ message: '合成注册失败，请重试' }, 503) }
      assert.equal(body.questions.length, 3); assert.equal(body.password, 'fixture-password')
      state.loggedIn = true; return send({ user: state.user }, 201)
    }
    if (path.endsWith('/login')) { state.loggedIn = true; return send({ user: state.user }) }
    if (path.endsWith('/logout')) { state.loggedIn = false; return send({ message: '已退出' }) }
    if (path.endsWith('/nickname')) { state.user.nickname = body.nickname; return send({ user: state.user }) }
    if (path.endsWith('/recovery/start')) return send({ questions: ['合成问题一', '合成问题二', '合成问题三'] })
    if (path.endsWith('/recovery/reset') || path.endsWith('/password') || path.endsWith('/security-questions')) return send({ message: '操作成功' })
    if (path.endsWith('/rooms')) return send({ rooms: state.rooms })
    if (path.endsWith('/manage')) {
      const room = state.rooms.find(item => path.includes(item.code))
      if (body.action === 'reveal') return send({ apiKey: 'synthetic-room-key' })
      if (body.action === 'test') return send({ ok: true, message: '合成连接测试通过' })
      if (body.action === 'save' && state.failNextSave) { state.failNextSave = false; return send({ message: '合成保存失败' }, 503) }
      if (body.action === 'save') { room.configured = true; room.keyState = 'configured' }
      if (body.action === 'delete') { room.configured = false; room.keyState = 'deleted' }
      if (body.action === 'asr') room.asrEnabled = body.enabled
      return send({ room, message: '房间设置已更新' })
    }
    if (path.endsWith('/presets')) return send({ presets: state.presets })
    if (path.includes('/presets/')) {
      if (method === 'DELETE') state.presets = []
      else state.presets[0].name = body.name
      return send({ preset: state.presets[0], message: '已保存' })
    }
    throw Error('Unmocked endpoint: ' + path)
  })
  await page.goto(origin + '/account/')
  await page.getByLabel('账号或 UID', { exact: true }).waitFor()
  return { context, page, state }
}
async function navigate(page, name) {
  const mobile = await page.getByRole('button', { name: '打开导航菜单', exact: true }).isVisible()
  if (mobile) await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
  const navigation = page.locator(mobile ? 'dialog[open]' : '.desktop-sidebar')
  await navigation.getByRole('button', { name, exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('dialog')?.open)
}
async function login(page) {
  await page.getByLabel('账号或 UID', { exact: true }).fill('123456')
  await page.getByLabel('密码', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: '登录 →', exact: true }).click()
  await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
  await page.locator('.room-card').first().waitFor()
}
async function assertNoOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
}
try {
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  for (const width of [375, 768, 1440]) {
    const { page, state, context } = await openPage(width)
    await assertNoOverflow(page)
    assert.equal(await page.getByRole('tab').count(), 0)
    {
      await page.screenshot({ path: join(output, `login-${width}.png`) })
      await page.getByRole('button', { name: '注册账号', exact: true }).click()
      assert.equal(await page.locator('.question-pair').count(), 0)
      await page.getByLabel('登录账号', { exact: true }).fill('fixture_user')
      await page.getByLabel('用户昵称', { exact: true }).fill('小地')
      await page.getByLabel('设置密码', { exact: true }).fill('fixture-password')
      await page.getByLabel('确认密码', { exact: true }).fill('mismatched-password')
      await page.getByRole('button', { name: '下一步 →', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '不一致' }).waitFor()
      await page.getByLabel('确认密码', { exact: true }).fill('fixture-password')
      await page.getByRole('button', { name: '下一步 →', exact: true }).click()
      assert.equal(state.calls.filter(call => call.path.endsWith('/register')).length, 0)
      await assertNoOverflow(page)
      for (let index = 0; index < 3; index++) await page.locator(`#answer-${index}`).fill('synthetic answer ' + index)
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出当前安全码到电脑' }).click()
      assert.equal((await downloadPromise).suggestedFilename(), 'xdstar-security-codes.txt')
      await page.getByRole('button', { name: '返回上一步' }).click()
      assert.equal(await page.getByLabel('设置密码', { exact: true }).inputValue(), 'fixture-password')
      await page.getByRole('button', { name: '下一步 →', exact: true }).click()
      assert.equal(await page.locator('#answer-0').inputValue(), 'synthetic answer 0')
      await page.getByRole('button', { name: '完成注册', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '合成注册失败' }).waitFor()
      assert.equal(await page.locator('#answer-0').inputValue(), 'synthetic answer 0')
      await page.getByRole('button', { name: '完成注册', exact: true }).click()
      await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
    }
    await page.locator('.room-card').first().waitFor()
    assert.equal(await page.locator('main input').count(), 0)
    await assertNoOverflow(page)
    await page.screenshot({ path: join(output, `overview-${width}.png`), fullPage: true })
    if (width <= 768) {
      const before = await page.locator('main').boundingBox()
      const toggle = page.getByRole('button', { name: '打开导航菜单', exact: true })
      await toggle.click()
      const dialog = page.getByRole('dialog')
      assert.equal(await dialog.evaluate(element => element.matches(':modal')), true)
      const bounds = await dialog.boundingBox()
      assert.equal(bounds.x, 0); assert.ok(bounds.width <= 320 && bounds.width <= width * .86)
      assert.equal(await page.evaluate(() => document.body.style.position), 'fixed')
      assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true)
      for (let index = 0; index < 12; index++) await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true)
      assert.equal((await page.locator('main').boundingBox()).width, before.width)
      await page.screenshot({ path: join(output, `drawer-${width}.png`) })
      await page.keyboard.press('Escape')
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
      assert.equal(await toggle.evaluate(element => element === document.activeElement), true)
      assert.equal(await page.evaluate(() => document.body.style.position), '')
      await toggle.click(); await page.mouse.click(width - 28, 450)
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
      await toggle.click(); await page.getByRole('button', { name: '关闭导航菜单', exact: true }).click()
    }
    await navigate(page, '我的房间')
    await page.getByRole('button', { name: '管理房间', exact: true }).first().waitFor()
    assert.equal(await page.locator('main input').count(), 0)
    await page.getByRole('button', { name: '管理房间', exact: true }).first().click()
    const key = page.locator('#key-114514')
    assert.equal(await key.getAttribute('type'), 'password')
    assert.equal(state.calls.filter(call => call.body?.action === 'reveal').length, 0)
    await page.getByRole('button', { name: '显示', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('#key-114514')?.value === 'synthetic-room-key')
    await page.getByRole('button', { name: '隐藏', exact: true }).click()
    assert.equal(await key.inputValue(), '********')
    await key.fill('synthetic-replacement-key'); await page.getByRole('button', { name: '保存 Key', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '房间设置已更新' }).waitFor()
    assert.notEqual(await key.inputValue(), 'synthetic-replacement-key')
    await page.getByRole('button', { name: '测试 Key', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '合成连接测试通过' }).waitFor()
    await page.getByRole('button', { name: '暂停豆包 ASR', exact: true }).click()
    await page.getByRole('button', { name: '开启豆包 ASR', exact: true }).waitFor()
    await page.getByRole('button', { name: '删除 Key', exact: true }).click()
    assert.equal(state.calls.filter(call => call.body?.action === 'delete').length, 0)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '删除 Key', exact: true }).click()
    await page.getByRole('button', { name: '确认删除', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('#key-114514')?.value === '')
    await key.fill('synthetic-new-room-key'); await page.getByRole('button', { name: '保存 Key', exact: true }).click()
    await page.getByRole('button', { name: '测试 Key', exact: true }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => document.querySelector('#key-114514')?.value === '********' && !document.querySelector('#key-114514').matches(':disabled'))
    if (width === 1440) {
      state.failNextSave = true
      await key.fill('synthetic-failing-room-key'); await page.getByRole('button', { name: '保存 Key', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '合成保存失败' }).waitFor()
      assert.equal(await page.locator('main input').count(), 0)
      await page.getByRole('button', { name: '刷新我的房间', exact: true }).first().click()
      await page.locator('#key-114514').waitFor()
    }
    await page.getByRole('button', { name: '← 返回房间列表', exact: true }).click()
    assert.equal(await page.locator('main input').count(), 0)
    await assertNoOverflow(page)
    await page.screenshot({ path: join(output, `rooms-${width}.png`), fullPage: true })
    await navigate(page, '房间存档')
    await page.getByLabel('存档名称', { exact: true }).fill('新的日常交流')
    await page.getByRole('button', { name: '保存名称', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '存档名称已更新' }).waitFor()
    assert.match(await page.getByRole('link', { name: '在 HakiSub 加载 ↗' }).getAttribute('href'), /preset=fixture-preset/)
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await page.getByRole('heading', { name: '还没有房间存档', exact: true }).waitFor()
    await page.getByRole('button', { name: '刷新存档', exact: true }).click()
    await navigate(page, '个人资料')
    await page.getByLabel('新的用户昵称', { exact: true }).fill('小地的新昵称')
    await page.getByRole('button', { name: '保存昵称', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '用户昵称已更新' }).waitFor()
    await navigate(page, '安全设置')
    await page.getByLabel('当前密码', { exact: true }).fill('fixture-password')
    await page.getByLabel('新密码', { exact: true }).fill('fixture-new-password')
    await page.getByLabel('确认新密码', { exact: true }).fill('fixture-new-password')
    await page.getByRole('button', { name: '更新密码', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '操作成功' }).waitFor()
    assert.equal(await page.getByLabel('新密码', { exact: true }).inputValue(), '')
    await page.getByLabel('验证当前密码', { exact: true }).fill('fixture-new-password')
    for (let index = 0; index < 3; index++) await page.locator(`#answer-${index}`).fill('new synthetic answer ' + index)
    await page.getByRole('button', { name: '替换全部密保', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('#security-password')?.value === '')
    await assertNoOverflow(page)
    if (width <= 768) {
      // 长页面的滚动锁定，以及抽屉打开时从手机切到桌面。
      await page.evaluate(() => window.scrollTo(0, 350))
      const scrollY = await page.evaluate(() => window.scrollY)
      await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
      await page.keyboard.press('Escape')
      assert.equal(await page.evaluate(() => window.scrollY), scrollY)
      await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.waitForFunction(() => !document.querySelector('dialog').open)
      assert.equal(await page.evaluate(() => document.body.style.position), '')
      await page.setViewportSize({ width, height: 900 })
    } else {
      await page.evaluate(() => window.scrollTo(0, 500))
      assert.equal((await page.locator('.desktop-sidebar').boundingBox()).y, 0)
    }
    await navigate(page, '总览')
    await page.reload(); await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
    await navigate(page, '退出登录')
    await page.getByRole('button', { name: '忘记密码？', exact: true }).click()
    await page.getByLabel('账号或 UID', { exact: true }).fill('123456')
    await page.getByRole('button', { name: '继续 →', exact: true }).click()
    for (let index = 0; index < 3; index++) await page.locator(`#answer-${index}`).fill('synthetic answer ' + index)
    await page.getByLabel('新密码', { exact: true }).fill('fixture-password')
    await page.getByLabel('确认新密码', { exact: true }).fill('fixture-password')
    await page.getByRole('button', { name: '重置密码', exact: true }).click()
    await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
    await login(page)
    await context.close()
    console.log(`通过：${width}px 登录/两步注册/恢复、五个页面、单房间Key/ASR、存档、账号设置、退出、布局及抽屉。`)
  }
  assert.deepEqual(errors, [])
  console.log('全部浏览器验收通过；仅合成接口，截图在 artifacts/account-workspace/。')
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
