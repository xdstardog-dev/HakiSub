// 可选真浏览器联调：npm run test:room-interactions:browser -- <playwright 模块名或 file: URL>
// 先 npm run build；使用临时端口/内存房间和假 Web Speech，不读取 .env 或现有数据。
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { createStaticWebsite } from '../server/staticWebsite.mjs'

const { chromium } = await import(process.argv[2] ?? 'playwright')
const origins = []
const gateway = createAsrGateway({ allowedOrigins: origins, allowLegacyAsr: false,
  serveWebsite: createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))),
  connectUpstream() { throw Error('浏览器联调不得请求真实豆包') },
})
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const origin = `http://127.0.0.1:${gateway.server.address().port}`
origins.push(origin)
let browser
const errors = []
const peers = []
async function openPage(mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 480, height: 900 }, hasTouch: mobile, isMobile: mobile })
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  await context.addInitScript(() => {
    window.testAbortCount = 0
    window.testToneStarts = 0
    const createBufferSource = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = createBufferSource.apply(this, args), start = source.start.bind(source)
      source.start = (...values) => { const result = start(...values); window.testToneStarts++; return result }
      return source
    }
    window.SpeechRecognition = class {
      constructor() { window.testRecognition = this }
      start() { queueMicrotask(() => this.onstart?.()) }
      abort() { window.testAbortCount++ }
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  return page
}
async function enter(page, name, code) {
  await page.goto(origin + '/?debug=1')
  await page.evaluate(([name, code]) => localStorage.setItem('hakisub.rooms.v1', JSON.stringify([{ code: code || '100000', name }])), [name, code])
  await page.goto(origin + (code ? `/${code}/?debug=1` : '/?debug=1'))
  if (!code) {
    const create = page.getByRole('button', { name: '创建房间', exact: true })
    await create.focus(); await create.press('Enter')
  }
  if (!code) await page.getByLabel('输入房间名称', { exact: true }).fill(name)
  await page.locator('form button[type="submit"]').click()
  await page.locator('.member-tile').first().waitFor()
  // 本套件保留原固定布局场景；新默认动态及两种切换由重构与控件专项覆盖。
  await page.getByRole('checkbox', { name: '动态自适应布局', exact: true }).uncheck()
}
const selfTile = page => page.locator('.member-tile').filter({ has: page.locator('h2 small') })
const captionWith = (page, text) => page.locator('.caption-message').filter({ hasText: text })
const reactionWith = (page, text) => page.locator('.reaction-bubble').filter({ hasText: text }).or(page.getByLabel(text, { exact: true }))
async function expandOwnMember(page, name) {
  const avatar = page.getByRole('button', { name: new RegExp(`^展开${name}的卡片`) })
  if (await avatar.count()) await avatar.click()
}
async function selectTyping(page, tile) {
  if (!await tile.locator('.mode-options-trigger').count()) { await tile.locator('.start-typing').click(); return }
  await tile.locator('.mode-options-trigger').click()
  await page.getByRole('menuitem', { name: '切换打字', exact: true }).click()
}
async function dismissComposer(page) {
  const width = page.viewportSize().width
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await page.touchscreen.tap(width - 2, 80)
  else await page.mouse.click(width - 2, 80)
  await page.locator('.typing-composer').waitFor({ state: 'detached' })
}
try {
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  const alice = await openPage(), bob = await openPage(true), other = await openPage(), observer = await openPage()
  await enter(alice, 'A')
  const code = /\d{6}/.exec(new URL(alice.url()).pathname)[0]
  await enter(bob, 'B', code); await enter(other, 'C')
  await enter(observer, 'Observer', code)
  const assets = await alice.evaluate(async () => {
    const slots = await (await fetch('/sounds/reactions/slots.json')).json()
    const audio = new AudioContext(), decoded = []
    try {
      for (const file of new Set([slots.default, ...Object.values(slots.reactions)])) {
        const response = await fetch(`/sounds/reactions/${file}`)
        if (!response.ok || !response.headers.get('content-type')?.includes('audio/mpeg')) throw Error(`Invalid MP3 response: ${file}`)
        const buffer = await audio.decodeAudioData(await response.arrayBuffer())
        const pcm = buffer.getChannelData(0)
        decoded.push({ file, duration: buffer.duration, peak: pcm.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) })
      }
      return decoded
    } finally { await audio.close() }
  })
  assert.ok(assets.length > 0 && assets.length <= 14, '槽位可共用通用素材，不要求14个不同文件')
  assert.ok(assets.every(asset => asset.duration > 0 && asset.duration <= 5 && Number.isFinite(asset.peak) && asset.peak > 0), JSON.stringify(assets))
  // 全局音效入口、音量与本机静音；试听仅在本机，不发送回应。
  await alice.getByRole('button', { name: '全局音效设置', exact: true }).click()
  const soundSettings = alice.getByRole('dialog', { name: '全局音效', exact: true })
  await soundSettings.waitFor()
  await soundSettings.getByLabel('音效音量').evaluate(element => { element.value = '25'; element.dispatchEvent(new Event('input', { bubbles: true })) })
  await soundSettings.getByRole('button', { name: '试听音效', exact: true }).click()
  await alice.waitForFunction(() => window.testToneStarts === 1)
  await soundSettings.getByLabel('试听内容').selectOption('question')
  await soundSettings.getByRole('button', { name: '试听音效', exact: true }).click()
  await alice.waitForFunction(() => window.testToneStarts === 2)
  await soundSettings.getByLabel('试听内容').selectOption('default')
  assert.equal(await bob.evaluate(() => window.testToneStarts), 0)
  assert.equal(await observer.evaluate(() => window.testToneStarts), 0)
  assert.equal(await alice.locator('.reaction-bubble').count(), 0)
  await soundSettings.getByRole('checkbox', { name: '启用快捷回应音效' }).uncheck()
  assert.equal(await soundSettings.getByRole('button', { name: '试听音效' }).isDisabled(), true)
  await soundSettings.getByRole('checkbox', { name: '启用快捷回应音效' }).check()
  await soundSettings.getByRole('button', { name: '关闭音效设置' }).click()
  await bob.getByRole('button', { name: '全局音效设置', exact: true }).tap()
  const mobileSoundSettings = bob.getByRole('dialog', { name: '全局音效', exact: true })
  await mobileSoundSettings.getByRole('checkbox', { name: '启用快捷回应音效' }).uncheck()
  await mobileSoundSettings.getByRole('button', { name: '关闭音效设置' }).tap()
  const own = selfTile(alice)
  await expandOwnMember(alice, 'A')
  await selectTyping(alice, own)
  await own.getByText('打字模式', { exact: true }).waitFor()
  const input = alice.getByLabel('输入字幕', { exact: true })
  await input.fill('中文输入法测试')
  await input.press('Shift+Enter'); await input.press('End'); await input.type('second line')
  assert.match(await input.inputValue(), /\n/)
  assert.equal(await bob.locator('.caption-message').count(), 0, '草稿与换行只在本地')
  await input.dispatchEvent('compositionstart')
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true })
  await input.dispatchEvent('compositionend')
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })
  assert.equal(await bob.locator('.caption-message').count(), 0)
  await alice.waitForTimeout(80)
  await input.press('Enter')
  await captionWith(bob, '中文输入法测试').waitFor()
  await captionWith(alice, '中文输入法测试').waitFor()
  await alice.waitForFunction(() => document.querySelector('textarea')?.value === '')
  assert.equal(await other.locator('.caption-message').count(), 0)
  assert.match(await captionWith(bob, '中文输入法测试').innerText(), /\n/)

  // 桌面左键不打开，右键闭麦 B 打开回应；自己的输入保留原生菜单。
  const bobTile = alice.locator('.member-tile').filter({ has: alice.getByRole('heading', { name: 'B', exact: true }) }).or(alice.locator('.contracted-member').filter({ has: alice.getByRole('button', { name: 'B，闭麦，长按或右键发送快捷回应', exact: true }) }))
  const selfContextAllowed = await input.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
  assert.equal(selfContextAllowed, true, '自己的输入保留原生菜单')
  assert.equal(await alice.locator('.reaction-menu').count(), 0)
  await bobTile.locator('.tile-identity, .member-avatar').click()
  assert.equal(await alice.locator('.reaction-menu').count(), 0, '桌面左键不弹回应菜单')
  await bobTile.locator('.tile-identity, .member-avatar').click({ button: 'right' })
  assert.equal(await alice.getByRole('button', { name: '😆 闹麻了', exact: true }).count(), 1)
  assert.equal(await alice.locator('.reaction-menu > button').count(), 5)
  const footer = await alice.locator('.reaction-menu-footer').evaluate(element => {
    const [cancel, settings] = element.querySelectorAll('button')
    return { cancel: cancel.getBoundingClientRect().right, settings: settings.getBoundingClientRect().left }
  })
  assert.ok(footer.cancel <= footer.settings, '取消在左，设置在右')
  await alice.getByRole('button', { name: '👍 赞同', exact: true }).click()
  await reactionWith(bob, '👍 A 赞同了 B').waitFor()
  await reactionWith(alice, '👍 A 赞同了 B').waitFor()
  await alice.waitForFunction(() => window.testToneStarts === 3)
  await observer.waitForFunction(() => window.testToneStarts === 1)
  assert.equal(await bob.evaluate(() => window.testToneStarts), 0, '本机静音保留气泡')
  assert.equal(await other.evaluate(() => window.testToneStarts), 0, '其他房间不播放')
  assert.equal(await other.locator('.reaction-bubble').count(), 0)
  assert.equal(await alice.locator('.reaction-menu').count(), 0)

  await bob.getByRole('button', { name: '全局音效设置', exact: true }).tap()
  await mobileSoundSettings.getByRole('checkbox', { name: '启用快捷回应音效' }).check()
  await mobileSoundSettings.getByRole('button', { name: '试听音效', exact: true }).tap()
  await bob.waitForFunction(() => window.testToneStarts === 1)
  await mobileSoundSettings.getByRole('button', { name: '关闭音效设置' }).tap()

  // 移动端轻触不打开，长按打开；系统 contextmenu 被取消。
  const remote = bob.locator('.member-tile').filter({ has: bob.getByRole('heading', { name: 'A', exact: true }) })
  const remoteText = remote.locator('.tile-text')
  await remoteText.tap()
  assert.equal(await bob.locator('.reaction-menu').count(), 0)
  await remote.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: 50, clientY: 250, bubbles: true })
  await bob.getByRole('dialog', { name: '快捷回应' }).waitFor()
  const contextPrevented = await remote.evaluate(element => !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
  assert.equal(contextPrevented, true)
  await remote.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, bubbles: true })
  await bob.getByRole('button', { name: '✅ 收到', exact: true }).tap()
  await reactionWith(alice, '✅ B 收到了 A').waitFor()
  await bob.waitForFunction(() => window.testToneStarts === 2)
  await observer.waitForFunction(() => window.testToneStarts === 2)
  await bob.waitForTimeout(2700)
  assert.equal(await alice.locator('.reaction-bubble').count(), 0)
  assert.equal(await bob.locator('.reaction-bubble').count(), 0)

  // 个人词库配置只影响自己的菜单，新词仍向所有同房成员广播。
  await bobTile.locator('.tile-identity, .member-avatar').click({ button: 'right' })
  await alice.locator('.reaction-menu').getByRole('button', { name: '设置', exact: true }).click()
  const reactionSettings = alice.getByRole('dialog', { name: '你需要哪五个词汇？' })
  await reactionSettings.waitFor()
  assert.equal(await alice.locator('.reaction-menu').count(), 0)
  assert.equal(await reactionSettings.getByRole('checkbox', { name: '谢谢', exact: true }).isDisabled(), true)
  await reactionSettings.getByRole('checkbox', { name: '反对', exact: true }).uncheck()
  await reactionSettings.getByRole('checkbox', { name: '谢谢', exact: true }).check()
  assert.match(await reactionSettings.getByRole('status').innerText(), /已选 5 \/ 5/)
  await reactionSettings.getByRole('button', { name: '保存', exact: true }).click()
  await bobTile.locator('.tile-identity, .member-avatar').click({ button: 'right' })
  assert.equal(await alice.locator('.reaction-menu > button').count(), 5)
  assert.equal(await alice.getByRole('button', { name: '👎 反对', exact: true }).count(), 0)
  await alice.getByRole('button', { name: '🙏 谢谢', exact: true }).click()
  await reactionWith(bob, '🙏 A 对 B：谢谢').waitFor()
  assert.deepEqual(await alice.evaluate(() => JSON.parse(localStorage.getItem('hakisub.reaction-selection.v1'))), ['agree', 'question', 'received', 'fun', 'thanks'])
  assert.equal(await bob.evaluate(() => localStorage.getItem('hakisub.reaction-selection.v1')), null)
  await remote.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 8, isPrimary: true, clientX: 50, clientY: 250, bubbles: true })
  await bob.getByRole('dialog', { name: '快捷回应' }).waitFor()
  await remote.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 8, bubbles: true })
  assert.equal(await bob.getByRole('button', { name: '👎 反对', exact: true }).count(), 1)
  assert.equal(await bob.getByRole('button', { name: '🙏 谢谢', exact: true }).count(), 0)
  await bob.locator('.reaction-menu').getByRole('button', { name: '设置', exact: true }).tap()
  const mobileSettings = bob.getByRole('dialog', { name: '你需要哪五个词汇？' })
  const settingsBounds = await mobileSettings.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight }
  })
  assert.ok(settingsBounds.left >= 0 && settingsBounds.top >= 0 && settingsBounds.right <= settingsBounds.width && settingsBounds.bottom <= settingsBounds.height, JSON.stringify(settingsBounds))
  await mobileSettings.getByRole('checkbox', { name: '反对', exact: true }).uncheck()
  await mobileSettings.getByRole('checkbox', { name: '疑问', exact: true }).uncheck()
  await mobileSettings.getByRole('button', { name: '保存', exact: true }).tap()
  await remote.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 9, isPrimary: true, clientX: 50, clientY: 250, bubbles: true })
  await bob.getByRole('dialog', { name: '快捷回应' }).waitFor()
  await remote.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 9, bubbles: true })
  assert.equal(await bob.locator('.reaction-menu > button').count(), 3, '可以保存少于五个回应')
  await bob.locator('.reaction-menu').getByRole('button', { name: '取消', exact: true }).tap()

  // 恢复语音沿用原广播/撤回路径，关麦后再进打字，草稿保留。
  await selectTyping(alice, own)
  await input.fill('切换后保留草稿')
  await alice.getByLabel('识别来源').selectOption('browser')
  await own.locator('.tile-mic').click()
  await own.getByText('麦克风关闭', { exact: true }).waitFor()
  await own.locator('.tile-mic').click()
  await own.getByText('麦克风开启', { exact: true }).waitFor()
  await alice.evaluate(() => window.testRecognition.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: '原有语音仍广播' } }] }))
  await captionWith(bob, '原有语音仍广播').waitFor()
  await own.locator('.tile-mic').click()
  await own.getByText('麦克风关闭', { exact: true }).waitFor()
  await captionWith(bob, '原有语音仍广播').waitFor({ state: 'detached' })
  assert.ok(await alice.evaluate(() => window.testAbortCount > 0))
  await selectTyping(alice, own)
  assert.equal(await input.inputValue(), '切换后保留草稿')
  // 八人房间时自己的编辑区、其他闭麦卡片及轻量菜单仍可使用。
  for (let index = 0; index < 5; index++) {
    const peer = new WebSocket(`${origin.replace('http:', 'ws:')}/api/rooms`, { origin })
    peers.push(peer); await once(peer, 'open')
    const memberUpdate = once(peer, 'message')
    peer.send(JSON.stringify({ type: 'join', name: `Peer${index}`, code }))
    await memberUpdate
  }
  await bob.waitForFunction(() => document.querySelectorAll('.member-tile, .contracted-member').length === 8)
  await bob.evaluate(() => {
    window.testViewport = Object.assign(new EventTarget(), { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => window.testViewport })
  })
  const mobileSelf = selfTile(bob)
  await expandOwnMember(bob, 'B')
  await selectTyping(bob, mobileSelf)
  const mobileInput = bob.getByLabel('输入字幕', { exact: true })
  await mobileInput.fill('中'.repeat(1000))
  const longComposer = await mobileInput.evaluate(editor => {
    editor.scrollTop = editor.scrollHeight
    const panel = editor.closest('.typing-composer'), footer = panel.querySelector('.composer-actions'), send = panel.querySelector('.composer-send')
    const inputBounds = editor.getBoundingClientRect(), footerBounds = footer.getBoundingClientRect(), sendBounds = send.getBoundingClientRect()
    return { scrolling: editor.scrollHeight > editor.clientHeight, separated: inputBounds.bottom <= footerBounds.top + 1, background: getComputedStyle(footer).backgroundColor, square: Math.abs(sendBounds.width - sendBounds.height) < 1 }
  })
  assert.equal(longComposer.scrolling, true); assert.equal(longComposer.separated, true); assert.equal(longComposer.background, 'rgb(241, 241, 238)'); assert.equal(longComposer.square, true)
  await mobileInput.fill('八人手机打字')
  const layout = await mobileInput.evaluate(editor => {
    const panel = editor.closest('.typing-composer').getBoundingClientRect()
    return { inCard: !!editor.closest('.member-tile'), left: panel.left, right: panel.right, bottom: panel.bottom, top: panel.top, width: innerWidth, height: innerHeight }
  })
  assert.equal(layout.inCard, false)
  assert.ok(layout.top >= 0 && layout.left >= 0 && layout.right <= layout.width && layout.bottom <= layout.height, JSON.stringify(layout))
  await bob.evaluate(() => { window.testViewport.height = 430; window.testViewport.dispatchEvent(new Event('resize')) })
  await bob.waitForFunction(() => document.querySelector('.typing-composer').getBoundingClientRect().bottom <= 430)
  const keyboardLayout = await mobileInput.evaluate(editor => {
    const panel = editor.closest('.typing-composer').getBoundingClientRect()
    return { bottom: panel.bottom, top: panel.top }
  })
  assert.ok(keyboardLayout.top >= 0 && keyboardLayout.bottom >= 400, JSON.stringify(keyboardLayout))
  await bob.evaluate(() => { window.testViewport.offsetTop = 50; window.testViewport.dispatchEvent(new Event('scroll')) })
  await bob.waitForFunction(() => Math.abs(document.querySelector('.typing-composer').getBoundingClientRect().bottom - 468) < 2)
  await bob.getByRole('dialog', { name: '打字字幕' }).getByRole('button', { name: '发送', exact: true }).tap()
  await captionWith(alice, '八人手机打字').waitFor()
  assert.equal(await mobileInput.evaluate(element => document.activeElement === element), true, '发送按钮不夺走输入焦点')
  await bob.evaluate(() => { window.testViewport.height = innerHeight; window.testViewport.offsetTop = 0; window.testViewport.dispatchEvent(new Event('resize')) })
  await bob.waitForFunction(() => document.querySelector('.typing-composer').getBoundingClientRect().bottom > 700)
  await mobileInput.fill('收起后保留的草稿')
  await dismissComposer(bob)
  await alice.getByRole('button', { name: '全局音效设置', exact: true }).click()
  await soundSettings.getByRole('checkbox', { name: '启用快捷回应音效' }).uncheck()
  await soundSettings.getByRole('button', { name: '关闭音效设置' }).click()
  assert.equal(await bob.locator('.typing-composer').count(), 0)
  await mobileSelf.locator('.start-typing').tap()
  assert.equal(await mobileInput.inputValue(), '收起后保留的草稿')
  await dismissComposer(bob)
  await alice.getByRole('button', { name: '退出房间', exact: true }).click()
  assert.equal(await alice.locator('textarea').count(), 0)
  await alice.reload(); await enter(alice, 'A again', code)
  assert.match(await alice.getByRole('button', { name: '全局音效设置', exact: true }).innerText(), /关/)
  assert.deepEqual(await alice.evaluate(() => JSON.parse(localStorage.getItem('hakisub.sound-preferences.v1'))), { enabled: false, volume: 25 })
  await bobTile.locator('.tile-identity, .member-avatar').click({ button: 'right' })
  assert.equal(await alice.getByRole('button', { name: '🙏 谢谢', exact: true }).count(), 1, '刷新后恢复个人菜单')
  assert.equal(await alice.getByRole('button', { name: '👎 反对', exact: true }).count(), 0)
  await alice.locator('.reaction-menu').getByRole('button', { name: '取消', exact: true }).click()
  // 自己的卡片支持右键/真实触屏长按；松手不能误打开打字框，回应仍广播同房。
  const output = new URL('../artifacts/room-interactions/', import.meta.url)
  await mkdir(output, { recursive: true })
  await expandOwnMember(alice, 'A again')
  await selectTyping(alice, selfTile(alice))
  await input.fill('自己的快捷回应不清除草稿')
  await dismissComposer(alice)
  await selfTile(alice).locator('.tile-text').click({ button: 'right' })
  await alice.getByRole('dialog', { name: '快捷回应' }).waitFor()
  await alice.screenshot({ path: fileURLToPath(new URL('self-reaction-desktop.png', output)) })
  await alice.getByRole('button', { name: '❓ 疑问', exact: true }).click()
  for (const page of [alice, bob, observer]) await reactionWith(page, '❓ A again：疑问').waitFor()
  assert.equal(await alice.locator('.typing-composer').count(), 0, '右键回应不改变打字状态或开启输入框')
  assert.equal(await other.locator('.reaction-bubble, .contracted-reaction').count(), 0, '回复自己不广播到其他房间')
  await selfTile(alice).locator('.tile-text').click({ button: 'right' })
  assert.equal(await alice.getByRole('button', { name: '❓ 疑问', exact: true }).isDisabled(), true, '自己和他人共用回应冷却')
  await alice.keyboard.press('Escape')
  await selfTile(alice).locator('.tile-text').click()
  assert.equal(await input.inputValue(), '自己的快捷回应不清除草稿')
  await dismissComposer(alice)
  const selfTouch = mobileSelf.locator('.tile-text')
  await bob.bringToFront()
  // 等待另一成员的打字状态展开卡片，避免广播到达时改变触摸坐标。
  await bob.locator('.member-tile').filter({ has: bob.getByRole('heading', { name: 'A again', exact: true }) }).getByText('打字模式', { exact: true }).waitFor()
  await selfTouch.scrollIntoViewIfNeeded()
  await selfTouch.tap({ trial: true })
  const selfBounds = await selfTouch.boundingBox()
  const selfTouchPoint = { x: selfBounds.x + selfBounds.width / 2, y: selfBounds.y + Math.min(20, selfBounds.height / 2) }
  const touchTarget = await bob.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y)
    return { matches: !!target?.closest('.tile-text.can-type'), target: target?.outerHTML.slice(0, 300), scrollY }
  }, selfTouchPoint)
  assert.equal(touchTarget.matches, true, JSON.stringify({ selfBounds, selfTouchPoint, ...touchTarget }))
  const cdp = await bob.context().newCDPSession(bob)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [selfTouchPoint] })
  await bob.getByRole('dialog', { name: '快捷回应' }).waitFor()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert.equal(await bob.locator('.typing-composer').count(), 0, '长按自己的打字卡片松手不打开输入框')
  assert.equal(await bob.locator('.member-mode-menu').count(), 0, '卡片长按不触发麦克风的打字菜单')
  await bob.screenshot({ path: fileURLToPath(new URL('self-reaction-mobile.png', output)) })
  await bob.getByRole('button', { name: '✅ 收到', exact: true }).tap()
  for (const page of [alice, bob, observer]) await reactionWith(page, '✅ B：收到').waitFor()
  await selfTouch.tap()
  assert.equal(await mobileInput.inputValue(), '收起后保留的草稿', '长按后下一次轻触仍正常编辑原草稿')
  await dismissComposer(bob)
  assert.deepEqual(errors, [])
  console.log(`通过：${assets.length}个素材MP3在正式静态服务中正确MIME/实际解码/非静音/时长与峰值验证、默认和逐项试听真实BufferSource播放；桌面/移动双房间/八成员、全局静音/音量/旁观成员/隔离/偏好及打字/回应/假ASR回归。未验收物理扬声器听感、真机键盘或真实麦克风/豆包。`)
} finally {
  await browser?.close()
  peers.forEach(peer => peer.terminate())
  await gateway.close()
}
