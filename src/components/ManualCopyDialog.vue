<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
defineProps<{ text: string; label: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const field = ref<HTMLTextAreaElement | null>(null)
function selectText() { field.value?.focus(); field.value?.select() }
onMounted(() => { dialog.value?.showModal(); selectText() })
onUnmounted(() => dialog.value?.close())
</script>

<template>
  <dialog ref="dialog" class="manual-copy-dialog" aria-labelledby="manual-copy-title" @cancel.prevent="emit('close')">
    <h2 id="manual-copy-title">手动复制{{ label }}</h2>
    <p>自动复制未完成，请长按文本或全选后复制。</p>
    <textarea ref="field" :aria-label="label" :value="text" readonly rows="3" />
    <div><button type="button" @click="selectText">全选</button><button type="button" @click="emit('close')">关闭</button></div>
  </dialog>
</template>

<style scoped>
.manual-copy-dialog { margin: auto; width: min(420px, calc(100% - 32px)); padding: 20px; border: 1px solid var(--home-border); border-radius: 20px; background: var(--room-card-bg); color: var(--home-text); }
.manual-copy-dialog::backdrop { background: #181a1db3; }
h2 { margin: 0; font-size: 20px; } p { font-size: 14px; }
textarea { width: 100%; resize: none; font-size: 16px; user-select: text; }
div { display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px; }
</style>
