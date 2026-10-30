<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
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
import { roomCodeFromPath, roomPath, roomShareUrl, shareRoomLink } from './roomNavigation'
import AccountAccess from './components/AccountAccess.vue'
import RoomPresets from './components/RoomPresets.vue'
import { createAccountClient, type AccountIdentity, type RoomPresetConfiguration } from './accountClient'
type Member = RoomMember
const glasses = ref(location.pathname === '/glasses')
const settingsOpen = ref(false)
const roomMode = ref<'simulation' | 'online'>('online')
const rememberedRooms = ref<RememberedRoom[]>(loadRememberedRooms())
const roomSessionToken = ref('')
const roomStatusVersion = ref(0)
const connecting = ref(false), selfId = ref('')
const roomPasswordOpen = ref(false), roomPasswordMessage = ref('')
let roomEntryOperation = 0, roomAccessClient: ReturnType<typeof createAccountClient> | undefined
let roomClient: ReturnType<typeof createRoomClient> | undefined
const joined = ref(false), mode = ref<'create' | 'join'>('create'), name = ref(''), code = ref(''), room = ref(''), error = ref('')
const sharing = ref(false), shareMessage = ref(''), manualShare = ref(false)
const shareUrl = computed(() => room.value ? roomShareUrl(room.value, location.origin) : '')
let shareOperation = 0
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
async function unlockSound() { await reactionSound.unlock(); soundState.value = reactionSound.getState() }
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
  const message = ['agree', 'disagree', 'question', 'received'].includes(option.type) ? `${option.emoji} ${sender.name} ${option.label}了 ${target.name}` : `${option.emoji} ${sender.name} 对 ${target.name}：${option.label}`
  reactions.value = [...reactions.value, { ...event, message, expiresAt: Date.now() + REACTION_DURATION_MS }].slice(-24)
  void playReactionSound(event.reaction)
}
function sendReaction(targetId: string, reaction: ReactionType) {
  if (!joined.value || !me.value || targetId === me.value.id || !members.value.some(member => member.id === targetId) || !QUICK_REACTIONS.some(option => option.type === reaction)) return
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
const adaptiveCards = ref(false)
const accountUser = ref<AccountIdentity | null>(null), presetsOpen = ref(false), accountMessage = ref('')
let displayNameEdited = false
function markDisplayNameEdited() { displayNameEdited = true }
let presetLinkHandled = false, presetLinkClient: ReturnType<typeof createAccountClient> | undefined
function updateAccountIdentity(user: AccountIdentity | null) {
  accountUser.value = user
  if (user && !joined.value && !connecting.value && !displayNameEdited) name.value = user.nickname
  if (user && !presetLinkHandled) {
    const presetId = new URL(location.pathname + (location.search ?? ''), location.origin).searchParams.get('preset')
    if (presetId && /^[a-f0-9-]{36}$/.test(presetId)) { presetLinkHandled = true; void loadLinkedPreset(presetId, user.uid) }
  }
}
async function loadLinkedPreset(id: string, uid: string) {
  presetLinkClient = createAccountClient()
  try {
    const result = await presetLinkClient.presets()
    if (accountUser.value?.uid !== uid) return
    const preset = result.presets.find(item => item.id === id)
    if (!preset) { accountMessage.value = '这份存档不存在，或不属于当前登录账号。'; return }
    if (joined.value || connecting.value) { accountMessage.value = '返回首页后可在个人房间存档中加载设置。'; return }
    loadRoomPreset(preset.configuration)
    window.history.replaceState(null, '', location.pathname)
  } catch { if (accountUser.value?.uid === uid) accountMessage.value = '无法读取存档，请在个人房间存档中刷新重试。' }
  finally { presetLinkClient?.cancel(); presetLinkClient = undefined }
}
function loadRoomPreset(configuration: RoomPresetConfiguration) {
  if (joined.value || connecting.value) return
  asrProvider.value = configuration.asrProvider
  adaptiveCards.value = configuration.adaptiveCards
  presetsOpen.value = false
  accountMessage.value = '已加载存档设置，请选择创建或加入房间，麦克风仍需手动开启。'
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
  members.value.push({ id: crypto.randomUUID(), name: character.name, mic: inputMode.value === 'simulation', color: character.color })
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
  roomEntryOperation++; roomAccessClient?.cancel(); roomAccessClient = undefined
  roomClient?.close(); connecting.value = false; roomPasswordOpen.value = false; roomPasswordMessage.value = ''
}
async function enter(password?: string | Event) {
  error.value = ''
  if (!name.value.trim()) { error.value = '请先填写你的显示名称。'; return }
  if (mode.value === 'join' && !/^\d{6}$/.test(code.value)) { error.value = '请输入 6 位数字房间码。'; return }
  void unlockSound()
  if (roomMode.value === 'online') {
    if (connecting.value) return
    connecting.value = true
    roomClient?.close()
    const operation = ++roomEntryOperation
    const submittedPassword = typeof password === 'string' ? password : undefined
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
          connecting.value = false; roomPasswordOpen.value = true; roomPasswordMessage.value = access.message ?? '请输入四位入房码。'
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
        room.value = roomCode; selfId.value = memberId
        roomPasswordOpen.value = false; roomPasswordMessage.value = ''
        roomSessionToken.value = roomClient?.getToken() ?? ''
        rememberedRooms.value = rememberRoom(rememberedRooms.value, { code: roomCode, name: name.value.trim(), ownerToken: ownership?.ownerToken }, aliases)
        settingsOpen.value = mode.value === 'create'
        inputMode.value = 'microphone'; captions.value = []; joined.value = true; connecting.value = false
        if (mode.value === 'create' && accountUser.value && ownership.ownerToken) {
          const client = createAccountClient()
          void client.bindRoom(roomCode, ownership.ownerToken).then(() => {
            rememberedRooms.value = forgetRoomOwnership(rememberedRooms.value, roomCode)
            accountMessage.value = '房间已绑定账号，可在个人中心跨设备管理。'
          }).catch(() => { if (room.value === roomCode) error.value = '房间已创建，但账号绑定未完成；请在房间设置中登录后重试绑定。' }).finally(() => client.cancel())
        }
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
        if (joined.value) receiveCaption(captions.value, event.memberId, event.utteranceId, event.text, event.state, Date.now())
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
        finishTypedSend()
        if (!joined.value) { connecting.value = false; roomClient?.close() }
      },
      onPasswordRequired(roomCode, message) {
        if (operation !== roomEntryOperation) return
        code.value = roomCode; connecting.value = false; roomPasswordOpen.value = true; roomPasswordMessage.value = message
      },
      onAccessRevoked(roomCode, message) {
        leave(false); mode.value = 'join'; code.value = roomCode
        roomPasswordOpen.value = true; roomPasswordMessage.value = message
      },
      onRoomStatus(status) {
        roomStatusVersion.value++
        if (status.bound && room.value) rememberedRooms.value = forgetRoomOwnership(rememberedRooms.value, room.value)
        if (asrProvider.value === 'doubao' && (!status.asrEnabled || !status.configured)) {
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
  members.value = [{ id: crypto.randomUUID(), name: name.value.trim(), mic: inputMode.value === 'simulation', color: characterAt(0).color }]
  for (let i = 0; i < 3; i++) addMember()
  joined.value = true
  now.value = Date.now()
}
// Recognition adapter: a stable utterance ID connects interim updates to its final result.
function recognize(memberId: string, id: string, text: string, state: Caption['state']) {
  if (!joined.value || !members.value.some(m => m.id === memberId && m.mic)) return
  receiveCaption(captions.value, memberId, id, text, state, Date.now())
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
  roomEntryOperation++; roomAccessClient?.cancel(); roomAccessClient = undefined
  roomPasswordOpen.value = false; roomPasswordMessage.value = ''
  asr.stop()
  roomClient?.close(); roomClient = undefined
  connecting.value = false; selfId.value = ''; roomSessionToken.value = ''; settingsOpen.value = false
  clearMicUsage()
  joined.value = false; members.value = []; captions.value = []; pending = []
  finishTypedSend(); typedDraft.value = ''; typingEditorOpen.value = false; reactions.value = []; nextReactionAt.value = 0; nextTypedAt.value = 0; reactionSound.close()
  reactionSettingsOpen.value = false
  soundSettingsOpen.value = false; soundState.value = reactionSound.getState()
  scenarioRunning.value = false; simulationStarted.value = null; error.value = ''
  shareOperation++; sharing.value = false; shareMessage.value = ''; manualShare.value = false; copied.value = false
  if (updateLocation && location.pathname !== '/') {
    window.history.pushState(null, '', '/')
    prepareRoomEntry()
  }
}
function reenterRoom(saved: RememberedRoom) {
  if (connecting.value) return
  roomMode.value = 'online'; mode.value = 'join'; code.value = saved.code
  if (!name.value.trim()) name.value = saved.name
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
function unlockReactionSound() { if (joined.value && soundEnabled.value) void unlockSound() }
window.addEventListener('pointerdown', unlockReactionSound)
window.addEventListener('keydown', unlockReactionSound)
onUnmounted(() => {
  roomEntryOperation++; roomAccessClient?.cancel(); roomAccessClient = undefined
  finishTypedSend(); reactionSound.close()
  window.removeEventListener('pointerdown', unlockReactionSound)
  window.removeEventListener('keydown', unlockReactionSound)
  presetLinkClient?.cancel()
  asr.stop(); roomClient?.close(); clearInterval(timer); pending = []
  shareOperation++
  window.removeEventListener('pagehide', handlePageHide)
  window.removeEventListener('popstate', handleHistoryNavigation)
})
const copied = ref(false)
async function copyCode() { try { await navigator.clipboard.writeText(room.value); copied.value = true; setTimeout(() => copied.value = false, 2000) } catch { error.value = `请手动复制房间码：${room.value}` } }
async function shareCurrentRoom() {
  if (!joined.value || roomMode.value !== 'online' || sharing.value) return
  const operation = ++shareOperation
  sharing.value = true; shareMessage.value = ''; manualShare.value = false
  const result = await shareRoomLink(room.value, location.origin)
  if (operation !== shareOperation) return
  sharing.value = false
  shareMessage.value = result === 'copied' ? '房间链接已复制' : result === 'shared' ? '已分享房间链接' : result === 'unavailable' ? '请复制下方房间链接' : ''
  manualShare.value = result === 'unavailable'
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
  <div v-else class="app-shell" :class="{ 'in-room': joined }">
    <header v-if="!joined" class="header"><a class="brand" href="/"><span class="brand-icon">≋</span>实时字幕<span class="brand-en">LIVE CAPTIONS</span></a><div class="header-links"><AccountAccess @identity="updateAccountIdentity" /><a class="glasses-link" href="/glasses">▱ AR 预览 <span>↗</span></a></div></header>
    <RoomPresets v-if="presetsOpen" :user="accountUser" :configuration="{ schemaVersion: 1, asrProvider, adaptiveCards }" :can-load="!joined && !connecting" @close="presetsOpen = false" @load="loadRoomPreset" />
    <RoomPasswordPrompt v-if="roomPasswordOpen && !joined" :room-code="code" :busy="connecting" :message="roomPasswordMessage" :signed-in="!!accountUser" @submit="enter" @cancel="cancelRoomPassword" />
    <main v-if="!joined" class="landing">
      <section class="intro"><div class="eyebrow"><span class="dot"></span> 多人实时字幕 · 保留模拟测试</div><h1>多人<span>实时字幕</span></h1><p>按成员显示实时字幕，让每句话随时间自然消散。</p><div class="feature-tags"><span>◎ 最多 8 名成员</span><span>◷ 每句话独立渐隐</span><span>✦ 无字幕历史记录</span></div></section>
      <section class="entry-card">
        <span class="small-label">房间设置</span><h2>创建或加入房间</h2>
        <p>输入显示名称，与伙伴进入同一个房间。豆包 API 在房间内配置。</p>
        <button class="personal-presets-button" type="button" @click="presetsOpen = true">个人房间存档</button>
        <p v-if="accountMessage" class="preset-loaded-message" role="status">{{ accountMessage }}</p>
        <div v-if="rememberedRooms.length" class="remembered-rooms" aria-label="保留的房间">
          <h3>你的房间</h3><p>所有人退出后仍可再次进入，不保留字幕。</p>
          <div v-for="saved in rememberedRooms" :key="saved.code" class="remembered-room">
            <div><strong>房间 {{ saved.code }}</strong><small>{{ saved.ownerToken ? '本机匿名创建凭据 · 权限由服务器验证' : '之前加入的房间 · 不代表所有权' }}</small></div>
            <button :disabled="connecting" @click="reenterRoom(saved)">再次进入</button>
          </div>
          <small>房间入口保存在当前浏览器；清除浏览器数据会失去创建者管理身份。</small>
        </div>
        <label for="room-mode">使用方式</label>
        <select id="room-mode" v-model="roomMode" :disabled="connecting"><option value="online">真实联网房间</option><option value="simulation">本地模拟演示</option></select>
        <div class="mode-tabs"><button :disabled="connecting" :class="{ selected: mode === 'create' }" @click="mode = 'create'; error = ''">创建房间</button><button :disabled="connecting" :class="{ selected: mode === 'join' }" @click="mode = 'join'; error = ''">加入房间</button></div>
        <form @submit.prevent="enter"><fieldset :disabled="connecting">
          <label for="display-name">显示名称</label><input id="display-name" v-model="name" maxlength="20" placeholder="输入显示名称" autocomplete="nickname" @input="markDisplayNameEdited"/>
          <template v-if="mode === 'join'"><label for="room-code">房间码</label><input id="room-code" v-model="code" maxlength="6" inputmode="numeric" placeholder="输入 6 位数字房间码"/></template>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button class="primary" type="submit">{{ connecting ? '正在连接…' : mode === 'create' ? '创建房间' : '加入房间' }} <span>→</span></button>
        </fieldset></form>
        <div class="privacy-note">♧ 字幕确认后显示 3、6 或 10 秒，再用 2 秒渐隐清除。</div>
        <div class="demo-note"><span>{{ roomMode === 'online' ? '联网' : 'DEMO' }}</span>{{ roomMode === 'online' ? '房间最多 8 人，各自手动开麦。房间码与配置会保留，音频和字幕不保存。' : '本地模拟互不联网，不采集音频；也可在房间内切换真实麦克风。' }}</div>
      </section>
    </main>
    <main v-else class="room-layout">
      <header class="room-topbar">
        <div class="room-heading">
          <button v-if="roomMode === 'online'" class="share-room" type="button" aria-label="分享房间链接" title="分享房间链接" :disabled="sharing" @click="shareCurrentRoom">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
          </button>
          <div><h1>字幕房间</h1><button class="copy-room" @click="copyCode" aria-label="复制房间码">{{ room }} · {{ copied ? '已复制' : '复制房间码' }}</button></div>
        </div>
        <div class="room-actions"><AccountAccess @identity="updateAccountIdentity" /><button aria-label="全局音效设置" :aria-expanded="soundSettingsOpen" @click="openSoundSettings">音效：{{ soundEnabled ? '开' : '关' }}</button><button @click="presetsOpen = true">个人存档</button><button @click="settingsOpen = !settingsOpen" :aria-expanded="settingsOpen">房间设置</button><button class="room-exit" @click="leave()">返回首页</button></div>
      </header>
      <p v-if="shareMessage" class="share-message" role="status">{{ shareMessage }}</p>
      <input v-if="manualShare" class="manual-share" aria-label="房间分享链接" :value="shareUrl" readonly @focus="($event.target as HTMLInputElement).select()"/>
      <RoomApiSettings v-if="settingsOpen && roomMode === 'online'" :key="room + ':' + !!rememberedRooms.find(saved => saved.code === room)?.ownerToken" :token="roomSessionToken" :code="room" :status-version="roomStatusVersion" :owner-token="rememberedRooms.find(saved => saved.code === room)?.ownerToken" @bound="rememberedRooms = forgetRoomOwnership(rememberedRooms, room)" @close="settingsOpen = false" />
      <ApiSettings v-if="settingsOpen && roomMode === 'simulation'" @close="settingsOpen = false" />
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
      <div v-if="inputMode === 'microphone'" class="room-demo-controls">
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
      <p v-else class="room-grid-note">普通话 · {{ roomMode === 'online' ? '每人独立开麦，字幕同步到同房成员' : '仅“我”接收真实语音' }} · {{ asrProvider === 'doubao' ? '本地检测到说话后上传至豆包，按服务用量计费' : '音频可能发送至浏览器语音服务' }}</p>
      <label class="layout-experiment"><input v-model="adaptiveCards" type="checkbox" />{{ adaptiveCards ? '动态自适应布局（实验）' : '固定等分布局（原版）' }}</label>
      <section class="room-stage" aria-label="房间内容">
        <MemberCaptionGrid :adaptive="adaptiveCards" :members="members" :captions="captions" :now="now" :self-id="me?.id" :starting-member-id="asrState === 'starting' ? me?.id : undefined" :protected-member-id="selfModeMenuOpen || ['starting', 'reconnecting', 'error'].includes(asrState) ? me?.id : undefined" :live-input="inputMode === 'microphone'" :online-room="roomMode === 'online'" :typed-draft="typedDraft" :reactions="reactions" :reaction-cooldown-until="nextReactionAt" :selected-reactions="selectedReactions" @edit-typed="typingEditorOpen = true" @react="sendReaction" @reaction-settings="reactionSettingsOpen = true" @toggle-mic="toggleMemberMic" @select-typing="selectMemberTyping" />
      </section>
      <TypingComposer v-if="typingEditorOpen && me?.mode === 'typing'" v-model:draft="typedDraft" :sending="typedSending" :now="now" :cooldown-until="nextTypedAt" @send="sendTypedCaption" @close="typingEditorOpen = false" />
      <ReactionSettings v-if="reactionSettingsOpen" :selected="selectedReactions" @save="updateReactionSelection" @close="reactionSettingsOpen = false" />
      <SoundSettings v-if="soundSettingsOpen" :preferences="soundPreferences" :state="soundState" :storage-failed="soundStorageFailed" @update="updateSoundPreferences" @preview="previewSound" @close="soundSettingsOpen = false" />
      <p v-if="error" class="room-error error" role="alert">{{ error }}</p>
      <p v-if="inputMode === 'microphone'" class="room-grid-note" :class="{ error: asrState === 'error' }" role="status">{{ me?.mode === 'typing' ? '打字模式 · 点击自己的字幕区域输入；切换模式保留草稿，离房清空' : asrMessage }}</p>
      <p v-if="inputMode === 'microphone' && asrProvider === 'doubao' && micStartedAt !== null" class="room-grid-note" aria-label="本次开麦音频用量">
        本次开麦 {{ formatUsageDuration(micOpenSeconds) }} · 提交 {{ formatUsageDuration(usageTotals.submitted) }} · 发送完成 {{ formatUsageDuration(usageTotals.completed) }} · 豆包返回 {{ usageTotals.returnedSegments ? formatUsageDuration(usageTotals.returned) : '尚无时长' }}
        <small>豆包返回的是响应中的音频时长，不是账单计费时长；本次数据仅存页面内存。</small>
      </p>
      <p class="room-grid-note">{{ stressProgress || '确认后按字数显示 3 / 6 / 10 秒，再渐隐 2 秒 · 无历史回看' }}</p>
      <p class="room-grid-note" title="闭麦且无字幕连续 5 秒后，卡片收起到底部头像栏">短按开关麦 · 长按、右键或 ‹ 打字</p>
      <div class="room-bottom-bar">
        <div><strong>{{ inputMode === 'simulation' ? '模拟测试' : '真实麦克风' }}</strong><small>{{ inputMode === 'simulation' ? '未采集音频' : asrProvider === 'doubao' ? '豆包 ASR 2.0 · 普通话' : '浏览器语音识别 · zh-CN' }}</small></div>
        <MemberModeControl v-if="me" :member-name="me.name" :microphone="me.mic" :mode="me.mode" :preparing="inputMode === 'microphone' && asrState === 'starting'" allow-typing labelled @toggle-mic="toggleMemberMic(me.id)" @select-typing="selectMemberTyping(me.id)" @menu-open="selfModeMenuOpen = $event" />
      </div>
    </main>
    <footer v-if="!joined"><span>实时字幕 · 面对面多人交流</span><span>多人联网 / 本地演示 <span class="footer-dot">●</span> 保留模拟测试</span></footer>
  </div>
</template>
