import * as nameRules from '../accounts/shared/nameRules.mjs'
import * as roomAvatars from '../accounts/shared/roomAvatars.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
import { loadVueComponent } from './load-vue-component.mjs'

const PinCodeInput = await loadVueComponent(new URL('../accounts/shared/PinCodeInput.vue', import.meta.url))

const source = readFileSync(new URL('../src/components/RoomApiSettings.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const template = source.match(/<template>([\s\S]*?)<\/template>\s*<style/)[1]
const render = new Function('Vue', ts.transpile(compile(template, { mode: 'function', prefixIdentifiers: true, expressionPlugins: ['typescript'] }).code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }))(Vue)
const status = { configured: false, readOnly: false, busy: false, source: 'none' }
const json = (body, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } })
function createView(fetchResponse) {
  const calls = [], timers = new Map(), emitted = []
  const props = Vue.reactive({ token: "fixture-session-token", speechVolume: 60, speechEnabled: true, preferences: { enabled: true, volume: 60 }, adaptive: true, storageFailed: false })
  let unmount, next = 0
  const context = vm.createContext({ ...nameRules, ...roomAvatars, ...Vue, AbortController, Error,
    defineProps: () => props, defineEmits: () => (event, value) => { emitted.push([event, value]); if (event === 'speech') props.speechVolume = value; else if (event === 'speechEnabled') props.speechEnabled = value; else if (event === 'sound') props.preferences = value; else if (event === 'layout') props.adaptive = value }, accountCenterUrl: 'https://xdstar.work/account/',
    onMounted: () => {}, onUnmounted: callback => { unmount = callback },
    setTimeout: callback => { timers.set(++next, callback); return next }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => { calls.push({ url, options }); return fetchResponse(url, options) },
  })
  vm.runInContext(ts.transpile(script + '\nglobalThis.view = { countNameUnits,isValidDisplayName,ROOM_NAME_MAXIMUM_UNITS,...toRefs(props),speechMuted,reactionMuted,toggleSpeechSound,toggleReactionSound,page,editingName,passwordEnabled,openOwnerSettings,backToPersonal,changePasswordSwitch,changeAsrSwitch,changeReactionVolume,clearKeyDisplay,configuration,newRoomName,newAccessCode,editingKey,apiKey,busy,message,failed,confirmDelete,activeAction,connectionTestMessage,connectionTestFailed,nameEditor,beginNameEditing,cancelNameEditing,cancelNameEditingOutside,startKeyReplacement,openDeleteConfirmation,closeDeleteConfirmation,confirmKeyRemoval,resetConnectionTest,requestConfiguration,emit,props,accountCenterUrl };', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  return { state: context.view, props, emitted, calls, timers, unmount: () => unmount(), html: () => renderToString(Vue.createSSRApp({ setup: () => context.view, render }).component('PinCodeInput', PinCodeInput)) }
}
const owner = createView((_url, options) => json(options.method === 'POST' ? JSON.parse(options.body).action === 'test' ? { ok: true } : { ...status, configured: true, source: 'room', message: 'saved', name: '日常交流' } : status))
await owner.state.requestConfiguration()
assert.match(await owner.html(), /发言提示音/); assert.match(await owner.html(), /快捷回复音效/)
assert.match(await owner.html(), /动态自适应/); assert.doesNotMatch(await owner.html(), /type="radio"/)
owner.state.emit('layout', false); assert.match(await owner.html(), /动态自适应（已关闭）/)
owner.state.emit('layout', true)
assert.match(await owner.html(), /class="owner-entry"[\s\S]*?房间设置/)
owner.props.speechVolume = 54; owner.props.preferences = { enabled: true, volume: 33 }; await Vue.nextTick()
owner.state.toggleSpeechSound(); assert.equal(owner.props.speechEnabled, false); assert.equal(owner.props.speechVolume, 54)
assert.equal(owner.props.preferences.enabled, true, '发言静音不改回应音效')
assert.match(await owner.html(), /id="speech-volume"[^>]*disabled/)
owner.state.toggleReactionSound(); assert.equal(owner.props.preferences.enabled, false); assert.equal(owner.props.preferences.volume, 33)
owner.state.toggleSpeechSound(); assert.equal(owner.props.speechEnabled, true); assert.equal(owner.props.speechVolume, 54)
assert.equal(owner.props.preferences.enabled, false, '恢复发言音效不改回应静音')
owner.state.toggleReactionSound(); assert.equal(owner.props.preferences.enabled, true); assert.equal(owner.props.preferences.volume, 33)
owner.props.speechVolume = 0; owner.props.preferences = { enabled: true, volume: 0 }; await Vue.nextTick()
owner.state.toggleSpeechSound(); owner.state.toggleReactionSound()
assert.equal(owner.props.speechVolume, 54); assert.equal(owner.props.speechEnabled, true)
assert.equal(owner.props.preferences.volume, 33); assert.equal(owner.props.preferences.enabled, true)
assert.doesNotMatch(await owner.html(), /id="room-api-key"/, '二级设置未打开，不展示密钥输入')
owner.state.openOwnerSettings()
assert.match(await owner.html(), /id="room-api-key"[^>]*type="text"/, '首次输入明文可见')
assert.equal(owner.calls[0].options.headers.Authorization, 'Bearer fixture-session-token')
owner.state.apiKey.value = ' fixture-room-key '
await owner.state.requestConfiguration('save')
assert.equal(owner.state.apiKey.value, '')
assert.deepEqual(JSON.parse(owner.calls[1].options.body), { action: 'save', apiKey: 'fixture-room-key' })
assert.doesNotMatch(await owner.html(), /fixture-room-key/)
assert.match(await owner.html(), /\*{8}/)
owner.state.apiKey.value = 'session-key'; owner.state.backToPersonal()
assert.equal(owner.state.apiKey.value, '')
owner.state.openOwnerSettings(); assert.equal(owner.state.apiKey.value, '')
assert.equal(owner.calls.length, 2, '重新进入不回读密钥')
const count = owner.calls.length
await owner.state.requestConfiguration('save')
assert.equal(owner.calls.length, count, '掩码不能作为待提交内容')
assert.equal(owner.timers.size, 0)
assert.doesNotMatch(await owner.html(), />移除密钥</, '保存状态不显示移除按钮')
owner.state.startKeyReplacement(); assert.match(await owner.html(), />移除密钥</)
owner.state.apiKey.value = 'synthetic-replacement-draft'
const beforeRemove = owner.calls.length
owner.state.openDeleteConfirmation(); await Vue.nextTick()
assert.equal(owner.state.confirmDelete.value, true); assert.equal(owner.calls.length, beforeRemove, '确认弹窗打开不发删除请求')
assert.match(await owner.html(), /class="key-delete-dialog"/)
owner.state.closeDeleteConfirmation(); assert.equal(owner.state.confirmDelete.value, false)
assert.equal(owner.state.apiKey.value, 'synthetic-replacement-draft', '取消移除保留当前输入')
owner.state.apiKey.value = ''
await owner.state.requestConfiguration('test')
assert.equal(owner.state.connectionTestMessage.value, 'key测试通过！'); assert.equal(owner.state.message.value, '')
assert.match(await owner.html(), /connection-test-row[\s\S]*测试连接<\/button>[\s\S]*key测试通过！/)
owner.state.clearKeyDisplay()
owner.state.beginNameEditing(); assert.equal(owner.state.newRoomName.value, '日常交流')
const insideTarget = {}; owner.state.nameEditor.value = { contains: target => target === insideTarget }
owner.state.cancelNameEditingOutside({ target: insideTarget }); assert.equal(owner.state.editingName.value, true, '确认按钮属于同一编辑行')
owner.state.newRoomName.value = '未保存草稿'; owner.state.cancelNameEditingOutside({ target: {} })
assert.equal(owner.state.editingName.value, false); assert.equal(owner.state.newRoomName.value, '')
assert.equal(owner.state.configuration.value.name, '日常交流', '点击别处取消不改服务端名称')
owner.state.newRoomName.value = '  日常交流  '
await owner.state.requestConfiguration('rename')
assert.deepEqual(JSON.parse(owner.calls.at(-1).options.body), { action: 'rename', name: '日常交流' })
assert.equal(owner.state.newRoomName.value, '')
owner.state.editingName.value = true
assert.match(await owner.html(), /id="room-new-name"[^>]*maxlength="24"/)
owner.state.newRoomName.value = '中'.repeat(13)
const beforeInvalidName = owner.calls.length
await owner.state.requestConfiguration('rename')
assert.equal(owner.calls.length, beforeInvalidName)
owner.state.changePasswordSwitch({ target: { checked: true } })
assert.equal(owner.state.passwordEnabled.value, true)
assert.equal(owner.calls.length, beforeInvalidName, '打开开关只编辑，未保存不启用')
owner.state.newAccessCode.value = '0000'
await owner.state.requestConfiguration('access-code', owner.state.newAccessCode.value)
assert.deepEqual(JSON.parse(owner.calls.at(-1).options.body), { action: 'access-code', accessCode: '0000' })
assert.equal(owner.state.newAccessCode.value, '')
await owner.state.requestConfiguration('access-code', '')
assert.deepEqual(JSON.parse(owner.calls.at(-1).options.body), { action: 'access-code', accessCode: '' })
owner.unmount()
const savedAccessCode = createView(() => json({ ...status, requiresPassword: true }))
await savedAccessCode.state.requestConfiguration()
savedAccessCode.state.openOwnerSettings()
assert.equal(savedAccessCode.state.passwordEnabled.value, true)
assert.match(await savedAccessCode.html(), /id="room-new-access-code"[^>]*type="text"/)
assert.doesNotMatch(await savedAccessCode.html(), /当前入房码/)
savedAccessCode.unmount()
const member = createView(() => json({ ...status, readOnly: true, configured: true, source: 'room' }))
await member.state.requestConfiguration()
assert.match(await member.html(), /发言提示音/)
assert.doesNotMatch(await member.html(), /房主设置|id="room-api-key"|测试连接|移除密钥/)
for (const action of ['save', 'delete', 'test', 'access-code', 'rename']) await member.state.requestConfiguration(action)
assert.equal(member.calls.length, 1)
member.unmount()
const failed = createView(() => json({ message: 'fixture failure' }, 503))
await failed.state.requestConfiguration()
assert.equal(failed.state.failed.value, true)
assert.equal(failed.state.busy.value, false)
assert.match(await failed.html(), /房间状态暂不可用/)
failed.unmount()
let abortSignal
const disposed = createView((_url, options) => new Promise((_resolve, reject) => {
  abortSignal = options.signal; abortSignal.addEventListener('abort', () => reject(Object.assign(Error(), { name: 'AbortError' })))
}))
const pending = disposed.state.requestConfiguration()
disposed.state.apiKey.value = 'fixture-clear-on-exit'
disposed.unmount(); await pending
assert.equal(abortSignal.aborted, true); assert.equal(disposed.state.apiKey.value, '')

const failedSwitch = createView((_url, options) => options.method === 'POST' ? json({ message: 'synthetic failure' }, 503) : json({ ...status, asrEnabled: true, requiresPassword: true }))
await failedSwitch.state.requestConfiguration(); failedSwitch.state.openOwnerSettings()
const asrInput = { checked: false }; await failedSwitch.state.changeAsrSwitch({ target: asrInput }); assert.equal(asrInput.checked, true, 'ASR保存失败恢复真实开关')
await failedSwitch.state.changePasswordSwitch({ target: { checked: false } }); assert.equal(failedSwitch.state.passwordEnabled.value, true, '密码关闭失败仍显示已保护')
failedSwitch.unmount()

const failedTest = createView((_url, options) => options.method === 'POST' ? json({ message: 'synthetic test unavailable' }, 503) : json({ ...status, configured: true, source: 'room' }))
await failedTest.state.requestConfiguration(); failedTest.state.openOwnerSettings(); await failedTest.state.requestConfiguration('test')
assert.equal(failedTest.state.connectionTestFailed.value, true); assert.equal(failedTest.state.connectionTestMessage.value, 'synthetic test unavailable')
assert.equal(failedTest.state.message.value, '', '连接失败也在测试控件旁边展示')
failedTest.unmount()

const rememberedSource = readFileSync(new URL('../src/rememberedRooms.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const storage = new Map()
const context = vm.createContext({ ...nameRules, ...roomAvatars, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } })
vm.runInContext(ts.transpile(rememberedSource + '\nglobalThis.rooms = {loadRememberedRooms,rememberRoom,forgetRoomOwnership}', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const ownerToken = '11111111-1111-1111-1111-111111111111'
let saved = context.rooms.rememberRoom([], { code: '123456', name: 'Owner', roomName: 'Owner的房间', ownerToken })
saved = context.rooms.rememberRoom(saved, { code: '123456', name: 'Returning' })
assert.equal(saved.length, 1); assert.equal(saved[0].ownerToken, ownerToken)
assert.equal(context.rooms.loadRememberedRooms()[0].roomName, 'Owner的房间')
assert.equal(context.rooms.loadRememberedRooms()[0].name, 'Returning')
saved = context.rooms.rememberRoom(saved, { code: '654321', name: 'Returning' }, ['123456'])
assert.equal(saved.length, 1); assert.equal(saved[0].code, '654321'); assert.equal(saved[0].ownerToken, ownerToken)
assert.equal(context.rooms.loadRememberedRooms()[0].ownerToken, ownerToken, '首页旧入口迁移后保留本浏览器房主凭据')
saved = context.rooms.rememberRoom(saved, { code: '654321', name: 'Returning', avatarId: 'cat' })
saved = context.rooms.rememberRoom(saved, { code: '654321', name: 'Returning', roomName: '改名后仍保留头像' })
assert.equal(context.rooms.loadRememberedRooms()[0].avatarId, 'cat')
saved = context.rooms.forgetRoomOwnership(saved, '654321')
assert.equal(saved[0].ownerToken, undefined); assert.equal(context.rooms.loadRememberedRooms()[0].avatarId, 'cat', '绑定清除旧凭据时保留房间头像')
storage.set('hakisub.rooms.v1', '{bad')
assert.equal(context.rooms.loadRememberedRooms().length, 0)
console.log('通过：房间配置实际模板、创建者与成员权限、密钥提交后清空/不回显、异常与卸载取消、首页房间记录恢复及创建者凭据保留。')
