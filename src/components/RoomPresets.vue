<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { accountCenterUrl, createAccountClient, type AccountIdentity, type RoomPreset, type RoomPresetConfiguration } from '../accountClient'
const props = defineProps<{ user: AccountIdentity | null; configuration: RoomPresetConfiguration; canLoad: boolean }>()
const emit = defineEmits<{ close: []; load: [configuration: RoomPresetConfiguration] }>()
const dialog = ref<HTMLDialogElement>(), presets = ref<RoomPreset[]>([]), name = ref(''), names = ref<Record<string, string>>({}), error = ref(''), message = ref(''), busy = ref(false)
const client = createAccountClient()
let operation = 0
async function execute(action: () => Promise<void>) {
  if (busy.value) return
  const id = ++operation, uid = props.user?.uid
  busy.value = true; error.value = ''; message.value = ''
  try { await action() }
  catch (issue) { if (id === operation && uid === props.user?.uid) error.value = issue instanceof Error ? issue.message : '无法读取个人存档。' }
  finally { if (id === operation) busy.value = false }
}
async function refresh() {
  presets.value = []; names.value = {}
  if (!props.user) return
  const uid = props.user.uid
  await execute(async () => {
    const data = await client.presets()
    if (uid !== props.user?.uid) return
    presets.value = data.presets; names.value = Object.fromEntries(data.presets.map(item => [item.id, item.name]))
  })
}
async function save() { const uid = props.user?.uid; await execute(async () => { const result = await client.save(name.value, props.configuration); if (uid !== props.user?.uid) return; presets.value.unshift(result.preset); names.value[result.preset.id] = result.preset.name; name.value = ''; message.value = '已保存到当前账号。' }) }
async function rename(preset: RoomPreset) { const uid = props.user?.uid; await execute(async () => { const result = await client.rename(preset.id, names.value[preset.id]); if (uid !== props.user?.uid) return; presets.value = presets.value.map(item => item.id === preset.id ? result.preset : item); message.value = '存档名称已更新。' }) }
async function remove(preset: RoomPreset) { if (!confirm(`删除存档“${preset.name}”？这不会销毁实时房间。`)) return; const uid = props.user?.uid; await execute(async () => { await client.remove(preset.id); if (uid !== props.user?.uid) return; presets.value = presets.value.filter(item => item.id !== preset.id); message.value = '存档已删除。' }) }
watch(() => props.user?.uid, () => { operation++; busy.value = false; client.cancel(); presets.value = []; refresh() })
onMounted(() => { dialog.value?.showModal(); refresh() })
onUnmounted(() => { operation++; client.cancel(); dialog.value?.close() })
</script>
<template><dialog ref="dialog" class="room-presets-dialog" aria-labelledby="presets-title" @cancel.prevent="emit('close')"><div class="presets-heading"><h2 id="presets-title">个人房间存档</h2><button aria-label="关闭房间存档" @click="emit('close')">×</button></div><p>保存识别来源和布局偏好，供不同设备使用。不包含 API Key、字幕或房主凭据。</p><p v-if="!user"><a :href="accountCenterUrl" target="_blank" rel="noopener noreferrer">登录或注册 ↗</a> 后保存；游客仍可继续使用房间。</p><template v-else><p class="preset-user">{{ user.nickname }} 的存档</p><form @submit.prevent="save"><label for="new-preset-name">存档名称</label><div class="preset-input-row"><input id="new-preset-name" v-model="name" maxlength="60" required :disabled="busy" placeholder="例如：面对面交流"><button :disabled="busy">保存当前配置</button></div></form><p v-if="!presets.length && !busy">还没有个人存档。</p><article v-for="preset in presets" :key="preset.id"><form @submit.prevent="rename(preset)"><label :for="`name-${preset.id}`">存档名称</label><input :id="`name-${preset.id}`" v-model="names[preset.id]" maxlength="60" required :disabled="busy"><div class="preset-actions"><button :disabled="busy">改名</button><button type="button" :disabled="busy || !canLoad" @click="emit('load', preset.configuration)">加载</button><button type="button" :disabled="busy" @click="remove(preset)">删除</button></div></form></article><p v-if="!canLoad">返回首页后可以加载存档，当前房间和麦克风保持原状。</p><button @click="refresh" :disabled="busy">{{ busy ? '正在同步…' : '刷新存档' }}</button></template><p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p><p class="preset-footnote">加载只应用设置；创建或加入房间后仍需手动开麦。保存存档不会取得房主权限。</p></dialog></template>
<style scoped>
.room-presets-dialog{width:min(520px,calc(100vw - 28px));max-height:85dvh;border:1px solid #dce2d5;border-radius:14px;padding:26px;background:#fafbf7;color:#2c3d2e;box-shadow:0 18px 70px #12271630;overflow:auto}.room-presets-dialog::backdrop{background:#12231765}.presets-heading{display:flex;align-items:center;justify-content:space-between;gap:20px}.presets-heading h2{font-size:20px;margin:0}.presets-heading button{font-size:23px;background:transparent;border:0}.room-presets-dialog p{font-size:12px;line-height:1.8;color:#73806c}.room-presets-dialog label{display:block;font-size:12px;margin:13px 0 7px}.room-presets-dialog input{padding:10px;border:1px solid #ccd6c4;border-radius:6px;min-width:0;width:100%;font:inherit;background:white}.room-presets-dialog button{padding:9px 12px;border:1px solid #cbd5c4;border-radius:6px;background:#edf2e7;color:#365632;cursor:pointer;white-space:nowrap}.room-presets-dialog button:disabled{opacity:.5;cursor:default}.preset-input-row{display:flex;gap:8px}.preset-actions{display:flex;gap:8px;margin:10px 0 18px}.room-presets-dialog article{border-top:1px solid #dde4d6;margin-top:20px}.room-presets-dialog .error{color:#a34e39}.preset-footnote{margin-bottom:0}.preset-user{font-weight:600}@media(max-width:450px){.preset-input-row{flex-direction:column}.room-presets-dialog{padding:20px}}
</style>
