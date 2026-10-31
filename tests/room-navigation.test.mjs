import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const script = readFileSync(new URL('../src/roomNavigation.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const context = vm.createContext({ URL })
vm.runInContext(ts.transpile(script + ';globalThis.navigation={roomCodeFromPath,roomPath,roomShareUrl,shareRoomLink}', { target: ts.ScriptTarget.ES2022 }), context)
const { roomCodeFromPath, roomPath, roomShareUrl, shareRoomLink } = context.navigation
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
console.log('通过：六位房间路径、无凭据分享URL、直接复制、无系统分享面板及剪贴板缺失／权限失败；未调用外部分享服务。')
