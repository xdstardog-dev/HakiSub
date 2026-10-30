import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/accountClient.ts', import.meta.url), 'utf8').replace('import.meta.env.VITE_ACCOUNT_ORIGIN', 'undefined').replace('import.meta.env.DEV', 'true').replace(/^export /gm, '')
const context = vm.createContext({ AbortController, DOMException, Error, setTimeout, clearTimeout, fetch, Response })
vm.runInContext(ts.transpile(source + '\nglobalThis.model = {createAccountClient,accountOrigin};', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
const calls = [], model = context.model
const client = model.createAccountClient(async (url, options) => {
  calls.push({ url, options })
  return new Response(JSON.stringify(url.endsWith('/csrf') ? { token: 'ephemeral-csrf' } : url.endsWith('/identity') ? { user: { uid: 'fixture-user', nickname: '公开昵称' } } : { presets: [] }), { status: 200 })
})
assert.equal((await client.identity()).user.nickname, '公开昵称')
await client.save('朋友交流', { schemaVersion: 1, asrProvider: 'doubao', adaptiveCards: false })
assert.equal(calls.length, 3)
assert.ok(calls.every(call => call.options.credentials === 'include' && call.options.cache === 'no-store'))
assert.equal(calls[2].options.headers['X-CSRF-Token'], 'ephemeral-csrf')
assert.equal(calls[2].options.headers.Authorization, undefined)
assert.equal(JSON.parse(calls[2].options.body).configuration.apiKey, undefined)
await client.roomAccess('123456', '0042')
assert.ok(calls.at(-1).url.endsWith('/rooms/123456/access'))
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { password: '0042' })
await client.roomAccess('123456')
assert.deepEqual(JSON.parse(calls.at(-1).options.body), {})
let signal
const pendingClient = model.createAccountClient((_url, options) => new Promise((_resolve, reject) => { signal = options.signal; signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) }))
const pending = pendingClient.identity(); pendingClient.cancel(); await assert.rejects(pending, /取消或超时/); assert.equal(signal.aborted, true)
const denied = model.createAccountClient(async () => new Response(JSON.stringify({ message: '请重新登录' }), { status: 401 }))
await assert.rejects(denied.identity(), error => error.status === 401 && error.message === '请重新登录')
console.log('通过：账号客户端精确主站请求、凭据Cookie/CSRF、无Bearer或Key持久化、错误状态和取消清理；仅模拟请求。')
