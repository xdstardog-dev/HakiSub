import { readAccountConfiguration } from './configuration.mjs'
import { openAccountDatabase } from './database.mjs'
import { createRequestSecurity } from './requestSecurity.mjs'
import { existsSync, chmodSync, mkdirSync, openSync, closeSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function clearIpLimit(database, configuration, ip) {
  const security = createRequestSecurity(database, configuration)
  const subject = security.subject('ip:' + security.canonicalIp(ip))
  database.transaction(() => {
    database.prepare('DELETE FROM rate_limit_events WHERE subject=?').run(subject)
    // 保留真实成功注册记录和全站预警计数，只免除历史记录的此IP额度占用。
    database.prepare('UPDATE registration_events SET quota_exempt=1 WHERE subject=?').run(subject)
    database.prepare('INSERT INTO security_events (kind,detail,created_at) VALUES (?,?,?)').run('ip_limit_cleared', JSON.stringify({ subject }), Date.now())
  }).immediate()
}
export async function backupDatabase(database, destination) {
  const path = resolve(destination)
  if (existsSync(path)) throw Error('目标已存在，备份不会覆盖文件。')
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  // 排他创建，避免两个备份任务通过存在性检查后互相覆盖。
  closeSync(openSync(path, 'wx', 0o600))
  const backup = await database.backup(path)
  chmodSync(path, 0o600)
  return backup
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let database
  try {
    const configuration = await readAccountConfiguration(process.env, process.argv.includes('--development'))
    database = openAccountDatabase(configuration.databasePath)
    const [command, value] = process.argv.slice(2).filter(value => value !== '--development')
    if (command === 'clear-ip' && value) { await clearIpLimit(database, configuration, value); console.log('指定网络的注册/来源限制已解除并记录审计。') }
    else if (command === 'warnings') console.log(JSON.stringify(database.prepare('SELECT kind,detail,created_at FROM security_events ORDER BY id DESC LIMIT 100').all(), null, 2))
    else if (command === 'backup' && value) { await backupDatabase(database, value); console.log('一致性数据库备份完成；请在隔离位置验证恢复。') }
    else throw Error('用法：admin warnings | clear-ip <IP> | backup <新备份绝对路径>')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
  finally { database?.close() }
}
