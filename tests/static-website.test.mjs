import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStaticWebsite } from '../server/staticWebsite.mjs'
import { allowedAppOrigins } from '../server/apiSettings.mjs'
const directory = await mkdtemp(join(tmpdir(), 'hakisub-web-'))
await writeFile(join(directory, 'index.html'), '<h1>HakiSub</h1>')
await writeFile(join(directory, 'runtime.mjs'), 'export const ready = true')
await writeFile(join(directory, 'runtime.wasm'), Buffer.from([0, 97, 115, 109]))
const server = createServer(createStaticWebsite(directory))
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
try {
  for (const path of ['/', '/glasses']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/)
    assert.equal(await response.text(), '<h1>HakiSub</h1>')
  }
  for (const path of ['/.env', '/server/index.mjs', '/%2eenv', '/..%5c.env', '/missing.js']) assert.equal((await fetch(base + path)).status, 404)
  assert.equal((await fetch(base, { method: 'POST' })).status, 405)
  assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '')
  assert.ok(allowedAppOrigins.includes('http://127.0.0.1:8787'))
  assert.match((await fetch(base + '/runtime.mjs')).headers.get('content-type'), /javascript/)
  assert.equal((await fetch(base + '/runtime.wasm')).headers.get('content-type'), 'application/wasm')
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  for (const file of ['index.html', 'runtime.mjs', 'runtime.wasm']) await unlink(join(directory, file))
  await rmdir(directory)
}
console.log('通过：正式网页、AR路由、文件隔离、HEAD与方法限制；未调用豆包。')
