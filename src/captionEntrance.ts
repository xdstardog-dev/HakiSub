import { captionOpacity, receiveCaption, type Caption } from './captions'
import type { CaptionEvent } from './captionEvents'

// 在入队前检查整块字幕区域，渐隐中的语音和打字字幕都占用这一轮。
// 无独立计时器，也不监听组件渲染；首条 interim 或直接 final 采用同一入口。
export function receiveCaptionEntrance(queue: Caption[], event: CaptionEvent, now: number): boolean {
  if (!event.text.trim()) return false
  const existing = queue.find(caption => caption.memberId === event.memberId && caption.id === event.utteranceId)
  const occupied = queue.some(caption => caption.memberId === event.memberId && caption.text.trim() && captionOpacity(caption, now) > 0)
  receiveCaption(queue, event.memberId, event.utteranceId, event.text, event.state, now)
  return !occupied && !existing && event.source !== 'typing' && !event.utteranceId.startsWith('typed-')
}
