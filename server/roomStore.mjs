import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isValidRoomName } from './roomNames.mjs'
import { hashRoomPassword, validPasswordHash } from './roomPassword.mjs'
import { isValidRoomAvatar, normalizeRoomAvatar } from '../accounts/shared/roomAvatars.mjs'

export async function createRoomStore(filePath) {
  let records = new Map(), queue = Promise.resolve(), migratePasswords = false
  // 只允许房间元数据落盘；旧版密文/明文Key及运行期状态既不解密，也不复制。
  const metadata = (room, previous) => ({ code: room.code, ownerHash: room.ownerHash,
    name: room.name ?? previous?.name ?? `房间 ${room.code}`,
    avatarId: normalizeRoomAvatar(room.avatarId ?? previous?.avatarId),
    guestNumber: room.guestNumber ?? previous?.guestNumber ?? 0,
    nameCustomized: room.nameCustomized ?? previous?.nameCustomized ?? false,
    ownerUid: room.ownerUid ?? previous?.ownerUid ?? null,
    asrEnabled: room.asrEnabled ?? previous?.asrEnabled ?? true,
    // 旧明文只在加载时转换；保留版本与已授权账号，不能把旧私密房变公开。
    passwordHash: room.passwordHash ?? (room.accessCode ? hashRoomPassword(room.accessCode) : previous?.passwordHash ?? ''),
    accessVersion: room.accessVersion ?? previous?.accessVersion ?? '',
    accessAccounts: [...(room.accessAccounts ?? previous?.accessAccounts ?? [])],
    aliases: [...(room.aliases ?? previous?.aliases ?? [])] })
  const validateRecords = entries => {
    const reserved = new Set(entries.map(record => record.code))
    if (reserved.size !== entries.length || entries.length > 100) throw Error('Invalid room records')
    for (const record of entries) {
      if (typeof record.code !== 'string' || !/^\d{6}$/.test(record.code) || !/^[a-f0-9]{64}$/.test(record.ownerHash)) throw Error('Invalid room record')
      if (record.name !== undefined && !isValidRoomName(record.name)) throw Error('Invalid room name')
      if (record.avatarId !== undefined && !isValidRoomAvatar(record.avatarId)) throw Error('Invalid room avatar')
      if (record.guestNumber !== undefined && (!Number.isSafeInteger(record.guestNumber) || record.guestNumber < 0)) throw Error('Invalid guest number')
      if (record.nameCustomized !== undefined && typeof record.nameCustomized !== 'boolean') throw Error('Invalid room name state')
      if (record.ownerUid != null && (typeof record.ownerUid !== 'string' || !/^[a-f0-9-]{36}$/.test(record.ownerUid))) throw Error('Invalid owner UID')
      if (record.asrEnabled !== undefined && typeof record.asrEnabled !== 'boolean') throw Error('Invalid ASR state')
      if (record.accessCode !== undefined && (typeof record.accessCode !== 'string' || (record.accessCode !== '' && !/^\d{4}$/.test(record.accessCode)))) throw Error('Invalid room access code')
      if (record.passwordHash !== undefined && record.passwordHash !== '' && !validPasswordHash(record.passwordHash)) throw Error('Invalid room password hash')
      if (record.accessVersion !== undefined && record.accessVersion !== '' && !/^[a-f0-9-]{36}$/.test(record.accessVersion)) throw Error('Invalid room access version')
      if ((record.accessCode || record.passwordHash) && !/^[a-f0-9-]{36}$/.test(record.accessVersion ?? '')) throw Error('Missing room access version')
      if (record.accessAccounts !== undefined && (!Array.isArray(record.accessAccounts) || record.accessAccounts.length > 5000 || new Set(record.accessAccounts).size !== record.accessAccounts.length || record.accessAccounts.some(uid => typeof uid !== 'string' || !/^[a-f0-9-]{36}$/.test(uid)))) throw Error('Invalid room access accounts')
      const aliases = record.aliases ?? []
      if (!Array.isArray(aliases) || aliases.length > 100) throw Error('Invalid room aliases')
      for (const code of aliases) {
        if (typeof code !== 'string' || !/^\d{6}$/.test(code) || reserved.has(code)) throw Error('Conflicting room alias')
        reserved.add(code)
      }
    }
  }
  try {
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    if (![1, 2, 3, 4, 5].includes(saved.version) || !Array.isArray(saved.rooms)) throw Error('Invalid room store')
    validateRecords(saved.rooms)
    for (const record of saved.rooms) records.set(record.code, metadata(record))
    migratePasswords = saved.rooms.some(record => !!record.accessCode)
  } catch (error) { if (error.code !== 'ENOENT') throw Error('无法读取房间资料，请检查数据文件及目录权限。') }
  const updateRecords = update => {
    const operation = queue.then(async () => {
      const next = update(new Map(records))
      validateRecords([...next.values()])
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
      const temporary = `${filePath}.${randomUUID()}.local`
      try {
        // v5使不支持摘要的旧程序拒绝启动，防止回退时把私密房意外公开。
        await writeFile(temporary, JSON.stringify({ version: 5, rooms: [...next.values()] }), { mode: 0o600, flag: 'wx' })
        await rename(temporary, filePath)
        records = next
      } finally { await unlink(temporary).catch(() => {}) }
    })
    queue = operation.catch(() => {})
    return operation
  }
  if (migratePasswords) await updateRecords(next => next)
  return {
    list: () => [...records.values()].map(record => ({ ...record, aliases: [...record.aliases], accessAccounts: [...record.accessAccounts] })),
    save(room) {
      // 串行原子替换仅保存元数据，失败保留原文件；Key从不经过此写入路径。
      return updateRecords(next => { next.set(room.code, metadata(room, next.get(room.code))); return next })
    },
    renameRoom(sourceCode, targetCode) {
      return updateRecords(next => {
        if (typeof targetCode !== 'string' || !/^\d{6}$/.test(targetCode) || sourceCode === targetCode) throw Error('目标房间码无效。')
        const source = next.get(sourceCode)
        if (!source) throw Error('原房间不存在。')
        if ([...next.values()].some(record => record.code === targetCode || record.aliases.includes(targetCode))) throw Error('目标房间码已被使用。')
        const record = { ...source, code: targetCode, aliases: [...source.aliases, sourceCode] }
        next.delete(sourceCode); next.set(targetCode, record)
        return next
      })
    },
  }
}
