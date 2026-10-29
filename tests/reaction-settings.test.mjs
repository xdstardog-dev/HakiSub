import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

const model = readFileSync(new URL('../src/roomInteractions.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const source = readFileSync(new URL('../src/components/ReactionSettings.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
const render = new Function('Vue', ts.transpile(compile(template, { mode: 'function', prefixIdentifiers: true }).code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }))(Vue)
const props = Vue.reactive({ selected: ['agree', 'disagree', 'question', 'received', 'fun'] })
const emitted = [], mounted = [], unmounted = [], stored = new Map()
const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
const context = vm.createContext({ ...Vue, localStorage: storage, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args), onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn) })
vm.runInContext(ts.transpile(model + script + '\nglobalThis.view = {settingsDialog,selection,atLimit,toggleReaction,restoreDefaults,save,emit,QUICK_REACTIONS,REACTION_SELECTION_LIMIT}; globalThis.preferences = {normalizeReactionSelection,loadReactionSelection,saveReactionSelection,DEFAULT_REACTION_TYPES};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const view = context.view, preferences = context.preferences
const defaults = ['agree', 'disagree', 'question', 'received', 'fun']
const values = value => Array.from(value)
assert.deepEqual(values(preferences.loadReactionSelection()), defaults)
assert.deepEqual(values(preferences.normalizeReactionSelection(['thanks', 'thanks', 'unknown', 1, 'repeat'])), ['thanks', 'repeat'])
assert.equal(preferences.normalizeReactionSelection(view.QUICK_REACTIONS.map(option => option.type)).length, 5)
for (const value of [null, {}, [], ['unknown']]) assert.deepEqual(values(preferences.normalizeReactionSelection(value)), defaults)
assert.equal(preferences.saveReactionSelection(['thanks', 'repeat']), true)
assert.deepEqual(values(preferences.loadReactionSelection()), ['thanks', 'repeat'])
assert.deepEqual(values(preferences.loadReactionSelection({ getItem() { throw Error('blocked') } })), defaults)
assert.deepEqual(values(preferences.loadReactionSelection({ getItem: () => '{bad' })), defaults)
assert.equal(preferences.saveReactionSelection(['thanks'], { setItem() { throw Error('blocked') } }), false)

let opened = 0, closed = 0
view.settingsDialog.value = { showModal() { opened++ }, close() { closed++ } }
mounted.forEach(fn => fn()); assert.equal(opened, 1)
view.toggleReaction('thanks'); assert.equal(view.selection.value.length, 5, '选满不能加入第六项')
view.toggleReaction('disagree'); view.toggleReaction('thanks')
assert.equal(view.selection.value.length, 5); assert.ok(view.selection.value.includes('thanks'))
assert.equal(props.selected.includes('thanks'), false, '编辑草稿不修改已保存设置')
assert.equal(emitted.length, 0, '选择过程不保存或广播')
const html = await renderToString(Vue.createSSRApp({ setup: () => ({ ...view, ...Vue.toRefs(props) }), render }))
assert.match(html, /你需要哪五个词汇/); assert.match(html, /已选 5 \/ 5/)
assert.match(html, /请再说一遍/); assert.doesNotMatch(html, /娱乐/)
assert.equal((html.match(/type="checkbox"/g) ?? []).length, view.QUICK_REACTIONS.length)
view.save(); assert.equal(emitted.at(-1)[0], 'save'); assert.ok(emitted.at(-1)[1].includes('thanks'))
for (const type of [...view.selection.value]) view.toggleReaction(type)
const beforeEmptySave = emitted.length
view.save(); assert.equal(emitted.length, beforeEmptySave, '至少保留一个回应才能保存')
view.restoreDefaults(); assert.deepEqual(values(view.selection.value), defaults)
view.emit('close'); assert.equal(emitted.at(-1)[0], 'close')
unmounted.forEach(fn => fn()); assert.equal(closed, 1)
console.log('通过：回应词库模板、五项上限/空选择/默认恢复/草稿独立/取消保存事件、个人偏好去重与白名单、浏览器持久化及损坏/受限存储回退、弹窗清理。')
