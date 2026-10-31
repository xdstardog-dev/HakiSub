export type RoomPreferences = { adaptiveCards: boolean; speechVolume: number; speechEnabled?: boolean }
const roomPreferencesStorageKey = 'hakisub.room-preferences.v1'
export function normalizeRoomPreferences(value: unknown): RoomPreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<RoomPreferences> : {}
  return { adaptiveCards: typeof candidate.adaptiveCards === 'boolean' ? candidate.adaptiveCards : true,
    speechEnabled: typeof candidate.speechEnabled === 'boolean' ? candidate.speechEnabled : true,
    speechVolume: typeof candidate.speechVolume === 'number' && Number.isFinite(candidate.speechVolume)
      ? Math.round(Math.max(0, Math.min(100, candidate.speechVolume))) : 60 }
}
export function loadRoomPreferences(storage?: Pick<Storage, 'getItem'>): RoomPreferences {
  try { return normalizeRoomPreferences(JSON.parse((storage ?? globalThis.localStorage)?.getItem(roomPreferencesStorageKey) ?? 'null')) }
  catch { return normalizeRoomPreferences(null) }
}
export function saveRoomPreferences(value: RoomPreferences, storage?: Pick<Storage, 'setItem'>): boolean {
  try { const target = storage ?? globalThis.localStorage; if (!target) return false; target.setItem(roomPreferencesStorageKey, JSON.stringify(normalizeRoomPreferences(value))); return true }
  catch { return false }
}
