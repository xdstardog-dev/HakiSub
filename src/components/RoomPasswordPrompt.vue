<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import PinCodeInput from '../../accounts/shared/PinCodeInput.vue'
const props = defineProps<{ busy: boolean; message: string }>()
const emit = defineEmits<{ submit: [password: string]; cancel: [] }>()
const dialogElement = ref<HTMLDialogElement | null>(null)
const password = ref('')
function submit() {
  if (props.busy || !/^\d{4}$/.test(password.value)) return
  const submitted = password.value
  password.value = ''; emit('submit', submitted)
}
onMounted(() => dialogElement.value?.showModal())
onUnmounted(() => { password.value = ''; dialogElement.value?.close() })
</script>

<template>
  <dialog ref="dialogElement" class="room-password-prompt" aria-labelledby="room-password-title" @cancel.prevent="emit('cancel')">
    <header class="password-heading"><h2 id="room-password-title">这是一个加密房间</h2><button type="button" aria-label="关闭弹窗" @click="emit('cancel')">×</button></header>
    <form class="home-entry-form" @submit.prevent="submit">
      <PinCodeInput id="room-entry-password" v-model="password" aria-label="输入密码" autofocus :disabled="busy" />
      <p v-if="message" class="home-entry-error" role="status">{{ message }}</p>
      <button type="submit" :disabled="busy || !/^\d{4}$/.test(password)">{{ busy ? '正在验证…' : '确定' }}</button>
    </form>
  </dialog>
</template>

<style scoped>
.room-password-prompt { margin: auto; width: min(440px, calc(100% - 24px)); max-height: calc(100dvh - 24px); overflow: auto; border: 1px solid var(--home-border); border-radius: 20px; padding: 0; background: var(--room-card-bg); color: var(--home-text); }
.room-password-prompt::backdrop { background: #181a1db3; }
.password-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--home-border); }
h2 { margin: 0; font-size: 20px; } .password-heading button { width: 44px; font-size: 28px; }
</style>
