import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const release = `hakisub-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`
const output = join(root, 'artifacts'), directory = join(output, release)
const expectedAssets = ['dist/index.html', ...['silero-v6.onnx', 'ort.wasm.min.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'].flatMap(file => [`dist/vad/${file}`, `dist/vad/${file}.gz`])]
for (const file of expectedAssets) await readFile(join(root, file))
await mkdir(output, { recursive: true })
await mkdir(directory)
const files = []
const copyFile = async path => {
  const contents = await readFile(join(root, path))
  await cp(join(root, path), join(directory, path))
  files.push({ path: path.replaceAll('\\', '/'), bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') })
}
const copyDirectory = async path => {
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    // 打包只接受构建资源；拒绝链接及误放入白名单目录的隐藏/敏感文件。
    if (entry.isSymbolicLink() || entry.name.startsWith('.') || /\.(?:env|pem|key|p12|pfx)$/i.test(entry.name)) throw Error('发布目录中出现非预期文件，已停止打包。')
    const file = join(path, entry.name)
    if (entry.isDirectory()) await copyDirectory(file)
    else if (entry.isFile()) await copyFile(file)
    else throw Error('发布目录中出现非普通文件。')
  }
}
for (const file of ['Dockerfile', '.dockerignore', 'compose.yaml', 'package.json', 'package-lock.json', 'deploy/server.env.example', 'deploy/release.env.example', 'deploy/start-private-test.sh', 'deploy/compose.public.yaml', 'deploy/compose.caddy.yaml', 'deploy/caddy/Caddyfile', 'deploy/public.env.example', 'docs/PRIVATE-TEST-DEPLOYMENT.md', 'docs/PUBLIC-DEPLOYMENT.md']) await copyFile(file)
const releaseEnvironment = `HAKISUB_RELEASE=${release}\nHAKISUB_MAX_ASR_SESSIONS=2\nHAKISUB_NODE_IMAGE=node:22-bookworm-slim\n`
await writeFile(join(directory, 'deploy/release.env'), releaseEnvironment)
files.push({ path: 'deploy/release.env', bytes: Buffer.byteLength(releaseEnvironment), sha256: createHash('sha256').update(releaseEnvironment).digest('hex') })
for (const entry of await readdir(join(root, 'server'), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.mjs')) await copyFile(join('server', entry.name))
  else throw Error('server目录包含非预期内容，已停止打包。')
}
await copyDirectory('dist')
await copyDirectory('deploy/xdstar')
await copyFile('deploy/prepare-room-storage.sh')
await writeFile(join(directory, 'RELEASE.json'), JSON.stringify({ release, createdAt: new Date().toISOString(), files }, null, 2) + '\n')
const archive = join(output, `${release}.tar.gz`)
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
execFileSync(tar, ['-czf', archive, '-C', directory, '.'], { stdio: 'inherit' })
const checksum = createHash('sha256').update(await readFile(archive)).digest('hex')
await writeFile(`${archive}.sha256`, `${checksum}  ${release}.tar.gz\n`)
console.log(JSON.stringify({ release, archive, checksum, manifest: relative(root, join(directory, 'RELEASE.json')) }, null, 2))
