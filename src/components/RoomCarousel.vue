<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { RememberedRoom } from '../rememberedRooms'
import RoomCard from './RoomCard.vue'

const props = defineProps<{ rooms: RememberedRoom[]; busy: boolean }>()
const emit = defineEmits<{ enter: [room: RememberedRoom]; create: []; join: [] }>()
const track = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const mouseDragging = ref(false)
let mobile = true, frame = 0, observer: ResizeObserver | undefined
let pointerStart: { id: number; x: number; y: number; scrollLeft: number; mouse: boolean; horizontal?: boolean; snapType: string } | undefined
let dragged = false, suppressClickUntil = 0
function items() { return Array.from(track.value?.querySelectorAll<HTMLElement>('.home-carousel-item') ?? []) }
function updateProgress() {
  cancelAnimationFrame(frame)
  frame = 0
  const element = track.value
  if (!element) return
  const bounds = element.getBoundingClientRect(), center = bounds.left + element.clientWidth / 2
  const cards = items()
  const step = cards[1] ? Math.abs(cards[1].offsetLeft - cards[0]!.offsetLeft) : cards[0]?.offsetWidth ?? 1
  const distances = cards.map(card => {
    const rectangle = card.getBoundingClientRect()
    return Math.abs(rectangle.left + rectangle.width / 2 - center)
  })
  let nearest = 0, minimum = Infinity
  cards.forEach((card, index) => {
    const distance = distances[index]!
    // 使用未缩放的槽位计算距离，避免缩放反过来影响中心与手指进度。
    card.style.setProperty('--card-distance', String(mobile ? Math.min(1, distance / Math.max(1, step)) : 0))
    if (distance < minimum) { minimum = distance; nearest = index }
  })
  activeIndex.value = nearest
}
function scheduleProgress() { if (!frame) frame = requestAnimationFrame(updateProgress) }
function centerCard(index: number, smooth = true) {
  const element = track.value, card = items()[index]
  if (!element || !card) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const left = element.scrollLeft + card.getBoundingClientRect().left - element.getBoundingClientRect().left + card.offsetWidth / 2 - element.clientWidth / 2
  element.scrollTo({ left, behavior: smooth && !reducedMotion ? 'smooth' : 'instant' })
}
function resize() {
  if (!track.value) return
  stopPointer()
  mobile = getComputedStyle(track.value).getPropertyValue('--home-carousel-mobile').trim() === '1'
  if (mobile) centerCard(activeIndex.value, false)
  updateProgress()
}
function pointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || !track.value) return
  stopPointer()
  dragged = false; suppressClickUntil = 0
  const mouse = mobile && event.pointerType === 'mouse'
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: track.value.scrollLeft, mouse, snapType: track.value.style.scrollSnapType }
  // 窄窗口的鼠标按下不能先触发按钮聚焦滚动，否则卡片会在拖动前跳位。
  if (mouse) event.preventDefault()
  window.addEventListener('pointermove', pointerMove, { passive: false })
  window.addEventListener('pointerup', pointerEnd)
  window.addEventListener('pointercancel', pointerEnd)
  window.addEventListener('blur', cancelPointer)
}
function pointerMove(event: PointerEvent) {
  const gesture = pointerStart, element = track.value
  if (!gesture || event.pointerId !== gesture.id || !element) return
  if (gesture.mouse && event.buttons === 0) { stopPointer(); return }
  const deltaX = event.clientX - gesture.x, deltaY = event.clientY - gesture.y
  if (Math.hypot(deltaX, deltaY) <= 8 && !dragged) return
  dragged = true
  // 触屏交给浏览器原生平移；只在手机布局补充横向鼠标拖动。
  if (!gesture.mouse) return
  if (gesture.horizontal === undefined) gesture.horizontal = Math.abs(deltaX) > Math.abs(deltaY)
  if (!gesture.horizontal) return
  if (!mouseDragging.value) {
    mouseDragging.value = true
    element.style.scrollSnapType = 'none'
    element.setPointerCapture(event.pointerId)
  }
  event.preventDefault()
  element.scrollLeft = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, gesture.scrollLeft - deltaX))
}
function pointerEnd(event: PointerEvent) { if (event.pointerId === pointerStart?.id) stopPointer() }
function cancelPointer() { stopPointer() }
function stopPointer(snap = true) {
  const gesture = pointerStart, element = track.value
  if (!gesture) return
  pointerStart = undefined
  window.removeEventListener('pointermove', pointerMove)
  window.removeEventListener('pointerup', pointerEnd)
  window.removeEventListener('pointercancel', pointerEnd)
  window.removeEventListener('blur', cancelPointer)
  if (dragged) suppressClickUntil = performance.now() + 500
  if (mouseDragging.value) {
    updateProgress()
    const nearest = activeIndex.value
    mouseDragging.value = false
    if (element) {
      element.style.scrollSnapType = gesture.snapType
      if (element.hasPointerCapture(gesture.id)) element.releasePointerCapture(gesture.id)
    }
    if (snap) centerCard(nearest)
  }
}
function captureClick(event: MouseEvent) {
  if (event.detail === 0) return
  if (dragged || performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); return }
  const target = (event.target as HTMLElement).closest<HTMLElement>('.home-carousel-item')
  const index = items().findIndex(card => card === target)
  if (mobile && index >= 0 && index !== activeIndex.value) {
    event.preventDefault(); event.stopPropagation(); centerCard(index)
    return
  }
  if (mobile) (event.target as HTMLElement).closest<HTMLButtonElement>('button')?.focus({ preventScroll: true })
}
function navigate(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const cards = items(), focused = (event.target as HTMLElement).closest('.home-carousel-item')
  const current = Math.max(0, cards.findIndex(card => card === focused))
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)))
  event.preventDefault()
  cards[index]?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  centerCard(index)
}
function focusCard(event: FocusEvent) {
  if (mouseDragging.value) return
  const index = items().findIndex(card => card.contains(event.target as Node))
  if (index >= 0) centerCard(index)
}
watch(() => props.rooms.map(room => room.code).join(','), async () => { await nextTick(); resize() })
onMounted(() => {
  observer = new ResizeObserver(resize)
  if (track.value) observer.observe(track.value)
  resize()
})
onUnmounted(() => { stopPointer(false); observer?.disconnect(); cancelAnimationFrame(frame) })
</script>

<template>
  <div ref="track" class="home-carousel" :class="{ 'is-dragging': mouseDragging }" role="region" aria-label="房间卡片，可左右滑动或拖动；方向键切换" @scroll.passive="scheduleProgress" @pointerdown="pointerDown" @click.capture="captureClick" @keydown="navigate" @focusin="focusCard" @dragstart.prevent>
    <div v-for="(room, index) in rooms" :key="room.code" class="home-carousel-item" :aria-current="index === activeIndex ? 'true' : undefined">
      <RoomCard :room="room" :busy="busy" @enter="emit('enter', $event)" />
    </div>
    <div class="home-carousel-item" :aria-current="activeIndex === rooms.length ? 'true' : undefined">
      <RoomCard :busy="busy" @create="emit('create')" @join="emit('join')" />
    </div>
  </div>
</template>
