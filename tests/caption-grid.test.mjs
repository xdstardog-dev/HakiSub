import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { computed, reactive, watch, ref, nextTick, effectScope } from 'vue'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
const script = readFileSync(new URL('../src/components/MemberCaptionGrid.vue', import.meta.url), 'utf8')
  .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const interactions = readFileSync(new URL('../src/roomInteractions.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const props = reactive({ members: [{ id: 'a' }, { id: 'b' }], captions: [], now: 0, adaptive: false, selfId: 'a', liveInput: true, onlineRoom: false, reactions: [], typingCooldownUntil: 0, reactionCooldownUntil: 0 })
let time = 1000, timerId = 0
const timers = new Map(), emitted = []
class Clock extends Date { static now() { return time } }
const context = vm.createContext({ Date: Clock, window: { innerWidth: 390, innerHeight: 844 },
  setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id),
  computed, reactive, watch, ref, nextTick, onMounted: () => {}, onUnmounted: () => {}, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args) })
const scope = effectScope()
scope.run(() => vm.runInContext(ts.transpile(interactions + script + '\nglobalThis.latest = latestCaptionIds; globalThis.view = {tiles,latestCaptionIds,tileStyle,gridElement,emit,reactionMenu,selectedReactionOptions,openReactionSettings,handleCardContextMenu,startLongPress,moveLongPress,finishLongPress,selectReaction,editTypedCaption,handleCardKeydown,dismissReactionMenu,handleEscape};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context))
const add = async (memberId, id, state = 'final') => { props.captions.push({ memberId, id, state, text: '字幕' }); await nextTick() }
await add('a', 'old-long')
await add('b', 'other')
await add('a', 'new-short', 'interim')
assert.equal(context.latest.get('a'), 'new-short')
assert.equal(context.latest.get('b'), 'other')
props.captions.at(-1).text = '不断增长的字幕'; props.captions.at(-1).state = 'final'; await nextTick()
assert.equal(context.latest.get('a'), 'new-short')
props.captions = props.captions.filter(c => c.id !== 'new-short'); await nextTick()
assert.equal(context.latest.get('a'), 'new-short', '最新短句先过期时，不重新加粗旧长句')
await add('a', 'next')
assert.equal(context.latest.get('a'), 'next')
props.captions = []; await nextTick(); await add('a', 'fresh')
assert.equal(context.latest.get('a'), 'fresh')
props.members = props.members.filter(m => m.id !== 'b'); await nextTick()
assert.equal(context.latest.has('b'), false)
const template = readFileSync(new URL('../src/components/MemberCaptionGrid.vue', import.meta.url), 'utf8').match(/<template>([\s\S]*?)<\/template>/)[1]
const render = new Function('Vue', ts.transpile(compile(template, { mode: 'function', prefixIdentifiers: true, expressionPlugins: ['typescript'] }).code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }))(Vue)
props.members = [{ id: 'a', name: '测试', mic: false }]; props.captions = []; props.startingMemberId = 'a'
const html = () => {
  const app = Vue.createSSRApp({ setup: () => ({ ...context.view, ...Vue.toRefs(props), captionOpacity: () => 1 }), render })
  app.directive('caption-scroll', {})
  return renderToString(app)
}
assert.match(await html(), /麦克风准备中/)
assert.match(await html(), /取消开启测试的麦克风/)
assert.doesNotMatch(await html(), /麦克风已关闭/)
props.startingMemberId = undefined; props.members[0].mic = true
assert.match(await html(), /关闭测试的麦克风/)
const view = context.view
props.members = [{ id: 'a', name: '测试', mic: false, mode: 'typing' }, { id: 'b', name: '别人', mic: false }]
props.typedDraft = '草稿'
await nextTick()
const initial = emitted.length
view.editTypedCaption('b'); assert.equal(emitted.length, initial)
view.editTypedCaption('a'); assert.equal(emitted.at(-1)[0], 'editTyped')
assert.doesNotMatch(await html(), /<textarea/, '卡片只提供入口，不再容纳输入框')
assert.match(await html(), /继续编辑草稿/)
assert.match(await html(), /打字模式/)
const contextMenu = { button: 2, clientX: 380, clientY: 840, preventDefault() { this.prevented = true } }
view.handleCardContextMenu(contextMenu, 'a'); assert.equal(view.reactionMenu.value, null)
assert.equal(contextMenu.prevented, undefined, '自己卡片保留原生文字编辑菜单')
view.handleCardContextMenu(contextMenu, 'b'); assert.equal(view.reactionMenu.value.memberId, 'b')
assert.equal(contextMenu.prevented, true, '其他成员卡片以回应菜单替代浏览器菜单')
assert.ok(view.reactionMenu.value.left <= 390 - 224)
assert.ok(view.reactionMenu.value.top <= 844 - 264)
assert.match(await html(), /快捷回应/)
assert.match(await html(), /😆 闹麻了<\/button>/)
assert.doesNotMatch(await html(), /娱乐/)
assert.match(await html(), /reaction-menu-footer/)
assert.match(await html(), />设置<\/button>/)
assert.equal(view.selectedReactionOptions.value.length, 5)
props.selectedReactions = ['thanks', 'repeat']; await nextTick()
assert.equal(view.selectedReactionOptions.value.length, 2)
assert.match(await html(), /🙏 谢谢/); assert.doesNotMatch(await html(), />👍 赞同/)
view.openReactionSettings(); assert.equal(view.reactionMenu.value, null)
assert.equal(emitted.at(-1)[0], 'reactionSettings')
props.selectedReactions = undefined; view.handleCardContextMenu(contextMenu, 'b')
view.selectReaction('agree'); assert.equal(view.reactionMenu.value, null)
assert.deepEqual(Array.from(emitted.at(-1)), ['react', 'b', 'agree'])
const touch = { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 30, clientY: 70 }
view.startLongPress(touch, 'b'); assert.equal(timers.size, 1)
view.moveLongPress({ ...touch, clientX: 55 }); assert.equal(timers.size, 0)
view.startLongPress(touch, 'b'); view.finishLongPress(touch); assert.equal(timers.size, 0)
view.handleCardContextMenu(contextMenu, 'b'); assert.equal(view.reactionMenu.value, null, '轻触后的系统 contextmenu 不提前弹菜单')
time += 1000
view.startLongPress(touch, 'a'); assert.equal(timers.size, 0, '自己卡片不会启动长按')
view.startLongPress(touch, 'b'); [...timers.values()][0]()
assert.equal(view.reactionMenu.value.memberId, 'b')
view.finishLongPress(touch)
view.selectReaction('fun'); assert.deepEqual(Array.from(emitted.at(-1)), ['react', 'b', 'fun'])
view.handleCardContextMenu(contextMenu, 'b'); assert.equal(view.reactionMenu.value, null, '长按释放后的系统 contextmenu 不重开菜单')
time += 1000
view.handleCardContextMenu({ ...contextMenu, pointerType: 'touch' }, 'b'); assert.equal(view.reactionMenu.value, null)
props.members[0].mode = 'muted'; await nextTick()
const beforeMutedEdit = emitted.length; view.editTypedCaption('a'); assert.equal(emitted.length, beforeMutedEdit)
scope.stop()
console.log('通过：字幕最新句与清理回归、卡片只提供本人打字入口、桌面右键与触屏长按/移动取消/原生菜单隔离、菜单边界和选择关闭。')
