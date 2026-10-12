export type AsrState = 'idle' | 'starting' | 'listening' | 'reconnecting' | 'error'
export type CaptionEvent = { memberId: string; utteranceId: string; text: string; state: 'interim' | 'final' }
export type AsrCallbacks = {
  onState: (state: AsrState, message: string) => void
  onResult: (id: string, text: string, state: 'interim' | 'final') => void
  onDiscard: (id: string) => void
}
export type AsrSession = { start: () => void; stop: () => void }
export type CaptionCallbacks = {
  onState: AsrCallbacks['onState']
  onCaption: (event: CaptionEvent) => void
  onDiscard: (memberId: string, utteranceId: string) => void
}
