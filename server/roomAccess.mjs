import { randomUUID } from 'node:crypto'

const issue = (statusCode, message, reason) => Object.assign(Error(message), { statusCode, reason })

export function createRoomAccess({ saveRoom, now = Date.now }) {
  const tickets = new Map(), failures = new Map()
  function prune() {
    for (const [token, ticket] of tickets) if (ticket.expiresAt <= now()) tickets.delete(token)
    for (const [key, failure] of failures) if (failure.expiresAt <= now()) failures.delete(key)
  }
  function verifyCode(room, password, subject) {
    if (!room.accessCode) return
    if (password === undefined || password === '') throw issue(403, '此房间需要四位入房码。', 'password-required')
    prune()
    const key = `${room.code}:${subject}`
    const failure = failures.get(key)
    if (failure?.count >= 5) throw issue(429, '入房码尝试过多，请一分钟后重试。', 'access-rate-limited')
    if (typeof password !== 'string' || !/^\d{4}$/.test(password) || password !== room.accessCode) {
      if (!failure && failures.size >= 10000) throw issue(429, '入房验证繁忙，请稍后重试。', 'access-rate-limited')
      failures.set(key, { count: (failure?.count ?? 0) + 1, expiresAt: failure?.expiresAt ?? now() + 60000 })
      throw issue(403, '入房码不正确，请重新输入。', 'password-incorrect')
    }
    failures.delete(key)
  }
  async function authorizeAccount(room, uid, password) {
    if (room.settingsBusy) throw issue(409, '房间设置正在更新，请稍后重试。')
    if (room.accessCode && room.ownerUid !== uid && !(room.accessAccounts ?? []).includes(uid)) {
      try { verifyCode(room, password, `account:${uid}`) }
      catch (error) {
        if (['password-required', 'password-incorrect'].includes(error.reason)) return { code: room.code, requiresPassword: true, message: error.message }
        throw error
      }
      room.settingsBusy = true
      try {
        if ((room.accessAccounts?.length ?? 0) >= 5000) throw issue(409, '此房间记住的账号数量已达上限，请联系房主更新入房码。')
        const accessAccounts = [...(room.accessAccounts ?? []), uid]
        await saveRoom({ ...room, accessAccounts })
        room.accessAccounts = accessAccounts
      } catch (error) { throw error.statusCode ? error : issue(500, '无法保存进房资格，请稍后重试。') }
      finally { room.settingsBusy = false }
    }
    prune()
    if (tickets.size >= 10000) throw issue(429, '入房验证繁忙，请稍后重试。')
    const accessTicket = randomUUID()
    // 账号资格持久化，入场票据仅单次、短时使用；网关重启后重新签发即可。
    tickets.set(accessTicket, { room, uid, version: room.accessVersion ?? '', expiresAt: now() + 60000 })
    return { code: room.code, requiresPassword: !!room.accessCode, accessTicket }
  }
  function consumeTicket(room, token) {
    if (typeof token !== 'string') return undefined
    const ticket = tickets.get(token)
    if (!ticket || ticket.room !== room || ticket.version !== (room.accessVersion ?? '') || ticket.expiresAt <= now()) return undefined
    tickets.delete(token)
    return ticket.uid
  }
  return { verifyCode, authorizeAccount, consumeTicket, clear: () => { tickets.clear(); failures.clear() } }
}
