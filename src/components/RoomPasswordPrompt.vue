<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
const props = defineProps<{ roomCode: string; busy: boolean; message: string; signedIn: boolean }>()
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
    <form @submit.prevent="submit">
      <h2 id="room-password-title">房间 {{ roomCode }} 需要入房码</h2>
      <label for="room-entry-password">四位数字入房码</label>
      <input id="room-entry-password" v-model="password" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" autofocus :disabled="busy" required />
      <p>{{ signedIn ? '验证后，此账号下次可直接进入；更换设备或服务器重启后仍有效。' : '登录账号后验证，可记住此账号的进房资格；游客每次进入需验证。' }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <div class="password-actions"><button type="button" @click="emit('cancel')">取消</button><button type="submit" :disabled="busy || !/^\d{4}$/.test(password)">{{ busy ? '正在验证…' : '进入房间' }}</button></div>
    </form>
  </dialog>
</template>

<style scoped>
.room-password-prompt { margin: auto; width: min(380px, calc(100% - 24px)); max-height: calc(100dvh - 24px); overflow: auto; border: 1px solid #cddbcf; border-radius: 14px; padding: 20px; background: #fbfdf9; color: #24372b; }
.room-password-prompt::backdrop { background: #18302970; }
h2 { margin: 0 0 16px; font-size: 18px; } label { display: block; margin: 0 0 8px; }
input { width: 100%; font-size: 22px; letter-spacing: .35em; } p { font-size: 13px; line-height: 1.7; }
.password-actions { display: flex; justify-content: flex-end; gap: 8px; } button { padding: 8px 14px; border-radius: 8px; background: #e8f0e3; }
</style>
