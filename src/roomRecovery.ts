export type ActiveRoom = { code: string; name: string; roomName: string }
const activeKey = 'hakisub.active-room.v1', credentialKey = 'hakisub.reconnect.v1'
export function loadActiveRoom(): ActiveRoom | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(activeKey) ?? 'null')
    if (value && /^\d{6}$/.test(value.code) && typeof value.name === 'string' && typeof value.roomName === 'string') return value
  } catch { /* 存储禁用时仍可在本页重连。 */ }
}
export function saveActiveRoom(value?: ActiveRoom) {
  try { if (value) localStorage.setItem(activeKey, JSON.stringify(value)); else localStorage.removeItem(activeKey) } catch { /* 不影响本次连接。 */ }
}
export function loadReconnectToken(code: string): string | undefined {
  try { const value = JSON.parse(sessionStorage.getItem(credentialKey) ?? 'null'); if (value?.code === code && /^[a-f0-9-]{36}$/.test(value.token)) return value.token } catch { /* 重新验证即可。 */ }
}
export function saveReconnectToken(code: string, token?: string) {
  // 标签页短期授权只存不透明随机凭据，不存 PIN；关闭标签页即丢弃。
  try { if (token) sessionStorage.setItem(credentialKey, JSON.stringify({ code, token })); else sessionStorage.removeItem(credentialKey) } catch { /* 当前 WebSocket 客户端仍持有内存凭据。 */ }
}
