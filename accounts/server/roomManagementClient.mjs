import { createHmac, randomUUID } from 'node:crypto'

export function createRoomManagementClient({ roomGatewayUrl, roomManagementSecret }, fetchRequest = fetch) {
  if (roomGatewayUrl) {
    const url = new URL(roomGatewayUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== roomGatewayUrl || url.username || url.password) throw Error('房间服务地址必须是独立 Origin。')
  }
  if (roomManagementSecret && roomManagementSecret.length < 43) throw Error('房间管理服务密钥长度不足。')
  return async (command, revalidate) => {
    const unavailable = () => Object.assign(Error('房间管理服务暂时不可用，请稍后重试。'), { statusCode: 503 })
    if (!roomGatewayUrl || !roomManagementSecret) throw unavailable()
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
    try {
      const challenge = await fetchRequest(roomGatewayUrl + '/internal/rooms/challenge', { signal: controller.signal, redirect: 'error' })
      if (!challenge.ok) throw unavailable()
      const { audience } = await challenge.json()
      if (typeof audience !== 'string' || !/^[a-f0-9-]{36}$/.test(audience)) throw unavailable()
      // 网络等待后再次查SQLite会话；会话撤销或账号服务故障时不签发新管理请求。
      revalidate()
      const body = JSON.stringify({ audience, issuedAt: Date.now(), nonce: randomUUID(), command })
      const path = '/internal/rooms/manage'
      const signature = createHmac('sha256', roomManagementSecret).update('POST\n' + path + '\n' + body).digest('hex')
      const response = await fetchRequest(roomGatewayUrl + path, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-HakiSub-Signature': signature }, body })
      const result = await response.json()
      if (!response.ok) throw Object.assign(Error(result.message ?? '房间操作失败。'), { statusCode: [400, 403, 404, 409, 500].includes(response.status) ? response.status : 503 })
      return result
    } catch (error) { if (error.statusCode) throw error; throw unavailable() }
    finally { clearTimeout(timer) }
  }
}
