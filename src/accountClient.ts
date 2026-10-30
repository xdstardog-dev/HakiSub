export type AccountIdentity = { uid: string; nickname: string }
export type OwnedRoom = { code: string; bound: boolean; configured: boolean; keyState: 'configured' | 'missing' | 'deleted'; asrEnabled: boolean; busy: boolean; source: 'room' | 'none'; requiresPassword?: boolean }
export type RoomPresetConfiguration = { schemaVersion: 1; asrProvider: 'browser' | 'doubao'; adaptiveCards: boolean }
export type RoomPreset = { id: string; name: string; configuration: RoomPresetConfiguration; createdAt: number; updatedAt: number }
const configuredOrigin = import.meta.env.VITE_ACCOUNT_ORIGIN
export const accountOrigin = configuredOrigin || (import.meta.env.DEV ? 'http://127.0.0.1:8790' : 'https://xdstar.work')
export const accountCenterUrl = accountOrigin + '/account/'

export function createAccountClient(fetchRequest: typeof fetch = fetch) {
  const controllers = new Set<AbortController>()
  async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
    controllers.add(controller)
    try {
      const headers: Record<string, string> = {}
      if (method !== 'GET') {
        const response = await fetchRequest(accountOrigin + '/api/projects/hakisub/csrf', { credentials: 'include', signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw Error('无法验证登录状态，请打开个人中心重新登录。')
        headers['X-CSRF-Token'] = (await response.json()).token
        headers['Content-Type'] = 'application/json'
      }
      const response = await fetchRequest(accountOrigin + '/api/projects/hakisub' + path, { method, headers, credentials: 'include', signal: controller.signal, cache: 'no-store', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const result = await response.json()
      if (!response.ok) { const error = Error(result.message ?? '账号操作失败，请重试。') as Error & { status?: number }; error.status = response.status; throw error }
      return result as T
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw Error('账号请求已取消或超时，请稍后重试。')
      throw error
    } finally { clearTimeout(timer); controllers.delete(controller) }
  }
  return {
    identity: () => request<{ user: AccountIdentity | null }>('/identity'),
    rooms: () => request<{ rooms: OwnedRoom[] }>('/rooms'),
    roomAccess: (code: string, password?: string) => request<{ code: string; requiresPassword: boolean; accessTicket?: string; message?: string }>('/rooms/' + encodeURIComponent(code) + '/access', 'POST', password === undefined ? {} : { password }),
    bindRoom: (code: string, ownerToken: string) => request('/rooms/' + encodeURIComponent(code) + '/bind', 'POST', { ownerToken }),
    manageRoom: (code: string, command: object) => request<{ room?: OwnedRoom; apiKey?: string; ok?: boolean; message?: string }>('/rooms/' + encodeURIComponent(code) + '/manage', 'POST', command),
    presets: () => request<{ presets: RoomPreset[] }>('/presets'),
    save: (name: string, configuration: RoomPresetConfiguration) => request<{ preset: RoomPreset }>('/presets', 'POST', { name, configuration }),
    rename: (id: string, name: string) => request<{ preset: RoomPreset }>('/presets/' + encodeURIComponent(id), 'PATCH', { name }),
    remove: (id: string) => request('/presets/' + encodeURIComponent(id), 'DELETE', {}),
    cancel: () => { for (const controller of controllers) controller.abort(); controllers.clear() },
  }
}
