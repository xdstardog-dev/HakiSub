// 正式构建、隔离内存房间与真实Chrome；不读取.env、不调用麦克风或豆包。
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
  connectUpstream() { throw Error('UI验收不得请求真实ASR') },
  probeRoomKey: async () => ({ ok: true }),
})
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const origin = `http://127.0.0.1:${gateway.server.address().port}`; origins.push(origin)
const output = new URL('../artifacts/room-refactor/', import.meta.url); await mkdir(output, { recursive: true })
let browser
async function pageFor(width, height, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion })
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  await context.addInitScript(() => {
    window.entranceAnimations = []; window.speechPitches = []
    window.clipboardWrites = []; window.nativeShareCalls = 0; window.clipboardFailure = false
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { window.nativeShareCalls++ } })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => {
      if (window.clipboardFailure) throw Error('synthetic clipboard denial')
      window.clipboardWrites.push(value)
    } } })
    const animate = HTMLElement.prototype.animate
    HTMLElement.prototype.animate = function (...args) {
      if (this.matches('.member-tile,.speech-ring')) window.entranceAnimations.push(this.className)
      return animate.apply(this, args)
    }
    const oscillator = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function (...args) {
      const node = oscillator.apply(this, args), start = node.start.bind(node)
      let pitch
      const setFrequency = node.frequency.setValueAtTime.bind(node.frequency)
      node.frequency.setValueAtTime = (value, time) => { pitch = value; return setFrequency(value, time) }
      node.start = (...args) => { window.speechPitches.push(pitch); return start(...args) }
      return node
    }
  })
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message))
  return page
}
async function create(page) {
  await page.goto(origin); await page.getByRole('button', { name: '创建房间', exact: true }).click()
  await page.getByLabel('输入房间名称', { exact: true }).fill('实时交流的房间')
  await page.locator('form button[type=submit]').click(); await page.locator('.room-bottom-bar').waitFor()
  return /\d{6}/.exec(new URL(page.url()).pathname)[0]
}
async function joinPeer(code, name) {
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/api/rooms', { origin }); peers.push(socket)
  await once(socket, 'open'); const identity = once(socket, 'message')
  socket.send(JSON.stringify({ type: 'join', code, name })); await identity
  socket.send(JSON.stringify({ type: 'mic', mic: true }))
  return event => socket.send(JSON.stringify(event))
}
async function slider(page, id, value) { await page.locator('#' + id).evaluate((element, value) => { element.value = String(value); element.dispatchEvent(new Event('input', { bubbles: true })) }, value) }
async function assertBounds(page) {
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('.room-stage').getBoundingClientRect()
    return { overflow: document.documentElement.scrollWidth > innerWidth, width: document.querySelector('.room-layout').getBoundingClientRect().width,
      cards: [...document.querySelectorAll('.member-tile')].map(element => { const r = element.getBoundingClientRect(); return r.left >= stage.left - 1 && r.right <= stage.right + 1 && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1 }) }
  })
  assert.equal(geometry.overflow, false); assert.ok(geometry.width <= 480); assert.ok(geometry.cards.every(Boolean), JSON.stringify(geometry))
}
try {
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  const page = await pageFor(390, 844), code = await create(page)
  const stageBeforeCopy = await page.locator('.room-stage').boundingBox()
  await page.locator('.copy-room span').click()
  const toast = page.locator('.room-copy-toast')
  await page.getByRole('status').filter({ hasText: '复制房间号成功' }).waitFor()
  assert.equal(await page.evaluate(() => window.clipboardWrites.at(-1)), code)
  assert.deepEqual(await page.locator('.room-stage').boundingBox(), stageBeforeCopy, '提示覆盖窗口且不挤动字幕布局')
  const toastStyle = await toast.evaluate(element => {
    const style = getComputedStyle(element), bounds = element.getBoundingClientRect()
    return { background: style.backgroundColor, color: style.color, position: style.position, centerX: bounds.x + bounds.width / 2, centerY: bounds.y + bounds.height / 2 }
  })
  const toastAlpha = /^rgba\(0, 0, 0, ([\d.]+)\)$/.exec(toastStyle.background)
  assert.ok(toastAlpha && Math.abs(Number(toastAlpha[1]) - .5) < .01)
  assert.equal(toastStyle.color, 'rgb(255, 255, 255)'); assert.equal(toastStyle.position, 'fixed')
  assert.ok(Math.abs(toastStyle.centerX - 195) < 1 && Math.abs(toastStyle.centerY - 422) < 1)
  await page.screenshot({ path: fileURLToPath(new URL('copy-code-toast.png', output)) })
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: '分享房间链接', exact: true }).click()
  await page.getByText('复制链接成功', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.clipboardWrites.at(-1)), origin + '/' + code + '/')
  assert.equal(await page.evaluate(() => window.nativeShareCalls), 0)
  await page.waitForTimeout(250)
  assert.equal(await toast.innerText(), '复制链接成功', '后一次复制重新计算提示时长')
  await page.screenshot({ path: fileURLToPath(new URL('copy-link-toast.png', output)) })
  await page.waitForFunction(() => {
    const element = document.querySelector('.room-copy-toast-leave-active')
    return element && Number(getComputedStyle(element).opacity) > 0 && Number(getComputedStyle(element).opacity) < 1
  }, undefined, { polling: 'raf' })
  await toast.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '复制房间号', exact: true }).focus(); await page.keyboard.press('Enter')
  await page.getByText('复制房间号成功', { exact: true }).waitFor()
  await page.evaluate(() => { window.clipboardFailure = true })
  await page.getByRole('button', { name: '分享房间链接', exact: true }).click()
  await page.getByText('复制失败，请重试', { exact: true }).waitFor()
  assert.equal(await page.locator('.manual-share,.share-message').count(), 0)
  assert.equal(await page.evaluate(() => window.nativeShareCalls), 0)
  await page.evaluate(() => { window.clipboardFailure = false })
  await toast.waitFor({ state: 'detached' })
  for (const [width, height] of [[320, 568], [390, 844], [1280, 900]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(400); await assertBounds(page)
    const header = await page.evaluate(() => {
      const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height } }
      return { home: bounds('.room-avatar'), title: bounds('.room-identity'), share: bounds('.share-room'), back: bounds('.room-exit') }
    })
    assert.ok(header.home.right < header.title.left && header.title.right < header.share.left && header.share.right < header.back.left)
    assert.equal(header.home.width, 48); assert.equal(header.share.width, 48); assert.equal(header.back.width, 48)
    assert.equal(header.home.top, header.share.top); assert.equal(header.share.top, header.back.top)
    await page.screenshot({ path: fileURLToPath(new URL(`header-${width}.png`, output)) })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  // 提示缩短后可能正处于闭麦收束边界，等待收束完成再从头像恢复卡片。
  await page.locator('.member-avatar').waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('idle-panel-390.png', output)) })
  await page.locator('.member-avatar').click()
  await page.waitForTimeout(400)
  // 正式页面与实际WebSocket一起验证本人目标，避免只测菜单已放开。
  const selfCard = page.locator('.member-tile').filter({ has: page.locator('h2 small') })
  await selfCard.locator('.tile-text').click({ button: 'right' })
  await page.getByRole('dialog', { name: '快捷回应', exact: true }).waitFor()
  await page.getByRole('button', { name: '👍 赞同', exact: true }).click()
  const selfReply = selfCard.locator('.reaction-bubble')
  await selfReply.waitFor()
  assert.match(await selfReply.innerText(), /^👍 .+：赞同$/)
  assert.equal(await page.getByText('无效的回应类型或目标成员。', { exact: true }).count(), 0)
  assert.equal(await selfCard.locator('.tile-status').innerText(), '麦克风关闭')
  await page.screenshot({ path: fileURLToPath(new URL('self-reply-current-ui.png', output)) })
  assert.equal(await page.locator('.room-demo-controls').count(), 0, '普通页面无技术参数')
  assert.equal(await page.getByText('个人存档', { exact: true }).count(), 0)
  await page.getByRole('button', { name: '房间设置', exact: true }).click()
  await page.locator('.owner-entry').waitFor()
  await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  const mainMic = page.locator('.room-main-control .tile-mic')
  const normalMicColor = await mainMic.evaluate(element => getComputedStyle(element).color)
  assert.equal(await mainMic.getAttribute('aria-disabled'), 'false')
  await page.screenshot({ path: fileURLToPath(new URL('asr-enabled-muted.png', output)) })
  await page.getByRole('button', { name: '房间设置', exact: true }).click()
  await page.getByRole('switch', { name: 'ASR 语音识别', exact: true }).uncheck()
  await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  await page.getByText('语音转文字功能被关闭了喵！只能打字说话了喵~', { exact: true }).waitFor()
  assert.equal(await mainMic.getAttribute('aria-disabled'), 'true')
  assert.equal(await mainMic.evaluate(element => getComputedStyle(element).color), 'rgb(135, 63, 69)')
  const lockedMicBounds = await mainMic.boundingBox()
  await page.mouse.click(lockedMicBounds.x + 32, lockedMicBounds.y + 28)
  assert.equal(await mainMic.getAttribute('aria-pressed'), 'false', '禁用红麦短按不能开启')
  await page.screenshot({ path: fileURLToPath(new URL('asr-disabled-muted.png', output)) })
  await page.mouse.click(lockedMicBounds.x + 32, lockedMicBounds.y + 28, { button: 'right' })
  await page.getByRole('menuitem', { name: '切换打字', exact: true }).click()
  await page.locator('.typing-composer').waitFor()
  assert.equal(await mainMic.getAttribute('aria-disabled'), 'false', '禁用语音仍可退出打字')
  assert.notEqual(await mainMic.evaluate(element => getComputedStyle(element).color), 'rgb(135, 63, 69)')
  await mainMic.click()
  await page.getByRole('button', { name: '房间设置', exact: true }).click()
  await page.getByRole('switch', { name: 'ASR 语音识别', exact: true }).check()
  await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  assert.equal(await mainMic.getAttribute('aria-disabled'), 'false')
  assert.equal(await mainMic.getAttribute('aria-pressed'), 'false', '恢复ASR不会自动开麦')
  assert.equal(await mainMic.evaluate(element => getComputedStyle(element).color), normalMicColor)
  await page.getByRole('button', { name: '房间设置', exact: true }).click()
  await page.locator('.owner-entry').waitFor()
  await slider(page, 'speech-volume', 54); await slider(page, 'reaction-volume', 100)
  assert.equal(await page.getByRole('switch', { name: '卡片布局', exact: true }).isChecked(), true)
  const sectionLayout = await page.evaluate(() => ({
    layoutLeft: document.querySelector('.layout-switch input').getBoundingClientRect().left,
    asrLeft: document.querySelector('.asr-switch input').getBoundingClientRect().left,
    personalColor: getComputedStyle(document.querySelector('[aria-label="音效"]')).backgroundColor,
    ownerColor: getComputedStyle(document.querySelector('.owner-management')).backgroundColor,
  }))
  assert.ok(Math.abs(sectionLayout.layoutLeft - sectionLayout.asrLeft) < 1); assert.notEqual(sectionLayout.personalColor, sectionLayout.ownerColor)
  assert.match(await page.locator('.owner-entry').innerText(), /房间设置/)
  await page.getByRole('button', { name: '静音发言提示音', exact: true }).click()
  assert.equal(await page.locator('#speech-volume').isDisabled(), true); assert.equal(await page.locator('#speech-volume').inputValue(), '54')
  assert.equal(await page.locator('#reaction-volume').isDisabled(), false)
  await page.getByRole('button', { name: '静音快捷回复音效', exact: true }).click()
  assert.equal(await page.locator('#reaction-volume').isDisabled(), true); assert.equal(await page.locator('#reaction-volume').inputValue(), '100')
  await page.screenshot({ path: fileURLToPath(new URL('settings-muted.png', output)) })
  await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  await page.getByRole('button', { name: '房间设置', exact: true }).click()
  assert.equal(await page.locator('#speech-volume').isDisabled(), true); assert.equal(await page.locator('#reaction-volume').isDisabled(), true)
  await page.getByRole('button', { name: '恢复发言提示音', exact: true }).click()
  await page.getByRole('button', { name: '恢复快捷回复音效', exact: true }).click()
  assert.equal(await page.locator('#speech-volume').inputValue(), '54'); assert.equal(await page.locator('#reaction-volume').inputValue(), '100')
  for (const [width, height] of [[320, 568], [390, 844], [1280, 900]]) {
    await page.setViewportSize({ width, height })
    assert.equal(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth), true)
    await page.screenshot({ path: fileURLToPath(new URL('settings-updated-' + width + '.png', output)) })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await slider(page, 'reaction-volume', 37)
  await page.getByRole('button', { name: '静音发言提示音', exact: true }).click()
  await page.getByRole('switch', { name: '卡片布局', exact: true }).uncheck()
  await page.getByText('动态自适应（已关闭）', { exact: true }).waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('personal-settings.png', output)) })
  await page.mouse.move(1, 1)
  const managementButtonColors = await page.locator('.owner-entry').evaluate(button => ({ background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color }))
  await page.locator('.owner-entry').click()
  await page.locator('.settings-back').waitFor()
  await page.mouse.move(1, 1)
  const bindingButton = page.getByRole('button', { name: '绑定当前登录账号', exact: true })
  const bindingLayout = await bindingButton.evaluate(button => {
    const style = getComputedStyle(button), bounds = button.getBoundingClientRect(), password = button.closest('dialog').querySelector('[aria-label="房间密码"]').getBoundingClientRect()
    return { background: style.backgroundColor, color: style.color, alignment: style.textAlign, gap: bounds.top - password.bottom, left: bounds.left - password.left, width: bounds.width - password.width }
  })
  assert.equal(bindingLayout.background, managementButtonColors.background); assert.equal(bindingLayout.color, managementButtonColors.color)
  assert.equal(bindingLayout.alignment, 'center'); assert.ok(Math.abs(bindingLayout.gap - 16) < 1 && Math.abs(bindingLayout.left) < 1 && Math.abs(bindingLayout.width) < 1, '绑定按钮与内容对齐，并与分隔线留16px间距')
  await page.screenshot({ path: fileURLToPath(new URL('account-binding-390.png', output)) })
  const backButtons = await page.locator('.room-back-button').evaluateAll(buttons => buttons.map(button => {
    const style = getComputedStyle(button), bounds = button.getBoundingClientRect(), icon = button.querySelector('svg')
    return { width: bounds.width, height: bounds.height, radius: style.borderRadius, background: style.backgroundColor, color: style.color, border: style.border,
      iconWidth: icon.getAttribute('width'), iconHeight: icon.getAttribute('height'), stroke: icon.getAttribute('stroke-width'), paths: [...icon.querySelectorAll('path')].map(path => path.getAttribute('d')) }
  }))
  assert.equal(backButtons.length, 2); assert.deepEqual(backButtons[0], backButtons[1], '房间与房主设置共用同一返回按钮设计')
  await page.getByRole('button', { name: '编辑房间名称' }).click()
  const beforeName = await page.locator('.name-row').boundingBox()
  await page.getByLabel('新房间名称').fill('取消的房名草稿')
  await page.getByRole('heading', { name: '豆包 API Key', exact: true }).click()
  assert.equal(await page.locator('#room-new-name').count(), 0)
  assert.equal(await page.getByRole('heading', { level: 1, name: '实时交流的房间' }).count(), 1)
  await page.getByRole('button', { name: '编辑房间名称' }).click()
  const duringName = await page.locator('.name-row').boundingBox()
  assert.ok(Math.abs(beforeName.y - duringName.y) < 1, '原位编辑不跳到下方表单')
  await page.getByLabel('新房间名称').fill('朋友的字幕房间')
  await page.getByRole('button', { name: '确认保存名称' }).click()
  await page.getByRole('heading', { level: 1, name: '朋友的字幕房间' }).waitFor()
  assert.equal(/\d{6}/.exec(new URL(page.url()).pathname)[0], code)
  await page.locator('#room-api-key').fill('synthetic-ui-only-key'); assert.equal(await page.locator('#room-api-key').getAttribute('type'), 'text')
  await page.getByRole('button', { name: '保存', exact: true }).click(); await page.getByLabel('已保存密钥').waitFor()
  assert.equal(await page.getByRole('button', { name: '移除密钥', exact: true }).count(), 0)
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await page.locator('.connection-test-row').getByText('key测试通过！', { exact: true }).waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('owner-key-tested.png', output)) })
  await page.getByRole('button', { name: '更换密钥', exact: true }).click()
  assert.equal(await page.locator('#room-api-key').inputValue(), '')
  await page.screenshot({ path: fileURLToPath(new URL('owner-key-editing.png', output)) })
  await page.getByRole('button', { name: '移除密钥', exact: true }).click()
  const removalDialog = page.getByRole('dialog', { name: '确认移除密钥？', exact: true })
  await removalDialog.waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('owner-key-remove-confirm.png', output)) })
  await removalDialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '取消更换', exact: true }).click()
  await page.getByLabel('已保存密钥').waitFor()
  await page.getByRole('button', { name: '更换密钥', exact: true }).click()
  await page.getByRole('button', { name: '移除密钥', exact: true }).click()
  await removalDialog.getByRole('button', { name: '确认移除', exact: true }).click()
  await page.getByText('尚未配置', { exact: true }).waitFor()
  await page.locator('#room-api-key').fill('synthetic-ui-replaced-key')
  await page.getByRole('button', { name: '保存', exact: true }).click(); await page.getByLabel('已保存密钥').waitFor()
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await page.locator('.connection-test-row').getByText('key测试通过！', { exact: true }).waitFor()
  await page.getByRole('switch', { name: /房间密码/ }).check()
  await page.locator('#room-new-access-code').fill('12a')
  assert.equal(await page.locator('#room-new-access-code').inputValue(), '12')
  assert.equal(await page.getByRole('button', { name: '保存密码', exact: true }).isDisabled(), true)
  await page.locator('#room-new-access-code').fill('0000'); await page.getByRole('button', { name: '保存密码', exact: true }).click()
  await page.getByText('已开启', { exact: true }).waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('owner-settings.png', output)) })
  await page.getByRole('switch', { name: /房间密码/ }).uncheck()
  await page.getByRole('button', { name: '更换密钥' }).click(); assert.equal(await page.locator('#room-api-key').inputValue(), '')
  await page.getByRole('button', { name: '返回房间设置', exact: true }).click()
  await page.locator('.owner-entry').click()
  assert.equal(await page.locator('#room-api-key').count(), 0, '重新进入仅有掩码')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '关闭设置' }).click()
  const senders = []; for (let i = 0; i < 7; i++) senders.push(await joinPeer(code, '成员' + i))
  await page.waitForFunction(() => document.querySelectorAll('.member-tile').length === 8)
  assert.equal(await page.evaluate(() => window.entranceAnimations.length), 0, '只开麦不触发入场')
  await page.clock.install(); await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
  const speech = (index, id, state = 'interim') => senders[index]({ type: 'caption', utteranceId: id, text: '首条可见字幕', state })
  speech(0, 'first'); await page.waitForFunction(() => window.entranceAnimations.length === 3)
  assert.equal(await page.evaluate(() => window.speechPitches.length), 0, '喇叭静音保留两圈涟漪和卡片动画')
  speech(0, 'first'); speech(0, 'first', 'final'); speech(0, 'second', 'final')
  await page.clock.runFor(200); assert.equal(await page.evaluate(() => window.entranceAnimations.length), 3)
  await page.clock.runFor(4900); speech(0, 'next-round', 'final')
  await page.waitForFunction(() => window.entranceAnimations.length === 6)
  senders[1]({ type: 'mode', mode: 'typing' }); senders[1]({ type: 'typed-caption', utteranceId: randomUUID(), text: '打字不发声' })
  await page.getByText('打字不发声', { exact: true }).waitFor()
  senders[1]({ type: 'mic', mic: true }); speech(1, 'over-typing', 'final')
  await page.clock.runFor(100); assert.equal(await page.evaluate(() => window.entranceAnimations.length), 6)
  await page.getByRole('button', { name: '房间设置', exact: true }).click(); await page.getByRole('button', { name: '恢复发言提示音', exact: true }).click(); await slider(page, 'speech-volume', 100)
  assert.equal(await page.locator('#reaction-volume').inputValue(), '37')
  await page.getByRole('switch', { name: '卡片布局', exact: true }).check(); await page.getByRole('button', { name: '关闭设置' }).click()
  await page.clock.runFor(700); assert.equal(await page.evaluate(() => window.entranceAnimations.length), 6, '布局切换不重播')
  speech(2, 'direct-final', 'final'); await page.waitForFunction(() => window.speechPitches.length === 1)
  assert.ok(Math.abs((await page.evaluate(() => window.speechPitches[0])) - 349.2282) < .01)
  for (let index = 3; index < 7; index++) speech(index, 'chorus-' + index, 'final')
  await page.waitForFunction(() => window.speechPitches.length === 5)
  assert.deepEqual(await page.evaluate(() => window.speechPitches.slice(1).map(Math.round)), [392, 440, 494, 523])
  await page.clock.runFor(800)
  for (const [width, height] of [[320, 568], [390, 844], [1280, 900]]) {
    await page.setViewportSize({ width, height }); await page.clock.runFor(800); await page.waitForTimeout(400); await assertBounds(page)
    await page.screenshot({ path: fileURLToPath(new URL(`room-${width}.png`, output)) })
  }
  await page.reload(); await page.locator('form button[type=submit]').click(); await page.locator('.room-bottom-bar').waitFor()
  await page.getByRole('button', { name: '房间设置', exact: true }).click()
  assert.equal(await page.locator('#speech-volume').inputValue(), '100'); assert.equal(await page.locator('#reaction-volume').inputValue(), '37')
  assert.equal(await page.getByRole('switch', { name: '卡片布局', exact: true }).isChecked(), true)
  await page.getByRole('button', { name: '静音发言提示音', exact: true }).click(); await page.getByRole('button', { name: '静音快捷回复音效', exact: true }).click()
  await page.getByRole('button', { name: '关闭设置' }).click()
  await page.reload(); await page.locator('form button[type=submit]').click(); await page.locator('.room-bottom-bar').waitFor()
  await page.getByRole('button', { name: '房间设置', exact: true }).click()
  assert.equal(await page.locator('#speech-volume').isDisabled(), true); assert.equal(await page.locator('#speech-volume').inputValue(), '100')
  assert.equal(await page.locator('#reaction-volume').isDisabled(), true); assert.equal(await page.locator('#reaction-volume').inputValue(), '37')
  await page.getByRole('button', { name: '恢复发言提示音', exact: true }).click()
  speech(0, 'after-unmute', 'final'); await page.waitForFunction(() => window.speechPitches.length === 1)
  assert.equal(await page.locator('#reaction-volume').isDisabled(), true, '恢复发言后回应仍静音')
  await page.getByRole('button', { name: '恢复快捷回复音效', exact: true }).click()
  assert.equal(await page.locator('#speech-volume').isDisabled(), false); assert.equal(await page.locator('#speech-volume').inputValue(), '100')
  assert.equal(await page.locator('#reaction-volume').isDisabled(), false); assert.equal(await page.locator('#reaction-volume').inputValue(), '37')
  await page.getByRole('button', { name: '关闭设置' }).click()
  // 重新加入前释放一位合成成员，为另一个减少动画的客户端留出空间。
  peers.pop().terminate(); await new Promise(resolve => setTimeout(resolve, 100))
  const reduced = await pageFor(390, 844, 'reduce')
  await reduced.goto(origin + '/' + code + '/'); await reduced.locator('form button[type=submit]').click(); await reduced.locator('.room-bottom-bar').waitFor()
  await reduced.getByRole('button', { name: '房间设置', exact: true }).click()
  assert.equal(await reduced.locator('.owner-entry').count(), 0)
  assert.equal(await reduced.locator('#speech-volume').inputValue(), '60', '其他成员偏好独立')
  await reduced.getByRole('button', { name: '关闭设置' }).click()
  speech(3, 'reduced-motion', 'final'); await reduced.getByText('首条可见字幕', { exact: true }).first().waitFor()
  assert.equal(await reduced.evaluate(() => window.entranceAnimations.length), 0)
  await reduced.screenshot({ path: fileURLToPath(new URL('reduced-motion.png', output)) })
  assert.deepEqual(errors, [])
  console.log('通过：顶部房屋/房名房号/分享/返回排列；点击数字及键盘复制、直接复制链接/无系统分享、居中半透明提示/自动消失/连续点击续时/失败反馈；普通/房主二级设置、改名同步/房号不变、Key明文输入/保存清空/更换空白/重入不可读；两音量/布局即时与刷新保持/成员隔离；统一一次动画/0音量/连续识别/渐隐后重触发/打字占位/直接final音阶/减少动态；320/390/1280窄框无溢出。仅Chrome合成房间、模拟剪贴板与音频调用记录。')
} finally { peers.forEach(socket => socket.terminate()); await browser?.close(); await gateway.close() }
