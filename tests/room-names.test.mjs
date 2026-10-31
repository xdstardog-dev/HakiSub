import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { createRoomStore } from '../server/roomStore.mjs'
import { createAsrGateway } from '../server/asrGateway.mjs'

const directory = await mkdtemp(join(tmpdir(), 'hakisub-room-names-'))
const path = join(directory, 'rooms.json'), origin = 'http://127.0.0.1:5173', clients = []
let gateway, base, failSave = false
async function waitFor(predicate) {
  for (let count = 0; count < 150; count++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error('Room naming test timed out')
}
async function start() {
  const store = await createRoomStore(path)
  gateway = createAsrGateway({ roomStore: { list: store.list, save: room => failSave ? Promise.reject(Error('synthetic disk outage')) : store.save(room) },
    connectUpstream() { throw Error('Naming tests must never call ASR') } })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  base = `http://127.0.0.1:${gateway.server.address().port}`
}
async function connect(command) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/rooms', { origin }), events = []
  clients.push(socket); socket.on('message', packet => events.push(JSON.parse(packet)))
  await once(socket, 'open'); socket.send(JSON.stringify({ name: '合成显示名称', ...command }))
  await waitFor(() => events.some(event => event.type === 'joined'))
  return { socket, events, identity: events.find(event => event.type === 'joined') }
}
const settings = (person, command, requestOrigin = origin) => fetch(base + '/api/rooms/settings', {
  method: command ? 'POST' : 'GET', headers: { Origin: requestOrigin, Authorization: `Bearer ${person.identity.token}`, ...(command ? { 'Content-Type': 'application/json' } : {}) },
  ...(command ? { body: JSON.stringify(command) } : {}),
})
try {
  const legacy = { code: '114514', ownerHash: createHash('sha256').update('legacy').digest('hex') }
  for (const version of [1, 2, 3, 4]) {
    await writeFile(path, JSON.stringify({ version, rooms: [legacy] }))
    assert.equal((await createRoomStore(path)).list()[0].name, '房间 114514')
  }
  await start()
  const owner = await connect({ type: 'create', roomName: '伪造名称', nickname: '伪造昵称' })
  assert.equal(owner.identity.name, '游客001的房间', '游客不使用未经认证的账号昵称或客户端指定名称')
  const others = await Promise.all([connect({ type: 'create' }), connect({ type: 'create' })])
  assert.deepEqual(others.map(person => person.identity.name).sort(), ['游客002的房间', '游客003的房间'])
  const member = await connect({ type: 'join', code: owner.identity.code })
  assert.equal(member.identity.name, owner.identity.name)
  assert.equal((await settings(member, { action: 'rename', name: '偷改' })).status, 403)
  assert.equal((await settings(owner, { action: 'rename', name: '跨域' }, 'https://untrusted.example')).status, 403)
  for (const name of ['', '   ', '中'.repeat(13), '换\n行', '控制\u0000字', '段落\u2029字', 123, null]) {
    assert.equal((await settings(owner, { action: 'rename', name })).status, 400)
  }
  const maximumName = '一二三四五六七八九十甲乙'
  assert.equal((await settings(owner, { action: 'rename', name: maximumName })).status, 200)
  assert.equal((await (await settings(owner)).json()).name, maximumName, '12字可完整保存')
  assert.equal((await settings(owner, { action: 'rename', name: maximumName + '多' })).status, 400)
  assert.equal((await (await settings(owner)).json()).name, maximumName, '拒绝13字时保留原名')
  for (const name of ['a'.repeat(24), '中'.repeat(11) + 'ab']) {
    assert.equal((await settings(owner, { action: 'rename', name })).status, 200)
    assert.equal((await (await settings(owner)).json()).name, name)
  }
  for (const name of ['a'.repeat(25), '中'.repeat(11) + 'abc']) assert.equal((await settings(owner, { action: 'rename', name })).status, 400)
  const rename = await settings(owner, { action: 'rename', name: '  朋友的交流室  ' })
  assert.equal(rename.status, 200); assert.equal((await rename.json()).name, '朋友的交流室')
  await waitFor(() => member.events.some(event => event.type === 'room-status' && event.name === '朋友的交流室'))
  assert.equal((await (await settings(others[0])).json()).name, others[0].identity.name, '名称按房间隔离')
  failSave = true
  assert.equal((await settings(owner, { action: 'rename', name: '保存失败的名称' })).status, 500)
  assert.equal((await (await settings(owner)).json()).name, '朋友的交流室')
  assert.equal((await readFile(path, 'utf8')).includes('保存失败的名称'), false)
  failSave = false
  const markup = '<img>'
  assert.equal((await settings(owner, { action: 'rename', name: markup })).status, 200)
  const store = await createRoomStore(path)
  const record = store.list().find(room => room.code === owner.identity.code)
  assert.equal(record.name, markup); assert.equal(record.nameCustomized, true)
  await store.save({ code: record.code, ownerHash: record.ownerHash, asrEnabled: false })
  assert.equal(store.list().find(room => room.code === record.code).name, markup, '其他元数据写入保留名称与编号')
  await gateway.close(); gateway = undefined
  const target = ['999991', '999992', '999993'].find(code => !store.list().some(room => room.code === code))
  await store.renameRoom(record.code, target)
  await start()
  const returned = await connect({ type: 'join', code: record.code, ownerToken: owner.identity.ownerToken })
  assert.equal(returned.identity.code, target); assert.equal(returned.identity.name, markup); assert.equal(returned.identity.isOwner, true)
  const next = await connect({ type: 'create' })
  assert.equal(next.identity.name, '游客004的房间', '自定义名称、换号和重启不重置游客编号')
  const invalid = JSON.parse(await readFile(path, 'utf8')); invalid.rooms[0].name = '中'.repeat(13)
  await writeFile(join(directory, 'invalid.json'), JSON.stringify(invalid))
  await assert.rejects(createRoomStore(join(directory, 'invalid.json')), /无法读取/)
  console.log('通过：游客默认名/并发编号/服务端校验/房主权限/广播隔离/失败保留/历史版本/持久重启及换号。无真实ASR或麦克风。')
} finally {
  clients.forEach(socket => socket.terminate()); await gateway?.close()
  await rm(directory, { recursive: true, force: true })
}
