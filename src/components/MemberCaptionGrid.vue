<script setup lang="ts">
import { computed, reactive, watch, ref, onMounted, onUnmounted, nextTick, type ObjectDirective } from 'vue'
import { adaptiveLayout, type TileRect } from '../adaptiveLayout'
import { captionOpacity, type Caption } from '../captions'
import { DEFAULT_REACTION_TYPES, QUICK_REACTIONS, REACTION_SELECTION_LIMIT, type MemberMode, type ReactionType, type VisibleReaction } from '../roomInteractions'
import MemberModeControl from './MemberModeControl.vue'
import { updateMemberContraction, expandContractedMember, type MemberContractionState } from '../memberContraction'

const props = defineProps<{
  members: { id: string; name: string; mic: boolean; mode?: MemberMode }[]
  captions: Caption[]
  now: number
  selfId?: string
  startingMemberId?: string
  protectedMemberId?: string
  liveInput?: boolean
  onlineRoom?: boolean
  microphoneUnavailable?: boolean
  adaptive?: boolean
  entrances?: Record<string, number>
  typedDraft?: string
  reactions?: VisibleReaction[]
  reactionCooldownUntil?: number
  selectedReactions?: ReactionType[]
}>()
const emit = defineEmits<{ toggleMic: [id: string]; selectTyping: [id: string]; editTyped: []; react: [targetId: string, reaction: ReactionType]; reactionSettings: [] }>()
// 动画只消费字幕入口序号；几何布局和 interim 更新不能重新启动反馈。
const entranceAnimations = new Map<string, Animation[]>()
watch(() => props.entrances, async (current, previous = {}) => {
  await nextTick()
  for (const [id, sequence] of Object.entries(current ?? {})) {
    if (sequence === previous[id]) continue
    for (const animation of entranceAnimations.get(id) ?? []) animation.cancel()
    entranceAnimations.delete(id)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) continue
    const card = gridElement.value?.querySelector<HTMLElement>(`[data-member-id="${CSS.escape(id)}"]`)
    if (!card?.animate) continue
    const animations = [card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.015)', offset: .35 }, { transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' })]
    for (const [index, ring] of Array.from(card.querySelectorAll<HTMLElement>('.speech-ring')).entries()) {
      animations.push(ring.animate([{ transform: 'scale(.8)', opacity: .55 }, { transform: 'scale(1.65)', opacity: 0 }], { duration: 650, delay: index * 90, easing: 'ease-out', fill: 'backwards' }))
    }
    entranceAnimations.set(id, animations)
    void Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => { if (entranceAnimations.get(id) === animations) entranceAnimations.delete(id) })
  }
}, { deep: false, flush: 'post' })
const contractionStates = reactive(new Map<string, MemberContractionState>())
const pressedMembers = reactive(new Map<number, string>())
const focusedMemberId = ref<string | null>(null), modeMenuMemberId = ref<string | null>(null)
const selectedReactionOptions = computed(() => (props.selectedReactions ?? DEFAULT_REACTION_TYPES).slice(0, REACTION_SELECTION_LIMIT).flatMap(type => QUICK_REACTIONS.filter(option => option.type === type)))
const reactionMenu = ref<{ memberId: string; left: number; top: number } | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | undefined
let pressStart: { x: number; y: number; pointerId: number } | undefined
let suppressTouchContextMenuUntil = 0
let suppressedClickMemberId: string | undefined
function cancelLongPress() { clearTimeout(longPressTimer); pressStart = undefined }
function isCardControl(target: EventTarget | null) {
  return !!(target as HTMLElement | null)?.closest('.member-mode-control, .start-typing, input, textarea, select, [contenteditable="true"]')
}
function openReactionMenu(memberId: string, x: number, y: number) {
  if (!props.selfId || !props.members.some(member => member.id === memberId)) return
  // 贴底头像优先向上展开，并避开原按压点，防止松手误点菜单。
  const menuHeight = Math.min(264, window.innerHeight - 16)
  const top = y + menuHeight + 20 <= window.innerHeight ? y + 12 : y - menuHeight - 12
  reactionMenu.value = { memberId, left: Math.max(8, Math.min(x, window.innerWidth - 224)), top: Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8)) }
}
function handleCardContextMenu(event: MouseEvent, memberId: string) {
  if (!props.selfId || event.defaultPrevented || isCardControl(event.target)) return
  event.preventDefault()
  // 触屏只由长按计时器打开，系统 contextmenu 不应提前弹出或重定位菜单。
  if ((event as PointerEvent).pointerType === 'touch' || (event as PointerEvent).pointerType === 'pen' || Date.now() < suppressTouchContextMenuUntil) return
  openReactionMenu(memberId, event.clientX, event.clientY)
}
function handleCardKeydown(event: KeyboardEvent, memberId: string) {
  if (event.key !== 'Enter' || event.target !== event.currentTarget) return
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  openReactionMenu(memberId, rect.left, rect.top)
}
function startLongPress(event: PointerEvent, memberId: string) {
  focusedMemberId.value = null
  pressedMembers.set(event.pointerId, memberId)
  suppressedClickMemberId = undefined
  cancelLongPress()
  // 麦克风有独立的长按打字手势，编辑控件保留原生操作。
  if (!props.selfId || isCardControl(event.target) || event.pointerType === 'mouse' || !event.isPrimary) return
  suppressTouchContextMenuUntil = Date.now() + 1000
  pressStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  longPressTimer = setTimeout(() => {
    openReactionMenu(memberId, event.clientX, event.clientY)
    suppressedClickMemberId = memberId; pressStart = undefined
  }, 500)
}
function moveLongPress(event: PointerEvent) {
  if (pressStart && (event.pointerId !== pressStart.pointerId || Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10)) cancelLongPress()
}
function finishLongPress(event: PointerEvent) {
  pressedMembers.delete(event.pointerId)
  if (event.pointerType !== 'mouse') suppressTouchContextMenuUntil = Date.now() + 700
  cancelLongPress()
}
function handleCardClick(event: MouseEvent, memberId: string) {
  // 长按后的合成点击不能打开自己的打字框或展开已收起的头像。
  if (event.detail !== 0 && suppressedClickMemberId === memberId) {
    suppressedClickMemberId = undefined
    event.preventDefault(); event.stopPropagation()
  }
}
function dismissReactionMenu(event: PointerEvent) {
  if (!(event.target as HTMLElement).closest('.reaction-menu')) reactionMenu.value = null
}
function handleEscape(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') reactionMenu.value = null
}
function handleFocusOut(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) focusedMemberId.value = null
}
function handleFocusIn(event: FocusEvent, memberId: string) {
  // 点击闭麦后按钮会保留焦点；只保护键盘焦点，不能因此永远不收起。
  focusedMemberId.value = (event.target as HTMLElement).matches(':focus-visible') ? memberId : null
}
function cancelInteractions() { pressedMembers.clear(); cancelLongPress(); suppressedClickMemberId = undefined }
function restoreMember(memberId: string, event: MouseEvent) {
  if (memberId !== props.selfId || reactionMenu.value?.memberId === memberId) return
  focusedMemberId.value = null
  expandContractedMember(contractionStates, memberId, props.now)
  if (event.detail === 0) nextTick(() => gridElement.value?.querySelector<HTMLElement>(`[data-member-id="${CSS.escape(memberId)}"]`)?.focus({ preventScroll: true }))
}
function handleAvatarKeydown(event: KeyboardEvent, memberId: string) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  openReactionMenu(memberId, rect.left, rect.top)
}
function selectReaction(reaction: ReactionType) {
  const target = reactionMenu.value?.memberId
  reactionMenu.value = null
  if (target && props.now >= (props.reactionCooldownUntil ?? 0)) emit('react', target, reaction)
}
function openReactionSettings() { reactionMenu.value = null; emit('reactionSettings') }
function editTypedCaption(memberId: string) {
  if (memberId !== props.selfId || !tiles.value.find(member => member.id === memberId)?.typing) return
  emit('editTyped')
}
watch(() => props.members.map(member => member.id), ids => { if (reactionMenu.value && !ids.includes(reactionMenu.value.memberId)) reactionMenu.value = null })

