<script setup lang="ts">
import { computed, reactive, watch, ref, onMounted, onUnmounted, nextTick, type ObjectDirective } from 'vue'
import { adaptiveLayout, type TileRect } from '../adaptiveLayout'
import { captionOpacity, type Caption } from '../captions'
import { DEFAULT_REACTION_TYPES, QUICK_REACTIONS, REACTION_SELECTION_LIMIT, type MemberMode, type ReactionType, type VisibleReaction } from '../roomInteractions'

const props = defineProps<{
  members: { id: string; name: string; mic: boolean; mode?: MemberMode }[]
  captions: Caption[]
  now: number
  selfId?: string
  startingMemberId?: string
  liveInput?: boolean
  onlineRoom?: boolean
  adaptive?: boolean
  typedDraft?: string
  reactions?: VisibleReaction[]
  reactionCooldownUntil?: number
  selectedReactions?: ReactionType[]
}>()
const emit = defineEmits<{ toggleMic: [id: string]; editTyped: []; react: [targetId: string, reaction: ReactionType]; reactionSettings: [] }>()
const selectedReactionOptions = computed(() => (props.selectedReactions ?? DEFAULT_REACTION_TYPES).slice(0, REACTION_SELECTION_LIMIT).flatMap(type => QUICK_REACTIONS.filter(option => option.type === type)))
const reactionMenu = ref<{ memberId: string; left: number; top: number } | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | undefined
let pressStart: { x: number; y: number; pointerId: number } | undefined
let suppressTouchContextMenuUntil = 0
function cancelLongPress() { clearTimeout(longPressTimer); pressStart = undefined }
function openReactionMenu(memberId: string, x: number, y: number) {
  if (!props.selfId || memberId === props.selfId) return
  reactionMenu.value = { memberId, left: Math.max(8, Math.min(x, window.innerWidth - 224)), top: Math.max(8, Math.min(y, window.innerHeight - 264)) }
}
function handleCardContextMenu(event: MouseEvent, memberId: string) {
  if (!props.selfId || memberId === props.selfId) return
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
  if (memberId === props.selfId || event.pointerType === 'mouse' || !event.isPrimary) return
  cancelLongPress()
  suppressTouchContextMenuUntil = Date.now() + 1000
  pressStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  longPressTimer = setTimeout(() => { openReactionMenu(memberId, event.clientX, event.clientY); pressStart = undefined }, 500)
}
function moveLongPress(event: PointerEvent) {
  if (pressStart && (event.pointerId !== pressStart.pointerId || Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10)) cancelLongPress()
}
function finishLongPress(event: PointerEvent) {
  if (event.pointerType !== 'mouse') suppressTouchContextMenuUntil = Date.now() + 700
  cancelLongPress()
}
function dismissReactionMenu(event: PointerEvent) {
  if (!(event.target as HTMLElement).closest('.reaction-menu')) reactionMenu.value = null
}
function handleEscape(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') reactionMenu.value = null
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
watch(() => [props.adaptive, props.members.map(member => member.id).join(',')], async () => {
  await nextTick()
  measureLayout(true)
})
onMounted(() => {
  window.addEventListener('pointerdown', dismissReactionMenu)
  window.addEventListener('pointerup', finishLongPress)
  window.addEventListener('pointercancel', finishLongPress)
  window.addEventListener('keydown', handleEscape)
  layoutObserver = new ResizeObserver(() => measureLayout())
  if (gridElement.value) layoutObserver.observe(gridElement.value)
  measureLayout(true)
  layoutTimer = setInterval(() => measureLayout(), 600)
})
onUnmounted(() => {
  clearInterval(layoutTimer); layoutObserver?.disconnect(); cancelLongPress()
  window.removeEventListener('pointerdown', dismissReactionMenu)
  window.removeEventListener('pointerup', finishLongPress)
  window.removeEventListener('pointercancel', finishLongPress)
  window.removeEventListener('keydown', handleEscape)
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
</script>

<template>
  <div ref="gridElement" class="member-caption-grid" :class="{ 'is-adaptive': adaptive && tileRects.length === tiles.length, 'is-compact': adaptive && compactCards }" :data-count="tiles.length" aria-label="按成员分区的实时字幕">
    <article v-for="(member, index) in tiles" :key="member.id" class="member-tile" :style="tileStyle(index)"
      :class="{ 'is-speaking': member.speaking, 'is-muted': !member.mic, 'is-typing': member.typing, 'reaction-target': member.id !== selfId }"
      @pointerdown="startLongPress($event, member.id)" @pointermove="moveLongPress"
      @contextmenu="handleCardContextMenu($event, member.id)"
      @keydown="handleCardKeydown($event, member.id)"
      :tabindex="member.id !== selfId ? 0 : undefined" :aria-description="member.id !== selfId ? '右键或长按发送快捷回应' : undefined"
      :data-member-id="member.id" :aria-label="`${member.name}的字幕区域`">
      <div class="tile-heading">
        <div class="tile-identity">
          <h2 :title="member.name">{{ member.name }}<small v-if="member.id === selfId">（我）</small></h2>
          <span class="tile-status">{{ member.typing ? '打字模式' : member.preparing ? '麦克风准备中…' : liveInput && member.id !== selfId && !onlineRoom ? '未接入设备' : !member.mic ? '麦克风关闭' : liveInput ? '麦克风开启' : '模拟麦克风开启' }}</span>
        </div>
        <button class="tile-mic" :disabled="liveInput && member.id !== selfId" @click.stop="emit('toggleMic', member.id)"
          :aria-label="member.typing ? `开启${member.name}的麦克风` : member.preparing ? `取消开启${member.name}的麦克风` : member.mic ? `关闭${member.name}的麦克风` : `将${member.name}切换到打字模式`" :aria-busy="member.preparing" :aria-pressed="member.mic" title="开麦 → 闭麦 → 打字 → 开麦">
          <svg v-if="member.typing" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2M7 16h10"/></svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
            <path v-if="!member.mic && !member.preparing" d="m3 3 18 18" />
          </svg>
        </button>
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
    <p v-if="!tiles.length" class="grid-empty">暂无成员</p>
  </div>
</template>

<style scoped>
.member-caption-grid {
  --caption-size: 16px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  height: 100%;
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
  border: 1px solid #c8c8c8;
  border-radius: 8px;
  background: #fff;
  color: #222;
}
.is-compact .member-tile { padding: 4px; }
.is-compact .tile-mic { width: 32px; height: 32px; min-height: 32px; }
.member-tile.is-speaking { border-color: #333; box-shadow: inset 0 0 0 1px #333; }
.tile-heading { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.tile-identity { flex: 1; min-width: 0; }
.tile-identity h2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 1.5; margin: 0; }
.tile-identity h2 small { font-size: 10px; font-weight: 400; }
.tile-status { display: block; font-size: 10px; line-height: 1.5; color: #666; }
.tile-mic { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; padding: 0; border-radius: 5px; }
.tile-mic:hover { background: #eee; }
.is-muted .tile-mic { color: #888; }
/* Normal top-down flow. Hidden overflow permits automatic scrolling only;
   wheel, touch and keyboard cannot manually browse older captions. */
.tile-text { min-height: 0; flex: 1; overflow: hidden; overflow-anchor: none; overflow-wrap: anywhere; margin-top: 4px; }
.caption-flow { display: flow-root; width: 100%; }
.tile-text .caption-message { font-size: calc(var(--caption-size) * .88); font-weight: 400; }
.tile-text .caption-message.is-latest { font-size: var(--caption-size); font-weight: 700; }
.caption-message + .caption-message { margin-top: 8px; }
.tile-text p { margin: 0; font-size: var(--caption-size); line-height: 1.6; }
.tile-text .tile-placeholder { color: #777; font-size: 13px; }
.caption-message { white-space: pre-wrap; }
.reaction-target { -webkit-touch-callout: none; user-select: none; touch-action: pan-y; }
.can-type { cursor: text; }
.start-typing { width: 100%; min-height: 28px; padding: 4px 8px; font-size: 12px; flex-shrink: 0; }
.reaction-menu { position: fixed; z-index: 1000; width: 208px; max-height: calc(100dvh - 16px); overflow: auto; display: grid; gap: 3px; padding: 6px; background: white; border: 1px solid #bbb; border-radius: 10px; box-shadow: 0 4px 18px #0003; }
.reaction-menu button { text-align: left; min-height: 34px; padding: 4px 10px; }
.reaction-menu small { padding: 0 10px; }
.reaction-menu-footer { display: flex; gap: 4px; border-top: 1px solid #e3e3e3; padding-top: 3px; }
.reaction-menu-footer button { flex: 1; }
.reaction-menu-footer .reaction-settings-trigger { flex: 0 0 auto; min-width: 56px; text-align: center; color: #52744d; }
.reaction-bubbles { position: absolute; right: 6px; top: 4px; z-index: 2; max-width: calc(100% - 12px); pointer-events: none; display: grid; gap: 3px; }
.reaction-bubble { margin: 0; padding: 3px 8px; border: 1px solid #c9d8c7; border-radius: 12px; background: #eff8ee; color: #263d29; font-size: 12px; overflow-wrap: anywhere; box-shadow: 0 1px 4px #0001; }
.member-caption-grid[data-count="1"],
.member-caption-grid[data-count="2"] { --caption-size: 22px; }
.grid-empty { grid-column: 1 / -1; color: #666; text-align: center; }
@media (max-width: 350px) {
  .member-caption-grid { gap: 6px; }
  .member-tile { padding: 6px; }
  .tile-identity h2 { font-size: 12px; }
  .member-caption-grid:not([data-count="1"]):not([data-count="2"]) { --caption-size: 14px; }
}
</style>
