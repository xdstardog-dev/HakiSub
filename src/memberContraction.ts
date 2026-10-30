export const MEMBER_CONTRACTION_DELAY_MS = 5000
export type MemberContractionState = { emptyMutedSince: number | null; contracted: boolean }
export type MemberContractionInput = { id: string; muted: boolean; hasText: boolean; protected: boolean }

export function updateMemberContraction(states: Map<string, MemberContractionState>, members: MemberContractionInput[], now: number) {
  const memberIds = new Set(members.map(member => member.id))
  for (const id of states.keys()) if (!memberIds.has(id)) states.delete(id)
  for (const member of members) {
    let state = states.get(member.id)
    if (!state) { state = { emptyMutedSince: null, contracted: false }; states.set(member.id, state); state = states.get(member.id)! }
    // 必须连续满足“闭麦且无字”；新字幕、模式变化或操作期间都重置完整的五秒。
    if (!member.muted || member.hasText) {
      state.emptyMutedSince = null; state.contracted = false
      continue
    }
    if (member.protected) { state.emptyMutedSince = null; continue }
    state.emptyMutedSince ??= now
    state.contracted ||= now - state.emptyMutedSince >= MEMBER_CONTRACTION_DELAY_MS
  }
}

export function expandContractedMember(states: Map<string, MemberContractionState>, memberId: string, now: number) {
  const state = states.get(memberId)
  if (state) { state.contracted = false; state.emptyMutedSince = now }
}
