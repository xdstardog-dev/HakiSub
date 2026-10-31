<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { createAsrSession, type AsrProvider } from './asrSession'
import type { AsrState, AsrSession, AsrUsageEvent, CaptionCallbacks } from './captionEvents'
import { buildScenario, STRESS_DURATION_MS, type ScenarioKey } from './simulation/scenarios'
import { expandScenario } from './simulation/engine'
import { materialState } from './simulation/material'
import MemberCaptionGrid from './components/MemberCaptionGrid.vue'
import MemberModeControl from './components/MemberModeControl.vue'
import RoomPasswordPrompt from './components/RoomPasswordPrompt.vue'
import TypingComposer from './components/TypingComposer.vue'
import ReactionSettings from './components/ReactionSettings.vue'
import SoundSettings from './components/SoundSettings.vue'
import ApiSettings from './components/ApiSettings.vue'
import RoomApiSettings from './components/RoomApiSettings.vue'
import { loadRememberedRooms, rememberRoom, forgetRoomOwnership, type RememberedRoom } from './rememberedRooms'
import { receiveCaption, expireCaptions, type Caption } from './captions'
import { createRoomClient, type RoomMember } from './roomClient'
import { loadSoundPreferences, normalizeSoundPreferences, saveSoundPreferences, loadReactionSelection, normalizeReactionSelection, saveReactionSelection, QUICK_REACTIONS, REACTION_COOLDOWN_MS, REACTION_DURATION_MS, TYPED_CAPTION_LIMIT, TYPED_CAPTION_COOLDOWN_MS, type SoundPreferences, type SoundState, type ReactionType, type RoomReaction, type VisibleReaction } from './roomInteractions'
import { createReactionSound, type SoundSlot } from './reactionSound'
import { roomCodeFromPath, roomPath, shareRoomLink } from './roomNavigation'
import AccountAccess from './components/AccountAccess.vue'
import HomePage from './components/HomePage.vue'
import RoomAvatarControl from './components/RoomAvatarControl.vue'
import { DEFAULT_ROOM_AVATAR, normalizeRoomAvatar, type RoomAvatarId } from '../accounts/shared/roomAvatars.mjs'
import CreateRoomDialog from './components/CreateRoomDialog.vue'
import JoinRoomDialog from './components/JoinRoomDialog.vue'
import { saveCreatedRoomName } from './roomCreation'
import './home.css'
import RoomPresets from './components/RoomPresets.vue'
import { createAccountClient, type AccountIdentity } from './accountClient'
import { isValidDisplayName, truncateNameToUnits, NICKNAME_MAXIMUM_UNITS, ROOM_NAME_MAXIMUM_UNITS } from '../accounts/shared/nameRules.mjs'
import { loadRoomPreferences, saveRoomPreferences } from './roomPreferences'
import { receiveCaptionEntrance } from './captionEntrance'
import { createSpeechSound } from './speechSound'

