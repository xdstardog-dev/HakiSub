export type MemberMode = 'microphone' | 'muted' | 'typing'
export const TYPED_CAPTION_LIMIT = 1000
export const TYPED_CAPTION_COOLDOWN_MS = 1000
export const REACTION_COOLDOWN_MS = 1500
export const REACTION_DURATION_MS = 2600
export const REACTION_SELECTION_LIMIT = 5
export const QUICK_REACTIONS = [
  { type: 'agree', label: '赞同', emoji: '👍' },
  { type: 'disagree', label: '反对', emoji: '👎' },
  { type: 'question', label: '疑问', emoji: '❓' },
  { type: 'received', label: '收到', emoji: '✅' },
  { type: 'fun', label: '闹麻了', emoji: '😆' },
  { type: 'thanks', label: '谢谢', emoji: '🙏' },
  { type: 'sorry', label: '抱歉', emoji: '🙇' },
  { type: 'slower', label: '请慢一点', emoji: '🐢' },
  { type: 'repeat', label: '请再说一遍', emoji: '🔁' },
  { type: 'wait', label: '稍等一下', emoji: '⏳' },
  { type: 'unclear', label: '没听清', emoji: '👂' },
  { type: 'understood', label: '明白了', emoji: '👌' },
  { type: 'okay', label: '没关系', emoji: '🤝' },
] as const
export type ReactionType = typeof QUICK_REACTIONS[number]['type']
export const DEFAULT_REACTION_TYPES: ReactionType[] = ['agree', 'disagree', 'question', 'received', 'fun']
const reactionSelectionStorageKey = 'hakisub.reaction-selection.v1'
export function normalizeReactionSelection(value: unknown): ReactionType[] {
  if (!Array.isArray(value)) return [...DEFAULT_REACTION_TYPES]
  const selected = [...new Set(value.filter((type): type is ReactionType => QUICK_REACTIONS.some(option => option.type === type)))].slice(0, REACTION_SELECTION_LIMIT)
  return selected.length ? selected : [...DEFAULT_REACTION_TYPES]
}
export function loadReactionSelection(storage?: Pick<Storage, 'getItem'>): ReactionType[] {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(reactionSelectionStorageKey)
    return normalizeReactionSelection(saved ? JSON.parse(saved) : undefined)
  } catch { return [...DEFAULT_REACTION_TYPES] }
}
export function saveReactionSelection(selected: ReactionType[], storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? globalThis.localStorage
    if (!target) return false
    target.setItem(reactionSelectionStorageKey, JSON.stringify(normalizeReactionSelection(selected)))
    return true
  } catch { return false }
}
export type RoomReaction = { id: string; senderId: string; targetId: string; reaction: ReactionType }
export type VisibleReaction = RoomReaction & { message: string; expiresAt: number }

// 选字用的 Enter（含旧浏览器的 229）不能成为发送动作。
export function shouldSendTypedCaption(event: KeyboardEvent, composing: boolean): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.repeat && !event.isComposing && !composing && event.keyCode !== 229
}

export type SoundPreferences = { enabled: boolean; volume: number }
export type SoundState = 'muted' | 'idle' | 'loading' | 'ready' | 'blocked' | 'unavailable'
const soundPreferencesStorageKey = 'hakisub.sound-preferences.v1'
export function normalizeSoundPreferences(value: unknown): SoundPreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<SoundPreferences> : {}
  return { enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    volume: typeof candidate.volume === 'number' && Number.isFinite(candidate.volume) ? Math.round(Math.max(0, Math.min(100, candidate.volume))) : 60 }
}
export function loadSoundPreferences(storage?: Pick<Storage, 'getItem'>): SoundPreferences {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(soundPreferencesStorageKey)
    return normalizeSoundPreferences(saved ? JSON.parse(saved) : undefined)
  } catch { return normalizeSoundPreferences(undefined) }
}
export function saveSoundPreferences(preferences: SoundPreferences, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? globalThis.localStorage
    if (!target) return false
    target.setItem(soundPreferencesStorageKey, JSON.stringify(normalizeSoundPreferences(preferences)))
    return true
  } catch { return false }
}

