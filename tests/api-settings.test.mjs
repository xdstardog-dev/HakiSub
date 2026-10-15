import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { createServer, request as httpRequest } from 'node:http'
import { once, EventEmitter } from 'node:events'
import { parseEnv } from 'node:util'
import { createApiKeyStore } from '../server/apiKeyStore.mjs'
import { createApiSettingsHandler, testDoubaoConnection } from '../server/apiSettings.mjs'
import { createAsrGateway } from '../server/asrGateway.mjs'
import WebSocket from 'ws'

const directory = await mkdtemp(join(tmpdir(), 'hakisub-settings-'))
const envPath = join(directory, '.env')
const secret = 'fake-settings-key-not-real'
try {
  await writeFile(envPath, '# keep this comment\nOTHER_VALUE="safe"\nDOUBAO_API_KEY="old\nmultiline"\nDOUBAO_API_KEY=duplicate\n')
  const store = await createApiKeyStore(envPath)
  await store.save(secret)
  assert.equal(store.getKey(), secret)
  assert.equal(JSON.stringify(store.status()).includes(secret), false)
  const saved = await readFile(envPath, 'utf8')
  assert.match(saved, /# keep this comment/)
  assert.equal(parseEnv(saved).OTHER_VALUE, 'safe')
  assert.equal(saved.match(/DOUBAO_API_KEY=/g).length, 1)
  assert.equal((await createApiKeyStore(envPath)).getKey(), secret)
  await assert.rejects(store.save('bad\nINJECTED=yes'))
  assert.equal(store.getKey(), secret)
  const locked = await createApiKeyStore(envPath, 'external-key')
  assert.equal(locked.status().readOnly, true)
  await assert.rejects(locked.save('replacement'))

  let recognizing = false, probeCount = 0
  const handler = createApiSettingsHandler(store, { isRecognizing: () => recognizing, probe: async key => {
    assert.equal(key, secret); probeCount++; return { ok: true, message: 'mock handshake only' }
  } })
  const server = createServer((request, response) => void handler(request, response))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/asr/settings`
  try {
    const initial = await fetch(base).then(response => response.json())
    assert.equal(initial.configured, true); assert.ok(initial.csrfToken)
    assert.equal(JSON.stringify(initial).includes(secret), false)
    const headers = { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json', 'X-HakiSub-Token': initial.csrfToken }
    const post = (body, override = {}, suffix = '') => fetch(base + suffix, { method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify(body) })
    assert.equal((await post({ action: 'delete' }, { Origin: 'https://stranger.example' })).status, 403)
    assert.equal((await post({ action: 'delete' }, { 'X-HakiSub-Token': 'wrong' })).status, 403)
    const rejectedHost = await new Promise((resolve, reject) => {
      const request = httpRequest(base, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode) })
      request.on('error', reject); request.end()
    })
    assert.equal(rejectedHost, 403)
    assert.equal((await post(null)).status, 400)
    assert.equal((await post({ action: 'save', apiKey: '' })).status, 400)
    assert.equal((await post({ action: 'save', apiKey: 'bad\nENV=1' })).status, 400)
    assert.equal((await post({ action: 'save', apiKey: 'x'.repeat(5000) })).status, 413)
    recognizing = true
    assert.equal((await post({ action: 'delete' })).status, 409)
    assert.equal((await post({}, {}, '/test')).status, 409)
    recognizing = false
    assert.equal((await (await post({}, {}, '/test')).json()).ok, true); assert.equal(probeCount, 1)
    const deletion = await (await post({ action: 'delete' })).json()
    assert.equal(deletion.configured, false); assert.equal(store.getKey(), '')
    assert.equal((await createApiKeyStore(envPath)).getKey(), '')
    assert.equal((await post({}, {}, '/test')).status, 400)
    assert.equal((await post({ action: 'save', apiKey: secret })).status, 200)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }

  // 探测不会发送配置或音频；所有结束路径必须释放连接，错误不透传密钥。
  for (const scenario of ['open', 'error', 'refused', 'close', 'timeout', 'abort']) {
    const socket = new EventEmitter(); socket.readyState = 0; socket.terminate = () => { socket.terminated = true }
    socket.send = () => assert.fail('连接探测不得发送音频')
    const controller = new AbortController()
    const promise = testDoubaoConnection(secret, { timeoutMs: 20, signal: controller.signal, connect: (_url, options) => { assert.equal(options.headers['X-Api-Key'], secret); return socket } })
    if (scenario === 'open') socket.emit('open')
    if (scenario === 'error') socket.emit('error', Error(secret))
    if (scenario === 'refused') socket.emit('unexpected-response', {}, { statusCode: 403, resume() {} })
    if (scenario === 'close') socket.emit('close')
    if (scenario === 'abort') controller.abort()
    const result = await promise
    assert.equal(result.ok, scenario === 'open'); assert.equal(socket.terminated, true)
    assert.equal(JSON.stringify(result).includes(secret), false)
  }

  // 保存的新密钥无需重启，下一条识别连接使用新值。
  let usedKey
  const gateway = createAsrGateway({ keyStore: store, connectUpstream: (_url, options) => {
    usedKey = options.headers['X-Api-Key']
    const socket = new EventEmitter(); socket.readyState = 0; socket.terminate = () => {}; return socket
  } })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  try {
    await store.save('new-session-key')
    const client = new WebSocket(`ws://127.0.0.1:${gateway.server.address().port}/api/asr`, { origin: 'http://127.0.0.1:5173' })
    await once(client, 'open'); assert.equal(usedKey, 'new-session-key')
    client.close(); await once(client, 'close')
  } finally { await gateway.close() }
} finally {
  // 仅删除本测试在系统临时目录中创建的专用目录。
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
  assert.ok(basename(directory).startsWith('hakisub-settings-'))
  await rm(directory, { recursive: true, force: true })
}
console.log('通过：API设置持久化/删除/环境变量只读/热更新、配置不回显、来源/令牌校验、忙碌保护、握手测试与超时/断线清理。未调用真实 API。')
