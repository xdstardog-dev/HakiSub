<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { MemberMode } from '../roomInteractions'

const props = defineProps<{
  memberName: string
  microphone: boolean
  mode?: MemberMode
  preparing?: boolean
  disabled?: boolean
  allowTyping?: boolean
  labelled?: boolean
}>()
const emit = defineEmits<{ toggleMic: []; selectTyping: []; menuOpen: [open: boolean] }>()
const controlElement = ref<HTMLElement | null>(null)
const microphoneButton = ref<HTMLButtonElement | null>(null)
const typingOption = ref<HTMLButtonElement | null>(null)
const menuElement = ref<HTMLElement | null>(null)
const menuOpen = ref(false), dragSelected = ref(false)
const menuPosition = ref({ left: 8, top: 8 })
const actionLabel = computed(() => props.preparing ? `取消开启${props.memberName}的麦克风`
  : props.mode === 'typing' ? '退出打字并保持闭麦'
  : props.microphone ? `关闭${props.memberName}的麦克风` : `开启${props.memberName}的麦克风`)
let longPressTimer: ReturnType<typeof setTimeout> | undefined
let pointer: { id: number; x: number; y: number; moved: boolean; longPressed: boolean } | undefined
let suppressNextClick = false
let suppressTouchContextMenuUntil = 0

function closeMenu(restoreFocus = false) {
  menuOpen.value = false; dragSelected.value = false
  if (restoreFocus) microphoneButton.value?.focus({ preventScroll: true })
}
function openMenu(focus = false) {
  if (props.disabled || !props.allowTyping) return
  const rect = microphoneButton.value?.getBoundingClientRect()
  if (!rect) return
  menuPosition.value = { left: Math.max(8, Math.min(rect.left - 140, window.innerWidth - 140)), top: Math.max(8, Math.min(rect.top, window.innerHeight - 60)) }
  menuOpen.value = true
  if (focus) nextTick(() => typingOption.value?.focus({ preventScroll: true }))
}
watch(menuOpen, open => emit('menuOpen', open), { flush: 'sync' })
function selectTyping() {
  if (props.disabled) return
  closeMenu(); emit('selectTyping')
}
function handleClick(event: MouseEvent) {
  // 长按松手也可能合成 click，不能再次触发开关麦。
  if (suppressNextClick && event.detail !== 0) { suppressNextClick = false; event.preventDefault(); return }
  closeMenu()
  if (!props.disabled) emit('toggleMic')
}
function startPress(event: PointerEvent) {
  if (props.disabled || !props.allowTyping || !event.isPrimary || event.button !== 0) return
  clearTimeout(longPressTimer)
  suppressNextClick = false
  if (event.pointerType !== 'mouse') suppressTouchContextMenuUntil = Date.now() + 1000
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, longPressed: false }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  longPressTimer = setTimeout(() => {
    if (!pointer) return
    pointer.longPressed = true; suppressNextClick = true; openMenu()
  }, 500)
}
function isOverTyping(event: PointerEvent) {
  const rect = typingOption.value?.getBoundingClientRect()
  return !!rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
}
function movePress(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return
  if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) {
    pointer.moved = true
    if (!pointer.longPressed) { clearTimeout(longPressTimer); suppressNextClick = true }
  }
  if (pointer.longPressed) dragSelected.value = isOverTyping(event)
}
function finishPress(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return
  clearTimeout(longPressTimer)
  if (event.pointerType !== 'mouse') suppressTouchContextMenuUntil = Date.now() + 700
  const press = pointer
  pointer = undefined
  if (press.longPressed) {
    suppressNextClick = true
    if (isOverTyping(event)) selectTyping()
    else if (press.moved) closeMenu()
  }
  dragSelected.value = false
}
function cancelPress() {
  clearTimeout(longPressTimer)
  if (pointer) suppressNextClick = true
  pointer = undefined; closeMenu()
}
function handleContextMenu(event: MouseEvent) {
  if (!props.allowTyping) return
  event.preventDefault()
  // 触屏系统菜单可能早于 500ms 到达，只由长按计时器负责展开。
  if ((event as PointerEvent).pointerType === 'touch' || (event as PointerEvent).pointerType === 'pen' || pointer || Date.now() < suppressTouchContextMenuUntil) return
  openMenu(true)
}
function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (['ArrowLeft', 'ArrowDown', 'ContextMenu'].includes(event.key) || (event.shiftKey && event.key === 'F10')) {
    if (!props.allowTyping) return
    event.preventDefault(); openMenu(true)
  }
}
function handleWindowKeydown(event: KeyboardEvent) {
  if (!menuOpen.value || event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); cancelPress(); microphoneButton.value?.focus({ preventScroll: true }) }
  if (event.key === 'Tab') closeMenu()
}
function dismissOutside(event: PointerEvent) {
  const target = event.target as Node
  if (!controlElement.value?.contains(target) && !menuElement.value?.contains(target)) cancelPress()
}
watch(() => props.disabled, disabled => { if (disabled) cancelPress() })
onMounted(() => {
  window.addEventListener('pointerdown', dismissOutside, true)
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('resize', cancelPress)
  window.addEventListener('blur', cancelPress)
})
onUnmounted(() => {
  cancelPress()
  window.removeEventListener('pointerdown', dismissOutside, true)
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('resize', cancelPress)
  window.removeEventListener('blur', cancelPress)
})
</script>

