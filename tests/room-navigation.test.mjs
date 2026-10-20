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
let shared, copied, copies = 0
const clipboard = { writeText: async url => { copied = url; copies++ } }
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', { share: async data => { shared = data }, clipboard }), 'shared')
assert.deepEqual(JSON.parse(JSON.stringify(shared)), { title: 'HakiSub 字幕房间 114514', url: 'https://hakisub.xdstar.work/114514/' })
assert.equal(copies, 0)
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', { clipboard }), 'copied')
assert.equal(copied, shared.url)
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', { share: async () => { throw { name: 'NotAllowedError' } }, clipboard }), 'copied')
const copiesBeforeCancel = copies
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', { share: async () => { throw { name: 'AbortError' } }, clipboard }), 'cancelled')
assert.equal(copies, copiesBeforeCancel, '取消系统分享不再触发复制')
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', {}), 'unavailable')
assert.equal(await shareRoomLink('114514', 'https://hakisub.xdstar.work', { clipboard: { writeText: async () => { throw Error('denied') } } }), 'unavailable')
console.log('通过：六位房间路径、无凭据分享URL、系统分享、复制回退、取消和权限失败；未调用外部分享服务。')
