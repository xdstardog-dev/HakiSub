import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'

const source = readFileSync(new URL('../src/roomCreation.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const timers = []
const context = vm.createContext({ AbortController, Error, setTimeout: fn => { timers.push(fn); return timers.length - 1 }, clearTimeout: index => { timers[index] = undefined } })
vm.runInContext(ts.transpile(source + ';globalThis.save = saveCreatedRoomName;', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const save = context.save
let request
const fetchRequest = async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ name: '新的房间名' }) } }
assert.equal(await save('synthetic-session-token', '新的房间名', new AbortController().signal, fetchRequest), '新的房间名')
assert.equal(request.url, '/api/rooms/settings')
assert.equal(request.options.headers.Authorization, 'Bearer synthetic-session-token')
assert.deepEqual(JSON.parse(request.options.body), { action: 'rename', name: '新的房间名' })
assert.equal(request.options.cache, 'no-store')
assert.equal(timers.filter(Boolean).length, 0)
for (const response of [{ ok: false, json: async () => ({ message: 'failure' }) }, { ok: true, json: async () => ({}) }]) {
  await assert.rejects(save('token', 'name', new AbortController().signal, async () => response), /名称保存失败/)
}
await assert.rejects(save('token', 'name', new AbortController().signal, async () => { throw Error('network failure') }), /network failure/)
const cancelled = new AbortController(); cancelled.abort()
await assert.rejects(save('token', 'name', cancelled.signal, () => { throw Error('不应发送请求') }), /已取消/)
let requestSignal
const waitsForAbort = async (_url, options) => {
  requestSignal = options.signal
  return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }))
}
const controller = new AbortController(), pending = save('token', 'name', controller.signal, waitsForAbort)
controller.abort(); await assert.rejects(pending, /aborted/); assert.equal(requestSignal.aborted, true)
const timeout = save('token', 'name', new AbortController().signal, waitsForAbort)
timers.at(-1)(); await assert.rejects(timeout, /aborted/)
assert.equal(timers.filter(Boolean).length, 0)
let resolveResponse
const lateController = new AbortController()
const late = save('token', 'name', lateController.signal, async () => new Promise(resolve => { resolveResponse = resolve }))
lateController.abort(); resolveResponse({ ok: true, json: async () => ({ name: '迟到响应' }) })
await assert.rejects(late, /已取消/)
console.log('通过：复用房主改名接口的身份/正文、成功/失败/异常响应、取消/超时与迟到响应清理；无真实外部请求。')

const component = readFileSync(new URL('../src/components/CreateRoomDialog.vue', import.meta.url), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const { isValidDisplayName, ROOM_NAME_MAXIMUM_UNITS } = await import('../accounts/shared/nameRules.mjs')
const props = { busy: false, message: '' }, emitted = []
let unmount
const viewContext = vm.createContext({ ref, isValidDisplayName, ROOM_NAME_MAXIMUM_UNITS, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args), onUnmounted: fn => { unmount = fn } })
vm.runInContext(ts.transpile(component + ';globalThis.view = {roomName,privateRoom,password,togglePrivateRoom,submit};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), viewContext)
const view = viewContext.view
view.roomName.value = '公开房间'; view.submit()
assert.equal(emitted[0][2], undefined)
view.togglePrivateRoom(); assert.equal(view.privateRoom.value, true)
for (const password of ['', '123', '12345', 'abcd', '１２３４']) { view.password.value = password; view.submit(); assert.equal(emitted.length, 1) }
view.password.value = '0042'; props.busy = true; view.submit(); view.togglePrivateRoom()
assert.equal(emitted.length, 1); assert.equal(view.privateRoom.value, true)
props.busy = false; view.submit(); assert.equal(emitted[1][2], '0042'); assert.equal(view.password.value, '')
view.password.value = '0123'; view.togglePrivateRoom(); assert.equal(view.password.value, '')
view.submit(); assert.equal(emitted[2][2], undefined, '取消私密不提交旧密码')
view.togglePrivateRoom(); view.password.value = '0123'; unmount(); assert.equal(view.password.value, '')
console.log('通过：创建卡私密开关、公开请求不带密码、四位数字与前导零、忙碌禁用、提交/取消私密/卸载清理。')
