import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import WebSocket from 'ws'
import { readRuntimeConfiguration } from '../server/runtimeConfiguration.mjs'
import { createAsrGateway } from '../server/asrGateway.mjs'

const local = readRuntimeConfiguration({})
assert.equal(local.host, '127.0.0.1'); assert.equal(local.port, 8787)
assert.equal(local.allowLegacyAsr, true); assert.equal(local.enableSettings, true)
assert.equal(local.maxAsrSessions, 8)
assert.equal(readRuntimeConfiguration({ HAKISUB_DEPLOYMENT_MODE: 'private-test' }).maxAsrSessions, 8)
const configuration = readRuntimeConfiguration({
  HAKISUB_DEPLOYMENT_MODE: 'private-test', HAKISUB_HOST: '0.0.0.0',
  HAKISUB_ALLOWED_ORIGINS: 'http://localhost:18787,http://127.0.0.1:18787',
  HAKISUB_MAX_ASR_SESSIONS: '2',
})
assert.equal(configuration.allowLegacyAsr, false); assert.equal(configuration.enableSettings, false)
assert.equal(configuration.maxAsrSessions, 2); assert.equal(configuration.maxRooms, 1)
for (const overrides of [
  { HAKISUB_DEPLOYMENT_MODE: 'unknown' }, { HAKISUB_HOST: 'invalid-host' },
  { HAKISUB_PORT: '0' }, { HAKISUB_PORT: '65536' }, { HAKISUB_PORT: '8787abc' },
  { HAKISUB_MAX_ASR_SESSIONS: '9' }, { HAKISUB_MAX_ASR_SESSIONS: '0' },
  { HAKISUB_ALLOWED_ORIGINS: '*' }, { HAKISUB_ALLOWED_ORIGINS: 'https://public.example' },
  { HAKISUB_ALLOWED_ORIGINS: 'http://localhost:18787/path' }, { HAKISUB_ALLOWED_ORIGINS: '' },
]) assert.throws(() => readRuntimeConfiguration(overrides))
assert.equal(readRuntimeConfiguration({ HAKISUB_MAX_ASR_SESSIONS: '8' }).maxAsrSessions, 8)
const publicConfiguration = readRuntimeConfiguration({
  HAKISUB_DEPLOYMENT_MODE: 'public', HAKISUB_ALLOWED_ORIGINS: 'https://captions.example',
})
assert.equal(publicConfiguration.enableSettings, false)
assert.equal(publicConfiguration.allowLegacyAsr, false)
assert.equal(publicConfiguration.maxRooms, 100)
assert.equal(publicConfiguration.maxAsrSessions, 8)
assert.deepEqual(publicConfiguration.allowedOrigins, ['https://captions.example'])
for (const origin of [undefined, '', '*', 'http://captions.example', 'https://localhost', 'https://127.0.0.1', 'https://captions.example/path', 'https://user:password@captions.example', 'https://*.example']) {
  assert.throws(() => readRuntimeConfiguration({ HAKISUB_DEPLOYMENT_MODE: 'public', HAKISUB_ALLOWED_ORIGINS: origin }))
}

