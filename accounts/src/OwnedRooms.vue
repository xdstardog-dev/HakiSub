<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { accountRequest } from './accountApi'
const props = defineProps({ uid: { type: String, required: true }, projectOrigin: { type: String, required: true }, overview: Boolean })
const emit = defineEmits(['open-rooms', 'session-expired'])
const rooms = ref([]), keys = ref({}), busy = ref(false), error = ref(''), message = ref(''), deleting = ref('')
const revealedKeys = ref({}), visibleKeys = ref({}), editingKeys = ref({})
const selectedCode = ref('')
const selectedRoom = computed(() => rooms.value.find(room => room.code === selectedCode.value))
const displayedRooms = computed(() => props.overview ? rooms.value.slice(0, 3) : rooms.value)
function clearKeyDisplay() { revealedKeys.value = {}; visibleKeys.value = {}; editingKeys.value = {} }
function selectRoom(code = '') {
  generation++; keys.value = {}; clearKeyDisplay(); deleting.value = ''; error.value = ''; message.value = ''; selectedCode.value = code; busy.value = false
}
function editKey(code, event) { keys.value[code] = event.target.value; delete revealedKeys.value[code] }
async function toggleKey(room) {
  if (busy.value || room.busy) return
  if (visibleKeys.value[room.code]) { delete revealedKeys.value[room.code]; visibleKeys.value[room.code] = false; return }
  if (keys.value[room.code]) { visibleKeys.value[room.code] = true; return }
  await manage(room, 'reveal')
}
let generation = 0, disposed = false
async function refresh() {
  const current = ++generation
  keys.value = {}; clearKeyDisplay(); deleting.value = ''; error.value = ''; message.value = ''; busy.value = true
  try {
    const result = await accountRequest('/api/projects/hakisub/rooms')
    if (!disposed && current === generation) { rooms.value = result.rooms; if (!selectedRoom.value) selectedCode.value = '' }
  } catch (issue) { if (!disposed && current === generation) { rooms.value = []; error.value = issue.message; if (issue.status === 401) emit('session-expired') } }
  finally { if (!disposed && current === generation) busy.value = false }
}
async function manage(room, action) {
  if (busy.value || room.busy) return
  const current = generation, apiKey = keys.value[room.code]?.trim()
  if (action === 'save' && (!apiKey || /^\*+$/.test(apiKey))) return
  clearKeyDisplay()
  keys.value = {}; deleting.value = ''; busy.value = true; error.value = ''; message.value = ''
  try {
    const result = await accountRequest(`/api/projects/hakisub/rooms/${room.code}/manage`, 'POST', {
      action, ...(action === 'save' ? { apiKey } : {}), ...(action === 'asr' ? { enabled: !room.asrEnabled } : {}),
    })
    if (disposed || current !== generation) return
    if (action === 'reveal') { revealedKeys.value[room.code] = result.apiKey ?? ''; visibleKeys.value[room.code] = true; return }
    if (result.room) rooms.value = rooms.value.map(item => item.code === room.code ? result.room : item)
    if (action === 'test' && !result.ok) error.value = result.message
    else message.value = result.message
  } catch (issue) {
    if (!disposed && current === generation) {
      error.value = issue.message
      // 失败后丢弃缓存；下一次刷新从房间服务取得真实状态，不显示假成功。
      rooms.value = []
      if (issue.status === 401) emit('session-expired')
    }
  } finally { if (!disposed && current === generation) busy.value = false }
}
function focus() { if (!busy.value) void refresh() }
watch(() => props.uid, () => { selectRoom(); rooms.value = []; void refresh() })
watch(() => props.overview, () => { selectRoom(); void refresh() })
onMounted(() => { void refresh(); window.addEventListener('focus', focus) })
onUnmounted(() => { disposed = true; generation++; keys.value = {}; clearKeyDisplay(); window.removeEventListener('focus', focus) })
</script>
<template>
  <section class="owned-rooms" :class="{ 'room-overview': overview }" aria-labelledby="owned-rooms-title" :aria-busy="busy">
    <div class="section-heading"><h2 id="owned-rooms-title">{{ overview ? '房间概览' : selectedRoom ? `房间 ${selectedRoom.code}` : '已绑定的房间' }}<span v-if="!selectedRoom" class="count-badge">{{ rooms.length }}</span></h2><button v-if="overview" class="text-button" @click="emit('open-rooms')">管理我的房间 →</button><button v-else-if="selectedRoom" class="text-button" :disabled="busy" @click="selectRoom()">← 返回房间列表</button><button v-else class="secondary" :disabled="busy" @click="refresh">刷新我的房间</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" class="success" role="status">{{ message }}</p>
    <p v-if="busy" role="status">正在处理房间设置…</p>
    <div v-else-if="!rooms.length && !error" class="empty-state"><span aria-hidden="true">▦</span><h3>尚无绑定房间</h3><p>登录后在 HakiSub 创建房间，或用原房主浏览器进入旧房间并绑定账号。</p><a class="secondary" :href="projectOrigin" target="_blank" rel="noopener noreferrer">打开 HakiSub ↗</a></div>
    <div v-if="!selectedRoom" class="room-grid" :class="{ 'summary-grid': overview }"><article v-for="room in displayedRooms" :key="room.code" class="room-card"><div class="room-card-heading"><span class="room-icon" aria-hidden="true">▦</span><div><small>HAKISUB ROOM</small><h3>房间 {{ room.code }}</h3></div></div><dl class="room-status"><div><dt>豆包 ASR</dt><dd><span class="status-dot" :class="{ enabled: room.asrEnabled }"></span>{{ room.asrEnabled ? '已开启' : '已暂停' }}</dd></div><div><dt>API Key</dt><dd>{{ room.keyState === 'deleted' ? '房主已删除' : room.configured ? '已配置' : '未配置' }}</dd></div></dl><div v-if="!overview" class="room-card-actions"><button class="secondary" :disabled="busy" @click="selectRoom(room.code)">管理房间</button><a :href="`${projectOrigin}/${room.code}/`" target="_blank" rel="noopener noreferrer">进入房间 ↗</a></div></article></div>
    <template v-if="selectedRoom && !overview">
    <article v-for="room in [selectedRoom]" :key="room.code" class="room-management">
      <div class="settings-card"><div class="section-heading"><div><h3>豆包语音识别</h3><p class="muted">房主 · 当前账号</p></div><a :href="`${projectOrigin}/${room.code}/`" target="_blank" rel="noopener noreferrer">进入房间 ↗</a></div><p><span class="status-dot" :class="{ enabled: room.asrEnabled }"></span>{{ room.asrEnabled ? '豆包 ASR 已开启' : '豆包 ASR 已暂停' }}</p><button type="button" class="secondary" :disabled="busy || room.busy" @click="manage(room, 'asr')">{{ room.asrEnabled ? '暂停豆包 ASR' : '开启豆包 ASR' }}</button><small>开启后仍需有效 Key，各成员须手动开麦。</small></div>
      <div class="settings-card"><h3>API Key</h3><p class="muted">{{ room.keyState === 'deleted' ? '房主已删除' : room.configured ? '已配置' : '未配置' }} · 仅在明确点击显示时读取原文。</p>
      <form @submit.prevent="manage(room, 'save')"><fieldset :disabled="busy || room.busy">
        <label :for="`key-${room.code}`">{{ room.configured ? '替换房间 API Key' : '设置房间 API Key' }}</label>
        <div class="secret-field"><input :id="`key-${room.code}`" :value="keys[room.code] || revealedKeys[room.code] || (room.configured && !editingKeys[room.code] ? '********' : '')" @input="editKey(room.code, $event)" @focus="editingKeys[room.code] = true" @blur="editingKeys[room.code] = false" :type="visibleKeys[room.code] ? 'text' : 'password'" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="粘贴新的豆包 API Key"><button type="button" :aria-controls="`key-${room.code}`" :aria-pressed="!!visibleKeys[room.code]" :disabled="!keys[room.code] && !room.configured" @click="toggleKey(room)">{{ visibleKeys[room.code] ? '隐藏' : '显示' }}</button></div>
        <div class="button-row"><button class="secondary" :disabled="!keys[room.code]?.trim()">保存 Key</button><button type="button" class="secondary" :disabled="!room.configured" @click="manage(room, 'test')">测试 Key</button><button type="button" class="danger" :disabled="!room.configured" @click="deleting = room.code">删除 Key</button></div>
        <div v-if="deleting === room.code" class="button-row"><span>删除后豆包识别停止，不会使用默认 Key。</span><button type="button" class="danger" @click="manage(room, 'delete')">确认删除</button><button type="button" @click="deleting = ''">取消</button></div>
      </fieldset></form>
      <p class="muted">Key 仅当前后端进程有效，启动或重启后须由房主重填。测试只检查云端连接，不采集音频。</p></div>
      <p class="security-note">更换或删除 Key、切换开关会终止本房间现有豆包会话。删除后不会使用默认 Key。</p>
    </article>
    </template>
    <p v-if="!overview && !selectedRoom" class="muted">仅显示绑定当前 UID 的真实房间，存档与保存过的入口不代表房主身份。</p>
    <button v-if="error || selectedRoom" class="text-button" :disabled="busy" @click="refresh">刷新我的房间</button>
  </section>
</template>
