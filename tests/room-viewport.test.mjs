import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const surface = value => ({ ...value, handlers: new Map(), addEventListener(k, f) { this.handlers.set(k, f) }, removeEventListener(k) { this.handlers.delete(k) } })
const values = new Map(), classes = new Set()
const document = surface({ activeElement: null, documentElement: { style: { setProperty(k,v) { values.set(k,v) }, removeProperty(k) { values.delete(k) } }, classList: { toggle(k,v) { v ? classes.add(k) : classes.delete(k) }, remove(k) { classes.delete(k) } } } })
const viewport = surface({ height: 844, offsetTop: 0, scale: 1 }), window = surface({ innerHeight: 844, visualViewport: viewport })
const context = vm.createContext({ document, window })
const code = readFileSync(new URL('../src/roomViewport.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
vm.runInContext(ts.transpile(code + '\nglobalThis.install=installRoomViewport', { target: ts.ScriptTarget.ES2022 }), context)
const dispose = context.install()
document.activeElement = { tagName: 'TEXTAREA' }; document.handlers.get('focusin')()
for (const resizedLayout of [false, true]) {
  window.innerHeight = resizedLayout ? 480 : 844; viewport.height = 480; viewport.offsetTop = 20; viewport.handlers.get('resize')()
  assert.equal(values.get('--room-screen-height'), '844px'); assert.equal(values.get('--room-keyboard-inset'), '344px'); assert.ok(classes.has('room-keyboard-open'))
}
window.innerHeight = 844; viewport.height = 844; viewport.offsetTop = 0; viewport.handlers.get('resize')()
assert.equal(values.get('--room-keyboard-inset'), '0px'); assert.equal(classes.size, 0)
document.activeElement = null; document.handlers.get('focusout')(); dispose(); assert.equal(values.size, 0); assert.equal(window.handlers.size, 0); assert.equal(viewport.handlers.size, 0)
const persistent = new Map(), session = new Map()
const storage = map => ({ getItem: k => map.get(k), setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) })
const recovery = vm.createContext({ localStorage: storage(persistent), sessionStorage: storage(session) })
vm.runInContext(ts.transpile(readFileSync(new URL('../src/roomRecovery.ts',import.meta.url),'utf8').replace(/^export /gm,'') + '\nglobalThis.model={loadActiveRoom,saveActiveRoom,loadReconnectToken,saveReconnectToken}', {target:ts.ScriptTarget.ES2022}), recovery)
const m = recovery.model
assert.equal(m.loadActiveRoom(),undefined); m.saveActiveRoom({code:'123456',name:'游客',roomName:'测试'}); assert.equal(m.loadActiveRoom().code,'123456')
m.saveReconnectToken('123456','11111111-1111-1111-1111-111111111111'); assert.ok(m.loadReconnectToken('123456')); assert.equal(m.loadReconnectToken('654321'),undefined)
session.clear(); assert.equal(m.loadReconnectToken('123456'),undefined); assert.equal(m.loadActiveRoom().code,'123456')
m.saveActiveRoom(); assert.equal(m.loadActiveRoom(),undefined)
console.log('通过：Android布局视口缩小/iOS可见视口平移的模型、键盘恢复/清理、留房标记与标签页凭据隔离、退出清除；不能替代真机。')
