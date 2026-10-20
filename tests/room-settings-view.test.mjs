import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

const source = readFileSync(new URL('../src/components/RoomApiSettings.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const template = source.match(/<template>([\s\S]*?)<\/template>\s*<style/)[1]
const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
const status = { configured: false, readOnly: false, busy: false, source: 'none' }
const json = (body, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } })
function createView(fetchResponse) {
  const calls = [], timers = new Map()
  let unmount, next = 0
  const context = vm.createContext({ ...Vue, AbortController, Error,
    defineProps: () => ({ token: 'fixture-session-token' }), defineEmits: () => () => {},
    onMounted: () => {}, onUnmounted: callback => { unmount = callback },
    setTimeout: callback => { timers.set(++next, callback); return next }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => { calls.push({ url, options }); return fetchResponse(url, options) },
  })
  vm.runInContext(ts.transpile(script + '\nglobalThis.view = { configuration,apiKey,busy,message,failed,confirmDelete,requestConfiguration,emit };', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  return { state: context.view, calls, timers, unmount: () => unmount(), html: () => renderToString(Vue.createSSRApp({ setup: () => context.view, render })) }
}
const owner = createView((_url, options) => json(options.method === 'POST' ? { ...status, configured: true, source: 'room', message: 'saved' } : status))
await owner.state.requestConfiguration()
assert.match(await owner.html(), /保存房间配置/)
assert.equal(owner.calls[0].options.headers.Authorization, 'Bearer fixture-session-token')
owner.state.apiKey.value = ' fixture-room-key '
await owner.state.requestConfiguration('save')
assert.equal(owner.state.apiKey.value, '')
assert.deepEqual(JSON.parse(owner.calls[1].options.body), { action: 'save', apiKey: 'fixture-room-key' })
assert.doesNotMatch(await owner.html(), /fixture-room-key/)
assert.equal(owner.timers.size, 0)
owner.unmount()
const member = createView(() => json({ ...status, readOnly: true, configured: true, source: 'room' }))
await member.state.requestConfiguration()
assert.doesNotMatch(await member.html(), /<input|保存房间配置|测试连接|移除房间配置/)
assert.match(await member.html(), /创建房间的浏览器/)
for (const action of ['save', 'delete', 'test']) await member.state.requestConfiguration(action)
assert.equal(member.calls.length, 1)
member.unmount()
const failed = createView(() => json({ message: 'fixture failure' }, 503))
await failed.state.requestConfiguration()
assert.equal(failed.state.failed.value, true)
assert.equal(failed.state.busy.value, false)
assert.match(await failed.html(), /配置状态暂不可用/)
failed.unmount()
let abortSignal
const disposed = createView((_url, options) => new Promise((_resolve, reject) => {
  abortSignal = options.signal; abortSignal.addEventListener('abort', () => reject(Object.assign(Error(), { name: 'AbortError' })))
}))
const pending = disposed.state.requestConfiguration()
disposed.state.apiKey.value = 'fixture-clear-on-exit'
disposed.unmount(); await pending
assert.equal(abortSignal.aborted, true); assert.equal(disposed.state.apiKey.value, '')

const rememberedSource = readFileSync(new URL('../src/rememberedRooms.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const storage = new Map()
const context = vm.createContext({ localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } })
vm.runInContext(ts.transpile(rememberedSource + '\nglobalThis.rooms = {loadRememberedRooms,rememberRoom}', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const ownerToken = '11111111-1111-1111-1111-111111111111'
let saved = context.rooms.rememberRoom([], { code: '123456', name: 'Owner', ownerToken })
saved = context.rooms.rememberRoom(saved, { code: '123456', name: 'Returning' })
assert.equal(saved.length, 1); assert.equal(saved[0].ownerToken, ownerToken)
assert.equal(context.rooms.loadRememberedRooms()[0].name, 'Returning')
saved = context.rooms.rememberRoom(saved, { code: '654321', name: 'Returning' }, ['123456'])
assert.equal(saved.length, 1); assert.equal(saved[0].code, '654321'); assert.equal(saved[0].ownerToken, ownerToken)
assert.equal(context.rooms.loadRememberedRooms()[0].ownerToken, ownerToken, '首页旧入口迁移后保留本浏览器房主凭据')
storage.set('hakisub.rooms.v1', '{bad')
assert.equal(context.rooms.loadRememberedRooms().length, 0)
console.log('通过：房间配置实际模板、创建者与成员权限、密钥提交后清空/不回显、异常与卸载取消、首页房间记录恢复及创建者凭据保留。')
