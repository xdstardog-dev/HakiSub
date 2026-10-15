import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

// 正式模式只暴露 dist，绝不把项目根目录（含 .env）作为网页目录。
export function createStaticWebsite(directory) {
  const root = resolve(directory)
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
  return async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      if (pathname.split('/').some(part => part.startsWith('.')) || pathname.includes('\\')) throw Error()
      const file = resolve(root, '.' + (['/', '/glasses'].includes(pathname) ? '/index.html' : pathname))
      if (!file.startsWith(root + sep)) throw Error()
      const content = await readFile(file)
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' })
      response.end(request.method === 'HEAD' ? undefined : content)
    } catch { response.writeHead(404); response.end('Not found') }
  }
}
