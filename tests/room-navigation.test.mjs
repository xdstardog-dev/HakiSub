import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const script = readFileSync(new URL('../src/roomNavigation.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const context = vm.createContext({ URL })
vm.runInContext(ts.transpile(script + ';globalThis.navigation={roomCodeFromPath,roomPath,roomShareUrl,shareRoomLink,copyText}', { target: ts.ScriptTarget.ES2022 }), context)
const { roomCodeFromPath, roomPath, roomShareUrl, shareRoomLink, copyText } = context.navigation
for (const path of ['/114514', '/114514/']) assert.equal(roomCodeFromPath(path), '114514')
for (const path of ['/', '/glasses', '/11451/', '/1145140/', '/114514/extra', '//114514/']) assert.equal(roomCodeFromPath(path), undefined)
assert.equal(roomPath('114514'), '/114514/')
assert.throws(() => roomPath('../.env'))
assert.equal(roomShareUrl('114514', 'https://hakisub.xdstar.work/?token=secret#private'), 'https://hakisub.xdstar.work/114514/')
let copied, copies = 0, shares = 0
const clipboard = { writeText: async url => { copied = url; copies++ } }
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work/?ownerToken=secret#private', { share: async () => { shares++ }, clipboard }), 'copied')
assert.equal(copied, 'https://hakisub.xdstar.work/114514/')
assert.equal(copies, 1)
assert.equal(shares, 0, '支持系统分享的浏览器也直接复制，不打开分享面板')
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', { clipboard }), 'copied')
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', {}), 'unavailable')
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', { clipboard: { writeText: async () => { throw Error('denied') } } }), 'unavailable')
assert.equal(shares, 0)
assert.equal(roomShareUrl('001234', 'https://user:password@hakisub.xdstar.work/private?ownerToken=secret&memberToken=secret#secret'), 'https://hakisub.xdstar.work/001234/')
assert.equal(await copyText('001234', { clipboard }, undefined), 'copied')
assert.equal(copied, '001234')
function fallbackPage(result = true) {
  const elements = [], calls = []
  const focus = { tagName: 'INPUT', isConnected: true, selectionStart: 2, selectionEnd: 4, focus() { calls.push('restore-focus') }, setSelectionRange(start, end) { calls.push([start, end]) } }
  return { elements, calls, activeElement: focus, getSelection: () => null,
    body: { append(element) { elements.push(element) } },
    createElement: () => ({ style: {}, setAttribute() {}, focus() {}, select() {}, setSelectionRange() {}, remove() { elements.pop() } }),
    execCommand(command) { calls.push(command); assert.equal(elements[0].value, '001234'); if (result instanceof Error) throw result; return result },
  }
}
for (const browser of [{}, { clipboard: { writeText: async () => { throw new DOMException('denied', 'NotAllowedError') } } }]) {
  for (const result of [true, false, Error('disabled')]) {
    const page = fallbackPage(result)
    assert.equal(await copyText('001234', browser, page), result === true ? 'copied' : 'unavailable')
    assert.equal(page.elements.length, 0, '所有分支清理临时DOM')
    assert.deepEqual(page.calls, ['copy', 'restore-focus', [2, 4]])
  }
}
const missingCommand = fallbackPage(); delete missingCommand.execCommand
assert.equal(await copyText('001234', {}, missingCommand), 'unavailable'); assert.equal(missingCommand.elements.length, 0)
let reject, current = true
const page = fallbackPage()
const pending = copyText('001234', { clipboard: { writeText: () => new Promise((_, fail) => { reject = fail }) } }, page, () => current)
current = false; reject(Error('late denial'))
assert.equal(await pending, 'unavailable'); assert.equal(page.calls.length, 0, '失效操作不得执行备用复制或抢焦点')
console.log('通过：六位房间路径、无凭据分享URL、直接复制、无系统分享面板及剪贴板缺失／权限失败；未调用外部分享服务。')