let storeChanges = 0
class FakeUpstream extends EventEmitter {
  readyState = 0; bufferedAmount = 0
  send() {}
  terminate() { this.readyState = 3 }
}
const upstreams = []
const gateway = createAsrGateway({ ...configuration,
  keyStore: { getKey: () => 'fixture-not-a-key', status: () => ({ configured: true }), save: () => storeChanges++ },
  connectUpstream: () => { const upstream = new FakeUpstream(); upstreams.push(upstream); return upstream },
})
const clients = []
const origin = 'http://localhost:18787'
gateway.server.listen(0, configuration.host); await once(gateway.server, 'listening')
assert.equal(gateway.server.address().address, '0.0.0.0')
const address = `127.0.0.1:${gateway.server.address().port}`
async function reject(path, requestOrigin = origin) {
  const socket = new WebSocket(`ws://${address}${path}`, { origin: requestOrigin })
  assert.match(await new Promise(resolve => socket.on('error', error => resolve(error.message))), /403/)
}
const waitFor = async predicate => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw Error('等待私有部署消息超时')
}
async function connect(path) {
  const socket = new WebSocket(`ws://${address}${path}`, { origin }), events = []
  clients.push(socket)
  socket.on('message', packet => events.push(JSON.parse(packet)))
  await once(socket, 'open')
  return { socket, events, send: event => socket.send(JSON.stringify(event)) }
}
try {
  const health = await (await fetch(`http://${address}/api/asr/health`)).json()
  assert.deepEqual(health, { configured: true })
  for (const path of ['/api/asr/settings', '/api/asr/settings/usage', '/api/asr/settings/test']) {
    assert.equal((await fetch(`http://${address}${path}`)).status, 404)
    assert.equal((await fetch(`http://${address}${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"action":"delete"}' })).status, 404)
  }
  assert.equal(storeChanges, 0)
  await reject('/api/asr'); await reject('/api/asr?session='); await reject('/api/asr?session=forged')
  await reject('/api/rooms', 'http://localhost:8787'); await reject('/api/rooms', 'https://untrusted.example')
  const alice = await connect('/api/rooms'); alice.send({ type: 'create', name: 'Alice' })
  await waitFor(() => alice.events.some(event => event.type === 'joined'))
  const first = alice.events.find(event => event.type === 'joined')
  const savedRoomKey = await fetch(`http://${address}/api/rooms/settings`, { method: 'POST', headers: { Origin: configuration.allowedOrigins[0], Authorization: `Bearer ${first.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', apiKey: 'fixture-private-room-key' }) })
  assert.equal(savedRoomKey.status, 200, '并发测试显式配置本房Key，不借用服务器默认Key')
  const roomLimit = await connect('/api/rooms'); roomLimit.send({ type: 'create', name: 'SecondRoom' })
  await waitFor(() => roomLimit.events.some(event => event.type === 'error'))
  const members = [alice]
  for (const name of ['Bob', 'Carol']) {
    const member = await connect('/api/rooms'); member.send({ type: 'join', name, code: first.code })
    await waitFor(() => member.events.some(event => event.type === 'joined')); members.push(member)
  }
  members.forEach(member => member.send({ type: 'mic', mic: true }))
  await waitFor(() => alice.events.at(-1)?.members?.every(member => member.mic))
  const token = member => member.events.find(event => event.type === 'joined').token
  await connect(`/api/asr?session=${token(alice)}`)
  await connect(`/api/asr?session=${token(members[1])}`)
  await reject(`/api/asr?session=${token(members[2])}`)
  assert.equal(upstreams.length, 2, '私有测试并发上限对实际连接生效')
  assert.equal(storeChanges, 0)
} finally {
  clients.forEach(client => client.terminate())
  await gateway.close()
}
const publicUpstreams = []
const publicGateway = createAsrGateway({ ...publicConfiguration,
  keyStore: { getKey: () => 'fixture-not-a-key', status: () => ({ configured: true }), save: () => storeChanges++ },
  connectUpstream: () => { const upstream = new FakeUpstream(); publicUpstreams.push(upstream); return upstream },
})
publicGateway.server.listen(0, '127.0.0.1'); await once(publicGateway.server, 'listening')
const publicAddress = `127.0.0.1:${publicGateway.server.address().port}`
const publicClients = []
try {
  assert.equal((await fetch(`http://${publicAddress}/api/asr/settings`)).status, 404)
  for (const [path, requestOrigin] of [
    ['/api/rooms', 'http://localhost:18787'], ['/api/rooms', 'https://untrusted.example'],
    ['/api/asr', 'https://captions.example'],
  ]) {
    const socket = new WebSocket(`ws://${publicAddress}${path}`, { origin: requestOrigin })
    publicClients.push(socket)
    assert.match(await new Promise(resolve => socket.on('error', error => resolve(error.message))), /403/)
  }
  const publicMembers = [], roomCodes = []
  for (let index = 0; index < 9; index++) {
    const socket = new WebSocket(`ws://${publicAddress}/api/rooms`, { origin: 'https://captions.example' })
    publicClients.push(socket)
    const events = []
    socket.on('message', packet => events.push(JSON.parse(packet)))
    await once(socket, 'open')
    socket.send(JSON.stringify(index < 2 ? { type: 'create', name: `Public${index}` }
      : { type: 'join', name: `Public${index}`, code: roomCodes[index % 2] }))
    await waitFor(() => events.some(event => event.type === 'joined'))
    const identity = events.find(event => event.type === 'joined')
    if (index < 2) {
      roomCodes.push(identity.code)
      const saved = await fetch(`http://${publicAddress}/api/rooms/settings`, { method: 'POST', headers: { Origin: 'https://captions.example', Authorization: `Bearer ${identity.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', apiKey: `fixture-public-room-${index}` }) })
      assert.equal(saved.status, 200)
    }
    socket.send(JSON.stringify({ type: 'mic', mic: true }))
    await waitFor(() => events.at(-1)?.members?.some(member => member.id === identity.memberId && member.mic))
    publicMembers.push({ socket, identity })
  }
  const connectPublicAsr = async (index, rejected = false) => {
    const socket = new WebSocket(`ws://${publicAddress}/api/asr?session=${publicMembers[index].identity.token}`, { origin: 'https://captions.example' })
    publicClients.push(socket)
    if (rejected) assert.match(await new Promise(resolve => socket.once('error', error => resolve(error.message))), /403/)
    else await once(socket, 'open')
  }
  for (let index = 0; index < 8; index++) await connectPublicAsr(index)
  assert.equal(publicUpstreams.length, 8, '公网默认允许八路独立成员识别')
  await connectPublicAsr(0, true)
  await connectPublicAsr(8, true)
  assert.equal(publicUpstreams.length, 8, '同成员重复连接与跨房间第九路仍被拒绝')
  publicMembers[0].socket.send(JSON.stringify({ type: 'mic', mic: false }))
  await waitFor(() => publicUpstreams[0].readyState === 3)
  await connectPublicAsr(8)
  assert.equal(publicUpstreams.length, 9, '关麦释放名额后等待成员可以连接')
  assert.equal(storeChanges, 0)
} finally {
  publicClients.forEach(client => client.terminate())
  await publicGateway.close()
}
console.log('通过：本机/私有/公网部署参数、HTTPS Origin白名单、远程模式关闭设置及无令牌ASR、房间及并发限制。未运行Docker、TLS或真实豆包。')
