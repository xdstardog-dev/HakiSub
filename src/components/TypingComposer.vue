<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { shouldSendTypedCaption, TYPED_CAPTION_LIMIT } from '../roomInteractions'

const props = defineProps<{ draft: string; sending: boolean; now: number; cooldownUntil: number }>()
const emit = defineEmits<{ 'update:draft': [text: string]; send: []; close: [] }>()
const inputElement = ref<HTMLTextAreaElement | null>(null)
const composerElement = ref<HTMLElement | null>(null)
const composing = ref(false)
let compositionEndedAt = -Infinity
const placement = ref({ left: 0, bottom: 0, width: 440, maxHeight: 400 })
let viewport: VisualViewport | null = null
function updatePlacement() {
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  const mobile = window.matchMedia('(pointer: coarse)').matches
  const gap = mobile ? 12 : Math.min(96, height * 0.12)
  // 可见视口不包含软键盘；offsetTop 同时补偿 iOS 聚焦输入时的视口平移。
  placement.value = {
    left: (viewport?.offsetLeft ?? 0) + width / 2,
    bottom: (viewport?.offsetTop ?? 0) + height - gap,
    width: Math.max(0, Math.min(440, width - 64)),
    maxHeight: Math.max(0, height - gap - 12),
  }
}
const windowStyle = computed(() => ({
  left: `${placement.value.left}px`, top: `calc(${placement.value.bottom}px - env(safe-area-inset-bottom, 0px))`,
  width: `${placement.value.width}px`, maxHeight: `${placement.value.maxHeight}px`,
}))
const canSend = computed(() => !props.sending && !!props.draft.trim() && props.draft.length <= TYPED_CAPTION_LIMIT && props.now >= props.cooldownUntil)
function send() {
  if (canSend.value && !composing.value && Date.now() - compositionEndedAt > 50) emit('send')
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.isComposing && !composing.value) {
    event.preventDefault(); event.stopPropagation(); emit('close'); return
  }
  if (shouldSendTypedCaption(event, composing.value)) { event.preventDefault(); send() }
}
function endComposition() { composing.value = false; compositionEndedAt = Date.now() }
function dismissOutside(event: MouseEvent) {
  if (composerElement.value?.contains(event.target as Node)) return
  // 卡片空白原本也能打开编辑器，拦住同一次点击，避免刚收起又展开。
  if (!(event.target as HTMLElement)?.closest?.('button, a, input, select, textarea, [role="button"], [contenteditable="true"]')) event.stopPropagation()
  emit('close')
}
onMounted(() => {
  viewport = window.visualViewport
  updatePlacement()
  viewport?.addEventListener('resize', updatePlacement)
  viewport?.addEventListener('scroll', updatePlacement)
  window.addEventListener('resize', updatePlacement)
  window.addEventListener('click', dismissOutside, true)
  inputElement.value?.focus({ preventScroll: true })
})
onUnmounted(() => {
  viewport?.removeEventListener('resize', updatePlacement)
  viewport?.removeEventListener('scroll', updatePlacement)
  window.removeEventListener('resize', updatePlacement)
  window.removeEventListener('click', dismissOutside, true)
})
</script>

<template>
  <section ref="composerElement" class="typing-composer" role="dialog" aria-label="打字字幕" :style="windowStyle">
    <textarea ref="inputElement" :value="draft" :maxlength="TYPED_CAPTION_LIMIT" aria-label="输入字幕" placeholder="哈基..." rows="3" @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)" @keydown="handleKeydown" @compositionstart="composing = true" @compositionend="endComposition" />
    <div class="composer-actions"><small>{{ draft.length }} / {{ TYPED_CAPTION_LIMIT }}</small><button type="button" class="composer-send" :aria-label="sending ? '发送中' : '发送'" :aria-busy="sending" :disabled="!canSend" @pointerdown.prevent @click="send"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div>
  </section>
</template>

<style scoped>
.typing-composer { position: fixed; z-index: 900; transform: translate(-50%, -100%); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--home-border); border-radius: 18px; background: var(--room-card-bg); color: var(--home-text); box-shadow: 0 8px 28px #00000012; }
.typing-composer:focus-within { border-color: var(--home-secondary-text); }
textarea { display: block; width: 100%; min-height: 0; flex: 1; resize: none; overflow-y: auto; padding: 12px 14px 0; border: 0; border-radius: 0; background: var(--room-card-bg); color: inherit; font: inherit; font-size: 16px; line-height: 1.5; }
textarea:focus { outline: none; box-shadow: none; }
textarea::placeholder { color: #92968f; opacity: 1; }
.composer-actions { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-shrink: 0; padding: 8px 10px 10px 14px; background: var(--room-card-bg); }
.composer-actions small { padding-bottom: 3px; color: var(--home-secondary-text); font-size: 11px; line-height: 1.5; }
.composer-send { display: grid; place-items: center; width: 32px; min-width: 32px; height: 32px; min-height: 32px; padding: 0; border-radius: 8px; background: var(--home-bg); color: var(--room-card-bg); }
.composer-send:hover { background: var(--home-text); }
.composer-send:disabled { background: #e3e4e0; color: #92968f; opacity: 1; }
</style>
