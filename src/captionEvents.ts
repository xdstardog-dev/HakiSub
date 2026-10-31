export type AsrState = 'idle' | 'starting' | 'listening' | 'reconnecting' | 'error'
export type CaptionEvent = { memberId: string; utteranceId: string; text: string; state: 'interim' | 'final'; source?: 'speech' | 'typing' }
export type AsrUsageEvent = { requestId: string; submittedAudioSeconds: number; completedAudioSeconds: number; serverAudioSeconds: number | null }
export type AsrCallbacks = {
  onState: (state: AsrState, message: string) => void
  onResult: (id: string, text: string, state: 'interim' | 'final') => void
  onDiscard: (id: string) => void
  onUsage?: (usage: AsrUsageEvent) => void
}
export type AsrSession = { start: () => void; stop: () => void }
export type CaptionCallbacks = {
  onState: AsrCallbacks['onState']
  onCaption: (event: CaptionEvent) => void
  onDiscard: (memberId: string, utteranceId: string) => void
  onUsage?: AsrCallbacks['onUsage']
}
