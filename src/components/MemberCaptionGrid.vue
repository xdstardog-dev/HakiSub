<script setup lang="ts">
import { computed, reactive, watch, ref, onMounted, onUnmounted, nextTick, type ObjectDirective } from 'vue'
import { adaptiveLayout, type TileRect } from '../adaptiveLayout'
import { captionOpacity, type Caption } from '../captions'

const props = defineProps<{
  members: { id: string; name: string; mic: boolean }[]
  captions: Caption[]
  now: number
  selfId?: string
  liveInput?: boolean
  onlineRoom?: boolean
  adaptive?: boolean
}>()
const emit = defineEmits<{ toggleMic: [id: string] }>()

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
  layoutObserver = new ResizeObserver(() => measureLayout())
  if (gridElement.value) layoutObserver.observe(gridElement.value)
  measureLayout(true)
  layoutTimer = setInterval(() => measureLayout(), 600)
})
onUnmounted(() => { clearInterval(layoutTimer); layoutObserver?.disconnect() })

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
  return { ...member, captions, speaking }
}))
</script>

<template>
  <div ref="gridElement" class="member-caption-grid" :class="{ 'is-adaptive': adaptive && tileRects.length === tiles.length, 'is-compact': adaptive && compactCards }" :data-count="tiles.length" aria-label="按成员分区的实时字幕">
    <article v-for="(member, index) in tiles" :key="member.id" class="member-tile" :style="tileStyle(index)"
      :class="{ 'is-speaking': member.speaking, 'is-muted': !member.mic }"
      :data-member-id="member.id" :aria-label="`${member.name}的字幕区域`">
      <div class="tile-heading">
        <div class="tile-identity">
          <h2 :title="member.name">{{ member.name }}<small v-if="member.id === selfId">（我）</small></h2>
          <span class="tile-status">{{ liveInput && member.id !== selfId && !onlineRoom ? '未接入设备' : !member.mic ? '麦克风关闭' : liveInput ? '麦克风开启' : '模拟麦克风开启' }}</span>
        </div>
        <button class="tile-mic" :disabled="liveInput && member.id !== selfId" @click="emit('toggleMic', member.id)"
          :aria-label="`${member.mic ? '关闭' : '开启'}${member.name}的麦克风`" :aria-pressed="member.mic">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
            <path v-if="!member.mic" d="m3 3 18 18" />
          </svg>
        </button>
      </div>
      <div v-caption-scroll class="tile-text" :aria-label="`${member.name}的当前字幕`" aria-live="polite" aria-relevant="additions text">
        <div class="caption-flow">
          <p v-for="caption in member.captions" :key="caption.id" class="caption-message"
            :class="{ 'is-latest': latestCaptionIds.get(member.id) === caption.id }"
            :data-state="caption.state" :data-caption-id="caption.id"
            :style="{ opacity: captionOpacity(caption, now) }">{{ caption.text }}</p>
          <p v-if="!member.captions.length" class="tile-placeholder">{{ member.mic ? '等待字幕…' : '麦克风已关闭' }}</p>
        </div>
      </div>
    </article>
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
