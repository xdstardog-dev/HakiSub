// 复用现有房主改名接口；名称保存后才绑定账号，避免绑定撤销匿名权限后的竞态。
export async function saveCreatedRoomName(token: string, name: string, signal: AbortSignal, fetchRequest: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const timer = setTimeout(cancel, 12000)
  try {
    if (controller.signal.aborted) throw Error('房间名称保存已取消。')
    const response = await fetchRequest('/api/rooms/settings', {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', name }),
    })
    const result = await response.json()
    if (controller.signal.aborted) throw Error('房间名称保存已取消。')
    if (!response.ok || typeof result.name !== 'string') throw Error('房间已创建，但名称保存失败，请在房间设置中重试。')
    return result.name
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel) }
}
