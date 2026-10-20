<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{ token: string }>()
const emit = defineEmits<{ close: [] }>()
type Configuration = { configured: boolean; readOnly: boolean; busy: boolean; source: 'room' | 'server' | 'none' }
const configuration = ref<Configuration | null>(null)
const apiKey = ref(''), busy = ref(false), message = ref(''), failed = ref(false), confirmDelete = ref(false)
const settingsDialog = ref<HTMLDialogElement | null>(null)
let controller: AbortController | undefined, disposed = false
async function requestConfiguration(action?: 'save' | 'delete' | 'test') {
  if (busy.value || (action && (!configuration.value || configuration.value.readOnly))) return
  busy.value = true; message.value = ''; failed.value = false; confirmDelete.value = false
  const submittedKey = apiKey.value.trim()
  if (action) apiKey.value = ''
  controller = new AbortController()
  const timeout = setTimeout(() => controller?.abort(), 12000)
  try {
    const response = await fetch('/api/rooms/settings', {
      method: action ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${props.token}`, ...(action ? { 'Content-Type': 'application/json' } : {}) },
      ...(action ? { body: JSON.stringify(action === 'save' ? { action, apiKey: submittedKey } : { action }) } : {}),
    })
    const result = await response.json()
    if (disposed) return
    if (!response.ok) throw Error(result.message ?? '房间配置暂时不可用，请重试。')
    if (action === 'test') { failed.value = !result.ok; message.value = result.message }
    else {
      if (typeof result.configured !== 'boolean' || typeof result.readOnly !== 'boolean' || typeof result.busy !== 'boolean' || !['room', 'server', 'none'].includes(result.source)) throw Error('房间配置状态无效，请刷新。')
      configuration.value = result
      message.value = result.message ?? ''
    }
  } catch (error) {
    if (!disposed) { failed.value = true; message.value = error instanceof Error && error.name !== 'AbortError' ? error.message : '请求超时，请刷新配置状态。' }
  } finally { clearTimeout(timeout); if (!disposed) busy.value = false }
}
onMounted(() => { settingsDialog.value?.showModal(); void requestConfiguration() })
onUnmounted(() => { disposed = true; controller?.abort(); apiKey.value = ''; settingsDialog.value?.close() })
</script>

<template>
  <dialog ref="settingsDialog" class="room-api-settings" aria-labelledby="room-api-title" @cancel.prevent="emit('close')">
    <div class="settings-heading"><h2 id="room-api-title">房间豆包配置</h2><button @click="emit('close')">收起配置</button></div>
    <p role="status">{{ configuration ? configuration.configured ? '已配置 API Key' : '尚未配置 API Key' : busy ? '正在读取配置…' : '配置状态暂不可用' }}</p>
    <template v-if="configuration">
      <p v-if="configuration.source === 'server'" class="settings-note">当前使用服务器的默认配置。创建者可为此房间保存独立的 API Key。</p>
      <p v-if="configuration.readOnly" class="settings-note">由房间创建者管理配置。请使用创建房间的浏览器修改；其他成员只看到配置状态。</p>
      <template v-else>
        <p class="settings-note">API Key 仅供本房间使用，加密保存在服务器。退出房间后保留，不回显给成员，也不保存在浏览器。</p>
        <p v-if="configuration.busy" class="settings-note">请所有成员先关闭麦克风，再刷新状态修改配置。</p>
        <form @submit.prevent="requestConfiguration('save')">
          <label for="room-api-key">{{ configuration.source === 'room' ? '更换房间 API Key' : '豆包 API Key' }}</label>
          <input id="room-api-key" v-model="apiKey" type="password" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="粘贴豆包语音服务 API Key" :disabled="busy || configuration.busy">
          <div class="settings-actions"><button class="save-key" type="submit" :disabled="busy || configuration.busy || !apiKey.trim()">保存房间配置</button><button type="button" :disabled="busy || configuration.busy || !configuration.configured || !!apiKey.trim()" @click="requestConfiguration('test')">测试连接</button></div>
        </form>
        <p class="settings-note">测试仅检查连接，不采集音频。真实识别需手动开启麦克风，并按豆包服务用量计费。</p>
        <button v-if="configuration.source === 'room'" :disabled="busy || configuration.busy" @click="confirmDelete = true">移除房间配置</button>
        <div v-if="confirmDelete" class="settings-actions"><span>确认移除此房间的 Key？</span><button @click="requestConfiguration('delete')">确认移除</button><button @click="confirmDelete = false">取消</button></div>
      </template>
    </template>
    <div class="settings-actions"><button :disabled="busy" @click="requestConfiguration()">刷新状态</button></div>
    <p v-if="message" :class="{ error: failed }" role="status">{{ message }}</p>
  </dialog>
</template>

<style scoped>
.room-api-settings{margin:auto;padding:18px 20px;width:min(480px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;border:1px solid #cddbcf;border-radius:14px;background:#fbfdf9;color:#24372b}.room-api-settings::backdrop{background:#18302970}.settings-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}h2{font-size:18px;margin:0}p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}.settings-note{color:#617267}label{display:block;font-size:13px;margin:12px 0 7px}input{width:100%;max-width:560px;min-height:44px;padding:10px;border:1px solid #bac9c0;border-radius:8px}.settings-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}button{padding:9px 12px;background:#eef3ed;border-radius:8px;font-size:13px}.save-key{background:#1b604e;color:white}.error{color:#a32c2c}
</style>
