<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

defineProps<{ title: string; titleId: string }>()
const emit = defineEmits<{ close: [] }>()
const dialogElement = ref<HTMLDialogElement | null>(null)
let previousFocus: HTMLElement | null = null
let previousOverflow = ''
onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialogElement.value?.showModal()
})
onUnmounted(() => {
  dialogElement.value?.close()
  document.body.style.overflow = previousOverflow
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
})
</script>

<template>
  <dialog ref="dialogElement" class="home-dialog" :aria-labelledby="titleId" @cancel.prevent="emit('close')">
    <div class="home-dialog-layout">
      <header class="home-dialog-header">
        <h2 :id="titleId">{{ title }}</h2>
        <button type="button" class="home-icon-button" aria-label="关闭弹窗" @click="emit('close')">×</button>
      </header>
      <slot />
    </div>
  </dialog>
</template>
