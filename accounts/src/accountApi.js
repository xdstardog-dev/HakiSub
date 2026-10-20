export async function accountRequest(path, method = 'GET', body) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const headers = {}
    if (method !== 'GET') {
      const csrfPath = path.startsWith('/api/projects/') ? '/api/projects/hakisub/csrf' : '/api/account/csrf'
      const csrfResponse = await fetch(csrfPath, { credentials: 'include', signal: controller.signal, cache: 'no-store' })
      if (!csrfResponse.ok) throw Error('安全验证暂时不可用，请刷新后重试。')
      headers['X-CSRF-Token'] = (await csrfResponse.json()).token
      headers['Content-Type'] = 'application/json'
    }
    const response = await fetch(path, { method, headers, credentials: 'include', cache: 'no-store', signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    if (!response.ok) { const error = Error(result.message ?? '操作失败，请重试。'); error.status = response.status; throw error }
    return result
  } catch (error) {
    if (error.name === 'AbortError') throw Error('请求超时，请稍后重试。')
    throw error
  } finally { clearTimeout(timeout) }
}
