<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import AsrUsageStatistics from './AsrUsageStatistics.vue'
import PinCodeInput from '../../accounts/shared/PinCodeInput.vue'
import { countNameUnits, isValidDisplayName, ROOM_NAME_MAXIMUM_UNITS } from '../../accounts/shared/nameRules.mjs'

type Configuration = { configured: boolean; readOnly: boolean; source: 'environment' | 'file'; csrfToken: string; busy: boolean }
const props = defineProps<{ roomName?: string; accessCode?: string }>()
const localDialog = ref<HTMLDialogElement | null>(null)
const emit = defineEmits<{ close: []; rename: [name: string]; 'access-code': [code: string] }>()
const newRoomName = ref(''), newAccessCode = ref(''), roomMessage = ref('')
function saveRoomName() {
  if (props.roomName === undefined || !isValidDisplayName(newRoomName.value.trim(), ROOM_NAME_MAXIMUM_UNITS)) return
  emit('rename', newRoomName.value.trim()); newRoomName.value = ''; roomMessage.value = '房间名称已保存。'
}
function saveAccessCode(value: string) {
  if (props.roomName === undefined || (value !== '' && !/^\d{4}$/.test(value))) return
  emit('access-code', value); newAccessCode.value = ''; roomMessage.value = value ? '入房码已保存。' : '已移除入房码。'
}
const configuration = ref<Configuration | null>(null)
const managedByServer = ref(false), serverConfigured = ref(false)
const configurationState = ref<'loading' | 'available' | 'unavailable'>('loading')
const configurationLabel = computed(() => configurationState.value === 'loading' ? '正在读取配置…'
  : configurationState.value === 'unavailable' ? '配置状态暂不可用'
    : (managedByServer.value ? serverConfigured.value : configuration.value?.configured) ? '已配置 API Key' : '尚未配置 API Key')
const apiKey = ref(''), message = ref(''), failed = ref(false), busy = ref(false), confirmDelete = ref(false)
const revealedKey = ref(''), keyVisible = ref(false), editingKey = ref(false)
function clearKeyDisplay() { revealedKey.value = ''; keyVisible.value = false; editingKey.value = false }
function editKey(event: Event) { apiKey.value = (event.target as HTMLInputElement).value; revealedKey.value = '' }
async function toggleKey() {
  if (busy.value || managedByServer.value || configuration.value?.readOnly) return
  if (keyVisible.value) { clearKeyDisplay(); return }
  if (apiKey.value) { keyVisible.value = true; return }
  await requestConfiguration('reveal')
}
const keyInput = ref<HTMLInputElement | null>(null)
let controller: AbortController | undefined
let disposed = false

async function requestConfiguration(action?: 'save' | 'delete' | 'test' | 'reveal') {
  if (busy.value || (action && (managedByServer.value || !configuration.value))) return
  busy.value = true; failed.value = false; message.value = ''; confirmDelete.value = false
  if (!action) configurationState.value = 'loading'
  controller = new AbortController()
  const timeout = setTimeout(() => controller?.abort(), 12000)
  // 输入值仅用于这次请求，提交后立即清空，不在浏览器持久化。
  const submittedKey = apiKey.value.trim()
  if (action === 'save' && (!submittedKey || /^\*+$/.test(submittedKey))) { busy.value = false; clearTimeout(timeout); return }
  clearKeyDisplay()
  if (action) apiKey.value = ''
  try {
    let response = await fetch(managedByServer.value ? '/api/asr/health' : `/api/asr/settings${action === 'test' ? '/test' : ''}`, {
      method: action ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
      ...(action ? { headers: { 'Content-Type': 'application/json', 'X-HakiSub-Token': configuration.value?.csrfToken ?? '' },
        body: JSON.stringify(action === 'save' ? { action, apiKey: submittedKey } : { action }) } : {}),
    })
    if (disposed) return
    // 设置404表示此服务未开放网页管理；只查询无密钥的健康状态，不放开写接口。
    if (!action && response.status === 404 && !managedByServer.value) {
      managedByServer.value = true; configuration.value = null; apiKey.value = ''
      response = await fetch('/api/asr/health', { cache: 'no-store', signal: controller.signal })
    }
    if (disposed) return
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('配置服务暂时不可用，请检查服务连接后刷新状态。')
    const result = await response.json()
    if (!response.ok) throw Error(result.message ?? '设置操作失败，请重试。')
    if (disposed) return
    if (!action) {
      if (typeof result?.configured !== 'boolean') throw Error('服务返回的配置状态无效，请稍后刷新状态。')
      if (managedByServer.value) serverConfigured.value = result.configured
      else {
        if (typeof result.readOnly !== 'boolean' || typeof result.csrfToken !== 'string' || typeof result.busy !== 'boolean') throw Error('服务返回的配置状态无效，请稍后刷新状态。')
        configuration.value = result
      }
      configurationState.value = 'available'
      if (!managedByServer.value) { await nextTick(); if (!disposed) keyInput.value?.focus() }
    }
    else if (action === 'reveal') { revealedKey.value = result.apiKey ?? ''; keyVisible.value = true }
    else if (action === 'test') { failed.value = !result.ok; message.value = result.message }
    else { configuration.value = { ...configuration.value!, ...result }; message.value = result.message }
  } catch (error) {
    if (!disposed) {
      if (!action) configurationState.value = 'unavailable'
      failed.value = true
      message.value = error instanceof Error && error.name !== 'AbortError' ? error.message : '请求超时，请检查服务连接后刷新状态。'
    }
  } finally { clearTimeout(timeout); if (!disposed) busy.value = false }
}
onMounted(() => { localDialog.value?.showModal?.(); void requestConfiguration() })
onUnmounted(() => { disposed = true; controller?.abort(); apiKey.value = ''; newAccessCode.value = ''; localDialog.value?.close?.(); clearKeyDisplay() })
</script>

