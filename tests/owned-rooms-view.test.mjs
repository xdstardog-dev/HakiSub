import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

const source = readFileSync(new URL('../accounts/src/OwnedRooms.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
const configured = { code: '114514', bound: true, configured: true, keyState: 'configured', asrEnabled: true, busy: false }
function view(request) {
  const calls = []; let unmount, changed
  const context = vm.createContext({ ...Vue, window: { addEventListener() {}, removeEventListener() {} },
    defineProps: () => ({ uid: 'fixture-uid', projectOrigin: 'https://hakisub.xdstar.work' }),
    onMounted() {}, onUnmounted(callback) { unmount = callback }, watch(_getter, callback) { changed = callback },
    accountRequest: async (...args) => { calls.push(args); return request(...args) },
  })
  vm.runInContext(script + '\nglobalThis.model = {props, rooms, keys, revealedKeys, visibleKeys, editingKeys, editKey, toggleKey, busy, error, message, deleting, refresh, manage};', context)
  return { state: context.model, calls, unmount: () => unmount(), changeUser: () => changed(), html: () => renderToString(Vue.createSSRApp({ setup: () => context.model, render })) }
}
const owner = view(async (_url, method, body) => method === 'POST' ? body.action === 'reveal' ? { apiKey: 'synthetic-input-key' } : body.action === 'test' ? { ok: true, message: '连接测试通过' } : { room: { ...configured, asrEnabled: false }, message: '已保存' } : { rooms: [configured] })
await owner.state.refresh()
assert.match(await owner.html(), /我的 HakiSub 房间|房主 · 当前账号/)
assert.match(await owner.html(), /https:\/\/hakisub.xdstar.work\/114514\//)
owner.state.keys.value['114514'] = 'synthetic-input-key'
await owner.state.manage(configured, 'save')
assert.equal(owner.calls.at(-1)[2].apiKey, 'synthetic-input-key')
assert.equal(Object.keys(owner.state.keys.value).length, 0)
assert.doesNotMatch(await owner.html(), /synthetic-input-key/)
assert.match(await owner.html(), /value="\*{8}"/)
await owner.state.toggleKey(configured)
assert.equal(owner.state.revealedKeys.value['114514'], 'synthetic-input-key')
assert.match(await owner.html(), /type="text"/)
await owner.state.toggleKey(configured)
assert.equal(owner.state.revealedKeys.value['114514'], undefined)
await owner.state.manage(configured, 'asr')
assert.equal(owner.calls.at(-1)[2].enabled, false)
assert.match(await owner.html(), /开启豆包 ASR/)
owner.state.rooms.value = [{ ...configured, configured: false, keyState: 'deleted' }]
assert.match(await owner.html(), /房主已删除/)
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
console.log('通过：个人中心实际房间模板、房主与存档区分、进入链接、Key输入清理及不回显、ASR操作、删除状态、保存失败和迟到响应隔离。')
