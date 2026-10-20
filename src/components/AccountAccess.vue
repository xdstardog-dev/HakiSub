<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createAccountClient, accountCenterUrl, type AccountIdentity } from '../accountClient'
const emit = defineEmits<{ identity: [user: AccountIdentity | null] }>()
const client = createAccountClient(), user = ref<AccountIdentity | null>(null), unavailable = ref(false)
let operation = 0, timer: ReturnType<typeof setInterval> | undefined
async function refresh() {
  const id = ++operation
  try { const result = await client.identity(); if (id !== operation) return; user.value = result.user; unavailable.value = false; emit('identity', result.user) }
  catch { if (id !== operation) return; user.value = null; unavailable.value = true; emit('identity', null) }
}
const focus = () => { if (!document.hidden) refresh() }
onMounted(() => { refresh(); window.addEventListener('focus', focus); timer = setInterval(focus, 60000) })
onUnmounted(() => { operation++; client.cancel(); clearInterval(timer); window.removeEventListener('focus', focus) })
</script>
<template><a class="account-access" :href="accountCenterUrl" target="_blank" rel="noopener noreferrer" :title="unavailable ? '账号服务暂不可用，游客功能仍可使用' : '在新标签打开个人中心，保留当前房间'">{{ user ? user.nickname + ' · 个人中心 ↗' : '登录 / 注册 ↗' }}</a></template>
