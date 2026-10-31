<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import PinCodeInput from '../../accounts/shared/PinCodeInput.vue'
import { createAccountClient, accountCenterUrl } from '../accountClient'
import type { SoundPreferences } from '../roomInteractions'
import { isValidDisplayName, ROOM_NAME_MAXIMUM_UNITS } from '../../accounts/shared/nameRules.mjs'

const props = defineProps<{ token: string; code?: string; ownerToken?: string; statusVersion?: number; preferences?: SoundPreferences; speechVolume?: number; speechEnabled?: boolean; adaptive?: boolean; storageFailed?: boolean }>()
const emit = defineEmits<{ close: []; bound: []; sound: [value: SoundPreferences]; speech: [volume: number]; speechEnabled: [enabled: boolean]; layout: [adaptive: boolean] }>()
const speechMuted = computed(() => props.speechEnabled === false || (props.speechVolume ?? 60) === 0)
const reactionMuted = computed(() => props.preferences?.enabled === false || props.preferences?.volume === 0)
const lastSpeechVolume = ref((props.speechVolume ?? 60) > 0 ? props.speechVolume ?? 60 : 60)
const lastReactionVolume = ref((props.preferences?.volume ?? 60) > 0 ? props.preferences?.volume ?? 60 : 60)
watch(() => props.speechVolume, volume => { if (volume && volume > 0) lastSpeechVolume.value = volume })
watch(() => props.preferences?.volume, volume => { if (volume && volume > 0) lastReactionVolume.value = volume })
function toggleSpeechSound() {
  // 静音只切换开关，保留滑块值；手动拖到0时也能恢复最近的非零音量。
  const restoring = speechMuted.value
  if (restoring && (props.speechVolume ?? 60) === 0) emit('speech', lastSpeechVolume.value)
  emit('speechEnabled', restoring)
}
function toggleReactionSound() {
  const volume = props.preferences?.volume ?? 60
  emit('sound', { enabled: reactionMuted.value, volume: reactionMuted.value && volume === 0 ? lastReactionVolume.value : volume })
}
type Configuration = { name?: string; configured: boolean; readOnly: boolean; busy: boolean; source: 'room' | 'server' | 'none'; bound?: boolean; asrEnabled?: boolean; keyState?: string; requiresPassword?: boolean }
const configuration = ref<Configuration | null>(null)
const apiKey = ref(''), busy = ref(false), message = ref(''), failed = ref(false), confirmDelete = ref(false)
const activeAction = ref(''), connectionTestMessage = ref(''), connectionTestFailed = ref(false)
const newAccessCode = ref('')
const newRoomName = ref('')
const page = ref<'personal' | 'owner'>('personal')
const editingName = ref(false), passwordEnabled = ref(false), editingKey = ref(false)
const nameEditor = ref<HTMLElement | null>(null), nameInput = ref<HTMLInputElement | null>(null)
const deleteDialog = ref<HTMLDialogElement | null>(null)
function clearKeyDisplay() { apiKey.value = ''; editingKey.value = false }
function resetConnectionTest() { connectionTestMessage.value = ''; connectionTestFailed.value = false }
function cancelNameEditing() { newRoomName.value = ''; editingName.value = false }
function beginNameEditing() {
  if (busy.value || configuration.value?.readOnly) return
  newRoomName.value = configuration.value?.name ?? ('房间 ' + (props.code ?? ''))
  editingName.value = true
  void nextTick(() => { nameInput.value?.focus(); nameInput.value?.select() })
}
function cancelNameEditingOutside(event: PointerEvent) {
  // 确认按钮属于同一编辑行，不能因输入框失焦而先取消提交。
  if (editingName.value && activeAction.value !== 'rename' && !nameEditor.value?.contains(event.target as Node)) cancelNameEditing()
}
function startKeyReplacement() { clearKeyDisplay(); resetConnectionTest(); editingKey.value = true }
function closeDeleteConfirmation() { deleteDialog.value?.close(); confirmDelete.value = false }
function openDeleteConfirmation() {
  if (busy.value || configuration.value?.readOnly || !configuration.value?.configured || !editingKey.value) return
  confirmDelete.value = true
  void nextTick(() => deleteDialog.value?.showModal())
}
function confirmKeyRemoval() { closeDeleteConfirmation(); void requestConfiguration('delete') }
function showConnectionTestResult(result: { ok?: boolean; message?: string }) {
  connectionTestFailed.value = result.ok !== true
  connectionTestMessage.value = result.ok === true ? 'key测试通过！' : result.message || 'key测试未通过，请重试。'
}
function openOwnerSettings() { clearKeyDisplay(); cancelNameEditing(); resetConnectionTest(); page.value = 'owner'; passwordEnabled.value = !!configuration.value?.requiresPassword }
function backToPersonal() { clearKeyDisplay(); closeDeleteConfirmation(); cancelNameEditing(); resetConnectionTest(); newAccessCode.value = ''; page.value = 'personal' }
async function changePasswordSwitch(event: Event) {
 const enabled = (event.target as HTMLInputElement).checked
 if (enabled) passwordEnabled.value = true
 else if (configuration.value?.requiresPassword) {
   passwordEnabled.value = false
   await requestConfiguration('access-code', '')
   passwordEnabled.value = !!configuration.value?.requiresPassword
 }
 else { passwordEnabled.value = false; newAccessCode.value = '' }
}
async function changeAsrSwitch(event: Event) {
  const input = event.target as HTMLInputElement
  await requestConfiguration('asr')
  input.checked = configuration.value?.asrEnabled !== false
}
function changeReactionVolume(event: Event) { emit('sound', { enabled: true, volume: Number((event.target as HTMLInputElement).value) }) }
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
async function requestConfiguration(action?: 'save' | 'delete' | 'test' | 'asr' | 'access-code' | 'rename', accessCode?: string) {
  if (busy.value || (action && (!configuration.value || configuration.value.readOnly))) return
  if (action === 'access-code' && (typeof accessCode !== 'string' || (accessCode !== '' && !/^\d{4}$/.test(accessCode)))) return
  if (action === 'rename' && !isValidDisplayName(newRoomName.value.trim(), ROOM_NAME_MAXIMUM_UNITS)) return
  const submittedKey = apiKey.value.trim()
  if (action === 'save' && (!submittedKey || /^\*+$/.test(submittedKey))) return
  busy.value = true; message.value = ''; failed.value = false; activeAction.value = action ?? ''
  if (action === 'save' || action === 'delete') { clearKeyDisplay(); resetConnectionTest(); closeDeleteConfirmation() }
  if (action === 'test') resetConnectionTest()
  if (action === 'access-code') newAccessCode.value = ''
  const command = { action, ...(action === 'save' ? { apiKey: submittedKey } : {}), ...(action === 'asr' ? { enabled: !configuration.value?.asrEnabled } : {}), ...(action === 'access-code' ? { accessCode } : {}), ...(action === 'rename' ? { name: newRoomName.value.trim() } : {}) }
  controller = new AbortController()
  const timeout = setTimeout(() => controller?.abort(), 12000)
  try {
    if (action && configuration.value?.bound) {
      accountClient ??= createAccountClient()
      const result = await accountClient.manageRoom(props.code ?? '', command)
      if (!disposed) {
        if (action === 'test') showConnectionTestResult(result)
        else { configuration.value = { ...result.room!, readOnly: false }; if (action === 'access-code') passwordEnabled.value = !!result.room?.requiresPassword; message.value = ['save', 'delete', 'rename'].includes(action ?? '') ? '' : result.message ?? ''; if (action === 'rename') { newRoomName.value = ''; editingName.value = false } }
      }
      return
    }
    const response = await fetch('/api/rooms/settings', {
      method: action ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${props.token}`, ...(action ? { 'Content-Type': 'application/json' } : {}) },
      ...(action ? { body: JSON.stringify(command) } : {}),
    })
    const result = await response.json()
    if (disposed) return
    if (!response.ok) throw Error(result.message ?? '房间配置暂时不可用，请重试。')
    if (action === 'test') showConnectionTestResult(result)
    else {
      if (typeof result.configured !== 'boolean' || typeof result.readOnly !== 'boolean' || typeof result.busy !== 'boolean' || !['room', 'server', 'none'].includes(result.source)) throw Error('房间配置状态无效，请刷新。')
      configuration.value = result
      if (action === 'access-code') passwordEnabled.value = !!result.requiresPassword
      if (action === 'rename') { newRoomName.value = ''; editingName.value = false }
      if (result.bound) {
        accountClient ??= createAccountClient()
        const owned = (await accountClient.rooms()).rooms.find(room => room.code === props.code)
        if (!disposed && owned) configuration.value = { ...owned, readOnly: false }
      }
      message.value = ['save', 'delete', 'rename'].includes(action ?? '') ? '' : result.message ?? ''
    }
  } catch (error) {
    if (!disposed) {
      const errorMessage = error instanceof Error && error.name !== 'AbortError' ? error.message : '请求超时，请刷新配置状态。'
      if (action === 'test') showConnectionTestResult({ ok: false, message: errorMessage })
      else { failed.value = true; message.value = errorMessage }
    }
  } finally {
    clearTimeout(timeout)
    if (!disposed) { busy.value = false; activeAction.value = ''; if (refreshAgain) { refreshAgain = false; void requestConfiguration() } }
  }
}
onMounted(() => { settingsDialog.value?.showModal(); void requestConfiguration() })
onUnmounted(() => { disposed = true; controller?.abort(); accountClient?.cancel(); closeDeleteConfirmation(); apiKey.value = ''; newAccessCode.value = ''; clearKeyDisplay(); settingsDialog.value?.close() })
</script>

<template>
  <dialog ref="settingsDialog" class="room-api-settings" :aria-label="page === 'personal' ? '房间设置' : '房主设置'" @pointerdown="cancelNameEditingOutside" @cancel.prevent="page === 'owner' ? backToPersonal() : emit('close')">
    <div class="settings-heading">
      <h2 v-if="page === 'owner'">房主设置</h2>
      <button v-if="page === 'owner'" type="button" class="settings-back room-back-button" aria-label="返回房间设置" title="返回房间设置" @click="backToPersonal"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 7h7a6 6 0 0 1 0 12h-4m-3-17-5 5 5 5"/></svg></button>
      <button v-else type="button" class="settings-close" aria-label="关闭设置" title="关闭设置" @click="emit('close')"><span aria-hidden="true">×</span></button>
    </div>
    <template v-if="page === 'personal'">
      <section class="settings-section" aria-label="音效">
        <h3>音效</h3>
        <label for="speech-volume" :class="{ 'is-muted-label': speechMuted }">发言提示音 <output>{{ speechVolume ?? 60 }}%</output></label>
        <div class="volume-control" :class="{ 'is-muted': speechMuted }">
          <button type="button" class="sound-toggle" :aria-label="speechMuted ? '恢复发言提示音' : '静音发言提示音'" :aria-pressed="speechMuted" :title="speechMuted ? '恢复音量' : '静音'" @click="toggleSpeechSound">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Z"/><path v-if="speechMuted" d="m16 9 5 6m0-6-5 6"/><path v-else d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>
          </button>
          <input id="speech-volume" type="range" min="0" max="100" :value="speechVolume ?? 60" :disabled="speechEnabled === false" @input="emit('speech', Number(($event.target as HTMLInputElement).value))" />
        </div>
        <label for="reaction-volume" :class="{ 'is-muted-label': reactionMuted }">快捷回复音效 <output>{{ preferences?.volume ?? 60 }}%</output></label>
        <div class="volume-control" :class="{ 'is-muted': reactionMuted }">
          <button type="button" class="sound-toggle" :aria-label="reactionMuted ? '恢复快捷回复音效' : '静音快捷回复音效'" :aria-pressed="reactionMuted" :title="reactionMuted ? '恢复音量' : '静音'" @click="toggleReactionSound">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Z"/><path v-if="reactionMuted" d="m16 9 5 6m0-6-5 6"/><path v-else d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>
          </button>
          <input id="reaction-volume" type="range" min="0" max="100" :value="preferences?.volume ?? 60" :disabled="preferences?.enabled === false" @input="changeReactionVolume" />
        </div>
      </section>
      <section class="settings-section" aria-label="卡片布局">
        <h3>卡片布局</h3>
        <label class="switch-row layout-switch"><input id="card-layout" role="switch" type="checkbox" aria-label="卡片布局" :checked="adaptive !== false" @change="emit('layout', ($event.target as HTMLInputElement).checked)" /><span>{{ adaptive !== false ? '动态自适应' : '动态自适应（已关闭）' }}</span></label>
        <p v-if="storageFailed" class="error" role="status">设置已应用，本浏览器暂时无法保存。</p>
      </section>
      <section v-if="configuration && !configuration.readOnly" class="settings-section owner-management" aria-label="房主管理">
        <label class="switch-row asr-switch"><input role="switch" type="checkbox" aria-label="ASR 语音识别" :checked="configuration.asrEnabled !== false" :disabled="busy || configuration.busy" @change="changeAsrSwitch" /><span>ASR 语音识别</span><span class="switch-state">{{ configuration.asrEnabled === false ? '关' : '开' }}</span></label>
        <button class="owner-entry" :disabled="busy" @click="openOwnerSettings">房间设置 <span aria-hidden="true">›</span></button>
      </section>
      <p v-else-if="configuration?.asrEnabled === false" role="status">ASR 已暂停，仍可打字和快捷回应。</p>
      <p v-if="!configuration" role="status">{{ busy ? '正在读取房间状态…' : '房间状态暂不可用' }}</p>
    </template>
    <template v-else-if="configuration && !configuration.readOnly">
      <section class="settings-section" aria-label="房间名称">
        <h3>房间名称</h3>
        <form ref="nameEditor" class="name-row" @submit.prevent="requestConfiguration('rename')">
          <input v-if="editingName" id="room-new-name" ref="nameInput" v-model="newRoomName" class="inline-name-input" aria-label="新房间名称" maxlength="24" :disabled="busy" :aria-invalid="!isValidDisplayName(newRoomName.trim(), ROOM_NAME_MAXIMUM_UNITS)" title="最多12个汉字或24个英文／数字" required @keydown.esc.stop.prevent="cancelNameEditing" />
          <strong v-else>{{ configuration.name ?? ('房间 ' + (props.code ?? '')) }}</strong>
          <button type="button" class="name-edit-action" :aria-label="editingName ? '确认保存名称' : '编辑房间名称'" :disabled="busy || (editingName && !isValidDisplayName(newRoomName.trim(), ROOM_NAME_MAXIMUM_UNITS))" @click="editingName ? requestConfiguration('rename') : beginNameEditing()">{{ editingName ? '✓' : '✎' }}</button>
        </form>
      </section>
      <section class="settings-section" aria-label="豆包 API Key 配置">
        <h3>豆包 API Key</h3>
        <p role="status">{{ configuration.configured ? '已配置' : '尚未配置' }}</p>
        <div v-if="configuration.configured && !editingKey" class="settings-actions"><span aria-label="已保存密钥">********</span><button :disabled="busy" @click="startKeyReplacement">更换密钥</button></div>
        <form v-else @submit.prevent="requestConfiguration('save')">
          <label for="room-api-key">{{ configuration.configured ? '新的 API Key' : 'API Key' }}</label>
          <div class="key-input-row">
            <input id="room-api-key" v-model="apiKey" type="text" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="粘贴完整密钥" :disabled="busy || configuration.busy" @input="resetConnectionTest" />
            <button type="submit" class="dark-button key-save" :disabled="busy || configuration.busy || !apiKey.trim()">保存</button>
          </div>
          <div v-if="configuration.configured" class="settings-actions key-editor-actions"><button type="button" class="dark-button" :disabled="busy" @click="clearKeyDisplay">取消更换</button><button type="button" class="key-remove-button" :disabled="busy || configuration.busy" @click="openDeleteConfirmation">移除密钥</button></div>
        </form>
        <div v-if="configuration.configured" class="connection-test-row">
          <button type="button" class="connection-test-button" :disabled="busy || configuration.busy || !!apiKey.trim()" :aria-busy="activeAction === 'test'" :title="apiKey.trim() ? '请先保存新密钥' : '测试已保存密钥的连接'" @click="requestConfiguration('test')"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v6m8-6v6M6 9h12v3a6 6 0 0 1-12 0V9Zm6 9v3"/></svg>{{ activeAction === 'test' ? '测试中…' : '测试连接' }}</button>
          <span v-if="connectionTestMessage" class="connection-test-result" :class="{ error: connectionTestFailed }" role="status">{{ connectionTestMessage }}</span>
        </div>
      </section>
      <section class="settings-section" aria-label="房间密码">
        <label class="switch-row">房间密码 <input role="switch" type="checkbox" :checked="passwordEnabled" :disabled="busy" @change="changePasswordSwitch" /><span>{{ configuration.requiresPassword ? '已开启' : passwordEnabled ? '待保存' : '关' }}</span></label>
        <form v-if="passwordEnabled" @submit.prevent="requestConfiguration('access-code', newAccessCode)">
          <label for="room-new-access-code">{{ configuration.requiresPassword ? '更换四位数字密码' : '设置四位数字密码' }}</label>
          <PinCodeInput id="room-new-access-code" v-model="newAccessCode" :disabled="busy" />
          <div class="settings-actions"><button type="submit" :disabled="busy || !/^\d{4}$/.test(newAccessCode)">保存密码</button></div>
          <p class="settings-note">四位有效密码保存成功后才启用；支持 0000。保存或更换后，其他成员需重新验证。</p>
        </form>
      </section>
      <p v-if="configuration.bound" class="settings-note"><a :href="accountCenterUrl" target="_blank" rel="noopener noreferrer">个人中心</a>可管理账号和房间。</p>
      <button v-else-if="props.ownerToken" type="button" class="dark-button bind-account-button" :disabled="busy" @click="bindAccount">绑定当前登录账号</button>
    </template>
    <p v-if="message" :class="{ error: failed }" role="status">{{ message }}</p>
    <button v-if="failed" :disabled="busy" @click="requestConfiguration()">刷新状态</button>
    <dialog v-if="confirmDelete" ref="deleteDialog" class="key-delete-dialog" aria-labelledby="key-delete-title" aria-describedby="key-delete-description" @cancel.prevent="closeDeleteConfirmation">
      <h3 id="key-delete-title">确认移除密钥？</h3>
      <p id="key-delete-description">移除后，本房间的语音识别将停止。</p>
      <div class="settings-actions"><button type="button" autofocus @click="closeDeleteConfirmation">取消</button><button type="button" class="dark-button" :disabled="busy" @click="confirmKeyRemoval">确认移除</button></div>
    </dialog>
  </dialog>
</template>
<style scoped>
.room-api-settings{margin:auto;padding:20px;width:min(440px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;border:1px solid var(--home-border);border-radius:18px;background:var(--room-card-bg);color:var(--home-text)}.room-api-settings::backdrop{background:#0005}.settings-heading,.name-row,.switch-row,.owner-entry{display:flex;align-items:center;justify-content:space-between;gap:12px}.settings-heading h2{font-size:18px;margin:0}.settings-section{padding:16px 0;border-bottom:1px solid var(--home-border)}h3{font-size:14px;margin:0 0 12px}p{font-size:12px;line-height:1.7;overflow-wrap:anywhere}.settings-note{color:var(--home-secondary-text)}label{display:block;font-size:14px;margin:12px 0 6px}label output{float:right}input{width:100%;min-height:44px;padding:10px;border:1px solid var(--home-border);border-radius:8px}input[type=range]{padding:0;accent-color:var(--home-bg)}.layout-choice{display:flex;align-items:center;gap:8px;min-height:44px}.layout-choice input,.switch-row input{width:24px;min-height:24px;height:24px;margin:0;accent-color:var(--home-bg)}.switch-row input{margin-left:auto}.settings-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}button{min-height:44px;padding:8px 12px;background:#dedfdb;border-radius:9px;font-size:13px}.owner-entry{width:100%;margin-top:12px}.error{color:#9d2929}.name-row strong{overflow-wrap:anywhere;min-width:0}
.switch-row input[role=switch]{appearance:none;position:relative;flex:0 0 40px;width:40px;height:24px;min-height:24px;padding:0;border:0;border-radius:999px;background:var(--home-border);cursor:pointer;transition:background 160ms}.switch-row input[role=switch]::after{content:'';position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:var(--home-light-text);transition:transform 160ms}.switch-row input[role=switch]:checked{background:var(--home-bg)}.switch-row input[role=switch]:checked::after{transform:translateX(16px)}.switch-row input[role=switch]:disabled{opacity:.5}.switch-row input[role=switch]:focus-visible{outline:2px solid var(--home-secondary-text);outline-offset:3px}@media(prefers-reduced-motion:reduce){.switch-row input[role=switch],.switch-row input[role=switch]::after{transition:none}}

.volume-control { display: flex; align-items: center; gap: 8px; min-width: 0; }
.volume-control .sound-toggle { display: grid; place-items: center; flex: 0 0 40px; width: 40px; padding: 0; background: transparent; color: var(--home-bg); }
.volume-control input[type=range] { flex: 1; min-width: 0; width: 0; margin: 0; }
.volume-control.is-muted input[type=range] { accent-color: #b5bbc1; opacity: .5; }
.volume-control input:disabled { cursor: not-allowed; }
.volume-control.is-muted .sound-toggle, .is-muted-label { color: #92989e; }
.layout-switch, .asr-switch { justify-content: flex-start; gap: 12px; min-height: 44px; margin: 0; }
.layout-switch input[role=switch], .asr-switch input[role=switch] { margin-left: 0; }
.owner-management { margin: 16px -12px 0; padding: 16px 12px; border: 0; border-radius: 12px; background: #e3e4e0; }
.asr-switch .switch-state { margin-left: auto; color: var(--home-secondary-text); font-size: 12px; }
.settings-close { display: grid; place-items: center; width: 44px; height: 44px; margin-left: auto; padding: 0; background: transparent; font-size: 28px; line-height: 1; }
.settings-close:hover { background: #dedfdb; }
.settings-back { margin-left: auto; }
.owner-management .owner-entry { background: var(--home-bg); border: 1px solid var(--home-bg); color: var(--home-light-text); }
.owner-management .owner-entry:hover { background: var(--home-text); border-color: var(--home-text); }

.name-row strong { flex: 1; }
.name-row .inline-name-input { flex: 1; width: 0; min-width: 0; min-height: 44px; padding: 0; border: 0; border-bottom: 1px solid #888; border-radius: 0; background: transparent; font-size: 16px; font-weight: 600; box-shadow: none; }
.name-row .inline-name-input:focus { outline: none; box-shadow: none; }
.name-edit-action { flex: 0 0 40px; width: 40px; padding: 0; font-size: 18px; }
.dark-button { background: var(--home-bg); color: var(--home-light-text); }
.dark-button:hover { background: var(--home-text); }
.bind-account-button { display: block; width: 100%; margin-top: 16px; border: 1px solid var(--home-bg); text-align: center; }
.bind-account-button:hover { border-color: var(--home-text); }
.key-input-row { display: flex; align-items: center; gap: 8px; padding: 4px; border: 1px solid var(--home-border); border-radius: 9px; background: #fafaf8; }
.key-input-row:focus-within { border-color: #777; }
.key-input-row input { flex: 1; width: 0; min-width: 0; padding: 8px; min-height: 40px; border: 0; background: transparent; box-shadow: none; }
.key-input-row input:focus { outline: none; box-shadow: none; }
.key-save { flex-shrink: 0; min-height: 40px; padding: 8px 16px; border-radius: 6px; }
.key-remove-button { background: #e3e4e0; color: var(--home-secondary-text); }
.key-remove-button:hover { background: #dedfdb; color: var(--home-text); }
.connection-test-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 14px; }
.connection-test-button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 2px; border: 0; border-bottom: 1px dashed var(--home-secondary-text); border-radius: 0; background: transparent; color: var(--home-secondary-text); }
.connection-test-button:hover { color: var(--home-text); border-bottom-style: solid; }
.connection-test-result { font-size: 12px; color: #3c6652; overflow-wrap: anywhere; }
.connection-test-result.error { color: #9d2929; }
.key-delete-dialog { margin: auto; width: min(340px, calc(100% - 32px)); max-height: calc(100dvh - 32px); overflow: auto; padding: 22px; border: 1px solid var(--home-border); border-radius: 14px; background: var(--room-card-bg); color: var(--home-text); }
.key-delete-dialog::backdrop { background: #0005; }
.key-delete-dialog .settings-actions { justify-content: flex-end; }
input { background: #fafaf8; color: var(--home-text); }
input:focus { border-color: var(--home-secondary-text); box-shadow: 0 0 0 2px #62666a22; }
input[type=range] { background: transparent; }
</style>
