import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const destination = new URL('../public/vad/', import.meta.url)
await mkdir(destination, { recursive: true })
const model = await readFile(new URL('silero-v6.onnx', destination))
if (createHash('sha256').update(model).digest('hex') !== '597d30b3ec076608d059477bb14cfeffdf951bf5cae370d38f65d33bbfe82004') throw Error('Silero model checksum mismatch')
for (const file of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await copyFile(new URL(`../node_modules/onnxruntime-web/dist/${file}`, import.meta.url), new URL(file, destination))
}
for (const file of ['silero-v6.onnx', 'ort.wasm.min.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await writeFile(new URL(`${file}.gz`, destination), gzipSync(await readFile(new URL(file, destination)), { level: 9 }))
}
console.log('本地 VAD 模型校验通过，WASM 运行资源已准备。')
