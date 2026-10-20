// 仅在维护窗口停止应用后由服务器管理员执行；没有公开HTTP入口。
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createRoomStore } from './roomStore.mjs'

try {
  const [sourceCode, targetCode, action = '--check'] = process.argv.slice(2)
  if (!/^\d{6}$/.test(sourceCode ?? '') || !/^\d{6}$/.test(targetCode ?? '') || sourceCode === targetCode || !['--check', '--apply'].includes(action)) throw Error()
  let environment = {}
  if (!process.env.HAKISUB_ROOM_ENCRYPTION_KEY) {
    environment = parseEnv(await readFile(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8'))
  }
  const key = process.env.HAKISUB_ROOM_ENCRYPTION_KEY || environment.HAKISUB_ROOM_ENCRYPTION_KEY
  const path = process.env.HAKISUB_ROOM_STORE_PATH ?? fileURLToPath(new URL('../secrets/rooms.json', import.meta.url))
  if (!key) throw Error()
  const store = await createRoomStore(path, key), before = store.list()
  const source = before.find(room => room.code === sourceCode), target = before.find(room => room.code === targetCode)
  if (!source && target?.aliases.includes(sourceCode)) {
    console.log(JSON.stringify({ sourceCode, targetCode, alreadyMigrated: true })); process.exit(0)
  }
  if (!source || before.some(room => room.code === targetCode || room.aliases.includes(targetCode))) throw Error()
  if (action === '--check') {
    console.log(JSON.stringify({ sourceCode, targetCode, targetAvailable: true, configured: !!source.apiKey })); process.exit(0)
  }
  await store.renameRoom(sourceCode, targetCode)
  const restored = (await createRoomStore(path, key)).list(), renamed = restored.find(room => room.code === targetCode)
  if (!renamed || renamed.apiKey !== source.apiKey || renamed.ownerHash !== source.ownerHash || !renamed.aliases.includes(sourceCode) || restored.length !== before.length) throw Error()
  console.log(JSON.stringify({ sourceCode, targetCode, migrated: true, configurationPreserved: true, ownerPreserved: true, oldEntryPreserved: true }))
} catch {
  console.error('房间迁移未完成：请检查源/目标房间、服务端主密钥及数据目录，并使用维护备份恢复；不输出配置内容。')
  process.exitCode = 1
}
