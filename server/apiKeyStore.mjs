import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'

export async function createApiKeyStore(envPath, environmentKey = '') {
  let currentKey = environmentKey.trim()
  const readOnly = !!currentKey
  async function readConfiguration() {
    try { return await readFile(envPath, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error }
  }
  if (!readOnly) currentKey = (parseEnv(await readConfiguration()).DOUBAO_API_KEY ?? '').trim()
  return {
    getKey: () => currentKey,
    status: () => ({ configured: !!currentKey, readOnly, source: readOnly ? 'environment' : 'file' }),
    async save(apiKey) {
      if (readOnly) throw Error('进程环境变量配置不能在页面修改，请先移除该环境变量并重启。')
      if (typeof apiKey !== 'string' || apiKey.length > 2048 || /[^\x21-\x7e]|["'`#\\]/.test(apiKey)) throw Error('API Key 格式无效，请重新复制完整密钥。')
      const original = await readConfiguration()
      // 只替换本项目的变量，保留其它配置；同时清除重复定义和旧的多行引号值。
      const remaining = original.replace(/^[\t ]*(?:export[\t ]+)?DOUBAO_API_KEY[\t ]*=[\t ]*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\r\n]*)[^\r\n]*(?:\r?\n|$)/gm, '')
      const updated = `${remaining}${remaining && !remaining.endsWith('\n') ? '\n' : ''}DOUBAO_API_KEY=${apiKey}\n`
      const temporaryPath = `${envPath}.${randomUUID()}.local`
      try {
        // 同目录临时文件加原子替换；保存失败时旧 Key 仍然有效。
        await writeFile(temporaryPath, updated, { mode: 0o600, flag: 'wx' })
        await rename(temporaryPath, envPath)
        currentKey = apiKey
      } finally { await unlink(temporaryPath).catch(() => {}) }
    },
  }
}
