import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

const model = readFileSync(new URL('../src/roomInteractions.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const soundModel = readFileSync(new URL('../src/reactionSound.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const source = readFileSync(new URL('../src/components/SoundSettings.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
const props = Vue.reactive({ preferences: { enabled: true, volume: 60 }, state: 'ready', storageFailed: false })
const emitted = [], mounted = [], unmounted = [], stored = new Map()
const timers = new Map(); let timerId = 0
const context = vm.createContext({ ...Vue, localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
  AbortController, TextDecoder, setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id),
  defineProps: () => props, defineEmits: () => (...args) => emitted.push(args), onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn) })
vm.runInContext(ts.transpile(model + soundModel + script + '\nglobalThis.view = {settingsDialog,statusMessage,previewSlot,QUICK_REACTIONS,changeEnabled,changeVolume,emit};globalThis.sound = {createReactionSound,normalizeSoundSlots,loadSoundPreferences,saveSoundPreferences,normalizeSoundPreferences};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const view = context.view, modelApi = context.sound
const plain = value => JSON.parse(JSON.stringify(value))
assert.deepEqual(plain(modelApi.loadSoundPreferences()), { enabled: true, volume: 60 })
assert.deepEqual(plain(modelApi.normalizeSoundPreferences({ enabled: false, volume: -20 })), { enabled: false, volume: 0 })
assert.equal(modelApi.normalizeSoundPreferences({ volume: 500 }).volume, 100)
assert.equal(modelApi.normalizeSoundPreferences({ volume: NaN }).volume, 60)
assert.equal(modelApi.saveSoundPreferences({ enabled: false, volume: 25 }), true)
assert.deepEqual(plain(modelApi.loadSoundPreferences()), { enabled: false, volume: 25 })
assert.equal(modelApi.loadSoundPreferences({ getItem: () => '{bad' }).volume, 60)
assert.equal(modelApi.loadSoundPreferences({ getItem() { throw Error('blocked') } }).enabled, true)
assert.equal(modelApi.saveSoundPreferences({ enabled: true, volume: 20 }, { setItem() { throw Error('blocked') } }), false)
let opened = 0, closed = 0
view.settingsDialog.value = { showModal() { opened++ }, close() { closed++ } }
mounted.forEach(fn => fn()); assert.equal(opened, 1)
const html = () => renderToString(Vue.createSSRApp({ setup: () => ({ ...view, ...Vue.toRefs(props) }), render }))
assert.match(await html(), /全局音效/); assert.match(await html(), /试听音效/)
assert.match(await html(), /60%/); assert.match(await html(), /音效已就绪/)
assert.match(await html(), /试听内容/); assert.match(await html(), /通用提示音/); assert.match(await html(), /请再说一遍/)
view.previewSlot.value = 'question'; view.emit('preview', view.previewSlot.value)
assert.deepEqual(plain(emitted.at(-1)), ['preview', 'question'])
view.changeEnabled({ target: { checked: false } }); assert.deepEqual(plain(emitted.at(-1)), ['update', { enabled: false, volume: 60 }])
view.changeVolume({ target: { value: '25' } }); assert.equal(emitted.at(-1)[1].volume, 25)
props.preferences.enabled = false; assert.match(await html(), /音效已关闭/); assert.match(await html(), /disabled>试听音效/)
props.preferences.enabled = true; props.state = 'blocked'; assert.match(await html(), /请点击试听/)
props.state = 'unavailable'; assert.match(await html(), /回应仍会正常显示/)
props.storageFailed = true; assert.match(await html(), /浏览器未能保存/)
unmounted.forEach(fn => fn()); assert.equal(closed, 1)

const manifest = JSON.parse(readFileSync(new URL('../public/sounds/reactions/slots.json', import.meta.url), 'utf8'))
assert.deepEqual(Object.keys(manifest.reactions).sort(), Array.from(view.QUICK_REACTIONS, option => option.type).sort())
for (const file of [manifest.default, ...Object.values(manifest.reactions)]) {
  const data = readFileSync(new URL(`../public/sounds/reactions/${file}`, import.meta.url))
  assert.ok(data.length > 100 && data.length < 1024 * 1024)
  assert.ok(data.subarray(0, 3).toString() === 'ID3' || data[0] === 0xff, `${file} 必须是真正MP3，不能改后缀冒充`)
}
assert.match(readFileSync(new URL('../public/sounds/reactions/LICENSE.kenney.txt', import.meta.url), 'utf8'), /CC0/)
const fixtureSlots = { version: 1, default: 'default.mp3', reactions: { agree: 'agree.mp3' } }
const files = new Map([['slots.json', JSON.stringify(fixtureSlots)], ['default.mp3', new Uint8Array([1])], ['agree.mp3', new Uint8Array([2])]])
const requests = []
const request = async (url, options) => { requests.push({ url, options }); const body = files.get(url.split('/').at(-1)); return new Response(body ?? 'missing', { status: body === undefined ? 404 : 200 }) }
function fakeAudio() {
  const stats = { starts: 0, stops: 0, disconnected: 0, closed: 0, gains: [], nodes: [] }
  const audio = { state: 'suspended', currentTime: 10, destination: {},
    async resume() { this.state = 'running' }, async close() { stats.closed++ },
    async decodeAudioData(bytes) { const tag = new Uint8Array(bytes)[0]; if (tag === 255) throw Error('corrupt MP3'); return { duration: tag === 254 ? 10 : .2, tag } },
    createBufferSource() { const node = { connect() {}, disconnect() { stats.disconnected++ }, start() { stats.starts++ }, stop() { stats.stops++ } }; stats.nodes.push(node); return node },
    createGain: () => ({ gain: { setValueAtTime: value => stats.gains.push(value) }, connect() {}, disconnect() { stats.disconnected++ } }),
  }
  return { audio, stats }
}
let created = 0
const { audio, stats } = fakeAudio()
const engine = modelApi.createReactionSound(() => { created++; return audio }, { enabled: false, volume: 60 }, request)
assert.equal(engine.getState(), 'muted'); assert.equal(await engine.unlock(), false); assert.equal(created, 0)
assert.equal(await engine.play(), false); assert.equal(requests.length, 0)
engine.configure({ enabled: true, volume: 20 }); assert.equal(await engine.unlock(), true)
assert.equal(engine.getState(), 'ready'); assert.equal(await engine.play('agree'), true)
assert.equal(stats.gains[0], 0.2); assert.equal(stats.nodes[0].buffer.tag, 2)
assert.equal(requests[0].options.cache, 'no-cache')
engine.configure({ enabled: false, volume: 20 }); assert.equal(stats.disconnected, 2, '关闭时立即停止已有音符')
assert.equal(await engine.play(), false); assert.equal(stats.starts, 1)
engine.configure({ enabled: true, volume: 0 }); assert.equal(await engine.unlock(), false); assert.equal(await engine.play(), false)
engine.configure({ enabled: true, volume: 100 })
const plays = [engine.play(), engine.play(), engine.play()]
assert.equal(await engine.play(), false, '加载与播放中的总数上限为3')
assert.deepEqual(await Promise.all(plays), [true, true, true]); assert.equal(stats.starts, 4)
assert.equal(requests.filter(item => item.url.endsWith('/default.mp3')).length, 1, '同文件并发下载/解码去重')
engine.close(); engine.close(); assert.equal(stats.closed, 1); assert.equal(stats.disconnected, 8)
assert.ok(stats.stops >= stats.starts)
const invalidSlots = modelApi.normalizeSoundSlots({ default: 'https://bad.example/a.mp3', reactions: { agree: '../secret.mp3', question: 'custom.mp3' } })
assert.equal(invalidSlots.default, 'default.mp3'); assert.equal(invalidSlots.reactions.agree, 'agree.mp3'); assert.equal(invalidSlots.reactions.question, 'custom.mp3')
for (const replacement of [undefined, new Uint8Array([255]), new Uint8Array([254]), new Uint8Array(1024 * 1024 + 1)]) {
  if (replacement) files.set('agree.mp3', replacement); else files.delete('agree.mp3')
  const fallback = fakeAudio(), sound = modelApi.createReactionSound(() => fallback.audio, undefined, request)
  await sound.unlock(); assert.equal(await sound.play('agree'), true)
  assert.equal(fallback.stats.nodes[0].buffer.tag, 1, '缺失/损坏/过长/过大素材回退通用MP3')
  sound.close()
}
const missing = fakeAudio(), missingSound = modelApi.createReactionSound(() => missing.audio, undefined, async () => new Response('missing', { status: 404 }))
await missingSound.unlock(); assert.equal(await missingSound.play(), false); assert.equal(missingSound.getState(), 'unavailable'); missingSound.close()
let resolveResume
const pendingAudio = { state: 'suspended', resume: () => new Promise(resolve => { resolveResume = resolve }), close: async () => {} }
const pendingEngine = modelApi.createReactionSound(() => pendingAudio)
const pendingUnlock = pendingEngine.unlock(); pendingEngine.close(); pendingAudio.state = 'running'; resolveResume()
assert.equal(await pendingUnlock, false, '离房后迟到授权不补播')
const denied = modelApi.createReactionSound(() => ({ state: 'suspended', resume: async () => { throw Error('blocked') }, close: async () => {} }))
assert.equal(await denied.unlock(), false); assert.equal(denied.getState(), 'blocked'); assert.equal(await denied.play(), false); denied.close()
const unsupported = modelApi.createReactionSound(() => { throw Error('unsupported') })
assert.equal(await unsupported.unlock(), false); assert.equal(unsupported.getState(), 'unavailable'); unsupported.close()
const failedAudio = fakeAudio(); failedAudio.audio.createBufferSource = () => { throw Error('device failed') }
const failedDevice = modelApi.createReactionSound(() => failedAudio.audio, undefined, request)
await failedDevice.unlock(); assert.equal(await failedDevice.play(), false); assert.equal(failedDevice.getState(), 'unavailable'); failedDevice.close()
const waitFor = async predicate => { for (let i = 0; i < 30; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 0)) }; throw Error('等待音效加载超时') }
for (const action of ['mute', 'close', 'timeout']) {
  const pending = fakeAudio(); let downloading = false
  const pendingSound = modelApi.createReactionSound(() => pending.audio, undefined, (url, options) => {
    if (url.endsWith('.json')) return request(url, options)
    downloading = true
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }))
  })
  await pendingSound.unlock(); const playing = pendingSound.play()
  await waitFor(() => downloading)
  if (action === 'mute') pendingSound.configure({ enabled: false, volume: 60 })
  else if (action === 'close') pendingSound.close()
  else for (const fire of [...timers.values()]) fire()
  assert.equal(await playing, false); assert.equal(pending.stats.starts, 0); pendingSound.close()
}
let finishDecode
const late = fakeAudio(); late.audio.decodeAudioData = () => new Promise(resolve => { finishDecode = resolve })
const lateSound = modelApi.createReactionSound(() => late.audio, undefined, request)
await lateSound.unlock(); const latePlay = lateSound.play()
await waitFor(() => !!finishDecode); lateSound.close(); finishDecode({ duration: .2 })
assert.equal(await latePlay, false); assert.equal(late.stats.starts, 0)
assert.equal(timers.size, 0)
console.log('通过：14个真实MP3槽位/授权/配置覆盖、按回应加载/同文件缓存、缺失/损坏/过大/过长回退、超时/静音/离房取消与迟到解码不补播；全局开关/音量/逐项试听/偏好/浏览器受限和设备失败模拟。')
