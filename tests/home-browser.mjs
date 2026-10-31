// 使用正式构建与隔离内存网关；房间由真实 WebSocket 创建，不读取现有房间或 .env。
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
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
try {
  browser = await chromium.launch({ channel: process.env.HAKISUB_BROWSER_CHANNEL ?? 'chrome', headless: true })
  const rooms = []
  for (let index = 0; index < 12; index++) rooms.push(await createRoom(index))
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
  await empty.getByRole('button', { name: '房间设置', exact: true }).click()
  await empty.locator('.owner-entry').click()
  assert.equal(await empty.getByRole('switch', { name: /房间密码/ }).isChecked(), true)
  await empty.getByRole('button', { name: '返回房间设置', exact: true }).click()
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
  console.log('通过：首页六视口/触屏滑动、窄窗口鼠标双向拖动/连续缩放/松手吸附/移出松手/短拖防误入/随后点击、列表及本地WebSocket创建加入、私密建房与密码回归。未使用真实麦克风/豆包或物理手机。')
} finally { await browser?.close(); peers.forEach(peer => peer.terminate()); await gateway.close() }
