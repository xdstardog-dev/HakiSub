import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const context = vm.createContext({})
vm.runInContext(ts.transpile(source('captions.ts') + source('captionEntrance.ts') + '\nglobalThis.model={receiveCaptionEntrance,expireCaptions};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const { receiveCaptionEntrance: receive, expireCaptions } = context.model
let queue = []
const event = (memberId, utteranceId, text = '新字幕', state = 'interim', source = 'speech') => ({ memberId, utteranceId, text, state, source })
assert.equal(receive(queue, event('a', 'empty', '  '), 0), false)
assert.equal(receive(queue, event('a', 'first'), 0), true)
assert.equal(receive(queue, event('a', 'first', '持续更新'), 100), false)
assert.equal(receive(queue, event('a', 'first', '确认', 'final'), 200), false)
assert.equal(receive(queue, event('a', 'second', '另一句', 'final'), 300), false)
assert.equal(receive(queue, event('b', 'direct-final', '直接确认', 'final'), 300), true, '成员独立，直接 final 也触发')
assert.equal(receive(queue, event('a', 'fading', '渐隐中新句', 'final'), 5299), false, '旧字幕最后一毫秒仍占据区域')
queue = expireCaptions(queue, 10300)
assert.equal(receive(queue, event('a', 'new-round', '新轮次', 'final'), 10300), true)
assert.equal(receive(queue, event('a', 'new-round', '重复确认', 'final'), 10301), false)
queue = expireCaptions(queue, 15300)
assert.equal(receive(queue, event('a', 'typed-a', '打字', 'final', 'typing'), 15300), false)
assert.equal(receive(queue, event('a', 'speech-over-typing', '语音', 'final'), 15301), false, '打字内容也阻止新轮次')
queue = expireCaptions(queue, 20301)
assert.equal(receive(queue, event('a', 'after-typing'), 20301), true)
assert.equal(receive(queue, event('c', 'typed-legacy', '旧协议打字', 'final', undefined), 20301), false)
console.log('通过：非空首条 interim/直接 final、成员独立、连续更新/确认/重叠句去重、渐隐最后一毫秒、完全消失重新触发、打字占位且不触发。')
