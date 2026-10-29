import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

// 正式模式只暴露 dist，绝不把项目根目录（含 .env）作为网页目录。
export function createStaticWebsite(directory) {
  const root = resolve(directory)
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' }
  return async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      if (pathname.split('/').some(part => part.startsWith('.')) || pathname.includes('\\')) throw Error()
      const pageRoute = ['/', '/glasses'].includes(pathname) || /^\/\d{6}\/?$/.test(pathname)
      const file = resolve(root, '.' + (pageRoute ? '/index.html' : pathname))
      if (!file.startsWith(root + sep)) throw Error()
      const content = await readFile(file)
      const vadResource = /^\/vad\/(silero-v6\.onnx|ort\.wasm\.min\.mjs|ort-wasm-simd-threaded\.(mjs|wasm))$/.test(pathname)
      let body = content, compressed = false
      if (vadResource && /(?:^|,)\s*gzip\s*(?:;\s*q=(?!0(?:\.0*)?(?:\s|,|$))\d?(?:\.\d+)?)?\s*(?:,|$)/i.test(request.headers['accept-encoding'] ?? '')) {
        try { body = await readFile(file + '.gz'); compressed = true } catch { /* 开发目录可没有预压缩文件。 */ }
      }
      const version = new URL(request.url, 'http://localhost').searchParams.get('v')
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': vadResource && version && /^[a-zA-Z0-9.-]{1,80}$/.test(version) ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'Content-Length': body.byteLength,
        ...(vadResource ? { Vary: 'Accept-Encoding' } : {}), ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) })
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch { response.writeHead(404); response.end('Not found') }
  }
}
