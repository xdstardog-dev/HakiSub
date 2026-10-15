<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AsrUsageStatistics from './AsrUsageStatistics.vue'

type Configuration = { configured: boolean; readOnly: boolean; source: 'environment' | 'file'; csrfToken: string; busy: boolean }
const emit = defineEmits<{ close: [] }>()
const configuration = ref<Configuration | null>(null)
const apiKey = ref(''), message = ref(''), failed = ref(false), busy = ref(false), confirmDelete = ref(false)
const keyInput = ref<HTMLInputElement | null>(null)
let controller: AbortController | undefined
let disposed = false

async function requestConfiguration(action?: 'save' | 'delete' | 'test') {
  if (busy.value) return
  busy.value = true; failed.value = false; message.value = ''; confirmDelete.value = false
  controller = new AbortController()
  const timeout = setTimeout(() => controller?.abort(), 12000)
  // 输入值仅用于这次请求，提交后立即清空，不在浏览器持久化。
  const submittedKey = apiKey.value.trim()
  if (action) apiKey.value = ''
  try {
    const response = await fetch(`/api/asr/settings${action === 'test' ? '/test' : ''}`, {
      method: action ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
      ...(action ? { headers: { 'Content-Type': 'application/json', 'X-HakiSub-Token': configuration.value?.csrfToken ?? '' },
        body: JSON.stringify(action === 'save' ? { action, apiKey: submittedKey } : { action }) } : {}),
    })
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('设置服务不可用，请重启 npm run dev 后重试。')
    const result = await response.json()
    if (!response.ok) throw Error(result.message ?? '设置操作失败，请重试。')
    if (disposed) return
    if (!action) configuration.value = result
    else if (action === 'test') { failed.value = !result.ok; message.value = result.message }
    else { configuration.value = { ...configuration.value!, ...result }; message.value = result.message }
  } catch (error) {
    if (!disposed) {
      failed.value = true
      message.value = error instanceof Error && error.name !== 'AbortError' ? error.message : '请求超时，请检查本地服务后刷新配置状态。'
    }
  } finally { clearTimeout(timeout); if (!disposed) busy.value = false }
}
onMounted(() => { void requestConfiguration(); keyInput.value?.focus() })
onUnmounted(() => { disposed = true; controller?.abort(); apiKey.value = '' })
</script>

<template>
  <section class="api-settings" aria-labelledby="api-settings-title">
    <div class="settings-heading"><h1 id="api-settings-title">设置</h1><button @click="emit('close')">返回主页</button></div>
    <div class="settings-card">
      <h2>豆包语音识别</h2>
      <p>ASR 2.0 · 小时版</p>
      <p role="status">{{ configuration ? (configuration.configured ? '已配置 API Key' : '尚未配置 API Key') : '正在读取配置…' }}</p>
      <p class="settings-note">密钥保存在这台电脑的本地配置文件中，尚未加密。保存后不会回显，也不会写入浏览器存储。此设置目前只供本机使用。</p>
      <p v-if="configuration?.readOnly" class="settings-note">当前使用启动环境提供的密钥。若要在这里更换，请先移除环境变量并重启服务。</p>
      <p v-if="configuration?.busy" class="settings-note">当前正在识别或处理设置，请停止识别后刷新状态。</p>
      <form @submit.prevent="requestConfiguration('save')">
        <label for="doubao-api-key">{{ configuration?.configured ? '更换 API Key' : 'API Key' }}</label>
        <input id="doubao-api-key" ref="keyInput" v-model="apiKey" type="password" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="粘贴豆包语音服务 API Key" :disabled="busy || !configuration || configuration.readOnly || configuration.busy" />
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
      <p v-if="busy" role="status">正在处理，请稍候…</p>
      <p v-if="message" :class="{ 'settings-error': failed }" role="status">{{ message }}</p>
      <AsrUsageStatistics />
    </div>
  </section>
</template>

<style scoped>
.api-settings { padding: 20px 0 32px; }
.settings-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h1 { font-size: 24px; } h2 { margin: 0; font-size: 20px; }
.settings-card { background: white; border: 1px solid #dce4d8; border-radius: 18px; padding: 20px; }
p { font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.settings-note { color: #617267; font-size: 13px; }
label { display: block; margin: 20px 0 8px; font-size: 14px; }
input { display: block; width: 100%; min-height: 44px; border: 1px solid #bac9c0; border-radius: 8px; padding: 10px; }
.settings-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
button { border-radius: 8px; padding: 8px 12px; background: #eef3ed; font-size: 13px; }
.save-key { background: #1b604e; color: white; }
.settings-error { color: #a32c2c; }
.delete-confirm { padding: 8px; border: 1px solid #d9b2a8; border-radius: 8px; margin-top: 12px; }
.delete-confirm button { margin-right: 8px; }
</style>
