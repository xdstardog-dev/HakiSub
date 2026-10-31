import { createAccountClient } from './accountClient'
import { isValidRoomAvatar, type RoomAvatarId } from '../accounts/shared/roomAvatars.mjs'

export function createRoomAvatarClient(account = createAccountClient(), fetchRequest: typeof fetch = fetch) {
  const controllers = new Set<AbortController>()
  async function request(token: string, avatarId?: RoomAvatarId) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000)
    controllers.add(controller)
    try {
      const response = await fetchRequest('/api/rooms/settings', { method: avatarId ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, ...(avatarId ? { 'Content-Type': 'application/json' } : {}) },
        ...(avatarId ? { body: JSON.stringify({ action: 'avatar', avatarId }) } : {}) })
      const result = await response.json()
      if (!response.ok) throw Error(result.message ?? '房间头像暂时无法保存，请重试。')
      return result
    } finally { clearTimeout(timeout); controllers.delete(controller) }
  }
  return {
    async permission(code: string, token: string) {
      const status = await request(token)
      if (status.bound === true) return { bound: true, canEdit: (await account.rooms()).rooms.some(room => room.code === code) }
      return { bound: false, canEdit: status.readOnly === false }
    },
    async save(code: string, token: string, avatarId: RoomAvatarId, bound: boolean) {
      if (!isValidRoomAvatar(avatarId)) throw Error('请选择有效的预制房间头像。')
      const result = bound ? (await account.manageRoom(code, { action: 'avatar', avatarId })).room : await request(token, avatarId)
      if (result?.avatarId !== avatarId) throw Error('房间头像保存结果无效，请重试。')
      return avatarId
    },
    cancel() { for (const controller of controllers) controller.abort(); controllers.clear(); account.cancel() },
  }
}
