export function roomCodeFromPath(pathname: string): string | undefined {
  return /^\/(\d{6})\/?$/.exec(pathname)?.[1]
}

export function roomPath(roomCode: string): string {
  if (!/^\d{6}$/.test(roomCode)) throw new Error('Invalid room code')
  return `/${roomCode}/`
}

export function roomShareUrl(roomCode: string, origin: string): string {
  // 只分享房间入口，不携带当前页查询参数、成员令牌或房主管理凭据。
  return new URL(roomPath(roomCode), new URL(origin).origin).href
}

export async function shareRoomLink(roomCode: string, origin: string, browser: Pick<Navigator, 'share' | 'clipboard'> = navigator): Promise<'shared' | 'copied' | 'cancelled' | 'unavailable'> {
  const url = roomShareUrl(roomCode, origin)
  if (browser.share) {
    try { await browser.share({ title: `HakiSub 字幕房间 ${roomCode}`, url }); return 'shared' }
    catch (error) { if ((error as { name?: string })?.name === 'AbortError') return 'cancelled' }
  }
  try { await browser.clipboard.writeText(url); return 'copied' }
  catch { return 'unavailable' }
}
