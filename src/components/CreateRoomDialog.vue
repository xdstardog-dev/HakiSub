<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import HomeDialog from './HomeDialog.vue'
import PinCodeInput from '../../accounts/shared/PinCodeInput.vue'
import { isValidDisplayName, ROOM_NAME_MAXIMUM_UNITS } from '../../accounts/shared/nameRules.mjs'
const props = defineProps<{ busy: boolean; message: string }>()
const emit = defineEmits<{ submit: [roomName: string, password?: string]; close: [] }>()
const roomName = ref(''), validationMessage = ref('')
const privateRoom = ref(false), password = ref('')
function togglePrivateRoom() {
  if (props.busy) return
  privateRoom.value = !privateRoom.value
  password.value = ''; validationMessage.value = ''
}
function submit() {
  if (props.busy) return
  const value = roomName.value.trim()
  if (!isValidDisplayName(value, ROOM_NAME_MAXIMUM_UNITS)) { validationMessage.value = '房间名称最多12个汉字或24个英文／数字，不能包含换行。'; return }
  if (privateRoom.value && !/^\d{4}$/.test(password.value)) { validationMessage.value = '请输入四位数字密码。'; return }
  const submittedPassword = privateRoom.value ? password.value : undefined
  password.value = ''; validationMessage.value = ''; emit('submit', value, submittedPassword)
}
onUnmounted(() => { password.value = '' })
</script>

<template>
  <HomeDialog class="home-entry-dialog" title="创建房间" title-id="create-room-title" @close="emit('close')">
    <form class="home-entry-form" @submit.prevent="submit">
      <input v-model="roomName" aria-label="输入房间名称" placeholder="输入房间名称" maxlength="24" autocomplete="off" :disabled="busy" required autofocus @input="validationMessage = ''" />
      <button type="button" class="home-private-option" :aria-pressed="privateRoom" aria-controls="create-room-password" :disabled="busy" @click="togglePrivateRoom">私密房间</button>
      <PinCodeInput v-if="privateRoom" id="create-room-password" v-model="password" aria-label="四位数字密码" :disabled="busy" @update:model-value="validationMessage = ''" />
      <p v-if="validationMessage || message" class="home-entry-error" role="alert">{{ validationMessage || message }}</p>
      <button type="submit" :disabled="busy || (privateRoom && !/^\d{4}$/.test(password))">{{ busy ? '正在创建…' : '确定' }}</button>
    </form>
  </HomeDialog>
</template>
