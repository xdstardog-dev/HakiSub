import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import * as Vue from 'vue'
import ts from 'typescript'
import { renderToString } from '@vue/server-renderer'
import { loadVueComponent } from './load-vue-component.mjs'

const source = readFileSync(new URL('../src/components/MemberModeControl.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const props = Vue.reactive({ memberName: '我', microphone: false, mode: 'muted', allowTyping: true })
const timers = new Map(), listeners = new Map(), emitted = [], unmounted = []
let timerId = 0, time = 10000
class Clock extends Date { static now() { return time } }
const window = { innerWidth: 320, innerHeight: 568, addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) }
const context = vm.createContext({ ...Vue, window, Date: Clock, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args),
  setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id), onMounted: fn => fn(), onUnmounted: fn => unmounted.push(fn) })
const scope = Vue.effectScope()
scope.run(() => vm.runInContext(ts.transpile(script + '\nglobalThis.view = {actionLabel,microphoneButton,typingOption,menuOpen,menuPosition,dragSelected,handleClick,startPress,movePress,finishPress,cancelPress,handleContextMenu,handleKeydown,handleWindowKeydown};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context))
const view = context.view
let focused = 0
const button = { getBoundingClientRect: () => ({ left: 270, top: 540 }), focus() { focused++ }, setPointerCapture() {} }
view.microphoneButton.value = button
view.typingOption.value = { getBoundingClientRect: () => ({ left: 130, right: 262, top: 508, bottom: 560 }), focus() { focused++ } }
const event = values => ({ pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', clientX: 290, clientY: 540, currentTarget: button, detail: 1, preventDefault() { this.prevented = true }, ...values })
const fire = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()) }
const toggles = () => emitted.filter(([name]) => name === 'toggleMic').length
const selections = () => emitted.filter(([name]) => name === 'selectTyping').length
view.handleClick(event()); assert.equal(toggles(), 1); assert.match(view.actionLabel.value, /开启/)
props.microphone = true; assert.match(view.actionLabel.value, /关闭/)
props.mode = 'typing'; assert.match(view.actionLabel.value, /保持闭麦/)
props.preparing = true; assert.match(view.actionLabel.value, /取消开启/); props.preparing = false
view.startPress(event()); fire(); assert.equal(view.menuOpen.value, true)
assert.ok(view.menuPosition.value.left >= 8 && view.menuPosition.value.top <= 508)
view.finishPress(event()); view.handleClick(event()); assert.equal(toggles(), 1, '长按后合成click不能开关麦')
assert.equal(view.menuOpen.value, true, '长按原地松手保留菜单以供点击')
view.cancelPress(); view.startPress(event()); fire()
view.movePress(event({ clientX: 160 })); assert.equal(view.dragSelected.value, true)
assert.equal(selections(), 0, '滑过目标尚未松手不切换')
view.finishPress(event({ clientX: 160 })); assert.equal(selections(), 1)
view.handleClick(event()); assert.equal(toggles(), 1)
view.startPress(event()); fire(); view.movePress(event({ clientX: 70, clientY: 300 })); view.finishPress(event({ clientX: 70, clientY: 300 }))
assert.equal(selections(), 1); assert.equal(view.menuOpen.value, false, '移出后松手取消')
view.startPress(event()); view.movePress(event({ clientY: 500 })); assert.equal(timers.size, 0)
view.finishPress(event()); view.handleClick(event()); assert.equal(toggles(), 1, '长按前滑动取消且不误切麦')
view.startPress(event()); fire(); view.cancelPress(); assert.equal(view.menuOpen.value, false)
time += 1000
view.handleContextMenu(event({ pointerType: 'mouse' })); assert.equal(view.menuOpen.value, true)
view.handleWindowKeydown({ key: 'Escape', preventDefault() {} }); assert.equal(view.menuOpen.value, false)
view.handleKeydown({ key: 'ArrowLeft', preventDefault() {} }); await Vue.nextTick(); assert.ok(focused > 0)
view.handleWindowKeydown({ key: 'Tab' }); assert.equal(view.menuOpen.value, false)
props.disabled = true; await Vue.nextTick(); view.startPress(event()); view.handleClick(event({ detail: 0 })); assert.equal(timers.size, 0); assert.equal(toggles(), 1)
props.disabled = false; props.allowTyping = false; view.handleContextMenu(event({ pointerType: 'mouse' })); assert.equal(view.menuOpen.value, false)
const Component = await loadVueComponent(new URL('../src/components/MemberModeControl.vue', import.meta.url))
const html = await renderToString(Vue.createSSRApp(Component, { ...props, microphone: false, mode: 'muted', allowTyping: true }))
assert.match(html, /开启我的麦克风/); assert.match(html, /选择输入方式/); assert.match(html, /aria-haspopup="menu"/)
unmounted.forEach(fn => fn()); scope.stop(); assert.equal(listeners.size, 0); assert.equal(timers.size, 0)
console.log('通过：实际模式控件模板、短按/准备/退出打字标签、长按防合成点击、左滑松手确认/移出取消、早移/取消、右键/键盘/边界、禁用与卸载清理。')
