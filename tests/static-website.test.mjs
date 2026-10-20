import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, writeFile, unlink, rmdir, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStaticWebsite } from '../server/staticWebsite.mjs'
import { allowedAppOrigins } from '../server/apiSettings.mjs'
const directory = await mkdtemp(join(tmpdir(), 'hakisub-web-'))
await writeFile(join(directory, 'index.html'), '<h1>HakiSub</h1>')
await writeFile(join(directory, 'runtime.mjs'), 'export const ready = true')
await writeFile(join(directory, 'runtime.wasm'), Buffer.from([0, 97, 115, 109]))
await mkdir(join(directory, 'vad'))
const model = Buffer.alloc(4096, 42), compressedModel = gzipSync(model)
await writeFile(join(directory, 'vad/silero-v6.onnx'), model)
await writeFile(join(directory, 'vad/silero-v6.onnx.gz'), compressedModel)
const server = createServer(createStaticWebsite(directory))
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
try {
  for (const path of ['/', '/glasses', '/114514/', '/114514', '/985529/?source=share']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/)
    assert.equal(await response.text(), '<h1>HakiSub</h1>')
  }
  for (const path of ['/.env', '/server/index.mjs', '/%2eenv', '/..%5c.env', '/missing.js', '/11451/', '/1145140/', '/114514/extra', '/114514/.env']) assert.equal((await fetch(base + path)).status, 404)
  assert.equal((await fetch(base, { method: 'POST' })).status, 405)
  assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '')
  assert.ok(allowedAppOrigins.includes('http://127.0.0.1:8787'))
  assert.match((await fetch(base + '/runtime.mjs')).headers.get('content-type'), /javascript/)
  assert.equal((await fetch(base + '/runtime.wasm')).headers.get('content-type'), 'application/wasm')
  const compressed = await fetch(base + '/vad/silero-v6.onnx?v=test-v1', { headers: { 'Accept-Encoding': 'gzip' } })
  assert.equal(compressed.headers.get('content-encoding'), 'gzip')
  assert.equal(Number(compressed.headers.get('content-length')), compressedModel.length)
  assert.equal(compressed.headers.get('vary'), 'Accept-Encoding')
  assert.match(compressed.headers.get('cache-control'), /immutable/)
  assert.deepEqual(Buffer.from(await compressed.arrayBuffer()), model, 'HTTP客户端解压后必须仍为完整模型')
  for (const encoding of ['identity', 'gzip;q=0', 'br, gzip;q=0.0']) {
    const identity = await fetch(base + '/vad/silero-v6.onnx', { headers: { 'Accept-Encoding': encoding } })
    assert.equal(identity.headers.get('content-encoding'), null)
    assert.equal(Number(identity.headers.get('content-length')), model.length)
    assert.equal(identity.headers.get('cache-control'), 'no-cache')
    assert.deepEqual(Buffer.from(await identity.arrayBuffer()), model)
  }
  const head = await fetch(base + '/vad/silero-v6.onnx?v=test-v1', { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip;q=0.5' } })
  assert.equal(head.headers.get('content-encoding'), 'gzip'); assert.equal(await head.text(), '')
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  for (const file of ['index.html', 'runtime.mjs', 'runtime.wasm']) await unlink(join(directory, file))
  for (const file of ['silero-v6.onnx', 'silero-v6.onnx.gz']) await unlink(join(directory, 'vad', file))
  await rmdir(join(directory, 'vad'))
  await rmdir(directory)
}
console.log('通过：正式网页、AR路由、文件隔离、HEAD与方法限制；未调用豆包。')
