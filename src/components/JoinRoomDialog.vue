<script setup lang="ts">
import { ref, watch } from 'vue'
import HomeDialog from './HomeDialog.vue'
const props = defineProps<{ busy: boolean; message: string; roomCode: string }>()
const emit = defineEmits<{ submit: [roomCode: string]; close: [] }>()
const code = ref(props.roomCode)
watch(() => props.roomCode, value => { code.value = value })
function submit() { if (!props.busy && /^\d{6}$/.test(code.value)) emit('submit', code.value) }
</script>

<template>
  <HomeDialog class="home-entry-dialog" title="加入房间" title-id="join-room-title" @close="emit('close')">
    <form class="home-entry-form" @submit.prevent="submit">
      <input v-model="code" aria-label="输入房间号" placeholder="输入房间号" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" :disabled="busy" required autofocus />
      <p v-if="message" class="home-entry-error" role="alert">{{ message }}</p>
      <button type="submit" :disabled="busy">{{ busy ? '正在加入…' : '确定' }}</button>
    </form>
  </HomeDialog>
</template>
