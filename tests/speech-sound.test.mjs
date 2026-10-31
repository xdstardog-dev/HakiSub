import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const read = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8').replace(/^export /gm, '')
const context = vm.createContext({})
vm.runInContext(ts.transpile(read('speechSound.ts') + read('roomPreferences.ts') + '\nglobalThis.model={createSpeechSound,SPEECH_FREQUENCIES,loadRoomPreferences,saveRoomPreferences};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const { createSpeechSound, SPEECH_FREQUENCIES, loadRoomPreferences, saveRoomPreferences } = context.model
const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
assert.equal(loadRoomPreferences(storage).adaptiveCards, true)
assert.equal(loadRoomPreferences(storage).speechEnabled, true, '旧设置默认开启发言音效')
assert.equal(saveRoomPreferences({ adaptiveCards: false, speechVolume: 0 }, storage), true)
assert.equal(loadRoomPreferences(storage).adaptiveCards, false); assert.equal(loadRoomPreferences(storage).speechVolume, 0)
assert.equal(saveRoomPreferences({ adaptiveCards: true, speechVolume: 37 }, storage), true)
assert.equal(loadRoomPreferences(storage).speechVolume, 37)
saveRoomPreferences({ adaptiveCards: true, speechVolume: 54, speechEnabled: false }, storage)
assert.equal(loadRoomPreferences(storage).speechEnabled, false); assert.equal(loadRoomPreferences(storage).speechVolume, 54, '静音保存开关但保留调试音量')
saveRoomPreferences({ ...loadRoomPreferences(storage), speechEnabled: true }, storage)
assert.equal(loadRoomPreferences(storage).speechVolume, 54)
assert.equal(loadRoomPreferences({ getItem: () => '{broken' }).adaptiveCards, true)
assert.equal(saveRoomPreferences({}, { setItem() { throw Error('blocked') } }), false)
const oscillators = [], gains = []
const audio = { state: 'suspended', currentTime: 10, destination: {}, resume() { this.state = 'running' }, close() { this.state = 'closed'; return Promise.resolve() },
  createOscillator() { const node = { frequency: { setValueAtTime(value) { node.pitch = value } }, connect() {}, disconnect() {}, start() { node.started = true }, stop() { node.stopped = true } }; oscillators.push(node); return node },
  createGain() { const node = { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { node.peak = value }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; gains.push(node); return node },
}
const sound = createSpeechSound(() => audio)
assert.equal(sound.play(0), false, '未解锁不排队')
assert.equal(await sound.unlock(), true)
for (let slot = 0; slot < 8; slot++) assert.equal(sound.play(slot), true)
assert.deepEqual(oscillators.map(node => node.pitch), Array.from(SPEECH_FREQUENCIES))
assert.ok(Math.abs(oscillators[7].pitch / oscillators[0].pitch - 2) < .00001)
assert.equal(sound.play(0), false, '并发有界，丢弃过密音效')
sound.configure(0); assert.ok(oscillators.every(node => node.stopped)); assert.equal(sound.play(0), false)
sound.configure(100); assert.equal(sound.play(7), true)
assert.ok(gains.at(-1).peak > gains[0].peak)
assert.equal(sound.play(-1), false); assert.equal(sound.play(8), false); assert.equal(sound.play(NaN), false)
sound.close(); assert.equal(sound.play(0), false)
assert.equal(await createSpeechSound(() => { throw Error('unavailable') }).unlock(), false)
console.log('通过：C4～C5八音阶/同音色/短音/并发上限、未解锁丢弃、0音量/关闭清理、音量曲线、设备失败、布局与发言音量独立持久化及存储失败。仅模拟音频设备。')