type Member = RoomMember
const glasses = ref(location.pathname === '/glasses')
const settingsOpen = ref(false)
// 调试入口仅由显式 URL 参数打开，不进入普通成员设置。
const debugToolsOpen = ref(new URL(location.pathname + (location.search ?? ''), location.origin).searchParams.get('debug') === '1')
const roomMode = ref<'simulation' | 'online'>('online')
const rememberedRooms = ref<RememberedRoom[]>(loadRememberedRooms())
const roomSessionToken = ref('')
const roomStatusVersion = ref(0)
const roomName = ref('')
const roomAvatarId = ref<string>(DEFAULT_ROOM_AVATAR)
function updateRoomAvatar(avatarId: RoomAvatarId) {
  roomAvatarId.value = avatarId
  if (roomMode.value === 'online' && room.value) rememberedRooms.value = rememberRoom(rememberedRooms.value, { code: room.value, name: name.value.trim(), roomName: roomName.value, avatarId })
}
const roomAsrEnabled = ref(true)
const simulationAccessCode = ref('')
function renameSimulationRoom(value: string) {
  if (!joined.value || roomMode.value !== 'simulation' || !isValidDisplayName(value.trim(), ROOM_NAME_MAXIMUM_UNITS)) return
  roomName.value = value.trim()
}
function updateSimulationAccessCode(value: string) {
  if (!joined.value || roomMode.value !== 'simulation' || (value !== '' && !/^\d{4}$/.test(value))) return
  simulationAccessCode.value = value
}
const connecting = ref(false), selfId = ref('')
const roomPasswordOpen = ref(false), roomPasswordMessage = ref('')
let roomEntryOperation = 0, roomAccessClient: ReturnType<typeof createAccountClient> | undefined
let roomClient: ReturnType<typeof createRoomClient> | undefined
const joined = ref(false), mode = ref<'create' | 'join'>('create'), name = ref(''), code = ref(''), room = ref(''), error = ref('')
const entryOpen = ref(false)
const requestedRoomName = ref('')
let roomCreationController: AbortController | undefined, roomBindingClient: ReturnType<typeof createAccountClient> | undefined
function openRoomEntry(nextMode: 'create' | 'join') {
  if (connecting.value) return
  mode.value = nextMode; roomMode.value = 'online'; requestedRoomName.value = ''; error.value = ''; entryOpen.value = true
}
function closeRoomEntry() { cancelRoomPassword(); entryOpen.value = false; error.value = '' }
function prepareEntryIdentity() {
  const candidate = accountUser.value?.nickname ?? (name.value.trim() || rememberedRooms.value.find(saved => saved.code === code.value)?.name || rememberedRooms.value[0]?.name || '游客')
  const displayName = truncateNameToUnits(candidate, NICKNAME_MAXIMUM_UNITS).trim()
  name.value = isValidDisplayName(displayName, NICKNAME_MAXIMUM_UNITS) ? displayName : '游客'
}
function createNamedRoom(value: string, password?: string) {
  if (connecting.value || !isValidDisplayName(value.trim(), ROOM_NAME_MAXIMUM_UNITS)) return
  if (password !== undefined && (typeof password !== 'string' || !/^\d{4}$/.test(password))) return
  requestedRoomName.value = value.trim(); mode.value = 'create'; roomMode.value = 'online'
  prepareEntryIdentity(); void enter(undefined, password)
}
function joinRoomByCode(value: string) {
  if (connecting.value) return
  code.value = value; mode.value = 'join'; roomMode.value = 'online'
  prepareEntryIdentity(); void enter()
}
function showRoomPassword(message: string) {
  entryOpen.value = false; roomPasswordOpen.value = true
  roomPasswordMessage.value = ['此房间需要四位入房码。', '请输入四位入房码。'].includes(message) ? '' : message
}
async function finishRoomCreation(roomCode: string, token: string, ownerToken: string, desiredName: string, operation: number, user: AccountIdentity | null) {
  const controller = new AbortController()
  roomCreationController = controller
  const isCurrent = () => operation === roomEntryOperation && room.value === roomCode && !controller.signal.aborted
  try {
    if (desiredName) {
      const savedName = await saveCreatedRoomName(token, desiredName, controller.signal)
      if (!isCurrent()) return
      roomName.value = savedName
      rememberedRooms.value = rememberRoom(rememberedRooms.value, { code: roomCode, name: name.value, roomName: savedName, ownerToken })
    }
    if (user && accountUser.value?.uid === user.uid && isCurrent()) {
      const client = createAccountClient(); roomBindingClient = client
      try {
        await client.bindRoom(roomCode, ownerToken)
        if (!isCurrent() || accountUser.value?.uid !== user.uid) return
        rememberedRooms.value = forgetRoomOwnership(rememberedRooms.value, roomCode)
        accountMessage.value = '房间已绑定账号，可在个人中心跨设备管理。'
      } catch { if (isCurrent()) error.value = '房间已创建，但账号绑定未完成；请在房间设置中登录后重试绑定。' }
      finally { client.cancel(); if (roomBindingClient === client) roomBindingClient = undefined }
    }
  } catch { if (isCurrent()) error.value = '房间已创建，但名称保存失败，请在房间设置中重试。' }
  finally { if (roomCreationController === controller) roomCreationController = undefined }
}
const copyMessage = ref('')
let copyOperation = 0, copyMessageTimer: ReturnType<typeof setTimeout> | undefined
const members = ref<Member[]>([]), captions = ref<Caption[]>([])
const now = ref(Date.now())
const typedDraft = ref(''), typedSending = ref(false)
const typingEditorOpen = ref(false)
const selfModeMenuOpen = ref(false)
const reactionSettingsOpen = ref(false), selectedReactions = ref<ReactionType[]>(loadReactionSelection())
function updateReactionSelection(selection: ReactionType[]) {
  selectedReactions.value = normalizeReactionSelection(selection)
  if (!saveReactionSelection(selectedReactions.value)) error.value = '回应设置已应用，但本浏览器未能保存；刷新后可能恢复默认。'
  reactionSettingsOpen.value = false
}
const reactions = ref<VisibleReaction[]>([])
const nextReactionAt = ref(0), nextTypedAt = ref(0)
const soundPreferences = ref(loadSoundPreferences()), soundSettingsOpen = ref(false), soundStorageFailed = ref(false)
const reactionSound = createReactionSound(undefined, soundPreferences.value)
const soundState = ref<SoundState>(reactionSound.getState())
const soundEnabled = computed(() => soundPreferences.value.enabled && soundPreferences.value.volume > 0)
async function unlockSound() { await Promise.all([reactionSound.unlock(), speechSound.unlock()]); soundState.value = reactionSound.getState() }
function openSoundSettings() { soundSettingsOpen.value = true; void unlockSound() }
function updateSoundPreferences(preferences: SoundPreferences) {
  soundPreferences.value = normalizeSoundPreferences(preferences)
  reactionSound.configure(soundPreferences.value)
  soundStorageFailed.value = !saveSoundPreferences(soundPreferences.value)
  soundState.value = reactionSound.getState()
  if (soundEnabled.value) void unlockSound()
}
async function playReactionSound(slot: SoundSlot) {
  const playing = reactionSound.play(slot)
  soundState.value = reactionSound.getState()
  await playing
  soundState.value = reactionSound.getState()
}
async function previewSound(slot: SoundSlot = 'default') {
  if (await reactionSound.unlock()) await playReactionSound(slot)
  soundState.value = reactionSound.getState()
}
let pendingTyped: { id: string; text: string } | undefined
let typedSendTimer: ReturnType<typeof setTimeout> | undefined
function finishTypedSend() { clearTimeout(typedSendTimer); pendingTyped = undefined; typedSending.value = false }
function receiveReaction(event: RoomReaction) {
  const sender = members.value.find(member => member.id === event.senderId)
  const target = members.value.find(member => member.id === event.targetId)
  const option = QUICK_REACTIONS.find(option => option.type === event.reaction)
  if (!joined.value || !sender || !target || !option || reactions.value.some(reaction => reaction.id === event.id)) return
  const message = sender.id === target.id ? `${option.emoji} ${sender.name}：${option.label}`
    : ['agree', 'disagree', 'question', 'received'].includes(option.type) ? `${option.emoji} ${sender.name} ${option.label}了 ${target.name}` : `${option.emoji} ${sender.name} 对 ${target.name}：${option.label}`
  reactions.value = [...reactions.value, { ...event, message, expiresAt: Date.now() + REACTION_DURATION_MS }].slice(-24)
  void playReactionSound(event.reaction)
}
function sendReaction(targetId: string, reaction: ReactionType) {
  if (!joined.value || !me.value || !members.value.some(member => member.id === targetId) || !QUICK_REACTIONS.some(option => option.type === reaction)) return
  if (Date.now() < nextReactionAt.value) { error.value = '回应发送过快，请稍后再试。'; return }
  if (roomMode.value === 'online') {
    if (!roomClient?.send({ type: 'reaction', targetId, reaction })) { error.value = '房间未连接，回应未发送。'; return }
  } else receiveReaction({ id: crypto.randomUUID(), senderId: me.value.id, targetId, reaction })
  nextReactionAt.value = Date.now() + REACTION_COOLDOWN_MS; error.value = ''
}
function sendTypedCaption() {
  if (!joined.value || me.value?.mode !== 'typing' || typedSending.value) return
  if (!typedDraft.value.trim() || typedDraft.value.length > TYPED_CAPTION_LIMIT) { error.value = '请输入 1～1000 个字符。'; return }
  if (Date.now() < nextTypedAt.value) { error.value = '打字发送过快，请稍后再试。'; return }
  const id = crypto.randomUUID(), text = typedDraft.value
  if (roomMode.value === 'online') {
    if (!roomClient?.send({ type: 'typed-caption', utteranceId: id, text })) { error.value = '房间未连接，草稿已保留。'; return }
    pendingTyped = { id: `typed-${me.value.id}-${id}`, text }; typedSending.value = true
    typedSendTimer = setTimeout(() => { finishTypedSend(); error.value = '未收到发送确认，请检查连接；草稿已保留。' }, 10000)
  } else {
    receiveCaption(captions.value, me.value.id, `typed-${id}`, text.trim(), 'final', Date.now())
    typedDraft.value = ''
  }
  nextTypedAt.value = Date.now() + TYPED_CAPTION_COOLDOWN_MS; error.value = ''
}
const roomPreferences = loadRoomPreferences()
const adaptiveCards = ref(roomPreferences.adaptiveCards), speechVolume = ref(roomPreferences.speechVolume)
const speechEnabled = ref(roomPreferences.speechEnabled !== false)
const personalStorageFailed = ref(false)
const speechSound = createSpeechSound()
speechSound.configure(speechEnabled.value ? speechVolume.value : 0)
watch([adaptiveCards, speechVolume, speechEnabled], () => {
 personalStorageFailed.value = !saveRoomPreferences({ adaptiveCards: adaptiveCards.value, speechVolume: speechVolume.value, speechEnabled: speechEnabled.value })
})
watch([speechVolume, speechEnabled], () => speechSound.configure(speechEnabled.value ? speechVolume.value : 0), { flush: 'sync' })
function updateSpeechVolume(volume: number) {
  speechVolume.value = volume
  if (speechEnabled.value && volume > 0) void speechSound.unlock()
}
function updateSpeechEnabled(enabled: boolean) {
  speechEnabled.value = enabled
  // 在喇叭按钮的用户交互内解锁，恢复后不必再点击其他控件。
  if (enabled && speechVolume.value > 0) void speechSound.unlock()
}
const speechEntrances = ref<Record<string, number>>({})
let entranceSequence = 0
function receiveRoomCaption(event: import('./captionEvents').CaptionEvent) {
 const receivedAt = Date.now()
 if (receiveCaptionEntrance(captions.value, event, receivedAt)) {
  speechEntrances.value = { ...speechEntrances.value, [event.memberId]: ++entranceSequence }
  const member = members.value.find(member => member.id === event.memberId)
  if (member?.toneSlot !== undefined) speechSound.play(member.toneSlot)
 }
 now.value = receivedAt
}
const accountUser = ref<AccountIdentity | null>(null), accountMessage = ref('')
function updateAccountIdentity(user: AccountIdentity | null) {
 accountUser.value = user
 if (user && !joined.value && !connecting.value) name.value = truncateNameToUnits(user.nickname, NICKNAME_MAXIMUM_UNITS).trimEnd()
}
const scenario = ref<ScenarioKey>('rapid')
const scenarioRunning = ref(false)
const simulationStarted = ref<number | null>(null)
const stressProgress = computed(() => {
  if (scenario.value !== 'stress' || simulationStarted.value === null) return ''
  const seconds = Math.min(60, Math.max(0, Math.floor((now.value - simulationStarted.value) / 1000)))
  if (seconds === 60) return scenarioRunning.value ? '60 / 60 秒 · 发言结束，等待字幕自然消失' : '60 / 60 秒 · 压力测试完成'
  return `${seconds} / 60 秒 · ${Math.floor(seconds / 10) % 2 === 0 ? '密集交谈' : '稀疏交谈'}`
})
let simulationEnd = 0
let pending: { at: number; run: () => void }[] = []
// 角色与台词来自 materials/ 目录下的素材包，可独立编辑，不需要改代码。
const materialPack = materialState.packs[0]
const materialError = materialState.errors.join('；')
function characterAt(index: number): { name: string; color: string } {
  const character = materialPack?.characters[index]
  return { name: character?.name ?? (index === 0 ? '我' : '新成员'), color: character?.color ?? '' }
}
const me = computed(() => roomMode.value === 'online' ? members.value.find(member => member.id === selfId.value) : members.value[0])
const active = computed(() => members.value.filter(m => m.mic))
const inputMode = ref<'simulation' | 'microphone'>('simulation')
const asrProvider = ref<AsrProvider>('doubao')
const asrState = ref<AsrState>('idle')
const asrMessage = ref('麦克风已关闭')
const asrActive = computed(() => ['starting', 'listening', 'reconnecting'].includes(asrState.value))
const micStartedAt = ref<number | null>(null)
const micStoppedAt = ref<number | null>(null)
const usageByRequest = new Map<string, AsrUsageEvent>()
const usageTotals = ref({ submitted: 0, completed: 0, returned: 0, returnedSegments: 0 })
const micOpenSeconds = computed(() => micStartedAt.value === null ? 0 : Math.max(0, ((micStoppedAt.value ?? now.value) - micStartedAt.value) / 1000))
function formatUsageDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}分${(seconds % 60).toFixed(1)}秒`
}
function clearMicUsage() {
  micStartedAt.value = null; micStoppedAt.value = null
  usageByRequest.clear()
  usageTotals.value = { submitted: 0, completed: 0, returned: 0, returnedSegments: 0 }
}
const asrCallbacks: CaptionCallbacks = {
  onState(state, message) {
    if (asrProvider.value === 'doubao') {
      if (state === 'listening' && micStartedAt.value === null) micStartedAt.value = Date.now()
      if ((state === 'idle' || state === 'error') && micStartedAt.value !== null && micStoppedAt.value === null) micStoppedAt.value = Date.now()
    }
    asrState.value = state
    asrMessage.value = message
    if (inputMode.value === 'microphone' && me.value) {
      me.value.mic = state === 'listening' || (asrProvider.value === 'doubao' && state === 'reconnecting')
      if (me.value.mode !== 'typing') me.value.mode = me.value.mic || state === 'starting' ? 'microphone' : 'muted'
      if (roomMode.value === 'online') roomClient?.send({ type: 'mic', mic: me.value.mic })
    }
  },
  onCaption({ memberId, utteranceId, text, state }) {
    if (inputMode.value === 'microphone' && joined.value) {
      if (roomMode.value === 'online') roomClient?.send({ type: 'caption', utteranceId, text, state })
      else recognize(memberId, utteranceId, text, state)
    }
  },
  onDiscard(memberId, id) {
    if (roomMode.value === 'online') roomClient?.send({ type: 'discard', utteranceId: id })
    captions.value = captions.value.filter(c => c.memberId !== memberId || c.id !== id || c.state === 'final')
  },
  onUsage(usage) {
    if (asrProvider.value !== 'doubao' || micStartedAt.value === null || micStoppedAt.value !== null) return
    usageByRequest.set(usage.requestId, usage)
    // 同一连接会反复更新累计值，按 requestId 覆盖后再求和，避免把进度重复计入。
    const values = [...usageByRequest.values()]
    usageTotals.value = {
      submitted: values.reduce((sum, value) => sum + value.submittedAudioSeconds, 0),
      completed: values.reduce((sum, value) => sum + value.completedAudioSeconds, 0),
      returned: values.reduce((sum, value) => sum + (value.serverAudioSeconds ?? 0), 0),
      returnedSegments: values.filter(value => value.serverAudioSeconds !== null).length,
    }
  },
}
let currentAsrSession: AsrSession | undefined
let asrGeneration = 0
const asr = {
  start() {
    if (!me.value) return
    if (roomMode.value === 'online' && !roomAsrEnabled.value) {
      asrCallbacks.onState('idle', 'ASR 已暂停，仍可打字和快捷回应')
      return
    }
    if (asrProvider.value === 'doubao') clearMicUsage()
    const generation = ++asrGeneration
    // 停止后到达的旧回调不能关掉新会话，或把打字模式改回麦克风状态。
    const callbacks: CaptionCallbacks = {
      onState: (...args) => { if (generation === asrGeneration) asrCallbacks.onState(...args) },
      onCaption: event => { if (generation === asrGeneration) asrCallbacks.onCaption(event) },
      onDiscard: (...args) => { if (generation === asrGeneration) asrCallbacks.onDiscard(...args) },
      onUsage: usage => { if (generation === asrGeneration) asrCallbacks.onUsage?.(usage) },
    }
    currentAsrSession = createAsrSession(asrProvider.value, me.value.id, callbacks, roomClient?.getToken())
    currentAsrSession.start()
  },
  stop() { currentAsrSession?.stop(); currentAsrSession = undefined; asrGeneration++ },
}
function changeAsrProvider(event: Event) {
  asr.stop()
  clearMicUsage()
  asrProvider.value = (event.target as HTMLSelectElement).value === 'doubao' ? 'doubao' : 'browser'
  asrState.value = 'idle'; asrMessage.value = '麦克风已关闭'
}
function changeInputMode(event: Event) {
  if (roomMode.value === 'online') return
  asr.stop()
  clearMicUsage()
  pending = []; scenarioRunning.value = false; simulationStarted.value = null
  captions.value = []; error.value = ''
  inputMode.value = (event.target as HTMLSelectElement).value === 'microphone' ? 'microphone' : 'simulation'
  members.value.forEach(member => { member.mic = inputMode.value === 'simulation'; member.mode = member.mic ? 'microphone' : 'muted' })
}
function toggleRealMic() {
  if (me.value?.mode === 'typing') return
  if (asrActive.value) asr.stop()
  else if (joined.value && inputMode.value === 'microphone') asr.start()
}
function handlePageHide() { if (roomMode.value === 'online') leave(false); else asr.stop() }
window.addEventListener('pagehide', handlePageHide)
function prepareRoomEntry() {
  glasses.value = location.pathname === '/glasses'
  const roomCode = roomCodeFromPath(location.pathname)
  mode.value = roomCode ? 'join' : 'create'; code.value = roomCode ?? ''
  entryOpen.value = !!roomCode
  if (roomCode) {
    roomMode.value = 'online'
    if (!name.value.trim()) name.value = rememberedRooms.value.find(saved => saved.code === roomCode)?.name ?? ''
  }
}
function handleHistoryNavigation() { leave(false); prepareRoomEntry() }
window.addEventListener('popstate', handleHistoryNavigation)
function addMember() {
  if (members.value.length >= 8) { error.value = '房间已满，最多允许 8 人。'; return }
  const character = characterAt(members.value.length)
  members.value.push({ id: crypto.randomUUID(), name: character.name, mic: inputMode.value === 'simulation', color: character.color, toneSlot: Array.from({ length: 8 }, (_, slot) => slot).find(slot => !members.value.some(member => member.toneSlot === slot)) })
  error.value = ''
}
function setMemberCount(event: Event) {
  const count = Number((event.target as HTMLSelectElement).value)
  if (!Number.isInteger(count) || count < 1 || count > 8) return
  while (members.value.length < count) addMember()
  members.value = members.value.slice(0, count)
  const ids = new Set(members.value.map(member => member.id))
  captions.value = captions.value.filter(caption => ids.has(caption.memberId))
  error.value = ''
}
function toggleMemberMic(id: string) {
  const member = members.value.find(member => member.id === id)
  if (!member) return
  if (id === me.value?.id) {
    typingEditorOpen.value = false
    if (member.mode === 'typing' || member.mic || (inputMode.value === 'microphone' && asrActive.value)) {
      if (inputMode.value === 'microphone') asr.stop()
      member.mic = false; member.mode = 'muted'
      if (roomMode.value === 'online') roomClient?.send({ type: 'mode', mode: 'muted' })
    } else {
      if (roomMode.value === 'online' && !roomAsrEnabled.value) return
      member.mode = 'microphone'
      if (inputMode.value === 'microphone') asr.start()
      else member.mic = true
    }
    if (!member.mic) captions.value = captions.value.filter(c => c.memberId !== id || c.state === 'final')
    return
  }
  if (inputMode.value === 'microphone') return
  if (member) {
    member.mic = !member.mic
    member.mode = member.mic ? 'microphone' : 'muted'
    if (!member.mic) captions.value = captions.value.filter(c => c.memberId !== id || c.state === 'final')
  }
}
function selectMemberTyping(id: string) {
  const member = me.value
  if (!joined.value || !member || member.id !== id) return
  if (member.mode !== 'typing') {
    asr.stop()
    member.mic = false; member.mode = 'typing'
    captions.value = captions.value.filter(caption => caption.memberId !== id || caption.state === 'final')
    if (roomMode.value === 'online') roomClient?.send({ type: 'mode', mode: 'typing' })
  }
  typingEditorOpen.value = true
}
function cancelRoomPassword() {
  roomCreationController?.abort(); roomBindingClient?.cancel()
  roomEntryOperation++; roomAccessClient?.cancel(); roomAccessClient = undefined
  roomClient?.close(); connecting.value = false; roomPasswordOpen.value = false; roomPasswordMessage.value = ''
}
async function enter(password?: string | Event, creationPassword?: string) {
  error.value = ''
  if (!name.value.trim()) { error.value = '请先填写你的显示名称。'; return }
  if (!isValidDisplayName(name.value.trim(), NICKNAME_MAXIMUM_UNITS)) { error.value = '显示名称最多8个汉字或16个英文／数字，不能包含换行或控制字符。'; return }
  if (mode.value === 'join' && !/^\d{6}$/.test(code.value)) { error.value = '请输入 6 位数字房间码。'; return }
  void unlockSound()
  if (roomMode.value === 'online') {
    if (connecting.value) return
    connecting.value = true
    roomClient?.close()
    const operation = ++roomEntryOperation
    const creationName = mode.value === 'create' ? requestedRoomName.value : ''
    const creationAccount = accountUser.value
    const submittedPassword = mode.value === 'create' ? creationPassword : typeof password === 'string' ? password : undefined
    let accessTicket: string | undefined
    if (mode.value === 'join' && accountUser.value) {
      const entryAccountUid = accountUser.value.uid
      const client = createAccountClient()
      roomAccessClient?.cancel(); roomAccessClient = client
      try {
        const access = await client.roomAccess(code.value, submittedPassword)
        if (operation !== roomEntryOperation) return
        if (accountUser.value?.uid !== entryAccountUid) { connecting.value = false; error.value = '登录账号已变化，请重新加入房间。'; return }
        if (!access.accessTicket) {
          connecting.value = false; showRoomPassword(access.message ?? '')
          return
        }
        accessTicket = access.accessTicket
      } catch (issue) {
        if (operation !== roomEntryOperation) return
        connecting.value = false
        const message = issue instanceof Error ? issue.message : '入房验证暂时不可用，请重试。'
        if (roomPasswordOpen.value) roomPasswordMessage.value = message
        else error.value = message
        return
      } finally { client.cancel(); if (roomAccessClient === client) roomAccessClient = undefined }
    }
    let ownerRecoveryAttempted = false
    roomClient = createRoomClient({
      onJoined(roomCode, memberId, ownership) {
        const aliases = ownership?.aliases ?? []
        const previousOwner = rememberedRooms.value.find(value => aliases.includes(value.code) && value.ownerToken)
        // 直接输入新号码时，复用本浏览器旧入口的管理凭据，仅补验一次，避免重填Key或丢房主身份。
        if (!accessTicket && !ownership?.isOwner && previousOwner?.ownerToken && !ownerRecoveryAttempted) {
          ownerRecoveryAttempted = true
          roomClient?.connect('join', name.value.trim(), roomCode, previousOwner.ownerToken)
          return
        }
        roomAvatarId.value = normalizeRoomAvatar(ownership?.avatarId)
        room.value = roomCode; roomName.value = ownership?.name ?? `房间 ${roomCode}`; selfId.value = memberId
        roomPasswordOpen.value = false; roomPasswordMessage.value = ''
        roomSessionToken.value = roomClient?.getToken() ?? ''
        rememberedRooms.value = rememberRoom(rememberedRooms.value, { code: roomCode, name: name.value.trim(), roomName: roomName.value, avatarId: ownership?.avatarId, ownerToken: ownership?.ownerToken }, aliases)
        settingsOpen.value = false
        inputMode.value = 'microphone'; captions.value = []; joined.value = true; connecting.value = false
        entryOpen.value = false
        if (mode.value === 'create' && ownership?.ownerToken) void finishRoomCreation(roomCode, roomSessionToken.value, ownership.ownerToken, creationName, operation, creationAccount)
        const path = roomPath(roomCode)
        if (location.pathname !== path || location.search || location.hash) {
          if (roomCodeFromPath(location.pathname)) window.history.replaceState(null, '', path)
          else window.history.pushState(null, '', path)
        }
      },
      onMembers(next) {
        members.value = next
        if (me.value?.mode !== 'typing') typingEditorOpen.value = false
        captions.value = captions.value.filter(caption => next.some(member => member.id === caption.memberId && (member.mic || caption.state === 'final')))
        reactions.value = reactions.value.filter(reaction => next.some(member => member.id === reaction.targetId))
      },
      onCaption(event) {
        if (joined.value) receiveRoomCaption(event)
        if (event.memberId === selfId.value && event.utteranceId === pendingTyped?.id) {
          if (typedDraft.value === pendingTyped.text) typedDraft.value = ''
          finishTypedSend()
        }
      },
      onReaction: receiveReaction,
      onDiscard(memberId, utteranceId) {
        captions.value = captions.value.filter(caption => caption.memberId !== memberId || caption.id !== utteranceId || caption.state === 'final')
      },
      onError(message) {
        error.value = message
        if (roomPasswordOpen.value) roomPasswordMessage.value = message
        finishTypedSend()
        if (!joined.value) { connecting.value = false; roomClient?.close() }
      },
      onPasswordRequired(roomCode, message) {
        if (operation !== roomEntryOperation) return
        code.value = roomCode; connecting.value = false; showRoomPassword(message)
      },
      onAccessRevoked(roomCode, message) {
        leave(false); mode.value = 'join'; code.value = roomCode
        showRoomPassword(message)
      },
      onRoomStatus(status) {
        if (status.avatarId !== undefined) roomAvatarId.value = normalizeRoomAvatar(status.avatarId)
        if (typeof status.asrEnabled === 'boolean') roomAsrEnabled.value = status.asrEnabled
        if (typeof status.name === 'string') {
          roomName.value = status.name
          if (room.value) rememberedRooms.value = rememberRoom(rememberedRooms.value, { code: room.value, name: name.value.trim(), roomName: status.name, avatarId: status.avatarId })
        }
        roomStatusVersion.value++
        if (status.bound && room.value) rememberedRooms.value = forgetRoomOwnership(rememberedRooms.value, room.value)
        if (!roomAsrEnabled.value) {
          const wasActive = me.value?.mic || me.value?.mode === 'microphone'
          asr.stop()
          asrState.value = 'idle'; asrMessage.value = '语音转文字功能被关闭了喵！只能打字说话了喵~'
          if (me.value && me.value.mode !== 'typing') { me.value.mic = false; me.value.mode = 'muted' }
          if (wasActive) roomClient?.send({ type: 'mic', mic: false })
        } else if (asrProvider.value === 'doubao' && !status.configured) {
          asr.stop()
          asrMessage.value = !status.asrEnabled ? '豆包 ASR 已被房主暂停' : '请房主配置本房间 API Key'
        } else if (asrProvider.value === 'doubao' && !asrActive.value) asrMessage.value = '豆包 ASR 可用，请手动开启麦克风'
      },
      onClose() { leave(false); prepareRoomEntry(); error.value = '房间连接已断开，请重新加入；麦克风已停止。' },
    })
    roomClient.connect(mode.value, name.value.trim(), code.value, rememberedRooms.value.find(value => value.code === code.value)?.ownerToken,
      accessTicket ? { accessTicket } : submittedPassword === undefined ? undefined : { password: submittedPassword })
    return
  }
  room.value = mode.value === 'create' ? String(Math.floor(100000 + Math.random() * 900000)) : code.value
  roomName.value = mode.value === 'create' && isValidDisplayName(requestedRoomName.value.trim(), ROOM_NAME_MAXIMUM_UNITS) ? requestedRoomName.value.trim() : `${name.value.trim()}的房间`
  simulationAccessCode.value = ''
  members.value = [{ id: crypto.randomUUID(), name: name.value.trim(), mic: inputMode.value === 'simulation', color: characterAt(0).color, toneSlot: 0 }]
  for (let i = 0; i < 3; i++) addMember()
  joined.value = true
  entryOpen.value = false
  now.value = Date.now()
}
// Recognition adapter: a stable utterance ID connects interim updates to its final result.
function recognize(memberId: string, id: string, text: string, state: Caption['state']) {
  if (!joined.value || !members.value.some(m => m.id === memberId && m.mic)) return
  receiveRoomCaption({ memberId, utteranceId: id, text, state, source: 'speech' })
  now.value = Date.now()
}
function runSimulation() {
  if (inputMode.value !== 'simulation' || scenarioRunning.value) return
  if (!materialPack) { error.value = materialError || '未找到可用素材包，请检查 materials 目录下的 JSON 文件。'; return }
  const first = active.value[0]
  if (!['eight', 'stress', 'script'].includes(scenario.value) && !first) { error.value = '请先开启至少一位成员的模拟麦克风。'; return }
  error.value = ''
  const start = Date.now()
  simulationStarted.value = start
  if (scenario.value === 'stress' || scenario.value === 'eight') {
    while (members.value.length < 8) addMember()
    members.value.forEach(member => { member.mic = true; member.mode = 'microphone' })
  } else if (scenario.value === 'script') {
    while (members.value.length < Math.min(8, materialPack.characters.length)) addMember()
    members.value.forEach(member => { member.mic = true; member.mode = 'microphone' })
  }
  // 场景只描述“谁在什么时间说什么”，这里把成员槽位解析成真实成员，再交给调度队列。
  const firstActiveIndex = first ? members.value.indexOf(first) : 0
  const utterances = buildScenario(scenario.value, materialPack, firstActiveIndex)
  pending = []
  for (const event of expandScenario(utterances, () => crypto.randomUUID())) {
    const memberId = members.value[event.memberIndex]?.id
    if (!memberId) continue
    pending.push({ at: start + event.at, run: () => recognize(memberId, event.utteranceId, event.text, event.state) })
  }
  pending.sort((a, b) => a.at - b.at)
  simulationEnd = scenario.value === 'stress' ? start + STRESS_DURATION_MS : (pending.at(-1)?.at ?? start) + 12000
  scenarioRunning.value = true
  tick()
}
function leave(updateLocation = true) {
  roomCreationController?.abort(); roomBindingClient?.cancel()
  roomEntryOperation++; roomAccessClient?.cancel(); roomAccessClient = undefined
  roomPasswordOpen.value = false; roomPasswordMessage.value = ''
  asr.stop()
  roomClient?.close(); roomClient = undefined
  connecting.value = false; selfId.value = ''; roomSessionToken.value = ''; settingsOpen.value = false
  roomName.value = ''; roomAvatarId.value = DEFAULT_ROOM_AVATAR
  roomAsrEnabled.value = true
  simulationAccessCode.value = ''
  clearMicUsage()
  joined.value = false; members.value = []; captions.value = []; pending = []
  entryOpen.value = false
  finishTypedSend(); typedDraft.value = ''; typingEditorOpen.value = false; reactions.value = []; nextReactionAt.value = 0; nextTypedAt.value = 0; reactionSound.close(); speechSound.close(); speechEntrances.value = {}
  reactionSettingsOpen.value = false
  soundSettingsOpen.value = false; soundState.value = reactionSound.getState()
  scenarioRunning.value = false; simulationStarted.value = null; error.value = ''
  copyOperation++; clearCopyMessage()
  if (updateLocation && location.pathname !== '/') {
    window.history.pushState(null, '', '/')
    prepareRoomEntry()
  }
}
function reenterRoom(saved: RememberedRoom) {
  if (connecting.value) return
  roomMode.value = 'online'; mode.value = 'join'; code.value = saved.code
  if (!name.value.trim()) name.value = saved.name
  prepareEntryIdentity()
  enter()
}
function tick() {
  now.value = Date.now()
  while (pending.length && pending[0]!.at <= now.value) pending.shift()!.run()
  captions.value = expireCaptions(captions.value, now.value)
  reactions.value = reactions.value.filter(reaction => reaction.expiresAt > now.value)
  if (now.value >= simulationEnd && (scenario.value !== 'stress' || !captions.value.length)) scenarioRunning.value = false
}
// Each final has its own immutable deadline; the shared clock never resets it.
const timer = setInterval(tick, 50)
function unlockReactionSound() { if (joined.value) void unlockSound() }
window.addEventListener('pointerdown', unlockReactionSound)
window.addEventListener('keydown', unlockReactionSound)
onUnmounted(() => {
  roomCreationController?.abort(); roomBindingClient?.cancel()
  roomEntryOperation++; roomAccessClient?.cancel(); roomAccessClient = undefined
  finishTypedSend(); reactionSound.close()
  window.removeEventListener('pointerdown', unlockReactionSound)
  window.removeEventListener('keydown', unlockReactionSound)
  asr.stop(); roomClient?.close(); clearInterval(timer); pending = []
  copyOperation++; clearCopyMessage()
  window.removeEventListener('pagehide', handlePageHide)
  window.removeEventListener('popstate', handleHistoryNavigation)
})
function clearCopyMessage() {
  clearTimeout(copyMessageTimer); copyMessageTimer = undefined; copyMessage.value = ''
}
function showCopyMessage(message: string) {
  clearCopyMessage()
  copyMessage.value = message
  copyMessageTimer = setTimeout(clearCopyMessage, 500)
}
async function copyCode() {
  if (!joined.value) return
  const operation = ++copyOperation
  clearCopyMessage()
  try {
    await navigator.clipboard.writeText(room.value)
    if (operation === copyOperation) showCopyMessage('复制房间号成功')
  } catch { if (operation === copyOperation) showCopyMessage('复制失败，请重试') }
}
async function shareCurrentRoom() {
  if (!joined.value || roomMode.value !== 'online') return
  const operation = ++copyOperation
  clearCopyMessage()
  const result = await shareRoomLink(room.value, location.origin)
  // 只展示当前房间最后一次复制的结果，离房或后续点击使旧回调失效。
  if (operation !== copyOperation) return
  showCopyMessage(result === 'copied' ? '复制链接成功' : '复制失败，请重试')
}
prepareRoomEntry()
</script>

<template>
  <div v-if="glasses" class="glasses-page">
    <a href="/" class="back-link">← 返回实时字幕</a>
    <div class="concept-label">实时字幕 / GLASSES CONCEPT</div>
    <h1>智能眼镜字幕预览</h1><p>展示说话人、字幕与设备状态的静态示例，未连接硬件。</p>
    <div class="lens"><div class="lens-top"><span>● 实时字幕 · 4 人交流中</span><span>14:32</span></div><div class="lens-caption"><span>丰川祥子</span><p>周六下午两点，<br>我们在咖啡馆门口见吧。</p><small>若叶睦　好呀，我可以。</small></div><div class="lens-bottom">▰ ▰ ▰　 连接正常 <span>麦克风开启 ●</span></div></div>
    <div class="concept-notes"><span>高对比字幕</span><span>清晰说话人标记</span><span>两行核心信息</span></div>
  </div>
  <div v-else class="app-shell" :class="{ 'in-room': joined, 'home-shell': !joined }">
    <RoomPasswordPrompt v-if="roomPasswordOpen && !joined" :busy="connecting" :message="roomPasswordMessage" @submit="enter" @cancel="cancelRoomPassword" />
    <HomePage v-if="!joined" :rooms="rememberedRooms" :busy="connecting" @identity="updateAccountIdentity" @enter="reenterRoom" @create="openRoomEntry('create')" @join="openRoomEntry('join')">
      <p v-if="connecting" class="home-status" role="status">正在连接房间…</p>
      <p v-if="error && !entryOpen" class="home-status" role="alert">{{ error }}</p>
      <p v-if="accountMessage" class="home-status" role="status">{{ accountMessage }}</p>
    </HomePage>
    <CreateRoomDialog v-if="entryOpen && !joined && mode === 'create'" :busy="connecting" :message="error" @submit="createNamedRoom" @close="closeRoomEntry" />
    <JoinRoomDialog v-if="entryOpen && !joined && mode === 'join'" :busy="connecting" :message="error" :room-code="code" @submit="joinRoomByCode" @close="closeRoomEntry" />
    <main v-if="joined" class="room-layout">
      <header class="room-topbar">
        <div class="room-heading">
          <RoomAvatarControl :key="room" :avatar-id="roomAvatarId" :code="room" :token="roomSessionToken" :settings-open="settingsOpen" :simulation="roomMode === 'simulation'" @activate="settingsOpen = true" @changed="updateRoomAvatar" @error="error = $event" />
          <div class="room-identity"><h1 :title="roomName || '字幕房间'">{{ roomName || '字幕房间' }}</h1><button class="copy-room" type="button" @click="copyCode" aria-label="复制房间号" title="复制房间号"><span>{{ room }}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="8" width="13" height="13" rx="3"/><path d="M8 8V6a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-2"/></svg></button></div>
        </div>
        <div class="room-actions">
          <button v-if="roomMode === 'online'" class="share-room" type="button" aria-label="分享房间链接" title="分享房间链接" @click="shareCurrentRoom">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 15V3m-4 4 4-4 4 4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>
          </button>
          <button class="room-exit room-back-button" type="button" aria-label="退出房间" title="返回首页" @click="leave()"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 7h7a6 6 0 0 1 0 12h-4m-3-17-5 5 5 5"/></svg></button>
        </div>
      </header>
      <Teleport to="body"><Transition name="room-copy-toast"><p v-if="copyMessage" class="room-copy-toast" role="status" aria-live="polite" aria-atomic="true">{{ copyMessage }}</p></Transition></Teleport>
      <p v-if="roomMode === 'online' && !roomAsrEnabled" class="room-grid-note" role="status">语音转文字功能被关闭了喵！只能打字说话了喵~</p>
      <RoomApiSettings v-if="settingsOpen && roomMode === 'online'" :key="room + ':' + !!rememberedRooms.find(saved => saved.code === room)?.ownerToken" :token="roomSessionToken" :code="room" :preferences="soundPreferences" :speech-volume="speechVolume" :speech-enabled="speechEnabled" @speech-enabled="updateSpeechEnabled" :adaptive="adaptiveCards" :storage-failed="personalStorageFailed || soundStorageFailed" @sound="updateSoundPreferences" @speech="updateSpeechVolume" @layout="adaptiveCards = $event" :status-version="roomStatusVersion" :owner-token="rememberedRooms.find(saved => saved.code === room)?.ownerToken" @bound="rememberedRooms = forgetRoomOwnership(rememberedRooms, room)" @close="settingsOpen = false" />
      <ApiSettings v-if="settingsOpen && roomMode === 'simulation'" :room-name="roomName" :access-code="simulationAccessCode" @rename="renameSimulationRoom" @access-code="updateSimulationAccessCode" @close="settingsOpen = false" />
      <div v-if="roomMode === 'simulation'" class="room-demo-controls">
        <label for="input-mode">输入</label>
        <select id="input-mode" :value="inputMode" @change="changeInputMode">
          <option value="simulation">模拟字幕</option>
          <option value="microphone">真实麦克风</option>
        </select>
        <label for="member-count">人数</label>
        <select id="member-count" :value="members.length" :disabled="scenarioRunning && scenario === 'stress'" @change="setMemberCount">
          <option v-for="count in 8" :key="count" :value="count">{{ count }} 人</option>
        </select>
      </div>
      <div v-if="(debugToolsOpen || roomMode === 'simulation') && inputMode === 'microphone'" class="room-demo-controls">
        <label for="asr-provider">识别来源</label>
        <select id="asr-provider" :value="asrProvider" @change="changeAsrProvider">
          <option value="browser">浏览器 ASR</option>
          <option value="doubao">豆包 ASR 2.0</option>
        </select>
      </div>
      <div v-if="inputMode === 'simulation'" class="room-demo-controls simulation-controls">
        <label for="scenario">模拟字幕</label>
        <select id="scenario" v-model="scenario" :disabled="scenarioRunning">
          <option value="rapid">单人连续快速讲话</option>
          <option value="stress">8 人对话 · 1 分钟压力测试</option>
          <option value="eight">8 人同时讲话</option>
          <option value="long">长句（超过 30 字）</option>
          <option value="fade">渐隐时加入新句</option>
          <option value="overflow">卡片内容溢出</option>
          <option value="interim">实时识别到确认</option>
          <option value="script">素材对话（时间轴）</option>
        </select>
        <button @click="runSimulation" :disabled="scenarioRunning">{{ scenarioRunning ? '测试中' : '运行' }}</button>
      </div>
      <div v-if="debugToolsOpen" class="room-demo-controls">
        <label class="layout-experiment"><input v-model="adaptiveCards" type="checkbox" />动态自适应布局</label>
        <button aria-label="全局音效设置" @click="openSoundSettings">音效：{{ soundEnabled ? '开' : '关' }}</button>
      </div>
      <p v-if="error || (inputMode === 'microphone' && asrState === 'error')" class="room-error error" role="alert">{{ error || asrMessage }}</p>
      <template v-if="debugToolsOpen || roomMode === 'simulation'">
        <p v-if="inputMode === 'microphone'" class="room-grid-note" role="status">{{ asrMessage }}</p>
        <p v-if="inputMode === 'microphone' && asrProvider === 'doubao' && micStartedAt !== null" class="room-grid-note" aria-label="本次开麦音频用量">
          本次开麦 {{ formatUsageDuration(micOpenSeconds) }} · 提交 {{ formatUsageDuration(usageTotals.submitted) }} · 发送完成 {{ formatUsageDuration(usageTotals.completed) }} · 豆包返回 {{ usageTotals.returnedSegments ? formatUsageDuration(usageTotals.returned) : '尚无时长' }}
        </p>
        <p v-if="roomMode === 'simulation'" class="room-grid-note">{{ stressProgress || '确认后按字数显示 3 / 6 / 10 秒，再渐隐 2 秒 · 无历史回看' }}</p>
      </template>
      <section class="room-stage" aria-label="房间内容">
        <MemberCaptionGrid :entrances="speechEntrances" :adaptive="adaptiveCards" :members="members" :captions="captions" :now="now" :self-id="me?.id" :starting-member-id="asrState === 'starting' ? me?.id : undefined" :protected-member-id="selfModeMenuOpen || ['starting', 'reconnecting', 'error'].includes(asrState) ? me?.id : undefined" :live-input="inputMode === 'microphone'" :online-room="roomMode === 'online'" :microphone-unavailable="roomMode === 'online' && !roomAsrEnabled" :typed-draft="typedDraft" :reactions="reactions" :reaction-cooldown-until="nextReactionAt" :selected-reactions="selectedReactions" @edit-typed="typingEditorOpen = true" @react="sendReaction" @reaction-settings="reactionSettingsOpen = true" @toggle-mic="toggleMemberMic" @select-typing="selectMemberTyping">
          <template #controls>
            <div class="room-bottom-bar">
              <MemberModeControl v-if="me" class="room-main-control" :microphone-unavailable="roomMode === 'online' && !roomAsrEnabled" :member-name="me.name" :microphone="me.mic" :mode="me.mode" :preparing="inputMode === 'microphone' && asrState === 'starting'" allow-typing @toggle-mic="toggleMemberMic(me.id)" @select-typing="selectMemberTyping(me.id)" @menu-open="selfModeMenuOpen = $event" />
            </div>
          </template>
        </MemberCaptionGrid>
      </section>
      <TypingComposer v-if="typingEditorOpen && me?.mode === 'typing'" v-model:draft="typedDraft" :sending="typedSending" :now="now" :cooldown-until="nextTypedAt" @send="sendTypedCaption" @close="typingEditorOpen = false" />
      <ReactionSettings v-if="reactionSettingsOpen" :selected="selectedReactions" @save="updateReactionSelection" @close="reactionSettingsOpen = false" />
      <SoundSettings v-if="soundSettingsOpen" :preferences="soundPreferences" :state="soundState" :storage-failed="soundStorageFailed" @update="updateSoundPreferences" @preview="previewSound" @close="soundSettingsOpen = false" />
    </main>
  </div>
</template>
