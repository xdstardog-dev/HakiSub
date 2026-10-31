// 构建后运行；隔离本地房间、假 Web Speech 和浏览器时钟，不访问真实麦克风/豆包。
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { createStaticWebsite } from '../server/staticWebsite.mjs'

const { chromium } = await import(process.argv[2] ?? 'playwright')
const origins = [], peers = [], errors = []
const gateway = createAsrGateway({ allowedOrigins: origins, allowLegacyAsr: false,
  serveWebsite: createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))),
  connectUpstream() { throw Error('收束测试不得请求真实豆包') },
})
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const origin = `http://127.0.0.1:${gateway.server.address().port}`
origins.push(origin)
const output = new URL('../artifacts/member-controls/', import.meta.url)
await mkdir(output, { recursive: true })
let browser
async function joinPeer(code, name) {
  const peer = new WebSocket(`${origin.replace('http:', 'ws:')}/api/rooms`, { origin })
  peers.push(peer)
  await once(peer, 'open')
  const joined = once(peer, 'message')
  peer.send(JSON.stringify({ type: 'join', name, code }))
  await joined
  return event => peer.send(JSON.stringify(event))
}
const own = page => page.locator('.member-tile').filter({ has: page.locator('h2 small') })
const ownAvatar = page => page.getByRole('button', { name: '展开游客的卡片（我），保持闭麦，长按或右键发送快捷回应', exact: true })
async function blur(page) { await page.evaluate(() => document.activeElement?.blur()) }
async function validateLayout(page) {
  const geometry = await page.locator('.member-caption-surface').evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const cards = [...element.querySelectorAll('.member-tile')].map(card => {
      const rect = card.getBoundingClientRect(), heading = card.querySelector('.tile-heading').getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, headingBottom: heading.bottom,
        actionBottom: card.querySelector('.start-typing')?.getBoundingClientRect().bottom ?? rect.bottom,
        textHeight: card.querySelector('.tile-text').getBoundingClientRect().height }
    })
    return { bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }, cards, width: innerWidth, height: innerHeight }
  })
  const { bounds, cards } = geometry
  assert.ok(bounds.left >= 0 && bounds.right <= geometry.width && bounds.top >= 0 && bounds.bottom <= geometry.height, JSON.stringify(geometry))
  for (const card of cards) assert.ok(card.left >= bounds.left - 1 && card.right <= bounds.right + 1 && card.top >= bounds.top - 1 && card.bottom <= bounds.bottom + 1 && card.headingBottom <= card.bottom + 1 && card.actionBottom <= card.bottom + 1 && card.textHeight >= 20, JSON.stringify(geometry))
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j]
    assert.ok(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1, '展开卡片不能重叠')
  }
}
async function dismissComposer(page) {
  const width = page.viewportSize().width
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await page.touchscreen.tap(width - 2, 80)
  else await page.mouse.click(width - 2, 80)
  await page.locator('.typing-composer').waitFor({ state: 'detached' })
}
try {
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  for (const [width, height] of [[480, 900], [390, 844], [320, 568]]) {
    const mobile = width < 480
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile })
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
    await context.addInitScript(() => {
      window.testStarts = 0
      window.SpeechRecognition = class {
        constructor() { window.testRecognition = this }
        start() { window.testStarts++; queueMicrotask(() => this.onstart?.()) }
        abort() {}
      }
    })
    const page = await context.newPage()
    const cdp = mobile ? await context.newCDPSession(page) : null
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install()
    await page.goto(origin + '/?debug=1')
    await page.getByRole('button', { name: '创建房间', exact: true }).click()
    await page.getByLabel('输入房间名称', { exact: true }).fill('Self')
    await page.locator('form button[type="submit"]').click()
    await page.getByRole('checkbox', { name: '动态自适应布局', exact: true }).uncheck()
    const code = /\d{6}/.exec(new URL(page.url()).pathname)[0]
    const senders = []
    for (let index = 0; index < 7; index++) senders.push(await joinPeer(code, `Peer${index}`))
    await page.waitForFunction(() => document.querySelectorAll('.member-tile').length === 8)
    // 以浏览器的模拟时钟为基准，避免建房请求耗时后主进程时间落在过去。
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await blur(page)
    await page.clock.fastForward(4050)
    assert.equal(await page.locator('.contracted-member').count(), 0, '未满5秒不能收起')
    await page.clock.fastForward(1100)
    assert.equal(await page.locator('.contracted-member').count(), 8)
    assert.equal(await page.locator('.member-tile').count(), 0)
    const idlePanelBounds = await page.locator('.grid-empty').boundingBox()
    const row = await page.locator('.contracted-members').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, rows: new Set([...element.children].map(child => child.getBoundingClientRect().top)).size }))
    assert.equal(row.rows, 1); if (mobile) assert.ok(row.scrollWidth > row.width, '窄屏头像单行横向滚动')
    const otherAvatar = page.getByRole('button', { name: 'Peer1，闭麦，长按或右键发送快捷回应', exact: true })
    if (mobile) await otherAvatar.tap()
    else await otherAvatar.click()
    assert.equal(await page.locator('.member-tile').count(), 0, '点击/轻触他人头像不能展开卡片')
    assert.equal(await page.locator('.reaction-menu').count(), 0, '轻触不能打开回应菜单')
    await otherAvatar.press('Enter')
    assert.equal(await page.locator('.member-tile').count(), 0, '键盘激活他人头像不能展开卡片')
    // 触屏轻触后的系统 contextmenu 抑制窗结束后，再独立验证鼠标右键。
    await page.clock.fastForward(1000)
    await otherAvatar.click({ button: 'right' })
    await page.getByRole('button', { name: '👍 赞同', exact: true }).click()
    await page.locator('.contracted-reaction').waitFor()
    assert.equal(await page.locator('.member-tile').count(), 0, '头像回应不自动展开卡片')
    assert.match(await page.locator('.contracted-reaction').getAttribute('aria-label'), /游客 赞同了 Peer1/)
    const avatarBox = await otherAvatar.boundingBox(), avatarCenter = { x: avatarBox.x + avatarBox.width / 2, y: avatarBox.y + avatarBox.height / 2 }
    if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [avatarCenter] })
    else { await page.mouse.move(avatarCenter.x, avatarCenter.y); await page.mouse.down() }
    await page.clock.fastForward(600)
    if (mobile) {
      await page.getByRole('dialog', { name: '快捷回应' }).waitFor()
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      assert.equal(await page.locator('.member-tile').count(), 0, '长按松手也不能展开他人卡片')
      await page.getByRole('dialog', { name: '快捷回应' }).getByRole('button', { name: '取消', exact: true }).click()
    } else await page.mouse.up()
    await page.clock.fastForward(1000)
    await ownAvatar(page).click({ button: 'right' })
    await page.getByRole('dialog', { name: '快捷回应' }).waitFor()
    assert.equal(await page.locator('.member-tile').count(), 0, '右键自己的收起头像不展开卡片')
    await page.keyboard.press('Escape')
    if (mobile) {
      const ownBox = await ownAvatar(page).boundingBox()
      const ownCenter = { x: ownBox.x + ownBox.width / 2, y: ownBox.y + ownBox.height / 2 }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ownCenter] })
      await page.clock.fastForward(600)
      await page.getByRole('dialog', { name: '快捷回应' }).waitFor()
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      assert.equal(await page.locator('.member-tile').count(), 0, '长按自己的收起头像松手不展开卡片')
      await page.getByRole('dialog', { name: '快捷回应' }).getByRole('button', { name: '取消', exact: true }).click()
    }
    await page.screenshot({ path: fileURLToPath(new URL(`all-muted-${width}.png`, output)) })
    await ownAvatar(page).click()
    // Vue 会忽略早于监听器挂载的冒泡事件；冻结时钟后需跨过新控件的挂载毫秒。
    await page.clock.fastForward(10)
    const singleCardBounds = await own(page).boundingBox()
    for (const edge of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(idlePanelBounds[edge] - singleCardBounds[edge]) < 1, '空闲隔层与单人卡片占用同一范围')
    assert.equal(await own(page).locator('.tile-status').innerText(), '麦克风关闭')
    assert.equal(await page.evaluate(() => window.testStarts), 0, '展开不能采音')
    await page.getByLabel('识别来源').selectOption('browser')
    const mic = own(page).locator('.tile-mic')
    await mic.click(); await own(page).getByText('麦克风开启', { exact: true }).waitFor()
    await mic.click(); await own(page).getByText('麦克风关闭', { exact: true }).waitFor()
    assert.equal(await page.locator('.typing-composer').count(), 0, '短按不进入打字')
    await page.clock.fastForward(4050); assert.equal(await own(page).count(), 1)
    await page.clock.fastForward(1100); assert.equal(await own(page).count(), 0, '指针点击留下的按钮焦点不能阻止收束')
    await page.clock.fastForward(10)
    await ownAvatar(page).click(); await page.clock.fastForward(10)
    // 桌面右键和键盘可达，打开选项不改变闭麦状态。
    await mic.click({ button: 'right' })
    await page.getByRole('menu', { name: '输入方式' }).waitFor()
    assert.equal(await page.getByRole('menuitem', { name: '切换打字', exact: true }).innerText(), '', '键盘选项没有可见文字')
    await page.screenshot({ path: fileURLToPath(new URL('keyboard-option-' + width + '.png', output)) })
    await page.keyboard.press('Escape')
    await mic.press('ArrowLeft')
    await page.getByRole('menuitem', { name: '切换打字', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    // 真实 Pointer Events：手机走 CDP 触摸，桌面使用鼠标按住。
    const box = await mic.boundingBox(), start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    else { await page.mouse.move(start.x, start.y); await page.mouse.down() }
    await page.clock.fastForward(600)
    await page.getByRole('menu', { name: '输入方式' }).waitFor()
    if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    else await page.mouse.up()
    assert.equal(await own(page).locator('.tile-status').innerText(), '麦克风关闭')
    assert.equal(await page.evaluate(() => window.testStarts), 1, '长按松手不额外开麦')
    await page.getByRole('menuitem', { name: '切换打字', exact: true }).click()
    await page.getByLabel('输入字幕', { exact: true }).waitFor()
    assert.equal(await own(page).locator('.mode-options-trigger').count(), 0)
    assert.equal(await page.locator('.room-bottom-bar .mode-options-trigger').count(), 0)
    const input = page.getByLabel('输入字幕', { exact: true })
    assert.equal(await page.getByRole('button', { name: '收起输入框', exact: true }).count(), 0)
    await input.fill('点击空白后保留草稿')
    const blank = own(page).locator('.tile-text')
    if (mobile) await blank.tap({ position: { x: 5, y: 5 } })
    else await blank.click({ position: { x: 5, y: 5 } })
    await page.locator('.typing-composer').waitFor({ state: 'detached' })
    await page.clock.fastForward(10)
    if (mobile) await blank.tap({ position: { x: 5, y: 5 } })
    else await blank.click({ position: { x: 5, y: 5 } })
    assert.equal(await input.inputValue(), '点击空白后保留草稿', '空白点击收起不立即重开，下一次点击继续原草稿')
    await page.clock.fastForward(10)
    if (mobile) await input.tap()
    else await input.click()
    assert.equal(await page.locator('.typing-composer').count(), 1, '框内点击继续编辑')
    await page.locator('.typing-composer').screenshot({ path: fileURLToPath(new URL('composer-compact-' + width + '.png', output)) })
    await dismissComposer(page)
    await mic.click({ button: 'right' }); assert.equal(await page.locator('.member-mode-menu').count(), 0)
    await page.locator('.room-bottom-bar .tile-mic').click({ button: 'right' }); assert.equal(await page.locator('.member-mode-menu').count(), 0)
    await page.screenshot({ path: fileURLToPath(new URL('typing-mode-' + width + '.png', output)) })
    await mic.click(); assert.equal(await own(page).locator('.tile-status').innerText(), '麦克风关闭')
    assert.equal(await page.evaluate(() => window.testStarts), 1, '退出打字先闭麦')
    // 再次长按后左滑，只有松手命中选项才进入打字。
    if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    else { await page.mouse.move(start.x, start.y); await page.mouse.down() }
    await page.clock.fastForward(600)
    const option = await page.getByRole('menuitem', { name: '切换打字', exact: true }).boundingBox()
    const target = { x: option.x + option.width / 2, y: option.y + option.height / 2 }
    if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [target] })
    else await page.mouse.move(target.x, target.y)
    assert.equal(await own(page).locator('.tile-status').innerText(), '麦克风关闭')
    if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    else await page.mouse.up()
    await page.getByLabel('输入字幕', { exact: true }).waitFor()
    await dismissComposer(page)
    await mic.click(); await blur(page)
    await page.clock.fastForward(4050)
    assert.equal(await own(page).count(), 1, '恢复后重新计时')
    // 收起成员出现字幕即恢复；字幕自然消失后仍需完整5秒。
    senders[0]({ type: 'mode', mode: 'typing' })
    senders[0]({ type: 'typed-caption', utteranceId: randomUUID(), text: '重新出现的字幕' })
    senders[0]({ type: 'mode', mode: 'muted' })
    await page.getByText('重新出现的字幕', { exact: true }).waitFor()
    await page.clock.fastForward(5050)
    assert.equal(await page.getByText('重新出现的字幕', { exact: true }).count(), 0)
    const peerTile = page.locator('.member-tile').filter({ has: page.getByRole('heading', { name: 'Peer0', exact: true }) })
    await page.clock.fastForward(4050); assert.equal(await peerTile.count(), 1)
    await page.clock.fastForward(1100); assert.equal(await peerTile.count(), 0)
    // 自己收起后仍能用常驻底部控件直接进入打字，卡片立即恢复。
    await page.locator('.room-bottom-bar .mode-options-trigger').click()
    await page.getByRole('menuitem', { name: '切换打字', exact: true }).click()
    await dismissComposer(page)
    assert.equal(await own(page).count(), 1)
    await blur(page); await page.clock.fastForward(15000)
    assert.equal(await own(page).count(), 1, '打字无发送也不收起')
    await validateLayout(page)
    await page.getByRole('checkbox', { name: /动态自适应布局|固定等分布局/ }).check()
    await page.clock.fastForward(700)
    await validateLayout(page)
    await page.screenshot({ path: fileURLToPath(new URL(`active-${width}.png`, output)) })
    await context.close()
  }
  assert.deepEqual(errors, [])
  console.log('通过：Chrome 480/390/320px八成员全收束/单行滚动、头像展开不启麦、短按开关/退出打字闭麦、右键/键盘/真实鼠标及触摸长按防误触、左滑松手确认、字幕恢复和消失后完整5秒、常驻控件恢复、固定/动态布局边界与截图。未使用物理手机、真实麦克风或豆包。')
} finally {
  await browser?.close()
  peers.forEach(peer => peer.terminate())
  await gateway.close()
}
