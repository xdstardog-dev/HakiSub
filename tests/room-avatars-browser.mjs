// 隔离内存房间、正式构建、真实Chrome手势；不读取.env、不访问麦克风或真实账号。
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { createStaticWebsite } from '../server/staticWebsite.mjs'
const { chromium } = await import(process.argv[2] ?? 'playwright')
const origins = [], errors = []
const gateway = createAsrGateway({ allowedOrigins: origins, allowLegacyAsr: false,
  serveWebsite: createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))),
  connectUpstream() { throw Error('头像验收禁止真实ASR') },
})
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const origin = `http://127.0.0.1:${gateway.server.address().port}`; origins.push(origin)
const output = new URL('../artifacts/room-avatars/', import.meta.url); await mkdir(output, { recursive: true })
let browser
async function pageFor(width, height, remembered) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 768, isMobile: width < 768 })
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  if (remembered) await context.addInitScript(rooms => { if (!localStorage.getItem('hakisub.rooms.v1')) localStorage.setItem('hakisub.rooms.v1', rooms) }, remembered)
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message))
  return page
}
async function join(page, code) { await page.goto(origin + '/' + code + '/'); await page.locator('form button[type=submit]').click(); await page.locator('.room-stage').waitFor() }
async function expectAvatar(page, id) { await page.locator(`.room-avatar [data-avatar-id="${id}"]`).waitFor() }
async function longPress(page, touch = false) {
  const bounds = await page.locator('.room-avatar').boundingBox(), point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  if (touch) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }); await page.waitForTimeout(650)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach()
  } else { await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up() }
  await page.getByRole('menu', { name: '更换房间头像', exact: true }).waitFor()
  assert.equal(await page.getByRole('dialog', { name: '房间设置', exact: true }).count(), 0, '长按松手不误开设置')
}
try {
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  const owner = await pageFor(1280, 900)
  await owner.goto(origin); await owner.getByRole('button', { name: '创建房间', exact: true }).click()
  await owner.getByLabel('输入房间名称', { exact: true }).fill('朋友的交流室'); await owner.locator('form button[type=submit]').click(); await owner.locator('.room-stage').waitFor()
  const code = /\d{6}/.exec(new URL(owner.url()).pathname)[0]
  await expectAvatar(owner, 'home')
  await owner.locator('.room-avatar').click(); await owner.getByRole('dialog', { name: '房间设置', exact: true }).waitFor()
  await owner.getByRole('button', { name: '关闭设置', exact: true }).click()
  await owner.locator('.room-avatar').click({ button: 'right' })
  const menu = owner.getByRole('menu', { name: '更换房间头像', exact: true })
  await menu.waitFor(); assert.equal(await menu.getByRole('menuitemradio').count(), 4); assert.equal(await menu.getByRole('menuitem', { name: '更多', exact: true }).count(), 1)
  await owner.screenshot({ path: fileURLToPath(new URL('quick-menu-desktop.png', output)) })
  await menu.getByRole('menuitemradio', { name: '使用猫咪头像', exact: true }).click(); await expectAvatar(owner, 'cat'); await menu.waitFor({ state: 'detached' })
  const member = await pageFor(390, 844); await join(member, code); await expectAvatar(member, 'cat')
  await member.locator('.room-avatar').click({ button: 'right' })
  await member.getByText('仅房主可更换房间头像。', { exact: true }).waitFor(); assert.equal(await member.locator('.room-avatar-menu').count(), 0)
  await longPress(owner)
  await menu.getByRole('menuitem', { name: '更多', exact: true }).click()
  const library = owner.getByRole('dialog', { name: '房间头像', exact: true })
  await library.waitFor(); assert.equal(await library.evaluate(element => element.matches(':modal')), true)
  assert.equal(await library.getByRole('button', { name: /^使用.+头像$/ }).count(), 8)
  await owner.screenshot({ path: fileURLToPath(new URL('avatar-library-desktop.png', output)) })
  await library.getByRole('button', { name: '使用星星头像', exact: true }).click(); await expectAvatar(owner, 'star'); await expectAvatar(member, 'star')
  await owner.locator('.room-avatar').focus(); await owner.keyboard.press('Shift+F10'); await menu.waitFor()
  await owner.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '使用房屋头像')
  await owner.keyboard.press('ArrowRight'); await owner.keyboard.press('Enter'); await expectAvatar(owner, 'cat'); await expectAvatar(member, 'cat')
  const remembered = await owner.evaluate(() => localStorage.getItem('hakisub.rooms.v1'))
  for (const [width, height, id, label] of [[390, 844, 'book', '书本'], [320, 568, 'coffee', '咖啡']]) {
    const phone = await pageFor(width, height, remembered); await join(phone, code)
    await longPress(phone, true)
    const bounds = await phone.locator('.room-avatar-menu').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    await phone.screenshot({ path: fileURLToPath(new URL(`quick-menu-${width}.png`, output)) })
    await phone.getByRole('menuitemradio', { name: `使用${label}头像`, exact: true }).click(); await expectAvatar(phone, id); await expectAvatar(owner, id); await expectAvatar(member, id)
    await longPress(phone, true); await phone.getByRole('menuitem', { name: '更多', exact: true }).click()
    await phone.getByRole('dialog', { name: '房间头像', exact: true }).waitFor()
    assert.equal(await phone.locator('.room-avatar-library').evaluate(element => element.scrollWidth <= element.clientWidth), true)
    await phone.screenshot({ path: fileURLToPath(new URL(`avatar-library-${width}.png`, output)) })
    await phone.keyboard.press('Escape'); assert.equal(await phone.locator('.room-avatar-library').count(), 0)
    await phone.locator('.room-avatar').tap(); await phone.getByRole('dialog', { name: '房间设置', exact: true }).waitFor()
    await phone.getByRole('button', { name: '关闭设置', exact: true }).click()
    await phone.getByRole('button', { name: '退出房间', exact: true }).click()
    await phone.locator(`.home-room-avatar [data-avatar-id="${id}"]`).waitFor()
    const geometry = await phone.locator('.home-room-card').first().evaluate(card => { const a = card.querySelector('.home-room-avatar').getBoundingClientRect(), c = card.getBoundingClientRect(); return { center: Math.abs(a.x + a.width / 2 - c.x - c.width / 2), size: a.width } })
    assert.ok(geometry.center < 1 && geometry.size >= 80)
    await phone.screenshot({ path: fileURLToPath(new URL(`home-card-${width}.png`, output)) })
    await phone.getByRole('button', { name: '房间列表', exact: true }).click()
    await phone.locator(`.home-list-avatar [data-avatar-id="${id}"]`).waitFor()
    await phone.screenshot({ path: fileURLToPath(new URL(`room-list-${width}.png`, output)) })
    await phone.reload(); await phone.locator(`.home-room-avatar [data-avatar-id="${id}"]`).waitFor()
    await phone.context().close()
  }
  await owner.getByRole('button', { name: '退出房间', exact: true }).click(); await owner.locator('.home-room-avatar [data-avatar-id="coffee"]').waitFor()
  await owner.screenshot({ path: fileURLToPath(new URL('home-card-desktop.png', output)) })
  assert.deepEqual(errors, [])
  console.log('通过：默认房屋、右键/鼠标长按/触屏长按/键盘、四头像加更多、模态头像库、普通点击仍设置、房主权限、跨成员即时同步、首页卡片居中放大与列表一致、刷新保留；1280/390/320px。仅隔离合成房间。')
} finally { await browser?.close(); await gateway.close() }