<template>
  <component :is="props.roomName === undefined ? 'section' : 'dialog'" ref="localDialog" class="api-settings" aria-labelledby="api-settings-title" @cancel.prevent="emit('close')">
    <div class="settings-heading"><h1 id="api-settings-title">设置</h1><button @click="emit('close')">返回房间</button></div>
    <div v-if="props.roomName !== undefined" class="settings-card simulation-room-settings">
      <h2>房间设置</h2><p>房间名称：{{ props.roomName }}</p>
      <form @submit.prevent="saveRoomName"><label for="simulation-room-name">房间名称</label><input id="simulation-room-name" v-model="newRoomName" :placeholder="props.roomName" maxlength="24" required />
        <p class="settings-note">最多12个汉字或24个英文／数字，混合折算 {{ countNameUnits(newRoomName.trim()) }}/24。</p>
        <button type="submit" :disabled="!isValidDisplayName(newRoomName.trim(), ROOM_NAME_MAXIMUM_UNITS)">保存房间名称</button>
      </form>
      <p class="current-access-code">{{ props.accessCode ? '房间密码已设置；只能更换或移除。' : '入房码：未设置，可直接加入' }}</p>
      <form @submit.prevent="saveAccessCode(newAccessCode)"><label for="simulation-access-code">{{ props.accessCode ? '更换四位入房码' : '设置四位入房码' }}</label><PinCodeInput id="simulation-access-code" v-model="newAccessCode" />
        <div class="settings-actions"><button type="submit" :disabled="!/^\d{4}$/.test(newAccessCode)">保存入房码</button><button v-if="props.accessCode" type="button" @click="saveAccessCode('')">移除入房码</button></div>
      </form>
      <p class="settings-note">本地模拟设置仅当前房间有效，离房清空；入房码用于演示，不参与联网验证。</p>
      <p v-if="roomMessage" role="status">{{ roomMessage }}</p>
    </div>
    <div class="settings-card">
      <h2>豆包语音识别</h2>
      <p>ASR 2.0 · 小时版</p>
      <p role="status">{{ configurationLabel }}</p>
      <template v-if="managedByServer">
        <p class="settings-note">API Key 由服务器统一管理，此页面只显示配置状态。</p>
        <p v-if="configurationState === 'available'" class="settings-note">{{ serverConfigured ? '服务器已配置密钥，可进入真实联网房间验收语音识别。' : '语音识别需要管理员在服务器配置 API Key；配置完成后刷新状态。' }}</p>
        <button :disabled="busy" @click="requestConfiguration()">刷新状态</button>
      </template>
      <template v-else-if="configuration">
      <p class="settings-note">密钥保存在这台电脑的本地配置文件中，尚未加密。默认显示掩码，点击显示可临时查看，不写入浏览器存储。此设置目前只供本机使用。</p>
      <p v-if="configuration?.readOnly" class="settings-note">当前使用启动环境提供的密钥。若要在这里更换，请先移除环境变量并重启服务。</p>
      <p v-if="configuration?.busy" class="settings-note">当前正在识别或处理设置，请停止识别后刷新状态。</p>
      <form @submit.prevent="requestConfiguration('save')">
        <label for="doubao-api-key">{{ configuration?.configured ? '更换 API Key' : 'API Key' }}</label>
        <div class="secret-field"><input id="doubao-api-key" ref="keyInput" :value="apiKey || revealedKey || (configuration.configured && !editingKey ? '********' : '')" @input="editKey" @focus="editingKey = true" @blur="editingKey = false" :type="keyVisible ? 'text' : 'password'" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="粘贴豆包语音服务 API Key" :disabled="busy || !configuration || configuration.readOnly || configuration.busy" /><button type="button" aria-controls="doubao-api-key" :aria-pressed="keyVisible" :disabled="busy || configuration.readOnly || configuration.busy || (!apiKey && !configuration.configured)" @click="toggleKey">{{ keyVisible ? '隐藏' : '显示' }}</button></div>
        <div class="settings-actions">
          <button class="save-key" type="submit" :disabled="busy || !apiKey.trim() || !configuration || configuration.readOnly || configuration.busy">保存配置</button>
          <button type="button" :disabled="busy || !configuration?.configured || configuration.busy || !!apiKey.trim()" @click="requestConfiguration('test')">测试已保存的连接</button>
        </div>
      </form>
      <p class="settings-note">测试只连接豆包并检查握手，不采集或上传音频；通过后仍需进入房间讲话验收。</p>
      <div class="settings-actions">
        <button :disabled="busy" @click="requestConfiguration()">刷新状态</button>
        <button :disabled="busy || !configuration?.configured || configuration.readOnly || configuration.busy" @click="confirmDelete = true">删除本地配置</button>
      </div>
      <div v-if="confirmDelete" class="delete-confirm">
        <p>删除后，豆包识别将不可用，直到重新填写密钥。</p>
        <button @click="requestConfiguration('delete')">确认删除</button><button @click="confirmDelete = false">取消</button>
      </div>
      <AsrUsageStatistics />
      </template>
      <button v-else-if="!busy" @click="requestConfiguration()">刷新状态</button>
      <p v-if="busy" role="status">正在处理，请稍候…</p>
      <p v-if="message" :class="{ 'settings-error': failed }" role="status">{{ message }}</p>
    </div>
  </component>
