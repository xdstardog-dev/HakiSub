<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { createAccountClient, accountCenterUrl } from '../accountClient'

const props = defineProps<{ token: string; code?: string; ownerToken?: string; statusVersion?: number }>()
const emit = defineEmits<{ close: []; bound: [] }>()
type Configuration = { configured: boolean; readOnly: boolean; busy: boolean; source: 'room' | 'server' | 'none'; bound?: boolean; asrEnabled?: boolean; keyState?: string }
const configuration = ref<Configuration | null>(null)
const apiKey = ref(''), busy = ref(false), message = ref(''), failed = ref(false), confirmDelete = ref(false)
const revealedKey = ref(''), keyVisible = ref(false), editingKey = ref(false)
function clearKeyDisplay() { revealedKey.value = ''; keyVisible.value = false; editingKey.value = false }
function editKey(event: Event) { apiKey.value = (event.target as HTMLInputElement).value; revealedKey.value = '' }
async function toggleKey() {
  if (busy.value || configuration.value?.readOnly) return
  if (keyVisible.value) { clearKeyDisplay(); return }
  if (apiKey.value) { keyVisible.value = true; return }
  await requestConfiguration('reveal')
}
const settingsDialog = ref<HTMLDialogElement | null>(null)
let controller: AbortController | undefined, disposed = false
let accountClient: ReturnType<typeof createAccountClient> | undefined
let refreshAgain = false
watch(() => props.statusVersion, () => { if (busy.value) refreshAgain = true; else void requestConfiguration() })
async function bindAccount() {
  if (!props.ownerToken || !props.code || busy.value) return
  busy.value = true; message.value = ''; failed.value = false
  try {
    accountClient ??= createAccountClient()
    await accountClient.bindRoom(props.code, props.ownerToken)
    if (!disposed) { emit('bound'); message.value = '房间已绑定当前账号，原匿名凭据已撤销。' }
  } catch (error) { if (!disposed) { failed.value = true; message.value = error instanceof Error ? error.message : '绑定失败，请重试。' } }
  finally { if (!disposed) { busy.value = false; void requestConfiguration() } }
}
async function requestConfiguration(action?: 'save' | 'delete' | 'test' | 'asr' | 'reveal') {
  if (busy.value || (action && (!configuration.value || configuration.value.readOnly))) return
  busy.value = true; message.value = ''; failed.value = false; confirmDelete.value = false
  const submittedKey = apiKey.value.trim()
  if (action === 'save' && (!submittedKey || /^\*+$/.test(submittedKey))) { busy.value = false; return }
  clearKeyDisplay()
  if (action) apiKey.value = ''
  controller = new AbortController()
  const timeout = setTimeout(() => controller?.abort(), 12000)
  try {
    if (action && configuration.value?.bound) {
      accountClient ??= createAccountClient()
      const result = await accountClient.manageRoom(props.code ?? '', { action, ...(action === 'save' ? { apiKey: submittedKey } : {}), ...(action === 'asr' ? { enabled: !configuration.value.asrEnabled } : {}) })
      if (!disposed) {
        if (action === 'reveal') { revealedKey.value = result.apiKey ?? ''; keyVisible.value = true }
        else if (action === 'test') { failed.value = !result.ok; message.value = result.message ?? '' }
        else { configuration.value = { ...result.room!, readOnly: false }; message.value = result.message ?? '' }
      }
      return
    }
    const response = await fetch('/api/rooms/settings', {
      method: action ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${props.token}`, ...(action ? { 'Content-Type': 'application/json' } : {}) },
      ...(action ? { body: JSON.stringify(action === 'save' ? { action, apiKey: submittedKey } : action === 'asr' ? { action, enabled: !configuration.value?.asrEnabled } : { action }) } : {}),
    })
    const result = await response.json()
    if (disposed) return
    if (!response.ok) throw Error(result.message ?? '房间配置暂时不可用，请重试。')
    if (action === 'reveal') { revealedKey.value = result.apiKey ?? ''; keyVisible.value = true }
    else if (action === 'test') { failed.value = !result.ok; message.value = result.message }
    else {
      if (typeof result.configured !== 'boolean' || typeof result.readOnly !== 'boolean' || typeof result.busy !== 'boolean' || !['room', 'server', 'none'].includes(result.source)) throw Error('房间配置状态无效，请刷新。')
      configuration.value = result
      if (result.bound) {
        accountClient ??= createAccountClient()
        const owned = (await accountClient.rooms()).rooms.find(room => room.code === props.code)
        if (!disposed && owned) configuration.value = { ...owned, readOnly: false }
      }
      message.value = result.message ?? ''
    }
  } catch (error) {
    if (!disposed) { failed.value = true; message.value = error instanceof Error && error.name !== 'AbortError' ? error.message : '请求超时，请刷新配置状态。' }
  } finally {
    clearTimeout(timeout)
    if (!disposed) { busy.value = false; if (refreshAgain) { refreshAgain = false; void requestConfiguration() } }
  }
}
onMounted(() => { settingsDialog.value?.showModal(); void requestConfiguration() })
onUnmounted(() => { disposed = true; controller?.abort(); accountClient?.cancel(); apiKey.value = ''; clearKeyDisplay(); settingsDialog.value?.close() })
</script>

<template>
  <dialog ref="settingsDialog" class="room-api-settings" aria-labelledby="room-api-title" @cancel.prevent="emit('close')">
    <div class="settings-heading"><h2 id="room-api-title">房间豆包配置</h2><button @click="emit('close')">收起配置</button></div>
    <p role="status">{{ configuration ? configuration.configured ? '已配置 API Key' : '尚未配置 API Key' : busy ? '正在读取配置…' : '配置状态暂不可用' }}</p>
    <template v-if="configuration">
      <p>豆包 ASR：{{ configuration.asrEnabled === false ? '已暂停' : '已开启（仍需本房间 Key）' }}</p>
      <p v-if="configuration.keyState === 'deleted'">房主已删除 Key，豆包识别不可用。</p>
      <p v-if="configuration.bound" class="settings-note">房间已绑定账号。<a :href="accountCenterUrl" target="_blank" rel="noopener noreferrer">打开个人中心</a>登录房主账号可跨设备管理。</p>
      <p v-if="configuration.readOnly" class="settings-note">由房间创建者管理配置。请使用创建房间的浏览器修改；其他成员只看到配置状态。</p>
      <template v-else>
        <p class="settings-note">API Key 仅保存在当前后端进程内存中。重启后须由房主重填；点击显示仅供房主临时查看，关闭配置后清除。</p>
        <p class="settings-note">更换或删除 Key、切换 ASR 会停止本房间的豆包会话；成员之后需手动开麦。</p>
        <button v-if="!configuration.bound && props.ownerToken" :disabled="busy" @click="bindAccount">绑定当前登录账号</button>
        <button :disabled="busy || configuration.busy" @click="requestConfiguration('asr')">{{ configuration.asrEnabled === false ? '开启豆包 ASR' : '暂停豆包 ASR' }}</button>
        <form @submit.prevent="requestConfiguration('save')">
          <label for="room-api-key">{{ configuration.source === 'room' ? '更换房间 API Key' : '豆包 API Key' }}</label>
          <div class="secret-field"><input id="room-api-key" :value="apiKey || revealedKey || (configuration.configured && !editingKey ? '********' : '')" @input="editKey" @focus="editingKey = true" @blur="editingKey = false" :type="keyVisible ? 'text' : 'password'" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="粘贴豆包语音服务 API Key" :disabled="busy || configuration.busy"><button type="button" aria-controls="room-api-key" :aria-pressed="keyVisible" :disabled="busy || configuration.busy || (!apiKey && !configuration.configured)" @click="toggleKey">{{ keyVisible ? '隐藏' : '显示' }}</button></div>
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
.secret-field{display:flex;gap:8px;align-items:center}.secret-field input{min-width:0;flex:1}.secret-field button{flex-shrink:0}
.room-api-settings{margin:auto;padding:18px 20px;width:min(480px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;border:1px solid #cddbcf;border-radius:14px;background:#fbfdf9;color:#24372b}.room-api-settings::backdrop{background:#18302970}.settings-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}h2{font-size:18px;margin:0}p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}.settings-note{color:#617267}label{display:block;font-size:13px;margin:12px 0 7px}input{width:100%;max-width:560px;min-height:44px;padding:10px;border:1px solid #bac9c0;border-radius:8px}.settings-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}button{padding:9px 12px;background:#eef3ed;border-radius:8px;font-size:13px}.save-key{background:#1b604e;color:white}.error{color:#a32c2c}
</style>
