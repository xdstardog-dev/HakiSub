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

export async function copyText(text: string, browser = globalThis.navigator, page = globalThis.document, isCurrent = () => true): Promise<'copied' | 'unavailable'> {
  if (!isCurrent()) return 'unavailable'
  try {
    if (typeof browser?.clipboard?.writeText === 'function') {
      await browser.clipboard.writeText(text)
      return 'copied'
    }
  } catch { /* 原生接口可能受策略或焦点限制，继续尝试兼容复制。 */ }
  // 异步失败后可能已经离房；旧操作不得再改写剪贴板或抢走焦点。
  if (!isCurrent() || !page?.body) return 'unavailable'
  const previousFocus = page.activeElement as HTMLElement | null
  const selection = page.getSelection()
  const ranges = Array.from({ length: selection?.rangeCount ?? 0 }, (_, index) => selection!.getRangeAt(index).cloneRange())
  const input = previousFocus?.tagName === 'INPUT' || previousFocus?.tagName === 'TEXTAREA' ? previousFocus as HTMLInputElement | HTMLTextAreaElement : null
  const start = input?.selectionStart, end = input?.selectionEnd
  const textarea = page.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.setAttribute('aria-label', '临时复制文本')
  textarea.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px;'
  try {
    page.body.append(textarea)
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    // execCommand 已弃用，仅在原生 Clipboard API 不可用或失败时尝试。
    return page.execCommand('copy') ? 'copied' : 'unavailable'
  } catch { return 'unavailable' }
  finally {
    textarea.remove()
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)) }
    if (input && start != null && end != null) input.setSelectionRange(start, end)
  }
}

export function shareRoomLink(roomCode: string, origin: string, browser = globalThis.navigator): Promise<'copied' | 'unavailable'> {
  return copyText(roomShareUrl(roomCode, origin), browser)
}
