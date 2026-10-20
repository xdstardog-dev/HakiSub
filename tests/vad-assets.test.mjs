import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const context = vm.createContext({ URL, fetch })
const source = readFileSync(new URL('../src/vadAssets.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
vm.runInContext(ts.transpile(source + '\nglobalThis.api = {downloadVadAsset, vadAssetUrl}', { target: ts.ScriptTarget.ES2022 }), context)
const { downloadVadAsset, vadAssetUrl } = context.api
const url = vadAssetUrl('https://captions.example/vad/', 'silero-v6.onnx')
assert.match(url, /^https:\/\/captions.example\/vad\/silero-v6.onnx\?v=/)
const progress = [], chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]
const bytes = await downloadVadAsset(url, 5, value => progress.push(value), async (address, options) => {
  assert.equal(address, url); assert.equal(options.cache, 'force-cache'); assert.equal(options.credentials, 'same-origin')
  return new Response(new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close() } }),
    { headers: { 'Content-Length': '2', 'Content-Encoding': 'gzip' } })
})
assert.deepEqual(Array.from(bytes), [1, 2, 3, 4, 5])
assert.deepEqual(progress, [2, 5], '压缩传输使用浏览器解压后的字节数，不能用Content-Length误报完成')
for (const response of [new Response('', { status: 404 }), new Response(null), new Response(new Uint8Array(4)), new Response(new Uint8Array(6))]) {
  await assert.rejects(downloadVadAsset(url, 5, () => {}, async () => response), /VAD resource/)
}
let cancelled = false
await assert.rejects(downloadVadAsset(url, 5, () => { throw Error('cancel loading') }, async () => new Response(new ReadableStream({
  pull(controller) { controller.enqueue(new Uint8Array([1])) }, cancel() { cancelled = true },
}))), /cancel loading/)
assert.equal(cancelled, true)
console.log('通过：VAD版本化同源URL、资源流式进度、压缩长度处理、HTTP失败/截断/超长和取消清理。未访问真实麦克风或豆包。')