</template>

<style scoped>
.secret-field{display:flex;gap:8px;align-items:center}.secret-field input{min-width:0;flex:1}.secret-field button{flex-shrink:0}
.api-settings { padding: 20px 0 32px; }
dialog.api-settings { margin: auto; padding: 18px; width: min(560px, calc(100% - 24px)); max-height: calc(100dvh - 24px); overflow: auto; border: 1px solid var(--home-border); border-radius: 14px; background: var(--room-card-bg); color: var(--home-text); }
dialog.api-settings::backdrop { background: #181a1d80; }
.simulation-room-settings { margin-bottom: 16px; }
.settings-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h1 { font-size: 24px; } h2 { margin: 0; font-size: 20px; }
.settings-card { background: var(--room-card-bg); color: var(--home-text); border: 1px solid var(--home-border); border-radius: 18px; padding: 20px; }
p { font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.settings-note { color: var(--home-secondary-text); font-size: 13px; }
label { display: block; margin: 20px 0 8px; font-size: 14px; }
input { display: block; width: 100%; min-height: 44px; border: 1px solid var(--home-border); border-radius: 8px; padding: 10px; background: #fafaf8; color: var(--home-text); }
.settings-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
button { border-radius: 8px; padding: 8px 12px; background: #dedfdb; font-size: 13px; }
.save-key { background: var(--home-bg); color: var(--home-light-text); }
.settings-error { color: #a32c2c; }
.delete-confirm { padding: 8px; border: 1px solid #d9b2a8; border-radius: 8px; margin-top: 12px; }
.delete-confirm button { margin-right: 8px; }
</style>
