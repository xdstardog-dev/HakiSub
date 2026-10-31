import * as nameRules from '../accounts/shared/nameRules.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import { renderToString } from '@vue/server-renderer'
import { loadVueComponent } from './load-vue-component.mjs'

const PinCodeInput = await loadVueComponent(new URL('../accounts/shared/PinCodeInput.vue', import.meta.url))

const source = readFileSync(new URL('../accounts/src/OwnedRooms.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const template = parse(source).descriptor.template.content
const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
const configured = { code: '114514', name: '小明的房间', bound: true, configured: true, keyState: 'configured', asrEnabled: true, busy: false }
function view(request) {
  const calls = []; let unmount, changed
  const context = vm.createContext({ ...nameRules, ...Vue, window: { addEventListener() {}, removeEventListener() {} },
    defineProps: () => ({ uid: 'fixture-uid', projectOrigin: 'https://hakisub.xdstar.work', overview: false }), defineEmits: () => () => {},
    onMounted() {}, onUnmounted(callback) { unmount = callback }, watch(_getter, callback) { changed = callback },
    accountRequest: async (...args) => { calls.push(args); return request(...args) },
  })
  vm.runInContext(script + '\nglobalThis.model = {countNameUnits,isValidDisplayName,ROOM_NAME_MAXIMUM_UNITS,props, overview: false, projectOrigin: props.projectOrigin, emit, rooms, keys, newRoomName, newAccessCode, revealedKeys, visibleKeys, editingKeys, selectedRoom, selectedCode, displayedRooms, selectRoom, editKey, toggleKey, busy, error, message, deleting, refresh, manage};', context)
  return { state: context.model, calls, unmount: () => unmount(), changeUser: () => changed(), html: () => renderToString(Vue.createSSRApp({ setup: () => context.model, render }).component('PinCodeInput', PinCodeInput)) }
}
const owner = view(async (_url, method, body) => method === 'POST' ? body.action === 'reveal' ? { apiKey: 'synthetic-input-key' } : body.action === 'test' ? { ok: true, message: '连接测试通过' } : { room: { ...configured, asrEnabled: false }, message: '已保存' } : { rooms: [configured] })
await owner.state.refresh()
assert.match(await owner.html(), /已绑定的房间/)
assert.match(await owner.html(), /小明的房间/)
assert.match(await owner.html(), /https:\/\/hakisub.xdstar.work\/114514\//)
assert.doesNotMatch(await owner.html(), /<input|保存 Key|测试 Key/)
owner.state.selectRoom('114514')
owner.state.rooms.value[0] = { ...configured, requiresPassword: true, accessCode: '0042' }
assert.match(await owner.html(), /房间密码已设置/); assert.doesNotMatch(await owner.html(), /0042/)
assert.match(await owner.html(), /id="entry-code-114514"[^>]*type="text"/)
assert.match(await owner.html(), /房主 · 当前账号/)
owner.state.keys.value['114514'] = 'synthetic-input-key'
await owner.state.manage(configured, 'save')
assert.equal(owner.calls.at(-1)[2].apiKey, 'synthetic-input-key')
assert.equal(Object.keys(owner.state.keys.value).length, 0)
assert.doesNotMatch(await owner.html(), /synthetic-input-key/)
assert.match(await owner.html(), /value="\*{8}"/)
await owner.state.toggleKey(configured)
assert.equal(owner.state.revealedKeys.value['114514'], undefined); assert.equal(owner.calls.at(-1)[2].action, 'save', '更换不调用原文回读接口')
assert.match(await owner.html(), /type="text"/)
await owner.state.toggleKey(configured)
assert.equal(owner.state.revealedKeys.value['114514'], undefined)
await owner.state.manage(configured, 'asr')
assert.equal(owner.calls.at(-1)[2].enabled, false)
assert.match(await owner.html(), /开启豆包 ASR/)
owner.state.newRoomName.value = '  朋友交流  '
await owner.state.manage(configured, 'rename')
assert.equal(owner.calls.at(-1)[2].name, '朋友交流')
assert.equal(owner.state.newRoomName.value, '')
assert.match(await owner.html(), /id="name-114514"[^>]*maxlength="24"/)
owner.state.newRoomName.value = '中'.repeat(13)
const beforeInvalidName = owner.calls.length
await owner.state.manage(configured, 'rename')
assert.equal(owner.calls.length, beforeInvalidName, '个人中心拒绝超出12字的提交')
owner.state.newAccessCode.value = '0042'
await owner.state.manage(configured, 'access-code')
assert.equal(owner.calls.at(-1)[2].accessCode, '0042')
assert.equal(owner.state.newAccessCode.value, '')
await owner.state.manage(configured, 'access-code', '')
assert.equal(owner.calls.at(-1)[2].accessCode, '')
owner.state.rooms.value = [{ ...configured, configured: false, keyState: 'deleted' }]
assert.match(await owner.html(), /房主已删除/)
owner.state.selectRoom()
assert.doesNotMatch(await owner.html(), /<input|保存 Key|测试 Key/)
owner.state.keys.value['114514'] = 'clear-on-unmount'; owner.unmount()
assert.equal(Object.keys(owner.state.keys.value).length, 0)
const failure = view(async (_url, method) => { if (method) throw Error('synthetic save failure'); return { rooms: [configured] } })
await failure.state.refresh(); await failure.state.manage(configured, 'delete')
assert.equal(failure.state.rooms.value.length, 0)
assert.equal(failure.state.message.value, '')
assert.match(await failure.html(), /synthetic save failure/)
failure.unmount()
let resolve
const stale = view(() => new Promise(done => { resolve = done }))
const pending = stale.state.refresh(); stale.unmount(); resolve({ rooms: [configured] }); await pending
assert.equal(stale.state.rooms.value.length, 0, '退出或切换账号后迟到响应不能展示旧房间')
const lateReveal = view(async (_url, method) => method ? new Promise(done => { resolve = done }) : { rooms: [configured] })
await lateReveal.state.refresh(); lateReveal.state.selectRoom('114514')
const revealing = lateReveal.state.manage(configured, 'reveal'); lateReveal.state.selectRoom()
resolve({ apiKey: 'synthetic-late-key' }); await revealing
assert.equal(Object.keys(lateReveal.state.revealedKeys.value).length, 0, '退出单房间管理后迟到原文必须丢弃')
lateReveal.unmount()
console.log('通过：房间列表/单房间管理隔离、进入链接、Key清理与按需显示、ASR/删除状态、保存失败、退出及离开管理后的迟到响应隔离。')