// Remember the most recently introduced sentence, not the last surviving one.
// Its ID stays here after expiry so older captions never regain emphasis.
const latestCaptionIds = reactive(new Map<string, string>())
watch(() => props.captions.map(c => ({ memberId: c.memberId, id: c.id })), (current, previous = []) => {
  const previousIds = new Set(previous.map(c => JSON.stringify([c.memberId, c.id])))
  for (const caption of current) {
    if (!previousIds.has(JSON.stringify([caption.memberId, caption.id]))) {
      latestCaptionIds.set(caption.memberId, caption.id)
    }
  }
}, { immediate: true })
watch(() => props.members.map(member => member.id), ids => {
  for (const memberId of latestCaptionIds.keys()) {
    if (!ids.includes(memberId)) latestCaptionIds.delete(memberId)
  }
})

const gridElement = ref<HTMLElement | null>(null)
const tileRects = ref<TileRect[]>([])
const compactCards = ref(false)
let layoutTimer: ReturnType<typeof setInterval> | undefined
let layoutObserver: ResizeObserver | undefined
let previousSize = ''
function measureLayout(force = false) {
  const grid = gridElement.value
  if (!grid || !props.adaptive) return
  const cards = Array.from(grid.querySelectorAll<HTMLElement>('.member-tile'))
  const gap = parseFloat(getComputedStyle(grid).gap) || 8
  const rowCount = cards.length <= 2 ? cards.length : Math.ceil(cards.length / 2)
  compactCards.value = grid.clientHeight < rowCount * 80 + Math.max(0, rowCount - 1) * gap
  const size = `${grid.clientWidth}:${grid.clientHeight}:${cards.length}:${gap}`
  const minimum = Math.max(80, ...cards.map(card => {
    const style = getComputedStyle(card)
    return (card.querySelector<HTMLElement>('.tile-heading')?.offsetHeight ?? 44)
      + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 22
  }))
  const demands = cards.map(card => card.querySelector('.caption-message')
    ? card.querySelector<HTMLElement>('.caption-flow')!.getBoundingClientRect().height : 0)
  const next = adaptiveLayout(grid.clientWidth, grid.clientHeight, demands, gap, minimum)
  const balanced = demands.every(demand => Math.ceil(demand / 32) === Math.ceil((demands[0] ?? 0) / 32))
  if (force || size !== previousSize || next.some((rect, i) => {
    const old = tileRects.value[i]
    return !old || Math.abs(rect.height - old.height) >= (balanced ? .5 : 12) || Math.abs(rect.top - old.top) >= (balanced ? .5 : 12)
  })) tileRects.value = next
  previousSize = size
}
function tileStyle(index: number) {
  const rect = props.adaptive ? tileRects.value[index] : undefined
  return rect ? { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` } : undefined
}
onMounted(() => {
  window.addEventListener('pointerdown', dismissReactionMenu)
  window.addEventListener('pointerup', finishLongPress)
  window.addEventListener('pointercancel', finishLongPress)
  window.addEventListener('keydown', handleEscape)
  window.addEventListener('blur', cancelInteractions)
  layoutObserver = new ResizeObserver(() => measureLayout())
  if (gridElement.value) layoutObserver.observe(gridElement.value)
  measureLayout(true)
  layoutTimer = setInterval(() => measureLayout(), 600)
})
onUnmounted(() => {
  for (const animations of entranceAnimations.values()) for (const animation of animations) animation.cancel()
  entranceAnimations.clear()
  clearInterval(layoutTimer); layoutObserver?.disconnect(); cancelLongPress(); pressedMembers.clear(); contractionStates.clear()
  window.removeEventListener('pointerdown', dismissReactionMenu)
  window.removeEventListener('pointerup', finishLongPress)
  window.removeEventListener('pointercancel', finishLongPress)
  window.removeEventListener('keydown', handleEscape)
  window.removeEventListener('blur', cancelInteractions)
})

const scrollObservers = new WeakMap<HTMLElement, ResizeObserver>()
const vCaptionScroll: ObjectDirective<HTMLElement> = {
  mounted(element) {
    const followLatest = () => {
      const overflow = element.scrollHeight - element.clientHeight
      element.scrollTop = overflow > 0 ? overflow : 0
    }
    // Observe both the viewport and the flow: interim growth, expired messages,
    // font changes and changes to the member grid can all affect overflow.
    const observer = new ResizeObserver(followLatest)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    scrollObservers.set(element, observer)
    followLatest()
  },
  beforeUnmount(element) {
    scrollObservers.get(element)?.disconnect()
    scrollObservers.delete(element)
  },
}

// Membership order controls placement. New speech never moves a tile.
const tiles = computed(() => props.members.slice(0, 8).map(member => {
  const captions = props.captions.filter(c => c.memberId === member.id)
  const speaking = member.mic && captions.some(c => c.state === 'interim')
  return { ...member, captions, speaking, typing: member.mode === 'typing', preparing: member.id === props.startingMemberId }
}))
const visibleTiles = computed(() => tiles.value.filter(member => !contractionStates.get(member.id)?.contracted))
const contractedTiles = computed(() => tiles.value.filter(member => contractionStates.get(member.id)?.contracted))
watch(() => ({ now: props.now, members: tiles.value.map(member => ({
  id: member.id,
  muted: !member.mic && member.mode !== 'typing',
  hasText: member.captions.some(caption => caption.text.trim() && captionOpacity(caption, props.now) > 0),
  protected: member.id === props.startingMemberId || member.id === props.protectedMemberId || member.id === focusedMemberId.value
    || member.id === modeMenuMemberId.value || member.id === reactionMenu.value?.memberId || [...pressedMembers.values()].includes(member.id),
})) }), ({ members, now }) => updateMemberContraction(contractionStates, members, now), { immediate: true })
watch(() => [props.adaptive, visibleTiles.value.map(member => member.id).join(',')], async () => {
  await nextTick(); measureLayout(true)
})
</script>

<template>
  <div class="member-caption-surface">
  <div ref="gridElement" class="member-caption-grid" :class="{ 'is-adaptive': adaptive && tileRects.length === visibleTiles.length, 'is-compact': adaptive && compactCards }" :data-count="visibleTiles.length" aria-label="按成员分区的实时字幕">
    <article v-for="(member, index) in visibleTiles" :key="member.id" class="member-tile reaction-target" :style="tileStyle(index)"
      :class="{ 'is-speaking': member.speaking, 'is-muted': !member.mic, 'is-typing': member.typing }"
      @pointerdown.capture="startLongPress($event, member.id)" @pointermove="moveLongPress"
      @click.capture="handleCardClick($event, member.id)"
      @focusin="handleFocusIn($event, member.id)" @focusout="handleFocusOut" @keydown.capture="focusedMemberId = member.id"
      @contextmenu="handleCardContextMenu($event, member.id)"
      @keydown="handleCardKeydown($event, member.id)"
      tabindex="0" aria-description="右键或长按发送快捷回应"
      :data-member-id="member.id" :aria-label="`${member.name}的字幕区域`">
      <div class="tile-heading">
        <span class="speech-avatar" aria-hidden="true">{{ Array.from(member.name).slice(0, 1).join('') }}<span class="speech-ring"></span><span class="speech-ring"></span></span>
        <div class="tile-identity">
          <h2 :title="member.name">{{ member.name }}<small v-if="member.id === selfId">（我）</small></h2>
          <span class="tile-status">{{ member.typing ? '打字模式' : member.preparing ? '麦克风准备中…' : liveInput && member.id !== selfId && !onlineRoom ? '未接入设备' : !member.mic ? '麦克风关闭' : liveInput ? '麦克风开启' : '模拟麦克风开启' }}</span>
        </div>
        <MemberModeControl :member-name="member.name" :microphone="member.mic" :microphone-unavailable="microphoneUnavailable" :mode="member.mode" :preparing="member.preparing" :disabled="liveInput && member.id !== selfId" :allow-typing="member.id === selfId"
          @toggle-mic="emit('toggleMic', member.id)" @select-typing="emit('selectTyping', member.id)" @menu-open="modeMenuMemberId = $event ? member.id : null" />
      </div>
      <div v-caption-scroll class="tile-text" :class="{ 'can-type': member.typing && member.id === selfId }" @click="editTypedCaption(member.id)" :aria-label="`${member.name}的当前字幕`" aria-live="polite" aria-relevant="additions text">
        <div class="caption-flow">
          <p v-for="caption in member.captions" :key="caption.id" class="caption-message"
            :class="{ 'is-latest': latestCaptionIds.get(member.id) === caption.id }"
            :data-state="caption.state" :data-caption-id="caption.id"
            :style="{ opacity: captionOpacity(caption, now) }">{{ caption.text }}</p>
          <p v-if="!member.captions.length" class="tile-placeholder">{{ member.typing ? member.id === selfId ? '点击这里输入文字…' : '等待打字字幕…' : member.preparing ? '正在准备麦克风与本地语音检测…' : member.mic ? '等待字幕…' : '麦克风已关闭' }}</p>
        </div>
      </div>
      <button v-if="member.typing && member.id === selfId" class="start-typing" @click.stop="editTypedCaption(member.id)">{{ typedDraft ? '继续编辑草稿' : '输入字幕' }}</button>
      <div class="reaction-bubbles" aria-live="polite" aria-atomic="false">
        <p v-for="reaction in (reactions ?? []).filter(reaction => reaction.targetId === member.id).slice(-3)" :key="reaction.id" class="reaction-bubble">{{ reaction.message }}</p>
      </div>
    </article>
    <div v-if="reactionMenu" class="reaction-menu" role="dialog" aria-label="快捷回应" :style="{ left: `${reactionMenu.left}px`, top: `${reactionMenu.top}px` }" @click.stop>
      <button v-for="option in selectedReactionOptions" :key="option.type" :disabled="now < (reactionCooldownUntil ?? 0)" @click="selectReaction(option.type)">{{ option.emoji }} {{ option.label }}</button>
      <small v-if="now < (reactionCooldownUntil ?? 0)">请稍后再回应</small>
      <div class="reaction-menu-footer"><button @click="reactionMenu = null">取消</button><button class="reaction-settings-trigger" @click="openReactionSettings">设置</button></div>
    </div>
    <p v-if="!visibleTiles.length" class="grid-empty">
      <span>{{ tiles.length ? '没人说话喵' : '暂无成员' }}</span>
      <span v-if="tiles.length" class="grid-empty-face" role="img" aria-label="睡着的猫">
        <span class="grid-empty-snooze" aria-hidden="true"><span>z</span><span>Z</span></span>
        <span class="grid-empty-cat" aria-hidden="true"><span>(^_</span><svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" focusable="false"><path d="M1 1.5c0 3 4 3 4 0 0 3 4 3 4 0" /></svg><span>_^)</span></span>
      </span>
    </p>
  </div>
  <div v-if="contractedTiles.length || $slots.controls" class="member-bottom-dock">
  <div v-if="contractedTiles.length" class="contracted-members" aria-label="已收起的闭麦成员">
    <div v-for="member in contractedTiles" :key="member.id" class="contracted-member" :data-member-id="member.id"
      @pointerdown="startLongPress($event, member.id)" @pointermove="moveLongPress" @contextmenu="handleCardContextMenu($event, member.id)"
      @click.capture="handleCardClick($event, member.id)"
      @focusin="handleFocusIn($event, member.id)" @focusout="handleFocusOut" @keydown.capture="focusedMemberId = member.id">
      <button type="button" class="member-avatar" :aria-label="member.id === selfId ? `展开${member.name}的卡片（我），保持闭麦，长按或右键发送快捷回应` : `${member.name}，闭麦，长按或右键发送快捷回应`" :title="member.id === selfId ? `${member.name} · 闭麦 · 点击展开 · 长按或右键发送快捷回应` : `${member.name} · 闭麦 · 长按或右键发送快捷回应`" @click="restoreMember(member.id, $event)" @keydown="handleAvatarKeydown($event, member.id)">{{ Array.from(member.name).slice(0, 2).join('') }}<span aria-hidden="true" class="avatar-muted" :class="{ 'is-asr-disabled': microphoneUnavailable }"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8M3 3l18 18"/></svg></span></button>
      <span v-for="reaction in (reactions ?? []).filter(reaction => reaction.targetId === member.id).slice(-1)" :key="reaction.id" class="contracted-reaction" role="status" :title="reaction.message" :aria-label="reaction.message">{{ reaction.message.split(' ')[0] }}</span>
    </div>
  </div>
  <slot name="controls" />
  </div>
  </div>
</template>

<style scoped>
.member-caption-surface { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.member-caption-grid {
  --caption-size: 16px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.member-caption-grid[data-count="1"] { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
.member-caption-grid[data-count="2"] { grid-template-columns: minmax(0, 1fr); grid-template-rows: repeat(2, minmax(0, 1fr)); }
.member-caption-grid[data-count="3"], .member-caption-grid[data-count="4"] { grid-template-rows: repeat(2, minmax(0, 1fr)); }
.member-caption-grid[data-count="5"], .member-caption-grid[data-count="6"] { grid-template-rows: repeat(3, minmax(0, 1fr)); }
.member-caption-grid[data-count="3"] > :first-child,
.member-caption-grid[data-count="5"] > :first-child,
.member-caption-grid[data-count="7"] > :first-child { grid-column: 1 / -1; }
.member-caption-grid.is-adaptive > .member-tile {
  position: absolute;
  transition: top 300ms ease, height 300ms ease;
}
.member-tile {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 8px;
  border: 1px solid var(--home-border);
  border-radius: 8px;
  background: var(--room-card-bg);
  color: var(--home-text);
}
.is-compact .member-tile { padding: 4px; }
.is-compact :deep(.tile-mic) { width: 32px; height: 32px; min-height: 32px; }
.member-tile.is-speaking { border-color: #aeb2b6; box-shadow: inset 0 0 0 1px var(--home-bg); }
.tile-heading { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.speech-avatar { position: relative; display: grid; place-items: center; flex: 0 0 26px; height: 26px; border-radius: 50%; background: #dedfdb; font-size: 12px; }
.speech-ring { position: absolute; inset: 0; border: 1px solid #777; border-radius: 50%; opacity: 0; pointer-events: none; }
.tile-identity { flex: 1; min-width: 0; }
.tile-identity h2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 1.5; margin: 0; }
.tile-identity h2 small { font-size: 10px; font-weight: 400; }
.tile-status { display: block; font-size: 10px; line-height: 1.5; color: var(--home-secondary-text); }
/* Normal top-down flow. Hidden overflow permits automatic scrolling only;
   wheel, touch and keyboard cannot manually browse older captions. */
.tile-text { min-height: 0; flex: 1; overflow: hidden; overflow-anchor: none; overflow-wrap: anywhere; margin-top: 4px; }
.caption-flow { display: flow-root; width: 100%; }
.tile-text .caption-message { font-size: calc(var(--caption-size) * .88); font-weight: 400; }
.tile-text .caption-message.is-latest { font-size: var(--caption-size); font-weight: 700; }
.caption-message + .caption-message { margin-top: 8px; }
.tile-text p { margin: 0; font-size: var(--caption-size); line-height: 1.6; }
.tile-text .tile-placeholder { color: var(--home-secondary-text); font-size: 13px; }
.caption-message { white-space: pre-wrap; }
.reaction-target { -webkit-touch-callout: none; user-select: none; touch-action: pan-y; }
.can-type { cursor: text; }
.start-typing { width: 100%; min-height: 28px; padding: 4px 8px; font-size: 12px; flex-shrink: 0; }
.reaction-menu { position: fixed; z-index: 1000; width: 208px; max-height: calc(100dvh - 16px); overflow: auto; display: grid; gap: 3px; padding: 6px; background: var(--room-card-bg); color: var(--home-text); border: 1px solid var(--home-border); border-radius: 10px; box-shadow: 0 4px 18px #0003; }
.reaction-menu button { text-align: left; min-height: 34px; padding: 4px 10px; }
.reaction-menu small { padding: 0 10px; }
.reaction-menu-footer { display: flex; gap: 4px; border-top: 1px solid #e3e3e3; padding-top: 3px; }
.reaction-menu-footer button { flex: 1; }
.reaction-menu-footer .reaction-settings-trigger { flex: 0 0 auto; min-width: 56px; text-align: center; color: var(--home-secondary-text); }
.reaction-bubbles { position: absolute; right: 6px; top: 4px; z-index: 2; max-width: calc(100% - 12px); pointer-events: none; display: grid; gap: 3px; }
.reaction-bubble { margin: 0; padding: 3px 8px; border: 1px solid var(--home-border); border-radius: 12px; background: #dedfdb; color: var(--home-text); font-size: 12px; overflow-wrap: anywhere; box-shadow: 0 1px 4px #0001; }
.member-caption-grid[data-count="1"],
.member-caption-grid[data-count="2"] { --caption-size: 22px; }
/* 在原半透明白底上叠加10%黑色，提示文字独立保持白色。 */
.grid-empty { grid-column: 1 / -1; grid-row: 1 / -1; align-self: stretch; min-height: 0; display: grid; align-content: center; justify-items: center; gap: 10px; margin: 0; padding: 8px; border: 1px solid var(--home-border); border-radius: 8px; background: linear-gradient(rgb(0 0 0 / 10%), rgb(0 0 0 / 10%)), rgb(255 255 255 / 50%); color: #fff; text-align: center; font-size: 13px; line-height: 1.6; }
/* 等宽字符保持猫脸对称，睡眠符号独立排版，避免组合附标和下标造成错位。 */
.grid-empty-face { display: inline-flex; align-items: center; gap: 1px; font-family: Consolas, "Cascadia Mono", "SFMono-Regular", monospace; font-size: 18px; line-height: 1.3; white-space: pre; }
.grid-empty-cat { display: inline-flex; align-items: baseline; gap: .18em; }
.grid-empty-cat > svg { align-self: flex-end; width: 8px; height: 5px; margin-bottom: 2px; flex-shrink: 0; }
.grid-empty-snooze { display: inline-flex; align-items: flex-start; gap: 1px; align-self: flex-start; margin-top: -3px; font-weight: 600; line-height: 1; }
.grid-empty-snooze > span:first-child { font-size: 9px; }
.grid-empty-snooze > span:last-child { margin-top: 4px; font-size: 13px; }
.member-bottom-dock { flex-shrink: 0; display: flex; align-items: flex-end; gap: 12px; min-height: 64px; padding-bottom: 6px; }
.contracted-members { flex: 1; min-width: 0; display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px; }
.contracted-member { position: relative; flex: 0 0 44px; min-width: 0; text-align: center; user-select: none; -webkit-touch-callout: none; touch-action: pan-x; }
.member-avatar { position: relative; display: block; width: 44px; height: 44px; margin: 0 auto; padding: 0; border: 1px solid var(--home-border); border-radius: 50%; background: var(--room-card-bg); color: var(--home-text); font-size: 13px; }
.avatar-muted { position: absolute; display: grid; place-items: center; bottom: -1px; right: -2px; width: 16px; height: 16px; border-radius: 50%; background: #777; color: white; }
.avatar-muted.is-asr-disabled { background: var(--muted-microphone-color); }
.contracted-reaction { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 10px; line-height: 1.6; }
.contracted-reaction { position: absolute; top: -2px; right: 0; padding: 1px 4px; border-radius: 10px; background: #dedfdb; color: var(--home-text); font-size: 14px; }
@media (prefers-reduced-motion: reduce) { .member-caption-grid.is-adaptive > .member-tile { transition: none; } }
@media (max-height: 650px) { .member-tile { padding: 6px; } }
@media (max-width: 350px) {
  .member-caption-grid { gap: 6px; }
  .member-tile { padding: 6px; }
  .tile-identity h2 { font-size: 12px; }
  .member-caption-grid:not([data-count="1"]):not([data-count="2"]) { --caption-size: 14px; }
}
</style>
