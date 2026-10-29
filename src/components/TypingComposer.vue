<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { shouldSendTypedCaption, TYPED_CAPTION_LIMIT } from '../roomInteractions'

const props = defineProps<{ draft: string; sending: boolean; now: number; cooldownUntil: number }>()
const emit = defineEmits<{ 'update:draft': [text: string]; send: []; close: [] }>()
const inputElement = ref<HTMLTextAreaElement | null>(null)
const composing = ref(false)
let compositionEndedAt = -Infinity
const placement = ref({ left: 0, bottom: 0, width: 480, maxHeight: 400 })
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
    width: Math.max(0, Math.min(480, width - 24)),
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
onMounted(() => {
  viewport = window.visualViewport
  updatePlacement()
  viewport?.addEventListener('resize', updatePlacement)
  viewport?.addEventListener('scroll', updatePlacement)
  window.addEventListener('resize', updatePlacement)
  inputElement.value?.focus({ preventScroll: true })
})
onUnmounted(() => {
  viewport?.removeEventListener('resize', updatePlacement)
  viewport?.removeEventListener('scroll', updatePlacement)
  window.removeEventListener('resize', updatePlacement)
})
</script>

<template>
  <section class="typing-composer" role="dialog" aria-labelledby="typing-composer-title" :style="windowStyle">
    <div class="composer-heading"><h2 id="typing-composer-title">打字字幕</h2><button type="button" aria-label="收起输入框" @click="emit('close')">收起</button></div>
    <textarea ref="inputElement" :value="draft" :maxlength="TYPED_CAPTION_LIMIT" aria-label="输入字幕" placeholder="输入你想说的话…" rows="3" @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)" @keydown="handleKeydown" @compositionstart="composing = true" @compositionend="endComposition" />
    <div class="composer-actions"><small>Enter 发送 · Shift+Enter 换行<br />{{ draft.length }} / {{ TYPED_CAPTION_LIMIT }} · 仅发送后同步</small><button type="button" class="composer-send" :disabled="!canSend" @pointerdown.prevent @click="send">{{ sending ? '发送中…' : '发送' }}</button></div>
  </section>
</template>

<style scoped>
.typing-composer { position: fixed; z-index: 900; transform: translate(-50%, -100%); display: flex; flex-direction: column; gap: 10px; padding: 12px; overflow: auto; border: 1px solid #bacbb7; border-radius: 14px; background: #fff; color: #243b34; box-shadow: 0 8px 32px #18342130; }
.composer-heading, .composer-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }
.composer-heading h2 { margin: 0; font-size: 15px; }
.composer-heading button { min-height: 32px; padding: 4px 8px; font-size: 13px; }
textarea { width: 100%; min-height: 56px; flex: 1; resize: none; padding: 10px; border: 1px solid #c8d4c3; border-radius: 8px; font: inherit; font-size: 16px; line-height: 1.5; }
textarea:focus { outline: 2px solid #76b5a1; outline-offset: 1px; }
.composer-actions small { color: #666; font-size: 11px; line-height: 1.5; }
.composer-send { min-width: 72px; padding: 8px 16px; border-radius: 8px; background: #e8f0e3; font-size: 14px; }
</style>
