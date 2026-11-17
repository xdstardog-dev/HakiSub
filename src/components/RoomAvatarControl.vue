<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ROOM_AVATAR_CHOICES, ROOM_AVATAR_GROUPS, QUICK_ROOM_AVATARS, type RoomAvatarId } from '../../accounts/shared/roomAvatars.mjs'
import { createRoomAvatarClient } from '../roomAvatarClient'
import RoomAvatarIcon from './RoomAvatarIcon.vue'

const props = defineProps<{ avatarId: string; code: string; token: string; settingsOpen: boolean; simulation?: boolean }>()
const emit = defineEmits<{ activate: []; changed: [avatarId: RoomAvatarId]; error: [message: string] }>()
const button = ref<HTMLButtonElement | null>(null), menu = ref<HTMLElement | null>(null), library = ref<HTMLDialogElement | null>(null)
const menuOpen = ref(false), moreOpen = ref(false), busy = ref(false), position = ref({ left: 12, top: 12 })
const availableAvatarIds = ref<RoomAvatarId[]>([])
const draftAvatarId = ref<RoomAvatarId | null>(null)
const quickAvatars = computed(() => QUICK_ROOM_AVATARS.filter(({ id }) => availableAvatarIds.value.includes(id)))
const libraryGroups = computed(() => ROOM_AVATAR_GROUPS
  .flatMap(group => {
    const [primary, ...variants] = group.avatars.filter(({ id }) => availableAvatarIds.value.includes(id))
    return primary ? [{ id: group.id, label: group.label, primary, variants }] : []
  }))
