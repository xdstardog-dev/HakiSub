import { createBrowserAsr } from './browserAsr'
import { createDoubaoAsrClient } from './doubaoAsrClient'
import type { AsrCallbacks, AsrSession, CaptionCallbacks } from './captionEvents'

export type AsrProvider = 'browser' | 'doubao'

export function createAsrSession(provider: AsrProvider, memberId: string, callbacks: CaptionCallbacks, roomToken = ''): AsrSession {
  // 每次开启都有独立命名空间，避免重新开启后与尚未渐隐的旧字幕撞 ID。
  const sessionId = crypto.randomUUID()
  const normalized: AsrCallbacks = {
    onState: callbacks.onState,
    onResult: (utteranceId, text, state) => callbacks.onCaption({ memberId, utteranceId: `${sessionId}-${utteranceId}`, text, state }),
    onDiscard: utteranceId => callbacks.onDiscard(memberId, `${sessionId}-${utteranceId}`),
    onUsage: callbacks.onUsage,
  }
  return provider === 'browser' ? createBrowserAsr(normalized) : createDoubaoAsrClient(normalized, undefined, roomToken)
}
