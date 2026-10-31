// 隔离本地网关和持久资料；浏览器账号端用合成身份代理签名请求，真实Cookie/CSRF另由账号联调覆盖。
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { createRoomStore } from '../server/roomStore.mjs'
import { createStaticWebsite } from '../server/staticWebsite.mjs'
import { assertPinInput, exercisePinInput } from './pin-input-browser-helpers.mjs'

const { chromium } = await import(process.argv[2] ?? 'playwright')
const directory = await mkdtemp(join(tmpdir(), 'hakisub-entry-browser-'))
const output = new URL('../artifacts/room-access/', import.meta.url)
await mkdir(output, { recursive: true })
const secret = 'synthetic-browser-room-access-secret-at-least-forty-three-characters'
const ownerUid = randomUUID(), visitorUid = randomUUID(), errors = []
let gateway, origin, browser, port = 0
async function start() {
  const origins = []
  gateway = createAsrGateway({ allowedOrigins: origins, roomManagementSecret: secret,
    roomStore: await createRoomStore(join(directory, 'rooms.json')),
    serveWebsite: createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))),
    connectUpstream() { throw Error('浏览器入房测试禁止真实ASR') },
  })
  gateway.server.listen(port, '127.0.0.1'); await once(gateway.server, 'listening')
  port = gateway.server.address().port; origin = `http://127.0.0.1:${port}`; origins.push(origin)
}
async function signed(command) {
  const { audience } = await (await fetch(origin + '/internal/rooms/challenge')).json()
  const body = JSON.stringify({ audience, issuedAt: Date.now(), nonce: randomUUID(), command })
  const signature = createHmac('sha256', secret).update('POST\n/internal/rooms/manage\n' + body).digest('hex')
  const response = await fetch(origin + '/internal/rooms/manage', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HakiSub-Signature': signature }, body })
  return { status: response.status, body: await response.json() }
}
async function pageFor(uid, width = 390, height = 844) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 480, isMobile: width < 480 })
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === origin) { await route.continue(); return }
    if (url.origin !== 'https://xdstar.work' || !url.pathname.startsWith('/api/projects/hakisub/')) { await route.abort(); return }
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-CSRF-Token' }
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    const suffix = url.pathname.replace('/api/projects/hakisub', '')
    let result
    if (suffix === '/csrf') result = { status: 200, body: { token: 'synthetic-csrf' } }
    else if (suffix === '/identity') result = { status: 200, body: { user: uid ? { uid: uid === ownerUid ? '100001' : '100002', nickname: '合成账号' } : null } }
    else if (!uid) result = { status: 401, body: { message: '请先登录' } }
    else if (suffix === '/rooms') result = await signed({ action: 'list', uid })
    else {
      const match = /^\/rooms\/(\d{6})\/(bind|manage|access)$/.exec(suffix)
      if (!match) result = { status: 404, body: {} }
      else {
        const body = request.postDataJSON()
        result = await signed({ ...body, code: match[1], action: match[2] === 'manage' ? body.action : match[2], uid, ...(match[2] === 'bind' ? { nickname: '合成账号' } : {}) })
      }
    }
    await route.fulfill({ status: result.status, headers, body: JSON.stringify(result.body) })
  })
  const page = await context.newPage(); page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  return page
}
async function enter(page, name, code, password) {
  await page.goto(origin + (code ? `/${code}/` : '/'))
  if (!code) {
    const create = page.getByRole('button', { name: '创建房间', exact: true })
    await create.focus(); await create.press('Enter')
  }
  await page.locator('.account-access').waitFor()
  if (!code) await page.getByLabel('输入房间名称', { exact: true }).fill(name)
  if (!code && password) {
    await page.getByRole('button', { name: '私密房间', exact: true }).click()
    const input = page.getByLabel('四位数字密码', { exact: true })
    await exercisePinInput(page, input, page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }))
    await input.fill(password)
    await assertPinInput(input, password)
    await page.screenshot({ path: fileURLToPath(new URL('pin-create-desktop.png', output)) })
  }
  await page.locator('form button[type="submit"]').click()
}
const prompt = page => page.getByRole('dialog', { name: '这是一个加密房间' })
async function submitPassword(page, password) {
  await prompt(page).getByLabel('输入密码', { exact: true }).fill(password)
  await prompt(page).getByRole('button', { name: '确定', exact: true }).click()
}
try {
  await start()
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  const owner = await pageFor(ownerUid, 1280, 900), visitor = await pageFor(visitorUid), otherDevice = await pageFor(visitorUid), guest = await pageFor(null, 320, 568)
  await enter(owner, 'Owner', undefined, '0426')
  await owner.getByRole('button', { name: '房间设置', exact: true }).click()
  await owner.locator('.owner-entry').click()
  const code = /\d{6}/.exec(new URL(owner.url()).pathname)[0]
  await owner.getByText('个人中心', { exact: true }).waitFor()
  assert.equal(await owner.getByRole('switch', { name: /房间密码/ }).isChecked(), true)
  assert.equal(await owner.locator('.current-access-code').count(), 0)
  assert.equal(await owner.getByLabel('更换四位数字密码', { exact: true }).getAttribute('type'), 'text')
  await exercisePinInput(owner, owner.getByLabel('更换四位数字密码', { exact: true }), owner.getByRole('button', { name: '保存密码', exact: true }))
  await owner.getByRole('heading', { level: 1, name: 'Owner', exact: true }).waitFor()
  await owner.getByRole('button', { name: '编辑房间名称' }).click()
  await owner.getByLabel('新房间名称', { exact: true }).fill('朋友交流室')
  await owner.getByRole('button', { name: '确认保存名称', exact: true }).click()
  await owner.getByRole('heading', { level: 1, name: '朋友交流室', exact: true }).waitFor()
  await owner.getByLabel('更换四位数字密码', { exact: true }).fill('0426')
  await owner.getByRole('button', { name: '保存密码', exact: true }).click()
  assert.equal(await owner.getByRole('switch', { name: /房间密码/ }).isChecked(), true)
  await assertPinInput(owner.getByLabel('更换四位数字密码', { exact: true }))
  await owner.screenshot({ path: fileURLToPath(new URL('settings-desktop.png', output)) })
  await owner.getByRole('button', { name: '返回房间设置', exact: true }).click()
  await owner.getByRole('button', { name: '关闭设置', exact: true }).click()
  await owner.getByRole('button', { name: '房间设置', exact: true }).click()
  await owner.locator('.owner-entry').click()
  assert.equal(await owner.locator('.current-access-code').count(), 0)
  await assertPinInput(owner.getByLabel('更换四位数字密码', { exact: true }))
  await owner.getByRole('button', { name: '返回房间设置', exact: true }).click()
  await owner.getByRole('button', { name: '关闭设置', exact: true }).click()
  await enter(visitor, 'Visitor', code)
  await prompt(visitor).waitFor(); assert.equal(await visitor.locator('.member-tile').count(), 0)
  await exercisePinInput(visitor, prompt(visitor).getByLabel('输入密码', { exact: true }), prompt(visitor).getByRole('button', { name: '确定', exact: true }))
  await prompt(visitor).getByLabel('输入密码', { exact: true }).fill('01')
  await visitor.screenshot({ path: fileURLToPath(new URL('pin-partial-390.png', output)) })
  await submitPassword(visitor, '0000'); await prompt(visitor).getByText('入房码不正确，请重新输入。', { exact: true }).waitFor()
  assert.equal(await prompt(visitor).getByLabel('输入密码').inputValue(), '')
  await assertPinInput(prompt(visitor).getByLabel('输入密码', { exact: true }))
  await visitor.screenshot({ path: fileURLToPath(new URL('password-390.png', output)) })
  await submitPassword(visitor, '0426'); await visitor.locator('.room-bottom-bar').waitFor()
  assert.equal(await prompt(visitor).count(), 0)
  await enter(otherDevice, 'Same account', code); await otherDevice.locator('.room-bottom-bar').waitFor()
  assert.equal(await prompt(otherDevice).count(), 0, '同账号另一浏览器免输')
  await enter(guest, 'Guest', code); await prompt(guest).waitFor()
  await exercisePinInput(guest, prompt(guest).getByLabel('输入密码', { exact: true }), prompt(guest).getByRole('button', { name: '确定', exact: true }))
  await guest.screenshot({ path: fileURLToPath(new URL('password-320.png', output)) })
  await submitPassword(guest, '0426'); await guest.locator('.room-bottom-bar').waitFor()
  await guest.getByRole('heading', { level: 1, name: '朋友交流室', exact: true }).waitFor()
  await guest.getByRole('button', { name: '房间设置', exact: true }).click()
  assert.equal(await guest.getByRole('button', { name: '保存密码', exact: true }).count(), 0)
  assert.equal(await guest.getByRole('button', { name: '确认保存名称', exact: true }).count(), 0)
  assert.equal(await guest.locator('.current-access-code').count(), 0)
  await guest.getByRole('button', { name: '关闭设置', exact: true }).click()
  await gateway.close(); await start()
  await enter(otherDevice, 'After restart', code); await otherDevice.locator('.room-bottom-bar').waitFor()
  assert.equal(await prompt(otherDevice).count(), 0, '网关重启后仍按账号免输')
  await enter(owner, 'Owner again', code); await owner.locator('.room-bottom-bar').waitFor()
  await owner.getByRole('button', { name: '房间设置', exact: true }).click()
  await owner.locator('.owner-entry').click()
  await owner.getByRole('heading', { level: 1, name: '朋友交流室', exact: true }).waitFor()
  assert.equal(await owner.locator('.current-access-code').count(), 0)
  const longName = '中'.repeat(12)
  await owner.getByRole('button', { name: '编辑房间名称' }).click()
  await owner.getByLabel('新房间名称', { exact: true }).fill(longName)
  await owner.getByRole('button', { name: '确认保存名称', exact: true }).click()
  await otherDevice.getByRole('heading', { level: 1, name: longName, exact: true }).waitFor()
  assert.equal(await otherDevice.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await owner.getByLabel('更换四位数字密码', { exact: true }).fill('9630')
  await owner.getByRole('button', { name: '保存密码', exact: true }).click()
  await prompt(otherDevice).waitFor()
  assert.equal(await otherDevice.locator('.member-tile').count(), 0)
  assert.equal(await owner.locator('.room-bottom-bar').count(), 1, '房主保留设置权限')
  await submitPassword(otherDevice, '9630'); await otherDevice.locator('.room-bottom-bar').waitFor()
  await owner.getByRole('switch', { name: /房间密码/ }).uncheck()
  await owner.getByText('关', { exact: true }).waitFor()
  await enter(guest, 'Public guest', code); await guest.locator('.room-bottom-bar').waitFor()
  assert.equal(await prompt(guest).count(), 0)
  await guest.screenshot({ path: fileURLToPath(new URL('long-room-name-320.png', output)) })
  await enter(guest, '自定义显示名称')
  await guest.getByRole('button', { name: '房间设置', exact: true }).click()
  await guest.locator('.owner-entry').click()
  await guest.getByRole('heading', { level: 1, name: '自定义显示名称', exact: true }).waitFor()
  const markup = '<img>'
  await guest.getByRole('button', { name: '编辑房间名称' }).click()
  await guest.getByLabel('新房间名称', { exact: true }).fill(markup)
  await guest.getByRole('button', { name: '确认保存名称', exact: true }).click()
  await guest.getByRole('heading', { level: 1, name: markup, exact: true }).waitFor()
  assert.equal(await guest.locator('.room-heading img').count(), 0, '名称必须按文本渲染')
  await guest.screenshot({ path: fileURLToPath(new URL('rename-guest-320.png', output)) })
  await guest.getByRole('button', { name: '返回房间设置', exact: true }).click()
  await guest.getByRole('button', { name: '关闭设置', exact: true }).click()
  await guest.getByRole('button', { name: '退出房间', exact: true }).click()
  await guest.locator('.home-room-details strong').filter({ hasText: markup }).waitFor()
  assert.deepEqual(errors, [])
  console.log('通过：Chrome 1280/390/320px统一无边框PIN、四点与逐位数字/居中等距、全区域鼠标/触屏聚焦、数字过滤/四位上限/前导零、退格/全选/中途编辑/合成粘贴/IME、未满禁用/满四位不自动提交/错误清空及重开不回显；原房名/权限/账号免输/持久重启/改码撤权及移除回归。账号接口使用合成身份，剪贴板与IME事件为合成；未验收物理手机系统键盘、麦克风或豆包。')
} finally { await browser?.close(); await gateway?.close(); await rm(directory, { recursive: true, force: true }) }