const client = createRoomAvatarClient()
let operation = 0, bound = false, disposed = false, suppressClick = false, suppressTouchContextUntil = 0
let press: { id: number; x: number; y: number } | undefined, timer: ReturnType<typeof setTimeout> | undefined
let railDrag: { rail: HTMLElement; id: number; x: number; scrollLeft: number } | undefined
let suppressVariantClick = false
function cancelPress() { clearTimeout(timer); timer = undefined; press = undefined }
function close() {
  const restoreFocus = moreOpen.value && !disposed
  operation++; busy.value = false; menuOpen.value = false; moreOpen.value = false
  draftAvatarId.value = null
  railDrag = undefined; suppressVariantClick = false
  library.value?.close(); client.cancel(); cancelPress()
  if (restoreFocus) button.value?.focus({ preventScroll: true })
}
async function openMenu(focus = false) {
  if (busy.value) return
  const current = ++operation
  busy.value = true
  try {
    const permission = props.simulation
      ? { canEdit: true, bound: false, avatarIds: ROOM_AVATAR_CHOICES.map(({ id }) => id) }
      : await client.permission(props.code, props.token)
    if (current !== operation || disposed) return
    if (!permission.canEdit) { emit('error', '仅房主可更换房间头像。'); return }
    bound = permission.bound
    availableAvatarIds.value = permission.avatarIds
    const bounds = button.value!.getBoundingClientRect()
    position.value = { left: Math.max(12, Math.min(bounds.left, innerWidth - 312)), top: Math.min(bounds.bottom + 8, innerHeight - 88) }
    menuOpen.value = true
    busy.value = false
    if (focus) { await nextTick(); menu.value?.querySelector<HTMLButtonElement>('button')?.focus() }
  } catch (error) { if (current === operation && !disposed) emit('error', error instanceof Error ? error.message : '房间头像菜单暂时无法打开。') }
  finally { if (current === operation) busy.value = false }
}
function startPress(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0) return
  cancelPress(); suppressClick = false
  press = { id: event.pointerId, x: event.clientX, y: event.clientY }
  if (event.pointerType !== 'mouse') suppressTouchContextUntil = Date.now() + 1000
  // 鼠标与触屏共用500ms长按；手指移动超过10px视为滚动，不打开菜单。
  timer = setTimeout(() => { suppressClick = true; press = undefined; void openMenu() }, 500)
}
function movePress(event: PointerEvent) { if (press && (event.pointerId !== press.id || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10)) { suppressClick = true; cancelPress() } }
function finishPress(event: PointerEvent) { if (event.pointerType !== 'mouse') suppressTouchContextUntil = Date.now() + 700; cancelPress() }
function activate(event: MouseEvent) {
  if (suppressClick && event.detail !== 0) { suppressClick = false; event.preventDefault(); return }
  close(); emit('activate')
}
function contextMenu(event: MouseEvent) {
  event.preventDefault()
  if ((event as PointerEvent).pointerType === 'touch' || (event as PointerEvent).pointerType === 'pen' || Date.now() < suppressTouchContextUntil) return
  cancelPress(); suppressClick = true; void openMenu()
}
async function showMore() {
  menuOpen.value = false
  moreOpen.value = true
  await nextTick()
  library.value?.showModal()
  library.value?.querySelector('.avatar-library-rail button[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
function scrollRail(event: WheelEvent) {
  if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  const rail = event.currentTarget as HTMLElement
  const previous = rail.scrollLeft
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1
  rail.scrollLeft += event.deltaY * scale
  if (rail.scrollLeft !== previous) event.preventDefault()
}
function startRailDrag(event: PointerEvent) {
  suppressVariantClick = false
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  const rail = event.currentTarget as HTMLElement
  railDrag = rail.scrollWidth > rail.clientWidth ? { rail, id: event.pointerId, x: event.clientX, scrollLeft: rail.scrollLeft } : undefined
}
function moveRailDrag(event: PointerEvent) {
  if (!railDrag || event.currentTarget !== railDrag.rail || event.pointerId !== railDrag.id || !(event.buttons & 1)) return
  const distance = event.clientX - railDrag.x
  if (!suppressVariantClick && Math.abs(distance) < 6) return
  const { rail } = railDrag
  // 横向拖动和点选共用一排按钮，过阈值后拦截松手产生的点击。
  suppressVariantClick = true
  if (!rail.hasPointerCapture(event.pointerId)) rail.setPointerCapture(event.pointerId)
  rail.scrollLeft = railDrag.scrollLeft - distance
}
function finishRailDrag() { railDrag = undefined }
function preventDragSelection(event: MouseEvent) {
  if (!suppressVariantClick || event.detail === 0) return
  suppressVariantClick = false
  event.stopPropagation()
  event.preventDefault()
}
async function select(avatarId: RoomAvatarId) {
  if (busy.value) return
  const current = ++operation
  busy.value = true
  try {
    if (!props.simulation) await client.save(props.code, props.token, avatarId, bound)
    if (current === operation && !disposed) { emit('changed', avatarId); close() }
  } catch (error) { if (current === operation && !disposed) emit('error', error instanceof Error ? error.message : '房间头像保存失败，请重试。') }
  finally { if (current === operation) busy.value = false }
}
function dismiss(event: PointerEvent) { const target = event.target as Node; if (menuOpen.value && !button.value?.contains(target) && !menu.value?.contains(target)) close() }
function keydown(event: KeyboardEvent) { if (event.key === 'Escape' && !event.isComposing && menuOpen.value) { event.preventDefault(); close(); button.value?.focus() } }
function openWithKeyboard(event: KeyboardEvent) { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); void openMenu(true) } }
function navigateMenu(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
  if (!buttons.length) return
  event.preventDefault()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
}
onMounted(() => { window.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', keydown); window.addEventListener('resize', close); window.addEventListener('blur', cancelPress) })
onUnmounted(() => { disposed = true; close(); window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', keydown); window.removeEventListener('resize', close); window.removeEventListener('blur', cancelPress) })
</script>

<template>
  <button ref="button" class="room-avatar" type="button" aria-label="设置" title="设置；长按或右键更换头像" :aria-expanded="settingsOpen || menuOpen || moreOpen" :aria-busy="busy" @click="activate" @contextmenu="contextMenu" @keydown="openWithKeyboard" @pointerdown="startPress" @pointermove="movePress" @pointerup="finishPress" @pointercancel="cancelPress" @lostpointercapture="cancelPress"><RoomAvatarIcon :avatar-id="avatarId" /></button>
  <Teleport to="body">
    <div v-if="menuOpen" ref="menu" class="room-avatar-menu" role="menu" aria-label="更换房间头像" :style="{ left: position.left + 'px', top: position.top + 'px' }" @keydown="navigateMenu">
      <button v-for="avatar in quickAvatars" :key="avatar.id" type="button" role="menuitemradio" :aria-label="`使用${avatar.label}头像`" :aria-checked="avatarId === avatar.id" :disabled="busy" @click="select(avatar.id)"><RoomAvatarIcon :avatar-id="avatar.id" /></button>
      <button type="button" role="menuitem" aria-label="更多头像" aria-haspopup="dialog" :disabled="busy" @click="showMore">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
    </div>
    <dialog v-if="moreOpen" ref="library" class="room-avatar-library" aria-label="房间头像" :aria-busy="busy" closedby="any" @cancel.prevent="!busy && close()">
      <div class="avatar-library-body">
        <div v-for="group in libraryGroups" :key="group.id" class="avatar-library-row" role="group" :aria-label="group.label">
          <button class="avatar-library-primary avatar-library-tile" type="button" :aria-label="`使用${group.primary.label}头像`" :aria-pressed="(draftAvatarId ?? avatarId) === group.primary.id" :disabled="busy" @click="draftAvatarId = group.primary.id">
            <RoomAvatarIcon :avatar-id="group.primary.id" />
          </button>
          <div class="avatar-library-rail" @wheel="scrollRail" @pointerdown="startRailDrag" @pointermove="moveRailDrag" @pointerup="finishRailDrag" @pointercancel="finishRailDrag" @lostpointercapture="finishRailDrag" @dragstart.prevent @click.capture="preventDragSelection">
            <button v-for="avatar in group.variants" :key="avatar.id" class="avatar-library-tile" type="button" :aria-label="`使用${avatar.label}头像`" :aria-pressed="(draftAvatarId ?? avatarId) === avatar.id" :disabled="busy" @click="draftAvatarId = avatar.id">
              <RoomAvatarIcon :avatar-id="avatar.id" />
            </button>
          </div>
        </div>
      </div>
      <div class="avatar-library-footer">
        <button class="avatar-library-confirm" type="button" :disabled="busy || !draftAvatarId" @click="draftAvatarId && select(draftAvatarId)">确定</button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.room-avatar { touch-action: manipulation; user-select: none; -webkit-touch-callout: none; }
.room-avatar-menu { position: fixed; z-index: 1100; width: min(300px, calc(100vw - 24px)); display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; padding: 8px; border: 1px solid var(--home-border); border-radius: 12px; background: var(--room-card-bg); color: var(--home-text); box-shadow: 0 4px 18px #0003; }
.room-avatar-menu button { display: grid; place-items: center; min-width: 0; min-height: 48px; padding: 4px; border-radius: 8px; }
.room-avatar-menu button:hover, .room-avatar-menu button[aria-checked=true] { background: #dedfdb; }
.room-avatar-library {
  --avatar-tile-size: var(--ui-control-min);
  --avatar-sidebar-width: calc(var(--avatar-tile-size) + 21px);
  margin: auto;
  width: min(320px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--home-border);
  border-radius: 18px;
  background: var(--room-card-bg);
  color: var(--home-text);
}
.room-avatar-library::backdrop { background: #181a1d80; }
.avatar-library-body {
  max-height: max(var(--ui-control-min), calc(100dvh - var(--ui-control) - 42px));
  overflow: auto;
  padding: 10px 12px 8px;
  scrollbar-width: thin;
  background: linear-gradient(90deg, #bfc2bd var(--avatar-sidebar-width), var(--room-card-bg) var(--avatar-sidebar-width));
}
.avatar-library-row { display: grid; grid-template-columns: var(--avatar-tile-size) minmax(0, 1fr); align-items: start; gap: 8px; }
.avatar-library-row + .avatar-library-row { position: relative; margin-top: 3px; padding-top: 4px; }
.avatar-library-row + .avatar-library-row::before {
  content: '';
  position: absolute;
  top: 0;
  inset-inline: calc(var(--avatar-tile-size) + 12px) 0;
  border-top: 2px dashed #777c7359;
  pointer-events: none;
}
.avatar-library-rail { display: flex; gap: 8px; min-width: 0; min-height: var(--avatar-tile-size); padding: 3px 3px 3px 8px; margin-block: -3px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #a5a7a3 transparent; overscroll-behavior-x: contain; user-select: none; }
.avatar-library-tile { display: grid; place-items: center; flex: 0 0 var(--avatar-tile-size); width: var(--avatar-tile-size); height: var(--avatar-tile-size); min-height: 0; padding: 0; border: 0; border-radius: 10px; }
.avatar-library-primary { background: var(--room-card-bg); }
.avatar-library-primary:hover { background: #e8e9e5; }
.avatar-library-primary[aria-pressed=true] { box-shadow: inset 0 0 0 2px #969a9e; }
.avatar-library-rail .avatar-library-tile:hover { background: #e7e8e4; }
.avatar-library-rail .avatar-library-tile[aria-pressed=true] { background: #dedfdb; }
.avatar-library-tile :deep(.room-avatar-icon) { display: block; }
.avatar-library-footer { padding: 6px 12px 10px; }
.avatar-library-confirm { display: grid; place-items: center; padding: 0; }
.avatar-library-confirm:disabled { opacity: 1; background: #dedfdb; color: var(--home-secondary-text); }
.avatar-library-confirm:not(:disabled):hover { background: #4d5155; }
.avatar-library-confirm:not(:disabled):active { background: #35393d; }
:is(.room-avatar-menu, .room-avatar-library) button:focus-visible { outline: 2px solid var(--home-secondary-text); outline-offset: 2px; }
</style>