<template>
  <div ref="controlElement" class="member-mode-control" :class="{ 'is-labelled': labelled }" @pointerdown.stop @contextmenu.stop>
    <button ref="microphoneButton" type="button" class="tile-mic" :disabled="disabled" :aria-label="actionLabel" :aria-busy="preparing" :aria-pressed="microphone"
      title="短按开关麦；长按或右键选择打字" @click.stop="handleClick" @contextmenu="handleContextMenu" @keydown="handleKeydown"
      @pointerdown="startPress" @pointermove="movePress" @pointerup="finishPress" @pointercancel="cancelPress" @lostpointercapture="pointer && cancelPress()">
      <span v-if="labelled">{{ preparing ? '取消开启' : mode === 'typing' ? '退出打字' : microphone ? '关闭麦克风' : '开启麦克风' }}</span>
      <svg v-else-if="mode === 'typing'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2M7 16h10"/></svg>
      <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/><path v-if="!microphone && !preparing" d="m3 3 18 18"/></svg>
    </button>
    <button v-if="allowTyping" type="button" class="mode-options-trigger" :disabled="disabled" aria-label="选择输入方式" aria-haspopup="menu" :aria-expanded="menuOpen" title="选择打字，也可长按或右键麦克风" @click.stop="menuOpen ? closeMenu() : openMenu(true)">‹</button>
    <Teleport to="body">
      <div v-if="menuOpen" ref="menuElement" class="member-mode-menu" role="menu" aria-label="输入方式" :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }" @pointerdown.stop @contextmenu.prevent>
        <button ref="typingOption" type="button" role="menuitem" :class="{ 'is-selected': dragSelected }" @click="selectTyping">⌨ {{ mode === 'typing' ? '继续打字' : '切换打字' }}</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.member-mode-control { display: flex; flex-direction: row-reverse; align-items: center; flex-shrink: 0; }
.tile-mic { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border-radius: 5px; touch-action: none; user-select: none; -webkit-touch-callout: none; }
.tile-mic[aria-pressed="false"] { color: #777; }
.tile-mic:hover, .mode-options-trigger:hover { background: #eee; }
.mode-options-trigger { min-width: 24px; padding: 0 6px; font-size: 22px; }
.is-labelled { border: 1px solid #333; border-radius: 6px; background: #fff; }
.is-labelled .tile-mic { width: auto; padding: 0 8px; font-size: 13px; white-space: nowrap; }
.is-labelled .mode-options-trigger { border-right: 1px solid #ddd; }
.member-mode-menu { position: fixed; z-index: 1100; width: 132px; padding: 4px; background: white; color: #222; border: 1px solid #bbb; border-radius: 8px; box-shadow: 0 4px 18px #0003; }
.member-mode-menu button { width: 100%; min-height: 44px; font-size: 14px; border-radius: 5px; }
.member-mode-menu button:hover, .member-mode-menu button.is-selected { background: #e8f0e3; }
</style>
