import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

const source = readFileSync(new URL('../src/components/ApiSettings.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const template = source.match(/<template>([\s\S]*?)<\/template>\s*<style/)[1]
const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
const localConfiguration = { configured: false, readOnly: false, source: 'file', csrfToken: 'fixture-csrf', busy: false }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

function createView(fetchResponse) {
  const calls = [], timers = new Map()
  let unmount, mount, nextTimer = 0
  const context = vm.createContext({
    ...Vue, AbortController, Error,
    defineEmits: () => () => {},
    onMounted: callback => { mount = callback }, onUnmounted: callback => { unmount = callback },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => { calls.push({ url, options }); return fetchResponse(url, options, calls.length) },
  })
  vm.runInContext(ts.transpile(script + '\nglobalThis.settings = { configuration,managedByServer,serverConfigured,configurationState,configurationLabel,apiKey,message,failed,busy,confirmDelete,keyInput,requestConfiguration,emit };', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  assert.equal(typeof mount, 'function')
  const state = context.settings
  return {
    state, calls, timers, unmount: () => unmount(),
    html: () => renderToString(Vue.createSSRApp({
      components: { AsrUsageStatistics: { render: () => Vue.h('div', { 'data-fixture-usage': '' }, 'usage-panel') } },
      setup: () => state, render,
    })),
  }
}

// 私有服务的404只触发只读健康查询；页面与脚本均不提供密钥写入或用量轮询。
let configured = false
const privateView = createView(url => url === '/api/asr/settings' ? new Response(null, { status: 404 }) : json({ configured }))
await privateView.state.requestConfiguration()
assert.deepEqual(privateView.calls.map(call => call.url), ['/api/asr/settings', '/api/asr/health'])
assert.equal(privateView.state.managedByServer.value, true)
assert.equal(privateView.state.configurationLabel.value, '尚未配置 API Key')
let html = await privateView.html()
assert.match(html, /API Key 由服务器统一管理/)
assert.doesNotMatch(html, /<input|保存配置|测试已保存|删除本地配置|usage-panel|正在读取配置|npm run dev|这台电脑/)
privateView.state.apiKey.value = 'fixture-must-not-be-posted'
for (const action of ['save', 'delete', 'test']) await privateView.state.requestConfiguration(action)
assert.equal(privateView.calls.length, 2)
configured = true
await privateView.state.requestConfiguration()
assert.deepEqual(privateView.calls.map(call => call.url), ['/api/asr/settings', '/api/asr/health', '/api/asr/health'])
assert.equal(privateView.state.configurationLabel.value, '已配置 API Key')
assert.equal(privateView.timers.size, 0)
privateView.unmount()
assert.equal(privateView.state.apiKey.value, '')

// 本机设置维持保存、只读环境密钥和原用量入口；输入仅用于提交，之后清空。
const localView = createView((_url, options) => options.method === 'POST'
  ? json({ configured: true, message: 'fixture saved' }) : json(localConfiguration))
await localView.state.requestConfiguration()
html = await localView.html()
assert.match(html, /<input/)
assert.match(html, /保存配置/)
assert.match(html, /data-fixture-usage/)
assert.doesNotMatch(html, /服务器统一管理/)
localView.state.apiKey.value = ' fixture-local-only '
await localView.state.requestConfiguration('save')
assert.equal(localView.state.apiKey.value, '')
assert.equal(localView.calls[1].options.headers['X-HakiSub-Token'], 'fixture-csrf')
assert.deepEqual(JSON.parse(localView.calls[1].options.body), { action: 'save', apiKey: 'fixture-local-only' })
assert.equal(localView.state.configurationLabel.value, '已配置 API Key')
assert.doesNotMatch(await localView.html(), /fixture-local-only/)
localView.unmount()
const readOnlyView = createView(() => json({ ...localConfiguration, configured: true, readOnly: true, source: 'environment' }))
await readOnlyView.state.requestConfiguration()
html = await readOnlyView.html()
assert.match(html, /当前使用启动环境提供的密钥/)
assert.match(html, /<input[^>]*disabled/)
readOnlyView.unmount()

// 服务或响应异常不会永久显示读取中，也不会把失败误当作“未配置”。
for (const response of [() => new Response('unavailable', { status: 502 }), () => json({ invalid: true }), () => Promise.reject(Error('fixture offline'))]) {
  const failedView = createView(response)
  await failedView.state.requestConfiguration()
  assert.equal(failedView.state.configurationLabel.value, '配置状态暂不可用')
  assert.equal(failedView.state.busy.value, false)
  assert.equal(failedView.state.failed.value, true)
  html = await failedView.html()
  assert.doesNotMatch(html, /正在读取配置|npm run dev|<input|data-fixture-usage/)
  assert.match(html, /刷新状态/)
  failedView.unmount()
}
let failHealth = true
const retryView = createView(url => url === '/api/asr/settings' ? new Response(null, { status: 404 }) : failHealth ? json({ message: 'fixture unavailable' }, 503) : json({ configured: true }))
await retryView.state.requestConfiguration()
assert.equal(retryView.state.configurationLabel.value, '配置状态暂不可用')
assert.doesNotMatch(await retryView.html(), /<input|usage-panel|尚未配置 API Key|需要管理员在服务器配置/)
failHealth = false
await retryView.state.requestConfiguration()
assert.equal(retryView.state.configurationLabel.value, '已配置 API Key')
retryView.unmount()

// 超时与离开页面都会释放请求；迟到的404不应继续发起健康查询。
const timeoutView = createView((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(Error('aborted'), { name: 'AbortError' })), { once: true })))
const timeoutRequest = timeoutView.state.requestConfiguration()
assert.equal(timeoutView.timers.size, 1)
timeoutView.timers.values().next().value()
await timeoutRequest
assert.equal(timeoutView.state.configurationLabel.value, '配置状态暂不可用')
assert.equal(timeoutView.timers.size, 0)
timeoutView.unmount()
let resolveLate
const lateView = createView(() => new Promise(resolve => { resolveLate = resolve }))
const lateRequest = lateView.state.requestConfiguration()
lateView.unmount()
assert.equal(lateView.calls[0].options.signal.aborted, true)
resolveLate(new Response(null, { status: 404 }))
await lateRequest
assert.equal(lateView.calls.length, 1)
assert.equal(lateView.timers.size, 0)
console.log('通过：设置页私有服务只读状态、禁止写入与用量入口、本机保存/只读兼容、响应异常/重试/超时及卸载清理；使用模拟请求与实际Vue模板渲染。')
