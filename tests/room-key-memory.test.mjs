import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRoomStore } from '../server/roomStore.mjs'
import { createRoomGateway } from '../server/roomGateway.mjs'

const directory = await mkdtemp(join(tmpdir(), 'hakisub-memory-keys-'))
const path = join(directory, 'rooms.json')
const ownerUid = '11111111-1111-1111-1111-111111111111'
const metadata = { code: '114514', ownerHash: 'a'.repeat(64), ownerUid, aliases: ['985529'], asrEnabled: true }
let gateway
try {
  for (const version of [1, 2, 3]) {
    const legacy = { ...metadata, encryptedKey: { ciphertext: 'unreadable-old-ciphertext' }, apiKey: 'synthetic-disk-key', keyState: 'configured' }
    await writeFile(path, JSON.stringify({ version, rooms: [legacy] }))
    const store = await createRoomStore(path)
    assert.deepEqual(store.list(), [metadata], '旧密文损坏或主密钥丢失不阻断元数据读取，也不加载任何Key')
    gateway = createRoomGateway({ roomStore: store, probe: async () => ({ ok: true }) })
    const command = { uid: ownerUid, code: '985529' }
    assert.equal((await gateway.manageAccount({ uid: ownerUid, action: 'list' })).rooms[0].configured, false)
    await assert.rejects(gateway.manageAccount({ ...command, action: 'test' }), error => error.statusCode === 400)
    await gateway.manageAccount({ ...command, action: 'save', apiKey: 'synthetic-live-key' })
    assert.equal((await gateway.manageAccount({ uid: ownerUid, action: 'list' })).rooms[0].configured, true)
    assert.equal((await readFile(path, 'utf8')).includes('synthetic-live-key'), false)
    await gateway.close()
    // 即使上次元数据从未成功写入，原磁盘仍有旧Key，新实例也只能从missing开始。
    gateway = createRoomGateway({ roomStore: await createRoomStore(path) })
    assert.equal((await gateway.manageAccount({ uid: ownerUid, action: 'list' })).rooms[0].keyState, 'missing')
    await gateway.manageAccount({ ...command, action: 'asr', enabled: false })
    const saved = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(saved.version, 3)
    assert.deepEqual(saved.rooms, [{ ...metadata, asrEnabled: false }], '成功保存时全文件剥离旧Key字段，保留身份/别名/开关')
    await gateway.close(); gateway = undefined
  }
  const blockedParent = join(directory, 'not-a-directory')
  const failureStore = await createRoomStore(join(blockedParent, 'rooms.json'))
  await writeFile(blockedParent, 'synthetic filesystem obstruction')
  await assert.rejects(failureStore.save({ ...metadata, apiKey: 'must-never-persist' }))
  assert.deepEqual(failureStore.list(), [], '真实文件写失败不提交元数据')
  let failSave = false
  const store = await createRoomStore(path)
  gateway = createRoomGateway({ roomStore: { list: store.list, save: room => failSave ? Promise.reject(Error('synthetic disk failure')) : store.save(room) } })
  const command = { uid: ownerUid, code: '114514' }
  await gateway.manageAccount({ ...command, action: 'asr', enabled: true })
  await gateway.manageAccount({ ...command, action: 'save', apiKey: 'synthetic-ephemeral-key' })
  failSave = true
  await assert.rejects(gateway.manageAccount({ ...command, action: 'asr', enabled: false }), error => error.statusCode === 500)
  assert.equal((await gateway.manageAccount({ uid: ownerUid, action: 'list' })).rooms[0].configured, false)
  await gateway.close()
  gateway = createRoomGateway({ roomStore: await createRoomStore(path) })
  const restored = (await gateway.manageAccount({ uid: ownerUid, action: 'list' })).rooms[0]
  assert.equal(restored.asrEnabled, true, '开关仅恢复最后成功保存值')
  assert.equal(restored.configured, false, '磁盘失败后重启也无Key，不会恢复付费能力')
  assert.equal('blocked' in restored, false, '无额外的重启授权或blocked状态')
  console.log('通过：v1/v2/v3旧Key忽略、缺/损坏密钥不影响房间、Key不落盘、实际磁盘失败、开关失败清Key及重启无付费凭据。')
} finally { await gateway?.close(); await rm(directory, { recursive: true, force: true }) }
