import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

const source = readFileSync(new URL('../src/components/TypingComposer.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const model = readFileSync(new URL('../src/roomInteractions.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
const render = new Function('Vue', ts.transpile(compile(template, { mode: 'function', prefixIdentifiers: true, expressionPlugins: ['typescript'] }).code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }))(Vue)
const surface = values => ({ ...values, listeners: new Map(), addEventListener(name, handler) { this.listeners.set(name, handler) }, removeEventListener(name) { this.listeners.delete(name) } })
let time = 1000
class Clock extends Date { static now() { return time } }
function mount(viewport) {
  const window = surface({ innerWidth: 1280, innerHeight: 900, visualViewport: viewport, mobile: false, matchMedia() { return { matches: this.mobile } } })
  const props = Vue.reactive({ draft: '草稿', sending: false, now: time, cooldownUntil: 0 })
  const emitted = [], mounted = [], unmounted = []
  const context = vm.createContext({ ...Vue, Date: Clock, window, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args), onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn) })
  vm.runInContext(ts.transpile(model + script + '\nglobalThis.view = {inputElement,composerElement,dismissOutside,composing,placement,windowStyle,canSend,send,handleKeydown,endComposition,emit,TYPED_CAPTION_LIMIT};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  let focused
  context.view.inputElement.value = { focus(options) { focused = options } }
  mounted.forEach(fn => fn())
  return { view: context.view, window, props, emitted, focused, close: () => unmounted.forEach(fn => fn()) }
}
const viewport = surface({ width: 1280, height: 900, offsetTop: 0, offsetLeft: 0 })
const session = mount(viewport), { view, window, props, emitted } = session
assert.equal(session.focused.preventScroll, true)
assert.equal(view.placement.value.left, 640); assert.equal(view.placement.value.bottom, 804)
assert.equal(view.placement.value.width, 440)
window.mobile = true; viewport.width = 390; viewport.height = 844
viewport.listeners.get('resize')()
assert.equal(view.placement.value.bottom, 832); assert.equal(view.placement.value.width, 326)
viewport.height = 420; viewport.listeners.get('resize')()
assert.equal(view.placement.value.bottom, 408, '键盘弹出时跟随可见视口上移')
viewport.offsetTop = 70; viewport.offsetLeft = 10; viewport.listeners.get('scroll')()
assert.equal(view.placement.value.bottom, 478, '补偿输入法触发的视口平移')
assert.equal(view.placement.value.left, 205)
viewport.height = 844; viewport.offsetTop = 0; viewport.listeners.get('resize')()
assert.equal(view.placement.value.bottom, 832, '键盘收起时下移')
const html = await renderToString(Vue.createSSRApp({ setup: () => ({ ...view, ...Vue.toRefs(props) }), render }))
assert.match(html, /role="dialog"/); assert.match(html, /输入字幕/); assert.match(html, /草稿/)
const key = overrides => ({ key: 'Enter', keyCode: 13, shiftKey: false, isComposing: false, repeat: false, preventDefault() { this.prevented = true }, stopPropagation() {}, ...overrides })
view.composing.value = true; view.handleKeydown(key()); assert.equal(emitted.length, 0)
view.endComposition(); const confirmation = key(); view.handleKeydown(confirmation)
assert.equal(emitted.length, 0); assert.equal(confirmation.prevented, true)
time += 60
for (const override of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { repeat: true }]) view.handleKeydown(key(override))
assert.equal(emitted.length, 0)
view.handleKeydown(key()); assert.equal(emitted.at(-1)[0], 'send')
props.sending = true; view.handleKeydown(key()); assert.equal(emitted.length, 1)
props.sending = false; props.cooldownUntil = time + 1000; view.send(); assert.equal(emitted.length, 1)
props.cooldownUntil = 0; props.draft = ' '; view.send(); assert.equal(emitted.length, 1)
props.draft = '中'.repeat(1001); assert.equal(view.canSend.value, false)
view.composing.value = true; view.handleKeydown(key({ key: 'Escape', isComposing: true })); assert.equal(emitted.length, 1)
view.composing.value = false; view.handleKeydown(key({ key: 'Escape' })); assert.equal(emitted.at(-1)[0], 'close')
const inside = {}; view.composerElement.value = { contains: target => target === inside }
const beforeOutside = emitted.length; window.listeners.get('click')({ target: inside })
assert.equal(emitted.length, beforeOutside, '框内输入和发送不触发关闭')
let stoppedBlankClick = false
window.listeners.get('click')({ target: {}, stopPropagation() { stoppedBlankClick = true } }); assert.equal(emitted.at(-1)[0], 'close')
assert.equal(stoppedBlankClick, true, '空白点击不能在收起后重新打开编辑器')
assert.equal(props.draft, '中'.repeat(1001), '外部点击只收起，不修改草稿')
let stoppedControlClick = false
window.listeners.get('click')({ target: { closest: () => ({}) }, stopPropagation() { stoppedControlClick = true } })
assert.equal(stoppedControlClick, false, '框外功能控件继续执行本来的操作')
session.close(); assert.equal(viewport.listeners.size, 0); assert.equal(window.listeners.size, 0)
const fallback = mount(null)
fallback.window.innerHeight = 600; fallback.window.listeners.get('resize')()
assert.equal(fallback.view.placement.value.bottom, 528, '无 VisualViewport 时使用窗口大小')
fallback.close(); assert.equal(fallback.window.listeners.size, 0)
console.log('通过：全局悬浮输入模板、桌面位置、软键盘视口升降/平移/恢复、窗口回退、聚焦与监听清理、框内点击/框外空白收起保留草稿/外部控件不拦截、IME多种事件顺序/换行/冷却/发送中/长度/Escape保护。')
