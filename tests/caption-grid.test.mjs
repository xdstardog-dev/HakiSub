import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { computed, reactive, watch, ref, nextTick, effectScope } from 'vue'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
import { loadVueComponent } from './load-vue-component.mjs'
const MemberModeControl = await loadVueComponent(new URL('../src/components/MemberModeControl.vue', import.meta.url))
const script = readFileSync(new URL('../src/components/MemberCaptionGrid.vue', import.meta.url), 'utf8')
  .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const interactions = readFileSync(new URL('../src/roomInteractions.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const contraction = readFileSync(new URL('../src/memberContraction.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const captionModel = readFileSync(new URL('../src/captions.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const props = reactive({ members: [{ id: 'a' }, { id: 'b' }], captions: [], now: 0, adaptive: false, selfId: 'a', liveInput: true, onlineRoom: false, reactions: [], typingCooldownUntil: 0, reactionCooldownUntil: 0 })
let time = 1000, timerId = 0
const timers = new Map(), emitted = []
class Clock extends Date { static now() { return time } }
const context = vm.createContext({ Date: Clock, window: { innerWidth: 390, innerHeight: 844 },
  setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id),
  computed, reactive, watch, ref, nextTick, onMounted: () => {}, onUnmounted: () => {}, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args) })
const scope = effectScope()
scope.run(() => vm.runInContext(ts.transpile(interactions + contraction + captionModel + script + '\nglobalThis.latest = latestCaptionIds; globalThis.view = {tiles,visibleTiles,contractedTiles,contractionStates,restoreMember,pressedMembers,focusedMemberId,modeMenuMemberId,handleFocusIn,handleFocusOut,latestCaptionIds,tileStyle,gridElement,emit,reactionMenu,selectedReactionOptions,openReactionSettings,handleCardContextMenu,startLongPress,moveLongPress,finishLongPress,selectReaction,editTypedCaption,handleCardKeydown,dismissReactionMenu,handleEscape};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context))
const add = async (memberId, id, state = 'final') => { props.captions.push({ memberId, id, state, text: '字幕', finalizedAt: null, holdMs: 0 }); await nextTick() }
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
  app.component('MemberModeControl', MemberModeControl)
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
view.pressedMembers.clear(); view.reactionMenu.value = null
props.now = 20000; await nextTick()
props.members = [{ id: 'c', name: '闭麦', mic: false, mode: 'muted' }, { id: 'd', name: '开麦', mic: true, mode: 'microphone' }]
props.captions = []; await nextTick()
props.now = 24999; await nextTick(); assert.equal(view.contractedTiles.value.length, 0)
await add('c', 'arrived')
props.now = 50000; await nextTick(); assert.equal(view.contractedTiles.value.length, 0, '出现字后不能沿用先前的空白计时')
props.captions = []; await nextTick()
props.now = 54999; await nextTick(); assert.equal(view.contractedTiles.value.length, 0, '消字后必须重新等满5秒')
props.now = 55000; await nextTick(); assert.equal(view.contractedTiles.value[0].id, 'c')
assert.deepEqual(Array.from(view.visibleTiles.value, member => member.id), ['d'])
assert.match(await html(), /闭麦，闭麦，长按或右键发送快捷回应/)
assert.doesNotMatch(await html(), /展开闭麦的卡片/)
const contractedSince = view.contractionStates.get('c').emptyMutedSince
view.restoreMember('c', { detail: 1 }); assert.equal(view.contractedTiles.value.length, 1, '点击他人头像不能展开')
view.restoreMember('c', { detail: 0 }); assert.equal(view.contractedTiles.value.length, 1, '键盘激活他人头像不能展开')
assert.equal(view.contractionStates.get('c').emptyMutedSince, contractedSince, '不能通过点击重置他人的收束状态')
props.selfId = 'c'; await nextTick()
assert.match(await html(), /展开闭麦的卡片（我），保持闭麦/)
view.restoreMember('c', { detail: 1 }); assert.equal(view.contractedTiles.value.length, 0)
assert.equal(props.members[0].mic, false, '头像展开不能开麦')
props.now = 59999; await nextTick(); assert.equal(view.contractedTiles.value.length, 0)
props.now = 60000; await nextTick(); assert.equal(view.contractedTiles.value.length, 1)
props.members[0].mode = 'typing'; await nextTick(); assert.equal(view.contractedTiles.value.length, 0, '切打字立即展开')
props.members[0].mode = 'muted'; await nextTick(); props.now = 80000; await nextTick()
assert.equal(view.contractedTiles.value.length, 1)
await add('c', 'late'); assert.equal(view.contractedTiles.value.length, 0, '收起后出现新字幕立即展开')
props.captions = [{ memberId: 'c', id: 'fade', text: '最后一句', state: 'final', finalizedAt: 80000, holdMs: 3000 }]
props.now = 84999; await nextTick(); assert.equal(view.contractionStates.get('c').emptyMutedSince, null, '渐隐中的字仍算有字')
props.now = 85000; await nextTick(); assert.equal(view.contractionStates.get('c').emptyMutedSince, 85000)
props.now = 89999; await nextTick(); assert.equal(view.contractedTiles.value.length, 0)
view.focusedMemberId.value = 'c'; props.now = 110000; await nextTick()
assert.equal(view.contractedTiles.value.length, 0, '焦点内不收起')
view.focusedMemberId.value = null; await nextTick(); props.now = 114999; await nextTick(); assert.equal(view.contractedTiles.value.length, 0)
props.now = 115000; await nextTick(); assert.equal(view.contractedTiles.value.length, 1)
view.reactionMenu.value = { memberId: 'c' }; await nextTick(); assert.equal(view.contractedTiles.value.length, 1, '头像回应菜单不导致展开')
view.reactionMenu.value = null
props.members[0].mic = true; await nextTick(); assert.equal(view.contractedTiles.value.length, 0, '开麦立即展开')
assert.deepEqual(Array.from(view.visibleTiles.value, member => member.id), ['c', 'd'], '恢复原成员顺序')
props.members[0].mic = false; props.protectedMemberId = 'c'; props.now = 150000; await nextTick()
assert.equal(view.contractedTiles.value.length, 0, '准备/错误等受保护状态不收起')
props.members = []; await nextTick(); assert.equal(view.contractionStates.size, 0, '离房/成员离开清理计时')
props.now = 200000
props.members = [{ id: 'snapshot', name: '批量更新', mic: false, mode: 'muted' }]
props.captions = [{ memberId: 'snapshot', id: 'snapshot-text', text: '快照字幕', state: 'final', finalizedAt: 200000, holdMs: 3000 }]
await nextTick()
props.captions = []; props.now = 205000; await nextTick()
assert.equal(view.contractionStates.get('snapshot').emptyMutedSince, 205000, '同一轮字幕过期与时钟更新不能使用旧时钟提前计时')
props.now = 209999; await nextTick(); assert.equal(view.contractedTiles.value.length, 0)
props.now = 210000; await nextTick(); assert.equal(view.contractedTiles.value.length, 1)
view.handleFocusIn({ target: { matches: () => false } }, 'snapshot'); assert.equal(view.focusedMemberId.value, null)
view.handleFocusIn({ target: { matches: () => true } }, 'snapshot'); assert.equal(view.focusedMemberId.value, 'snapshot', '仅键盘焦点获得收束保护')
scope.stop()
console.log('通过：闭麦无字连续5秒、新字清零/渐隐结束重新计时、头像展开不启麦、开麦/打字/迟到字幕恢复、稳定顺序、焦点/错误保护与成员清理；原字幕强调、打字入口及快捷回应回归。')
