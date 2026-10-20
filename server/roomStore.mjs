import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink, mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseEnv } from 'node:util'

export async function getRoomEncryptionKey(environmentPath, environmentKey) {
  if (environmentKey) return environmentKey
  const readEnvironment = async () => {
    try { return await readFile(environmentPath, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error }
  }
  let contents = await readEnvironment()
  let key = parseEnv(contents).HAKISUB_ROOM_ENCRYPTION_KEY
  if (key) return key
  // 主密钥只放服务端环境或根.env；初始化锁避免两个启动进程生成不同密钥。
  const lockPath = `${environmentPath}.room-key.local`
  const lock = await open(lockPath, 'wx', 0o600)
  const temporary = `${environmentPath}.${randomUUID()}.local`
  try {
    contents = await readEnvironment()
    key = parseEnv(contents).HAKISUB_ROOM_ENCRYPTION_KEY
    if (!key) {
      key = randomBytes(32).toString('base64')
      await writeFile(temporary, `${contents}${contents && !contents.endsWith('\n') ? '\n' : ''}HAKISUB_ROOM_ENCRYPTION_KEY=${key}\n`, { mode: 0o600, flag: 'wx' })
      await rename(temporary, environmentPath)
    }
    return key
  } finally {
    await lock.close()
    await unlink(lockPath)
    await unlink(temporary).catch(() => {})
  }
}

export async function createRoomStore(filePath, encryptionKey) {
  const key = Buffer.from(encryptionKey, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encryptionKey) throw Error('房间加密主密钥格式无效。')
  let records = new Map(), queue = Promise.resolve()
  const encrypt = (code, value) => {
    if (!value) return null
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(Buffer.from(code))
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return { nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
  }
  const decrypt = record => {
    if (!record.encryptedKey) return ''
    const { nonce, tag, ciphertext } = record.encryptedKey
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'))
    decipher.setAAD(Buffer.from(record.code)); decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')
  }
  const validateRecords = entries => {
    const reserved = new Set(entries.map(record => record.code))
    if (reserved.size !== entries.length || entries.length > 100) throw Error('Invalid room records')
    for (const record of entries) {
      if (typeof record.code !== 'string' || !/^\d{6}$/.test(record.code) || !/^[a-f0-9]{64}$/.test(record.ownerHash)) throw Error('Invalid room record')
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
    if (saved.version !== 1 || !Array.isArray(saved.rooms) || saved.rooms.length > 100) throw Error('Invalid room store')
    validateRecords(saved.rooms)
    for (const record of saved.rooms) {
      if (!/^\d{6}$/.test(record.code) || !/^[a-f0-9]{64}$/.test(record.ownerHash) || records.has(record.code)) throw Error('Invalid room record')
      decrypt(record)
      records.set(record.code, record)
    }
  } catch (error) { if (error.code !== 'ENOENT') throw Error('无法读取房间资料，请检查数据文件和房间加密主密钥。') }
  const updateRecords = update => {
    const operation = queue.then(async () => {
      const next = update(new Map(records))
      validateRecords([...next.values()])
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
      const temporary = `${filePath}.${randomUUID()}.local`
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, rooms: [...next.values()] }), { mode: 0o600, flag: 'wx' })
        await rename(temporary, filePath)
        records = next
      } finally { await unlink(temporary).catch(() => {}) }
    })
    queue = operation.catch(() => {})
    return operation
  }
  return {
    list: () => [...records.values()].map(record => ({ code: record.code, ownerHash: record.ownerHash, apiKey: decrypt(record), aliases: [...(record.aliases ?? [])] })),
    save(room) {
      // 多房间写入串行化并原子替换；写入失败时保留旧文件与旧内存配置。
      return updateRecords(next => {
        next.set(room.code, { code: room.code, ownerHash: room.ownerHash, encryptedKey: encrypt(room.code, room.apiKey),
          aliases: [...(room.aliases ?? next.get(room.code)?.aliases ?? [])] })
        return next
      })
    },
    renameRoom(sourceCode, targetCode) {
      return updateRecords(next => {
        if (typeof targetCode !== 'string' || !/^\d{6}$/.test(targetCode) || sourceCode === targetCode) throw Error('目标房间码无效。')
        const source = next.get(sourceCode)
        if (!source) throw Error('原房间不存在。')
        if ([...next.values()].some(record => record.code === targetCode || record.aliases?.includes(targetCode))) throw Error('目标房间码已被使用。')
        // Key的AAD包含房间码，换号必须重新加密；原管理摘要和旧入口保持有效。
        const record = { code: targetCode, ownerHash: source.ownerHash, encryptedKey: encrypt(targetCode, decrypt(source)),
          aliases: [...(source.aliases ?? []), sourceCode] }
        next.delete(sourceCode); next.set(targetCode, record)
        return next
      })
    },
  }
}
