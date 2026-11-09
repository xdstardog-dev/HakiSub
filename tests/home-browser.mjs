// 使用正式构建与隔离内存网关；房间由真实 WebSocket 创建，不读取现有房间或 .env。
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { createAsrGateway } from '../server/asrGateway.mjs'
import { createStaticWebsite } from '../server/staticWebsite.mjs'

const { chromium } = await import(process.argv[2] ?? 'playwright')
const origins = [], peers = [], errors = []
const gateway = createAsrGateway({ allowedOrigins: origins,
  serveWebsite: createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))),
  connectUpstream() { throw Error('首页验收禁止调用真实ASR') },
})
gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
const origin = `http://127.0.0.1:${gateway.server.address().port}`
origins.push(origin)
const output = new URL('../artifacts/home/', import.meta.url)
await mkdir(output, { recursive: true })
let browser
async function createRoom(index) {
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/api/rooms', { origin })
  peers.push(socket); await once(socket, 'open')
  const result = once(socket, 'message')
  socket.send(JSON.stringify({ type: 'create', name: 'UI test' }))
  const room = JSON.parse((await result)[0])
  assert.equal(room.type, 'joined')
  const roomName = index === 0 ? '中'.repeat(12) : index === 1 ? 'ABCDEFGHIJKLMNOPQRSTUVWX' : `交流室 ${index + 1}`
  const response = await fetch(origin + '/api/rooms/settings', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${room.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename', name: roomName }) })
  assert.equal(response.status, 200)
  return { code: room.code, name: 'UI test', roomName }
}
async function openPage(width, height, rooms, touch = width < 768) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  await context.addInitScript(rooms => localStorage.setItem('hakisub.rooms.v1', JSON.stringify(rooms)), rooms)
  const page = await context.newPage(); page.setDefaultTimeout(7000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await page.locator('.home-room-card').first().waitFor()
  await page.locator('.home-logo img').evaluate(image => image.decode())
  return page
}
async function center(page, index) {
  await page.locator('.home-carousel').evaluate((track, index) => {
    const card = track.children[index]
    track.scrollTo({ left: track.scrollLeft + card.getBoundingClientRect().left - track.getBoundingClientRect().left + card.offsetWidth / 2 - track.clientWidth / 2, behavior: 'instant' })
  }, index)
  await page.waitForFunction(index => {
    const track = document.querySelector('.home-carousel'), card = track.children[index]
    return Math.abs(card.getBoundingClientRect().left + card.clientWidth / 2 - track.getBoundingClientRect().left - track.clientWidth / 2) < 1
  }, index)
}
async function geometry(page) {
  return page.locator('.home-carousel').evaluate(track => ({
    pageWidth: document.documentElement.scrollWidth, width: innerWidth,
    containerWidth: document.querySelector('.home-content').getBoundingClientRect().width,
    shellWidth: document.querySelector('.home-shell').getBoundingClientRect().width,
    outerBackground: getComputedStyle(document.body).backgroundColor,
    pageBackground: getComputedStyle(document.querySelector('.home-shell')).backgroundColor,
    cards: [...track.children].map(slot => {
      const card = slot.firstElementChild, style = getComputedStyle(card), overlay = getComputedStyle(card, '::after')
      return { width: slot.clientWidth, height: slot.clientHeight, scale: new DOMMatrix(style.transform).a, overlay: overlay.backgroundColor, overlayDisplay: overlay.display, opacity: style.opacity, contentFits: card.scrollHeight <= card.clientHeight + 1 }
    }),
  }))
}
async function waitForSelection(page, index) {
  await page.waitForFunction(index => {
    const track = document.querySelector('.home-carousel'), card = track.children[index]
    return card.getAttribute('aria-current') === 'true' && Math.abs(card.getBoundingClientRect().left + card.clientWidth / 2 - track.getBoundingClientRect().left - track.clientWidth / 2) < 1
  }, index)
}
async function waitForCatPress(page, action, pressed) {
  await page.waitForFunction(({ action, pressed }) => {
    const button = document.querySelector(`.home-cat-button--${action}`)
    const face = button.querySelector('.home-cat-face')
    const shadow = button.querySelector('.home-cat-shadow')
    const surprise = button.querySelector('.home-cat-surprise')
    return getComputedStyle(surprise).opacity === (pressed ? '1' : '0')
      && Math.abs(face.getBoundingClientRect().top - (pressed ? shadow : button).getBoundingClientRect().top) < .15
  }, { action, pressed })
}
async function waitForCardPress(card, pressed) {
  await card.evaluate(async (element, pressed) => {
    const surface = getComputedStyle(element, '::before')
    const depth = parseFloat(getComputedStyle(element).getPropertyValue('--card-depth'))
    const expected = pressed ? depth : 0
    const displacement = () => parseFloat(surface.translate.split(' ')[1] ?? '0')
    for (let frame = 0; frame < 60 && displacement() !== expected; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
    if (displacement() !== expected) throw new Error(`卡面位移应为 ${expected}px，实际为 ${displacement()}px`)
  }, pressed)
}
async function checkBrandCats() {
  const page = await openPage(320, 568, [], false)
  const brand = page.getByRole('button', { name: '哈基字幕 HakiSub，召唤猫咪' })
  const cat = page.locator('.home-brand-cat')
  const box = await brand.boundingBox()
  const clickX = Math.floor(box.x + box.width - 4)
  await page.mouse.click(clickX, box.y + box.height / 2)
  await cat.waitFor()
  const motion = await cat.evaluate(popup => {
    const flight = popup.getAnimations()[0]
    const frames = flight.effect.getKeyframes()
    const body = popup.querySelector('.home-brand-cat-motion')
    const footOrigin = parseFloat(getComputedStyle(body).transformOrigin.split(' ')[1])
    const sparks = popup.querySelector('.home-brand-cat-sparks')
    const hiss = popup.querySelector('.home-brand-cat-hiss')
    const hissDuration = hiss.getAnimations()[0].effect.getTiming().duration
    const sparksDuration = sparks.getAnimations()[0].effect.getTiming().duration
    const animations = popup.getAnimations({ subtree: true })
    for (const animation of animations) animation.pause()
    const sample = milliseconds => {
      for (const animation of animations) animation.currentTime = milliseconds
      const horizontal = new DOMMatrix(getComputedStyle(popup).transform)
      const vertical = new DOMMatrix(getComputedStyle(body).transform)
      return {
        x: horizontal.e, y: vertical.f, scale: Math.abs(vertical.d), facing: Math.sign(vertical.a),
        foot: body.getBoundingClientRect().bottom - (body.offsetHeight - footOrigin) * Math.abs(vertical.d),
        sparks: +getComputedStyle(sparks).opacity, hiss: +getComputedStyle(hiss).opacity,
      }
    }
    const start = sample(0), entry = sample(78), landing = sample(690), shout = sample(946.5)
    const beforeTurn = sample(1189), afterTurn = sample(1211)
    const exitPeaks = [1336.5, 1564.3, 1729.3].map(sample)
    const landings = [156.8, 376.4, 690, 1146, 1470.1, 1658.6].map(sample)
    for (const animation of animations) animation.play()
    return {
      left: parseFloat(popup.style.left), width: popup.offsetWidth, pointerEvents: getComputedStyle(popup).pointerEvents,
      duration: flight.effect.getTiming().duration, frames, start, entry, landing, shout, beforeTurn, afterTurn,
      hissDuration, sparksDuration,
      exitPeaks, landings, text: hiss.textContent, hissAnchor: parseFloat(hiss.style.left), hissShift: getComputedStyle(hiss).translate,
    }
  })
  assert.equal(motion.left, clickX + 20)
  assert.ok(motion.left + motion.width < 320)
  assert.equal(motion.pointerEvents, 'none')
  assert.equal(motion.duration, 1800)
  assert.equal(motion.hissDuration, 370.5)
  assert.equal(motion.sparksDuration, 370.5)
  assert.equal(motion.frames[0].opacity, '0')
  assert.equal(motion.frames.at(-1).opacity, '0')
  assert.ok(motion.left + motion.start.x >= 320 - motion.width * .2, '窄屏从右边缘入场')
  assert.ok(motion.entry.x > motion.landing.x && motion.shout.y < motion.landing.y)
  assert.ok(motion.entry.scale < motion.landing.scale && motion.shout.scale > motion.landing.scale)
  assert.ok(motion.landings.every(landing => Math.abs(landing.foot - motion.landing.foot) < 1), '缩放也沿猫脚底的基线落地')
  assert.equal(motion.beforeTurn.facing, 1)
  assert.equal(motion.afterTurn.facing, -1)
  assert.ok(motion.exitPeaks.every((peak, index, peaks) => peak.x > (peaks[index - 1]?.x ?? motion.afterTurn.x)
    && peak.y < 0 && (index === 0 || peak.y > peaks[index - 1].y)))
  assert.ok([motion.entry, ...motion.exitPeaks].every(sample => sample.sparks === 0 && sample.hiss === 0))
  assert.deepEqual([motion.shout.sparks, motion.shout.hiss, motion.text], [1, 1, '哈！'])
  assert.ok(motion.hissAnchor < motion.width * .3 && motion.hissShift.startsWith('-100%'))
  await cat.waitFor({ state: 'detached' })
  assert.equal(page.url(), origin + '/')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320)

  await page.setViewportSize({ width: 1100, height: 780 })
  await brand.click()
  await cat.waitFor()
  const desktopTravel = await cat.evaluate(popup => parseFloat(popup.style.getPropertyValue('--brand-cat-travel')) / popup.offsetWidth)
  assert.ok(desktopTravel > 2, '桌面跳跃距离至少超过两只猫身')
  await page.setViewportSize({ width: 320, height: 568 })
  await page.reload()
  const assets = (await readdir(new URL('../src/assets/home-cats/', import.meta.url)))
    .filter(name => name.endsWith('.svg')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  assert.ok(assets.length >= 11)
  const hiddenAsset = '10-longhair.svg'
  assert.ok(assets.includes(hiddenAsset))
  const regularAssets = assets.filter(asset => asset !== hiddenAsset)
  const summons = [
    ...regularAssets.map((asset, index) => ({
      asset,
      roll: index === 0 ? .01 : .01 + .99 * (index - .5) / (regularAssets.length - 1),
    })),
    { asset: hiddenAsset, roll: .009999 },
    { asset: hiddenAsset, roll: 0 },
  ]
  const brandMotions = new Set()
  const hissPositions = new Set()
  for (const [index, { asset, roll }] of summons.entries()) {
    const sizeRoll = index % 2 === 0 ? 0 : .999999
    const feedback = await brand.evaluate((button, rolls) => {
      const original = Math.random
      Math.random = () => rolls.shift() ?? original()
      try { button.click() } finally { Math.random = original }
      const animations = button.querySelector('.home-brand-mark').getAnimations()
      const frames = animations[0].effect.getKeyframes()
      const transforms = frames.map(frame => new DOMMatrix(frame.transform))
      const width = button.getBoundingClientRect().width
      animations[0].currentTime = 70
      return {
        count: animations.length,
        fixedHitbox: width === button.getBoundingClientRect().width,
        duration: animations[0].effect.getTiming().duration,
        shaking: transforms.some(transform => transform.e < 0) && transforms.some(transform => transform.e > 0),
        rotatesBothWays: transforms.some(transform => transform.b < 0) && transforms.some(transform => transform.b > 0),
        horizontalOnly: transforms.every(transform => Math.abs(transform.e) <= 1.5 && transform.b === 0 && transform.c === 0),
        kind: frames.some(frame => frame.filter?.includes('brightness')) ? 'brightness'
          : frames.some(frame => frame.transform?.includes('translateY(-')) ? 'hop'
            : frames.some(frame => frame.transform?.includes('translateY(')) ? 'sink'
              : frames.some(frame => frame.transform?.includes('scale(')) ? 'scale' : 'shake',
      }
    }, [roll, sizeRoll, (index % 5 + .5) / 5])
    assert.equal(feedback.count, 1)
    assert.ok(feedback.fixedHitbox)
    assert.ok(feedback.shaking && feedback.duration <= 300)
    if (feedback.kind === 'hop' || feedback.kind === 'sink') assert.ok(feedback.rotatesBothWays)
    else assert.ok(feedback.horizontalOnly)
    brandMotions.add(feedback.kind)
    await page.waitForFunction(name => {
      const popup = document.querySelector('.home-brand-cat')
      return popup?.dataset.asset === name && [...popup.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0)
    }, asset)
    assert.equal(await cat.count(), 1)
    const layers = await cat.evaluate(async popup => {
      const readSvg = async image => new DOMParser().parseFromString(await (await fetch(image.src)).text(), 'image/svg+xml')
      const selector = '#shout-marks, #sparks'
      const art = popup.querySelector('.home-brand-cat-art')
      const [body, sparks] = await Promise.all([readSvg(art), readSvg(popup.querySelector('.home-brand-cat-sparks'))])
      const { left, top, fontSize } = popup.querySelector('.home-brand-cat-hiss').style
      return { separated: !body.querySelector(selector) && Boolean(sparks.querySelector(selector)), left, top, fontSize,
        width: parseFloat(popup.style.width), decodedWidth: art.naturalWidth }
    })
    assert.ok(layers.separated)
    assert.ok(Math.abs(layers.width - (sizeRoll === 0 ? 97.2 : 118.8)) < .001, '320px 视口体型覆盖基准尺寸的 ±10% 边界')
    assert.equal(layers.decodedWidth, Math.ceil(layers.width), '按当前显示尺寸准备 1x 素材')
    hissPositions.add(layers.left + layers.top + layers.fontSize)
    await cat.evaluate(popup => popup.getAnimations()[0].finish())
    await cat.waitFor({ state: 'detached' })
    await brand.evaluate(button => button.querySelector('.home-brand-mark').getAnimations()[0]?.finish())
  }
  assert.deepEqual([...brandMotions].sort(), ['brightness', 'hop', 'scale', 'shake', 'sink'])
  assert.ok(hissPositions.size > 1)

  await brand.evaluate(button => {
    button.click()
    const mark = button.querySelector('.home-brand-mark')
    const feedback = mark.getAnimations()[0]
    for (let click = 0; click < 20; click++) button.click()
    if (mark.getAnimations()[0] !== feedback) throw new Error('连点重启了 Logo 动画')
  })
  await cat.waitFor()
  const layer = page.locator('.home-brand-cat-layer')
  for (let count = 1; count <= 4; count++) {
    await page.waitForFunction(count => document.querySelectorAll('.home-brand-cat').length === count, count)
    await cat.nth(count - 1).evaluate((popup, order) => {
      popup.getAnimations()[0].pause()
      popup.dataset.testOrder = order
    }, String(count))
    await brand.evaluate(button => button.querySelector('.home-brand-mark').getAnimations()[0]?.finish())
    if (count < 4) await brand.evaluate(button => button.click())
  }
  assert.equal(await layer.count(), 1)
  await brand.evaluate(async button => {
    const mark = button.querySelector('.home-brand-mark')
    await mark.getAnimations()[0]?.finished
    for (let click = 0; click < 20; click++) button.click()
    if (mark.getAnimations().some(animation => animation.playState === 'running')) throw new Error('满员时仍然触发 Logo 动画')
  })
  const catOrder = () => cat.evaluateAll(cats => cats.map(popup => popup.dataset.testOrder))
  assert.deepEqual(await catOrder(), ['1', '2', '3', '4'])
  await cat.first().evaluate(popup => popup.getAnimations()[0].finish())
  await page.locator('[data-test-order="1"]').waitFor({ state: 'detached' })
  assert.deepEqual(await catOrder(), ['2', '3', '4'])
  await brand.evaluate(button => button.click())
  await page.waitForFunction(() => document.querySelectorAll('.home-brand-cat').length === 4)
  assert.deepEqual(await catOrder(), ['2', '3', '4', undefined])
  await cat.evaluateAll(cats => cats.forEach(popup => popup.getAnimations()[0].finish()))
  await layer.waitFor({ state: 'detached' })
  await brand.evaluate(button => button.querySelector('.home-brand-mark').getAnimations()[0]?.finish())

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await brand.focus()
  await brand.press('Enter')
  const reducedBrandFrames = await brand.evaluate(button => button.querySelector('.home-brand-mark').getAnimations()[0].effect.getKeyframes())
  assert.ok(reducedBrandFrames.some(frame => +frame.opacity < 1))
  assert.ok(reducedBrandFrames.every(frame => !frame.transform && !frame.filter))
  await page.waitForFunction(() => {
    const image = document.querySelector('.home-brand-cat')
    return image && getComputedStyle(image).animationName === 'home-brand-cat-fade'
  })
  await cat.waitFor({ state: 'detached' })
  assert.equal(page.url(), origin + '/')
  await page.context().close()
  console.log(`通过：${assets.length} 只编号 SVG、隐藏猫 1% 边界与独立抽取、随机体型边界、五种品牌短抖动、连点拦截、四猫叠加与独立退场、猫咪宽窄屏动线、脚底落地、翻面、左侧哈字、键盘和减少动态效果。`)
}
async function checkTouchCatCleanup(room) {
  const page = await openPage(390, 844, [room], true)
  const brand = page.getByRole('button', { name: '哈基字幕 HakiSub，召唤猫咪' })
  const cats = page.locator('.home-brand-cat')
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    const decode = HTMLImageElement.prototype.decode
    window.catTest = { urls: new Set(), deferred: [], holdDecode: false }
    URL.createObjectURL = blob => {
      const url = create(blob)
      window.catTest.urls.add(url)
      return url
    }
    URL.revokeObjectURL = url => { window.catTest.urls.delete(url); revoke(url) }
    HTMLImageElement.prototype.decode = function () {
      if (window.catTest.holdDecode && window.catTest.urls.has(this.src)) {
        return new Promise(resolve => window.catTest.deferred.push(resolve))
      }
      return decode.call(this)
    }
  })
  const urls = () => page.evaluate(() => window.catTest.urls.size)
  const finishFeedback = () => brand.evaluate(button => button.querySelector('.home-brand-mark').getAnimations()[0]?.finish())

  await brand.tap()
  await cats.first().waitFor()
  await finishFeedback()
  await brand.tap()
  await cats.nth(1).waitFor()
  // 暂停退场以模拟浏览器未送达结束事件。
  await cats.evaluateAll(items => items.forEach(cat => cat.getAnimations()[0].pause()))
  await finishFeedback()
  await brand.tap()
  assert.equal(await cats.count(), 2)
  assert.equal(await urls(), 4)
  await page.locator('.home-brand-cat-layer').waitFor({ state: 'detached' })
  assert.equal(await urls(), 0)

  await brand.tap()
  await cats.first().waitFor()
  await finishFeedback()
  await page.evaluate(() => { window.catTest.holdDecode = true })
  await brand.tap()
  await page.waitForFunction(() => window.catTest.deferred.length === 2)
  assert.equal(await urls(), 4)
  await page.locator('button.home-room-card').first().tap()
  const leave = page.getByRole('button', { name: '退出房间', exact: true })
  await leave.waitFor()
  assert.equal(await cats.count(), 0)
  assert.equal(await urls(), 0, '进房时释放仍在播放和等待解码的全部素材')
  await page.evaluate(() => {
    window.catTest.holdDecode = false
    window.catTest.deferred.splice(0).forEach(resolve => resolve())
  })
  await leave.tap()
  await brand.waitFor()
  assert.equal(await cats.count(), 0)
  assert.equal(await urls(), 0)
  await brand.tap()
  await cats.first().waitFor()
  await cats.first().evaluate(cat => cat.getAnimations()[0].cancel())
  await page.locator('.home-brand-cat-layer').waitFor({ state: 'detached' })
  assert.equal(await urls(), 0)
  await page.context().close()
  console.log('通过：触屏两猫上限、漏发结束事件兜底、动画取消、进房释放活跃和待解码素材、退房后可重新召唤。')
}
try {
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  await checkBrandCats()
  const rooms = []
  for (let index = 0; index < 12; index++) rooms.push(await createRoom(index))
  await checkTouchCatCleanup(rooms[0])
  for (const [width, height] of [[320, 568], [390, 844], [767, 900], [768, 900], [1024, 768], [1440, 900]]) {
    const page = await openPage(width, height, rooms)
    let layout = await geometry(page)
    assert.equal(layout.pageWidth, width, '页面不能横向溢出')
    assert.ok(layout.containerWidth <= 1120)
    assert.ok(layout.cards.every(card => card.contentFits), JSON.stringify(layout))
    assert.equal(await page.locator('.home-room-card').count(), 13)
    assert.equal(await page.locator('.home-room-details strong').first().textContent(), rooms[0].roomName, '沿用最近访问顺序')
    assert.equal(await page.getByLabel('显示名称', { exact: true }).count(), 0, '首页不常驻创建/加入表单')
    await page.screenshot({ path: fileURLToPath(new URL(`initial-${width}.png`, output)) })
    if (width < 768) {
      await center(page, 0)
      layout = await geometry(page)
      assert.ok(Math.abs(layout.cards[0].width / layout.cards[0].height - 3 / 4) < .003)
      assert.equal(layout.cards[0].scale, 1)
      assert.equal(layout.cards[1].scale, .9)
      assert.equal(layout.cards[1].overlay, 'rgba(128, 128, 128, 0.4)')
      assert.equal(layout.cards[1].opacity, '1')
      // 在相邻卡片中点取样，验证缩放与蒙层确实随滚动连续变化。
      await page.locator('.home-carousel').evaluate(track => {
        track.style.scrollSnapType = 'none'
        track.scrollLeft = (track.children[1].offsetLeft - track.children[0].offsetLeft) / 2
      })
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.home-room-card')).transform.split('(')[1].split(',')[0]) < .99)
      layout = await geometry(page)
      assert.ok(layout.cards[0].scale > .94 && layout.cards[0].scale < .96, JSON.stringify(layout))
      assert.match(layout.cards[0].overlay, /0\.2\d*\)/)
      await page.locator('.home-carousel').evaluate(track => track.style.removeProperty('scroll-snap-type'))
      await center(page, 0)
      const cdp = await page.context().newCDPSession(page)
      const box = await page.locator('.home-room-card').first().boundingBox()
      const x = box.x + box.width * .8, y = box.y + box.height / 2
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - width * .065 * step, y }] })
        await page.waitForTimeout(20)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForFunction(() => {
        const track = document.querySelector('.home-carousel'), card = track.querySelector('[aria-current="true"]')
        return track.scrollLeft > 20 && Math.abs(card.getBoundingClientRect().left + card.clientWidth / 2 - track.clientWidth / 2) < 1
      })
      assert.equal(new URL(page.url()).pathname, '/', '触摸拖动不能误入房间')
      await center(page, rooms.length)
      await page.getByRole('button', { name: '加入房间', exact: true }).click()
      await page.getByRole('dialog', { name: '加入房间', exact: true }).waitFor()
      assert.equal(await page.getByLabel('输入房间号', { exact: true }).count(), 1)
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await page.waitForTimeout(500)
      await center(page, 2)
    } else {
      assert.ok(Math.abs(layout.cards[0].width - 236 * .8) < 1, '桌面卡片缩小到原来的0.8')
      assert.equal(layout.shellWidth, Math.min(width, 1120))
      assert.ok(layout.containerWidth <= 960, '1120px页面内继续收窄内容')
      assert.notEqual(layout.outerBackground, layout.pageBackground, '页面外侧灰色应与页面区分')
      assert.ok(Math.abs(layout.cards[0].width / layout.cards[0].height - 6 / 7) < .003)
      assert.ok(layout.cards.every(card => card.width === layout.cards[0].width && card.scale === 1 && card.overlayDisplay === 'none'))
      if (width === 1440) {
        const card = page.locator('button.home-room-card').first()
        const bounds = await card.boundingBox()
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 2)
        await page.mouse.down()
        await waitForCardPress(card, true)
        assert.deepEqual(await card.boundingBox(), bounds, '下压时普通卡片的点击区域保持原位')
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 10)
        await waitForCardPress(card, false)
        await page.mouse.up()
        assert.equal(new URL(page.url()).pathname, '/', '移出松手不会进入房间')
      }
      await page.locator('.home-carousel').evaluate(track => track.scrollLeft = track.scrollWidth)
      await page.getByRole('button', { name: '加入房间', exact: true }).click()
      await page.getByRole('dialog', { name: '加入房间', exact: true }).waitFor()
      const joinBounds = await page.getByRole('dialog', { name: '加入房间', exact: true }).boundingBox()
      assert.ok(joinBounds.width <= 400 && joinBounds.height >= 320, JSON.stringify(joinBounds))
      if (width === 1440) await page.screenshot({ path: fileURLToPath(new URL('join-1440.png', output)) })
      await page.keyboard.press('Escape')
    }
    const scrollPosition = await page.locator('.home-carousel').evaluate(track => track.scrollLeft)
    await page.getByRole('button', { name: '房间列表', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '房间列表', exact: true })
    await dialog.waitFor()
    const bounds = await dialog.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height)
    assert.equal(await dialog.locator('.home-room-list > button').count(), 12)
    assert.equal(await dialog.locator('.home-room-list').evaluate(list => list.scrollHeight > list.clientHeight), true)
    await page.screenshot({ path: fileURLToPath(new URL(`list-${width}.png`, output)) })
    await dialog.getByLabel('搜索房间名称或房间号').fill('交流室 3')
    assert.equal(await dialog.locator('.home-room-list > button').count(), 1)
    await dialog.getByLabel('搜索房间名称或房间号').fill(rooms[1].code)
    assert.equal(await dialog.locator('.home-room-list > button').count(), 1)
    await dialog.getByLabel('搜索房间名称或房间号').fill('不存在的房间')
    await dialog.getByText('没有匹配的房间', { exact: true }).waitFor()
    await dialog.getByLabel('搜索房间名称或房间号').fill('')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    const restoredPosition = await page.locator('.home-carousel').evaluate(track => track.scrollLeft)
    assert.ok(Math.abs(restoredPosition - scrollPosition) < 1, `关闭列表保留轮播位置 ${width}px: ${scrollPosition} -> ${restoredPosition}`)
    await page.waitForFunction(() => document.querySelector('.home-list-button') === document.activeElement)
    await page.screenshot({ path: fileURLToPath(new URL(`home-${width}.png`, output)) })
    if (width < 768) await center(page, 0)
    await page.locator('button.home-room-card').first().focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.locator('.room-bottom-bar').waitFor()
    assert.equal(new URL(page.url()).pathname, `/${rooms[1].code}/`, '键盘卡片进入真实房间')
    await page.getByRole('button', { name: '退出房间', exact: true }).click()
    await page.getByRole('button', { name: '房间列表', exact: true }).click()
    await page.getByRole('dialog', { name: '房间列表', exact: true }).getByLabel('搜索房间名称或房间号').fill(rooms[0].code)
    await page.locator('.home-room-list > button').click()
    await page.locator('.room-bottom-bar').waitFor()
    assert.equal(new URL(page.url()).pathname, `/${rooms[0].code}/`, '列表进入真实房间')
    await page.getByRole('button', { name: '退出房间', exact: true }).click()
    if (width < 768) { await center(page, 0); await page.locator('button.home-room-card').first().tap() }
    else await page.locator('button.home-room-card').first().click()
    await page.locator('.room-bottom-bar').waitFor()
    assert.equal(new URL(page.url()).pathname, `/${rooms[0].code}/`, '触摸或鼠标点击卡片进入真实房间')
    await page.context().close()
  }
  // 普通桌面浏览器只收窄窗口，没有触屏模拟，也应能用鼠标拖动选卡。
  const mousePreview = await openPage(390, 844, rooms, false)
  await center(mousePreview, 0)
  let mouseCard = await mousePreview.locator('.home-room-card').first().boundingBox()
  let mouseX = mouseCard.x + mouseCard.width * .85, mouseY = mouseCard.y + mouseCard.height / 2
  await mousePreview.mouse.move(mouseX, mouseY); await mousePreview.mouse.down()
  await mousePreview.mouse.move(mouseX - 100, mouseY, { steps: 5 })
  await mousePreview.waitForFunction(() => {
    const scale = new DOMMatrix(getComputedStyle(document.querySelector('.home-room-card')).transform).a
    return scale < 1 && scale > .9
  })
  const movingPosition = await mousePreview.locator('.home-carousel').evaluate(track => track.scrollLeft)
  assert.ok(movingPosition > 90 && movingPosition < 110, '卡片跟随鼠标位移，不等待松手才切换')
  await mousePreview.mouse.move(mouseX - 225, mouseY, { steps: 5 })
  await mousePreview.mouse.move(mouseX - 225, mouseCard.y + mouseCard.height + 60)
  await mousePreview.mouse.up()
  await waitForSelection(mousePreview, 1)
  assert.equal(new URL(mousePreview.url()).pathname, '/', '移出卡片后松手也不能误入房间')
  assert.equal(await mousePreview.evaluate(() => getSelection().toString()), '', '拖动不选中文字')
  mouseCard = await mousePreview.locator('.home-room-card').nth(1).boundingBox()
  mouseX = mouseCard.x + mouseCard.width * .15; mouseY = mouseCard.y + mouseCard.height / 2
  await mousePreview.mouse.move(mouseX, mouseY); await mousePreview.mouse.down()
  await mousePreview.mouse.move(mouseX + 225, mouseY, { steps: 8 }); await mousePreview.mouse.up()
  await waitForSelection(mousePreview, 0)
  await mousePreview.mouse.move(200, mouseY); await mousePreview.mouse.down()
  await mousePreview.mouse.move(160, mouseY, { steps: 4 }); await mousePreview.mouse.up()
  await waitForSelection(mousePreview, 0)
  assert.equal(new URL(mousePreview.url()).pathname, '/', '短距离拖动回弹也不能触发进入')
  await center(mousePreview, rooms.length)
  const functionButton = await mousePreview.getByRole('button', { name: '创建房间', exact: true }).boundingBox()
  mouseX = functionButton.x + functionButton.width * .15; mouseY = functionButton.y + functionButton.height / 2
  await mousePreview.mouse.move(mouseX, mouseY); await mousePreview.mouse.down()
  await mousePreview.mouse.move(mouseX + 225, mouseY, { steps: 8 }); await mousePreview.mouse.up()
  await waitForSelection(mousePreview, rooms.length - 1)
  assert.equal(await mousePreview.getByRole('dialog').count(), 0, '从功能按钮开始拖动也不打开弹窗')
  await center(mousePreview, 0)
  await mousePreview.mouse.move(280, mouseY); await mousePreview.mouse.down()
  await mousePreview.mouse.move(180, mouseY, { steps: 4 })
  await mousePreview.evaluate(() => window.dispatchEvent(new Event('blur')))
  await mousePreview.mouse.up(); await waitForSelection(mousePreview, 0)
  assert.equal(await mousePreview.locator('.home-carousel.is-dragging').count(), 0, '失焦释放拖动状态')
  await mousePreview.locator('button.home-room-card').first().click()
  await mousePreview.locator('.room-bottom-bar').waitFor()
  assert.equal(new URL(mousePreview.url()).pathname, `/${rooms[0].code}/`, '拖动后仍可正常点击进入')
  await mousePreview.context().close()
  const desktopEntry = await openPage(1440, 900, [])
  const entryCard = desktopEntry.locator('.home-function-card')
  await entryCard.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  await entryCard.screenshot({ path: fileURLToPath(new URL('cats-idle-1440.png', output)) })
  await entryCard.hover({ position: { x: 80, y: 24 } })
  await desktopEntry.mouse.down()
  await waitForCardPress(entryCard, true)
  await waitForCatPress(desktopEntry, 'create', false)
  await waitForCatPress(desktopEntry, 'join', false)
  await desktopEntry.mouse.up()
  await waitForCardPress(entryCard, false)
  assert.equal(await desktopEntry.getByRole('dialog').count(), 0, '空白处下压不打开弹窗')
  for (const [action, title] of [['create', '创建房间'], ['join', '加入房间']]) {
    const button = desktopEntry.getByRole('button', { name: title, exact: true })
    await button.hover()
    await desktopEntry.mouse.down()
    await waitForCatPress(desktopEntry, action, true)
    await waitForCardPress(entryCard, false)
    assert.equal(await desktopEntry.getByRole('dialog').count(), 0, '按住时仅显示按压反馈')
    await entryCard.screenshot({ path: fileURLToPath(new URL(`cats-${action}-1440.png`, output)) })
    await desktopEntry.mouse.up()
    await desktopEntry.getByRole('dialog', { name: title, exact: true }).waitFor()
    await desktopEntry.keyboard.press('Escape')
    await waitForCatPress(desktopEntry, action, false)
  }
  await desktopEntry.emulateMedia({ reducedMotion: 'reduce' })
  await desktopEntry.getByRole('button', { name: '加入房间', exact: true }).focus()
  await desktopEntry.keyboard.down('Space')
  await waitForCatPress(desktopEntry, 'join', true)
  await desktopEntry.keyboard.up('Space')
  await desktopEntry.getByRole('dialog', { name: '加入房间', exact: true }).waitFor()
  await desktopEntry.keyboard.press('Escape')
  await desktopEntry.getByRole('button', { name: '创建房间', exact: true }).click()
  const desktopCreate = desktopEntry.getByRole('dialog', { name: '创建房间', exact: true })
  const createBounds = await desktopCreate.boundingBox()
  assert.ok(createBounds.width <= 400 && createBounds.height >= 320, JSON.stringify(createBounds))
  await desktopEntry.screenshot({ path: fileURLToPath(new URL('create-1440.png', output)) })
  const privateOption = desktopCreate.getByRole('button', { name: '私密房间', exact: true })
  assert.equal(await privateOption.getAttribute('aria-pressed'), 'false')
  assert.equal(await privateOption.evaluate(button => getComputedStyle(button).backgroundColor), 'rgb(227, 228, 224)')
  await privateOption.click()
  assert.equal(await privateOption.getAttribute('aria-pressed'), 'true')
  assert.equal(await privateOption.evaluate(button => getComputedStyle(button).backgroundColor), 'rgb(63, 67, 71)')
  await desktopCreate.getByLabel('四位数字密码', { exact: true }).fill('0042')
  await desktopEntry.screenshot({ path: fileURLToPath(new URL('create-private-1440.png', output)) })
  await desktopEntry.setViewportSize({ width: 640, height: 360 })
  const shortBounds = await desktopCreate.boundingBox()
  assert.ok(shortBounds.y >= 0 && shortBounds.y + shortBounds.height <= 360, '较高弹窗仍须适应矮视口')
  await privateOption.click(); await privateOption.click()
  assert.equal(await desktopCreate.getByLabel('四位数字密码', { exact: true }).inputValue(), '', '取消后重新选中不恢复旧密码')
  await desktopEntry.context().close()
  const empty = await openPage(320, 568, [])
  assert.equal(await empty.locator('.home-room-card').count(), 1)
  const createButton = empty.getByRole('button', { name: '创建房间', exact: true })
  const createButtonBox = await createButton.boundingBox()
  const touch = await empty.context().newCDPSession(empty)
  const touchCard = empty.locator('.home-function-card')
  const touchCardBounds = await touchCard.boundingBox()
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{
    x: touchCardBounds.x + touchCardBounds.width / 2,
    y: touchCardBounds.y + 24,
  }] })
  await waitForCardPress(touchCard, true)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await waitForCardPress(touchCard, false)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{
    x: createButtonBox.x + createButtonBox.width / 2,
    y: createButtonBox.y + createButtonBox.height / 2,
  }] })
  await waitForCatPress(empty, 'create', true)
  await empty.locator('.home-function-card').screenshot({ path: fileURLToPath(new URL('cats-create-320.png', output)) })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await waitForCatPress(empty, 'create', false)
  assert.equal(await empty.getByRole('dialog').count(), 0, '触摸取消后复位且不触发创建')
  await empty.getByRole('button', { name: '创建房间', exact: true }).click()
  const createDialog = empty.getByRole('dialog', { name: '创建房间', exact: true })
  assert.equal(await createDialog.locator('input').count(), 1)
  assert.equal(await createDialog.locator('select').count(), 0)
  await createDialog.getByLabel('输入房间名称').fill('中'.repeat(13))
  await createDialog.getByRole('button', { name: '确定', exact: true }).click()
  await createDialog.getByRole('alert').waitFor()
  await createDialog.getByLabel('输入房间名称').fill('自定义交流室')
  await empty.screenshot({ path: fileURLToPath(new URL('create-320.png', output)) })
  await empty.locator('form button[type="submit"]').click()
  await empty.locator('.room-bottom-bar').waitFor()
  await empty.getByRole('heading', { level: 1, name: '自定义交流室', exact: true }).waitFor()
  await empty.getByRole('button', { name: '退出房间', exact: true }).click()
  assert.equal(await empty.locator('.home-room-card').count(), 2, '新建真实房间出现在首页')
  const externalJoin = empty.getByRole('button', { name: '加入房间', exact: true })
  await externalJoin.focus(); await externalJoin.press('Enter')
  await empty.getByLabel('输入房间号', { exact: true }).fill(rooms[0].code)
  await empty.locator('form button[type="submit"]').click()
  await empty.locator('.room-bottom-bar').waitFor()
  assert.equal(new URL(empty.url()).pathname, `/${rooms[0].code}/`, '功能卡沿用外部房间号加入流程')
  await empty.getByRole('button', { name: '退出房间', exact: true }).click()
  await empty.getByRole('button', { name: '加入房间', exact: true }).focus()
  await empty.getByRole('button', { name: '加入房间', exact: true }).press('Enter')
  const joinDialog = empty.getByRole('dialog', { name: '加入房间', exact: true })
  assert.equal(await joinDialog.locator('input').count(), 1)
  assert.equal(await joinDialog.getByRole('button', { name: '确定', exact: true }).count(), 1)
  await empty.screenshot({ path: fileURLToPath(new URL('join-320.png', output)) })
  await empty.evaluate(code => { history.pushState(null, '', `/${code}/`); window.dispatchEvent(new PopStateEvent('popstate')) }, rooms[2].code)
  assert.equal(await joinDialog.getByLabel('输入房间号').inputValue(), rooms[2].code, '历史导航同步预填房间号')
  await empty.keyboard.press('Escape')
  const privateCreate = empty.getByRole('button', { name: '创建房间', exact: true })
  await privateCreate.focus(); await privateCreate.press('Enter')
  const privateDialog = empty.getByRole('dialog', { name: '创建房间', exact: true })
  await privateDialog.getByLabel('输入房间名称').fill('私密交流室')
  await privateDialog.getByRole('button', { name: '私密房间', exact: true }).click()
  await privateDialog.getByLabel('四位数字密码', { exact: true }).fill('0042')
  await empty.screenshot({ path: fileURLToPath(new URL('create-private-320.png', output)) })
  await privateDialog.getByRole('button', { name: '确定', exact: true }).click()
  await empty.locator('.room-bottom-bar').waitFor()
  await empty.getByRole('heading', { level: 1, name: '私密交流室', exact: true }).waitFor()
  await empty.getByRole('button', { name: '设置', exact: true }).click()
  await empty.locator('.owner-entry').click()
  assert.equal(await empty.getByRole('switch', { name: /房间密码/ }).isChecked(), true)
  await empty.getByRole('button', { name: '返回设置', exact: true }).click()
  await empty.getByRole('button', { name: '关闭设置', exact: true }).click()
  const privateCode = /\d{6}/.exec(new URL(empty.url()).pathname)[0]
  const savedEntries = await empty.evaluate(() => localStorage.getItem('hakisub.rooms.v1'))
  assert.doesNotMatch(savedEntries, /"password"|"accessCode"/, '本机入口不保存密码')
  const visitor = await openPage(390, 844, [])
  await visitor.getByRole('button', { name: '加入房间', exact: true }).click()
  await visitor.getByLabel('输入房间号').fill(privateCode)
  await visitor.getByRole('dialog', { name: '加入房间', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
  const passwordDialog = visitor.getByRole('dialog', { name: '这是一个加密房间', exact: true })
  await passwordDialog.waitFor()
  assert.equal(await visitor.locator('.room-bottom-bar').count(), 0)
  await passwordDialog.getByLabel('输入密码').fill('0000')
  await passwordDialog.getByRole('button', { name: '确定', exact: true }).click()
  await passwordDialog.getByText('入房码不正确，请重新输入。', { exact: true }).waitFor()
  await passwordDialog.getByLabel('输入密码').fill('0042')
  await passwordDialog.getByRole('button', { name: '确定', exact: true }).click()
  await visitor.locator('.room-bottom-bar').waitFor()
  await visitor.getByRole('heading', { level: 1, name: '私密交流室', exact: true }).waitFor()
  await visitor.context().close()
  const responsive = await openPage(390, 844, rooms)
  await center(responsive, 2)
  await responsive.setViewportSize({ width: 768, height: 900 })
  await responsive.waitForFunction(() => getComputedStyle(document.querySelector('.home-room-card'), '::after').display === 'none')
  await responsive.setViewportSize({ width: 390, height: 844 })
  await responsive.waitForFunction(() => {
    const track = document.querySelector('.home-carousel'), card = track.querySelector('[aria-current="true"]')
    return Math.abs(card.getBoundingClientRect().left + card.clientWidth / 2 - track.clientWidth / 2) < 1
  })
  assert.deepEqual(errors, [])
  console.log('通过：首页六视口、猫按钮鼠标和键盘按压、触屏按压与取消、触屏滑动、窄窗口拖动防误入、列表及本地 WebSocket 创建加入、私密建房与密码回归。未使用真实麦克风、豆包或物理手机。')
} finally { await browser?.close(); peers.forEach(peer => peer.terminate()); await gateway.close() }
