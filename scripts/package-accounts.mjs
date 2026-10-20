import { readFile, readdir, mkdir, cp, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const release = `xdstar-accounts-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`
const output = join(root, 'artifacts', release), files = []
await readFile(join(root, 'accounts/dist/index.html'))
await mkdir(output, { recursive: true })
async function copy(path) {
  const data = await readFile(join(root, path))
  await mkdir(resolve(output, path, '..'), { recursive: true })
  await cp(join(root, path), join(output, path))
  files.push({ path: path.replaceAll('\\', '/'), sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length })
}
async function tree(path) {
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.') || /\.(?:sqlite|db|env|key|pem)(?:$|\.)/i.test(entry.name)) throw Error('发布目录含非预期文件，已停止打包。')
    if (entry.isDirectory()) await tree(join(path, entry.name))
    else if (entry.isFile()) await copy(join(path, entry.name))
  }
}
for (const path of ['accounts/package.json', 'accounts/package-lock.json', 'accounts/Dockerfile', 'accounts/.dockerignore', 'accounts/README.md', 'accounts/THIRD-PARTY.md', 'deploy/compose.accounts.yaml', 'deploy/caddy/Caddyfile.accounts.candidate', 'deploy/accounts.env.example', 'docs/ACCOUNT-SYSTEM-PLAN.md', 'docs/ACCOUNT-DEPLOYMENT.md']) await copy(path)
await tree('accounts/server'); await tree('accounts/dist')
await writeFile(join(output, 'RELEASE.json'), JSON.stringify({ release, files }, null, 2))
const archive = output + '.tar.gz'
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
execFileSync(tar, ['-czf', archive, '-C', output, '.'])
const checksum = createHash('sha256').update(await readFile(archive)).digest('hex')
await writeFile(archive + '.sha256', checksum + '\n')
console.log(JSON.stringify({ release, archive, sha256: checksum, files: files.length }))
