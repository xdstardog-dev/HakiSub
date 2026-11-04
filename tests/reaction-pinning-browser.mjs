import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { createStaticWebsite } from '../server/staticWebsite.mjs'
const { chromium } = await import(process.argv[2] ?? 'playwright')
const origins = []
const gateway = createAsrGateway({ allowedOrigins: origins, allowLegacyAsr: false,
  serveWebsite: createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))),
  connectUpstream() { throw Error('不得调用真实ASR') },
})
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const origin = `http://127.0.0.1:${gateway.server.address().port}`; origins.push(origin)
let browser
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 320, height: 568 } : { width: 1024, height: 768 }, hasTouch: mobile, isMobile: mobile })
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
    const page = await context.newPage()
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + '/?debug=1')
    await page.getByRole('button', { name: '创建房间', exact: true }).click()
    await page.getByLabel('输入房间名称', { exact: true }).fill('回应测试')
    await page.locator('form button[type="submit"]').click()
    const target = page.locator('.member-tile, .contracted-member').first()
    async function open() {
      if (!mobile) await target.click({ button: 'right' })
      else {
        const rect = await target.boundingBox()
        await target.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 9, isPrimary: true, clientX: rect.x + 20, clientY: rect.y + 30, bubbles: true })
        await page.getByRole('dialog', { name: '快捷回应', exact: true }).waitFor()
        await target.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 9, bubbles: true })
      }
    }
    await open()
    const options = page.locator('.reaction-menu-options'), settingsTrigger = options.getByRole('button', { name: '设置', exact: true })
    const reactionButtons = options.locator('button:not(.reaction-settings-trigger)')
    assert.equal(await reactionButtons.count(), 13)
    assert.equal(await page.locator('.reaction-menu').getByRole('button', { name: '取消', exact: true }).count(), 0)
    const bounds = await options.boundingBox(), settingsBounds = await settingsTrigger.boundingBox()
    assert.ok(settingsBounds.y >= bounds.y + bounds.height, '设置初始位于滚动区域下方')
    if (mobile) await page.touchscreen.tap(1, 1)
    else await page.mouse.click(1, 1)
    assert.equal(await page.locator('.reaction-menu').count(), 0, '点击外部等同取消')
    await open()
    if (mobile) {
      const session = await context.newCDPSession(page), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height - 12
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      for (let i = 1; i <= 6; i++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 20 }] })
        await page.waitForTimeout(20)
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach()
    } else { await options.hover(); await page.mouse.wheel(0, 300) }
    await page.waitForFunction(() => document.querySelector('.reaction-menu-options')?.scrollTop > 0)
    assert.equal(await page.locator('.reaction-menu').count(), 1, '滚动保留菜单')
    await options.getByRole('button', { name: '🤝 不对', exact: true }).click()
    await page.locator('.reaction-bubble, .contracted-reaction').filter({ hasText: /不对|🤝/ }).waitFor()
    await open()
    await options.evaluate(element => { element.scrollTop = element.scrollHeight })
    const endBounds = await options.boundingBox(), triggerBounds = await settingsTrigger.boundingBox()
    assert.ok(triggerBounds.y >= endBounds.y && triggerBounds.y + triggerBounds.height <= endBounds.y + endBounds.height + 1, '滑到最下可看到设置')
    await settingsTrigger.click()
    const settings = page.getByRole('dialog', { name: '置顶回应设置', exact: true })
    assert.deepEqual(await settings.locator('.pin-order').allTextContents(), ['1', '2', '3', '4', '5', '', '', '', '', '', '', '', ''])
    assert.doesNotMatch(await settings.innerText(), /你需要|从词库|只影响|先取消|关闭/)
    await settings.getByRole('button', { name: /^反对，/ }).click()
    await settings.getByRole('button', { name: /^谢谢，/ }).click()
    await settings.getByRole('button', { name: '保存', exact: true }).click()
    await open()
    assert.deepEqual((await reactionButtons.allTextContents()).slice(0, 5).map(text => text.trim()), ['👍 赞同', '❓ 疑问', '✅ 收到', '😅 闹麻了', '🙏 谢谢'])
    assert.equal(await reactionButtons.count(), 13)
    await settingsTrigger.click()
    await mkdir(new URL('../artifacts/reaction-pinning/', import.meta.url), { recursive: true })
    await page.screenshot({ path: fileURLToPath(new URL(`../artifacts/reaction-pinning/${mobile ? 'mobile' : 'desktop'}.png`, import.meta.url)) })
    await settings.getByRole('button', { name: '关闭回应设置', exact: true }).click()
    assert.equal(await settings.count(), 0)
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log('通过：桌面滚轮、320px移动视口真实触摸事件滑动、完整词库和未置顶发送、点击外部取消及列表底部设置、1～5编号及置顶顺序、精简文案和×关闭。未验收物理手机、真实API或麦克风。')
} finally {
  await browser?.close(); await gateway.close()
}
