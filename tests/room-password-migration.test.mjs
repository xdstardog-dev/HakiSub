import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRoomStore } from '../server/roomStore.mjs'
import { hashRoomPassword, verifyRoomPassword } from '../server/roomPassword.mjs'
const directory = await mkdtemp(join(tmpdir(), 'hakisub-password-migration-'))
try {
  const file = join(directory, 'rooms.json'), uid = randomUUID(), version = randomUUID()
  await writeFile(file, JSON.stringify({ version: 4, rooms: [{ code: '123456', name: '旧房间', ownerHash: 'a'.repeat(64), ownerUid: uid, accessCode: '0000', accessVersion: version, accessAccounts: [uid], aliases: ['654321'] }] }))
  const store = await createRoomStore(file), room = store.list()[0]
  assert.equal(room.accessCode, undefined); assert.equal(verifyRoomPassword(room, '0000'), true)
  assert.equal(verifyRoomPassword(room, '0001'), false)
  assert.equal(room.accessVersion, version); assert.deepEqual(room.accessAccounts, [uid]); assert.deepEqual(room.aliases, ['654321'])
  const saved = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(saved.version, 5); assert.equal('accessCode' in saved.rooms[0], false)
  assert.equal((await createRoomStore(file)).list()[0].passwordHash, room.passwordHash)
  assert.notEqual(hashRoomPassword('0000'), hashRoomPassword('0000'), '相同密码采用不同随机盐')
  assert.equal(verifyRoomPassword({ accessCode: '' }, '0000'), false, '旧公开房间空码不抛异常')
  await store.save({ ...room, passwordHash: '' })
  assert.equal(store.list()[0].passwordHash, '')
  console.log('通过：旧v4私密房原子迁移至v5带盐摘要、0000验证、房号/名称/房主/授权账号/别名/版本保留、重启与关闭保护。仅临时测试目录。')
} finally { await rm(directory, { recursive: true, force: true }) }
