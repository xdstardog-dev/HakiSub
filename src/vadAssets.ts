// 同步升级版本与资源长度；版本化URL只缓存公开模型，不缓存音频或密钥。
export const vadAssetVersion = 'ort-1.24.3-silero-v6-597d30b3'
export const vadAssetSizes = { model: 2327524, wasm: 12361745 }
export const vadDownloadBytes = vadAssetSizes.model + vadAssetSizes.wasm
export const vadAssetUrl = (base: string, filename: string) => {
  const url = new URL(filename, base)
  url.searchParams.set('v', vadAssetVersion)
  return url.href
}

export async function downloadVadAsset(url: string, expectedBytes: number, onProgress: (bytes: number) => void,
  request: typeof fetch = fetch): Promise<Uint8Array<ArrayBuffer>> {
  const response = await request(url, { cache: 'force-cache', credentials: 'same-origin' })
  if (!response.ok || !response.body) throw Error('VAD resource unavailable')
  const output = new Uint8Array(expectedBytes), reader = response.body.getReader()
  let received = 0, complete = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (received + value.byteLength > expectedBytes) throw Error('VAD resource size mismatch')
      output.set(value, received); received += value.byteLength
      // 浏览器已自动解压，按解压后长度统计，不能采用压缩后的Content-Length。
      onProgress(received)
    }
    if (received !== expectedBytes) throw Error('VAD resource incomplete')
    complete = true
    return output
  } finally {
    if (!complete) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
