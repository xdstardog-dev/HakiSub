<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

type Usage = { since: string; totalAudioSeconds: number; latest: null | {
  requestId: string; active: boolean; submittedAudioSeconds: number;
  serverDuration: null | { field: string; value: number }
} }
const usage = ref<Usage | null>(null)
const error = ref('')
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}分${(seconds % 60).toFixed(1)}秒 · ${(seconds / 3600).toFixed(4)}小时`
}
async function refreshUsage() {
  controller = new AbortController()
  const timeout = setTimeout(() => controller?.abort(), 5000)
  try {
    const response = await fetch('/api/asr/settings/usage', { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw Error()
    const result = await response.json()
    if (!result || typeof result.totalAudioSeconds !== 'number') throw Error()
    if (!disposed) { usage.value = result; error.value = '' }
  } catch {
    if (!disposed) error.value = '用量暂时无法更新，请确认本地服务已重启。下方已有数值可能过期。'
  } finally {
    clearTimeout(timeout)
    // 只轮询本机内存，不请求云端，也不并发堆积请求。
    if (!disposed) timer = setTimeout(refreshUsage, 1000)
  }
}
onMounted(() => { void refreshUsage() })
onUnmounted(() => { disposed = true; clearTimeout(timer); controller?.abort() })
</script>

<template>
  <section class="usage-panel" aria-labelledby="usage-title">
    <h3 id="usage-title">语音用量</h3>
    <p v-if="error" role="status">{{ error }}</p>
    <template v-if="usage">
      <dl>
        <dt>{{ usage.latest?.active ? '本次已上传' : '最近一次已上传' }}</dt>
        <dd>{{ usage.latest ? formatDuration(usage.latest.submittedAudioSeconds) : '暂无识别会话' }}</dd>
        <dt>本地服务启动以来累计</dt>
        <dd>{{ formatDuration(usage.totalAudioSeconds) }}</dd>
        <dt>豆包返回的音频时长</dt>
        <dd>{{ usage.latest?.serverDuration ? formatDuration(usage.latest.serverDuration.value / 1000) : '尚未返回' }}</dd>
        <dt>豆包剩余小时额度 / 账户余额</dt>
        <dd>尚未接入查询</dd>
      </dl>
      <p class="usage-note">每秒更新本机统计，包含静音上传；不是账单或剩余额度。刷新页面保留，重启本地服务清零；更换 Key 不清零。</p>
      <details><summary>查看会话信息</summary>
        <p class="usage-note">统计开始：{{ new Date(usage.since).toLocaleString() }}<br />Request ID：{{ usage.latest?.requestId ?? '暂无' }}</p>
      </details>
    </template>
    <p v-else-if="!error">正在读取本地用量…</p>
    <p class="usage-note">当前语音 Key 用于识别。官方额度和资金余额需接入独立的管理查询接口，不能用本地上传时长准确推算。</p>
  </section>
</template>

<style scoped>
.usage-panel { border-top: 1px solid #dce4d8; margin-top: 24px; padding-top: 16px; }
h3 { margin: 0 0 16px; font-size: 18px; }
dl { margin: 0; } dt { font-size: 13px; color: #617267; margin-top: 14px; }
dd { margin: 4px 0 0; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
p, summary { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.usage-note { color: #617267; }
</style>
