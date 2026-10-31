import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { renderToString } from '@vue/server-renderer'
import { loadVueComponent } from './load-vue-component.mjs'

const url = new URL('../src/components/RoomPasswordPrompt.vue', import.meta.url)
const source = readFileSync(url, 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const props = { roomCode: '123456', busy: false, signedIn: true, message: '请输入入房码' }, emitted = [], mounts = [], unmounts = []
const context = vm.createContext({ ...Vue, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args), onMounted: fn => mounts.push(fn), onUnmounted: fn => unmounts.push(fn) })
vm.runInContext(ts.transpile(source + '\nglobalThis.view = {password,submit,dialogElement};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const view = context.view
let opened = 0, closed = 0
view.dialogElement.value = { showModal() { opened++ }, close() { closed++ } }
mounts.forEach(fn => fn()); assert.equal(opened, 1)
for (const value of ['', '123', '12345', 'abcd']) { view.password.value = value; view.submit(); assert.equal(emitted.length, 0) }
view.password.value = '0042'; props.busy = true; view.submit(); assert.equal(emitted.length, 0)
props.busy = false; view.submit(); assert.deepEqual(Array.from(emitted[0]), ['submit', '0042']); assert.equal(view.password.value, '')
const Component = await loadVueComponent(url)
const html = await renderToString(Vue.createSSRApp(Component, props))
assert.match(html, /这是一个加密房间/); assert.match(html, /inputmode="numeric"/); assert.match(html, /maxlength="4"/)
assert.match(html, /aria-label="输入密码"/); assert.match(html, /确定/)
assert.doesNotMatch(html, /下次可直接进入|游客每次进入需验证|取消<\/button>/)
view.password.value = '1110'; unmounts.forEach(fn => fn()); assert.equal(closed, 1); assert.equal(view.password.value, '')
console.log('通过：精简加密房间弹窗模板、单密码输入与确定、四位数字/前导零/提交禁用、提交和卸载清理。')
