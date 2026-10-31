<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { QUICK_ROOM_AVATARS, ROOM_AVATARS, type RoomAvatarId } from '../../accounts/shared/roomAvatars.mjs'
import { createRoomAvatarClient } from '../roomAvatarClient'
import RoomAvatarIcon from './RoomAvatarIcon.vue'

const props = defineProps<{ avatarId: string; code: string; token: string; settingsOpen: boolean; simulation?: boolean }>()
const emit = defineEmits<{ activate: []; changed: [avatarId: RoomAvatarId]; error: [message: string] }>()
const button = ref<HTMLButtonElement | null>(null), menu = ref<HTMLElement | null>(null), library = ref<HTMLDialogElement | null>(null)
const menuOpen = ref(false), moreOpen = ref(false), busy = ref(false), position = ref({ left: 12, top: 12 })
const client = createRoomAvatarClient()
let operation = 0, bound = false, disposed = false, suppressClick = false, suppressTouchContextUntil = 0
let press: { id: number; x: number; y: number } | undefined, timer: ReturnType<typeof setTimeout> | undefined
function cancelPress() { clearTimeout(timer); timer = undefined; press = undefined }
function close() { operation++; busy.value = false; menuOpen.value = false; moreOpen.value = false; library.value?.close(); client.cancel(); cancelPress() }
async function openMenu(focus = false) {
  if (busy.value) return
  const current = ++operation
  busy.value = true
  try {
    const permission = props.simulation ? { canEdit: true, bound: false } : await client.permission(props.code, props.token)
    if (current !== operation || disposed) return
    if (!permission.canEdit) { emit('error', '仅房主可更换房间头像。'); return }
    bound = permission.bound
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
async function showMore() { menuOpen.value = false; moreOpen.value = true; await nextTick(); library.value?.showModal() }
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
  <button ref="button" class="room-avatar" type="button" aria-label="房间设置" title="房间设置；长按或右键更换头像" :aria-expanded="settingsOpen || menuOpen || moreOpen" :aria-busy="busy" @click="activate" @contextmenu="contextMenu" @keydown="openWithKeyboard" @pointerdown="startPress" @pointermove="movePress" @pointerup="finishPress" @pointercancel="cancelPress" @lostpointercapture="cancelPress"><RoomAvatarIcon :avatar-id="avatarId" /></button>
  <Teleport to="body">
    <div v-if="menuOpen" ref="menu" class="room-avatar-menu" role="menu" aria-label="更换房间头像" :style="{ left: position.left + 'px', top: position.top + 'px' }" @keydown="navigateMenu">
      <button v-for="avatar in QUICK_ROOM_AVATARS" :key="avatar.id" type="button" role="menuitemradio" :aria-label="`使用${avatar.label}头像`" :aria-checked="avatarId === avatar.id" :disabled="busy" :title="avatar.label" @click="select(avatar.id)"><RoomAvatarIcon :avatar-id="avatar.id" /></button>
      <button type="button" role="menuitem" :disabled="busy" @click="showMore">更多</button>
    </div>
    <dialog v-if="moreOpen" ref="library" class="room-avatar-library" aria-labelledby="room-avatar-library-title" @cancel.prevent="close">
      <div class="avatar-library-heading"><h2 id="room-avatar-library-title">房间头像</h2><button type="button" aria-label="关闭头像库" @click="close">×</button></div>
      <div class="avatar-library-grid" role="group" aria-label="预制房间头像"><button v-for="avatar in ROOM_AVATARS" :key="avatar.id" type="button" :aria-label="`使用${avatar.label}头像`" :aria-pressed="avatarId === avatar.id" :disabled="busy" @click="select(avatar.id)"><RoomAvatarIcon :avatar-id="avatar.id" /><span>{{ avatar.label }}</span></button></div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.room-avatar { touch-action: manipulation; user-select: none; -webkit-touch-callout: none; }
.room-avatar-menu { position: fixed; z-index: 1100; width: min(300px, calc(100vw - 24px)); display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; padding: 8px; border: 1px solid var(--home-border); border-radius: 12px; background: var(--room-card-bg); color: var(--home-text); box-shadow: 0 4px 18px #0003; }
.room-avatar-menu button { display: grid; place-items: center; min-width: 0; min-height: 48px; padding: 4px; border-radius: 8px; font-size: 12px; }
.room-avatar-menu button:hover, .room-avatar-menu button[aria-checked=true], .avatar-library-grid button:hover, .avatar-library-grid button[aria-pressed=true] { background: #dedfdb; }
.room-avatar-library { margin: auto; width: min(400px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; padding: 20px; border: 1px solid var(--home-border); border-radius: 18px; background: var(--room-card-bg); color: var(--home-text); }
.room-avatar-library::backdrop { background: #181a1d80; }
.avatar-library-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.avatar-library-heading h2 { margin: 0; font-size: 18px; }
.avatar-library-heading button { width: 44px; padding: 0; font-size: 26px; }
.avatar-library-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.avatar-library-grid button { display: grid; justify-items: center; gap: 8px; min-width: 0; padding: 12px 2px; border: 1px solid var(--home-border); border-radius: 12px; font-size: 12px; }
:is(.room-avatar-menu, .room-avatar-library) button:focus-visible { outline: 2px solid var(--home-secondary-text); outline-offset: 2px; }
</style>
