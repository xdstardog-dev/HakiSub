<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PinCodeInput from '../shared/PinCodeInput.vue'
import { accountRequest } from './accountApi'
import { countNameUnits, isValidDisplayName, ROOM_NAME_MAXIMUM_UNITS } from '../shared/nameRules.mjs'
const props = defineProps({ uid: { type: String, required: true }, projectOrigin: { type: String, required: true }, overview: Boolean })
const emit = defineEmits(['open-rooms', 'session-expired'])
const rooms = ref([]), keys = ref({}), busy = ref(false), error = ref(''), message = ref(''), deleting = ref('')
const revealedKeys = ref({}), visibleKeys = ref({}), editingKeys = ref({})
const selectedCode = ref('')
const newAccessCode = ref('')
const newRoomName = ref('')
const selectedRoom = computed(() => rooms.value.find(room => room.code === selectedCode.value))
const displayedRooms = computed(() => props.overview ? rooms.value.slice(0, 3) : rooms.value)
function clearKeyDisplay() { revealedKeys.value = {}; visibleKeys.value = {}; editingKeys.value = {} }
function selectRoom(code = '') {
  newRoomName.value = ''
  generation++; keys.value = {}; newAccessCode.value = ''; clearKeyDisplay(); deleting.value = ''; error.value = ''; message.value = ''; selectedCode.value = code; busy.value = false
}
function editKey(code, event) { keys.value[code] = event.target.value; delete revealedKeys.value[code] }
async function toggleKey(room) {
  if (busy.value || room.busy) return
  if (visibleKeys.value[room.code]) { delete revealedKeys.value[room.code]; visibleKeys.value[room.code] = false; return }
  if (keys.value[room.code]) { visibleKeys.value[room.code] = true; return }
  keys.value[room.code] = ''; editingKeys.value[room.code] = true; visibleKeys.value[room.code] = true
}
let generation = 0, disposed = false
async function refresh() {
  newRoomName.value = ''
  const current = ++generation
  keys.value = {}; newAccessCode.value = ''; clearKeyDisplay(); deleting.value = ''; error.value = ''; message.value = ''; busy.value = true
  try {
    const result = await accountRequest('/api/projects/hakisub/rooms')
    if (!disposed && current === generation) { rooms.value = result.rooms; if (!selectedRoom.value) selectedCode.value = '' }
  } catch (issue) { if (!disposed && current === generation) { rooms.value = []; error.value = issue.message; if (issue.status === 401) emit('session-expired') } }
  finally { if (!disposed && current === generation) busy.value = false }
}
async function manage(room, action, accessCode = newAccessCode.value) {
  if (busy.value || room.busy) return
  if (action === 'access-code' && (typeof accessCode !== 'string' || (accessCode !== '' && !/^\d{4}$/.test(accessCode)))) return
  if (action === 'rename' && !isValidDisplayName(newRoomName.value.trim(), ROOM_NAME_MAXIMUM_UNITS)) return
  const current = generation, apiKey = keys.value[room.code]?.trim()
  if (action === 'save' && (!apiKey || /^\*+$/.test(apiKey))) return
  clearKeyDisplay()
  keys.value = {}; newAccessCode.value = ''; deleting.value = ''; busy.value = true; error.value = ''; message.value = ''
  try {
    const result = await accountRequest(`/api/projects/hakisub/rooms/${room.code}/manage`, 'POST', {
      action, ...(action === 'save' ? { apiKey } : {}), ...(action === 'asr' ? { enabled: !room.asrEnabled } : {}), ...(action === 'access-code' ? { accessCode } : {}), ...(action === 'rename' ? { name: newRoomName.value.trim() } : {}),
    })
    if (disposed || current !== generation) return
    if (action === 'rename') newRoomName.value = ''
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
onUnmounted(() => { disposed = true; generation++; keys.value = {}; newAccessCode.value = ''; clearKeyDisplay(); window.removeEventListener('focus', focus) })
</script>
<template>
  <section class="owned-rooms" :class="{ 'room-overview': overview }" aria-labelledby="owned-rooms-title" :aria-busy="busy">
    <div class="section-heading"><h2 id="owned-rooms-title">{{ overview ? '房间概览' : selectedRoom ? selectedRoom.name ?? `房间 ${selectedRoom.code}` : '已绑定的房间' }}<span v-if="!selectedRoom" class="count-badge">{{ rooms.length }}</span></h2><button v-if="overview" class="text-button" @click="emit('open-rooms')">管理我的房间 →</button><button v-else-if="selectedRoom" class="text-button" :disabled="busy" @click="selectRoom()">← 返回房间列表</button><button v-else class="secondary" :disabled="busy" @click="refresh">刷新我的房间</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" class="success" role="status">{{ message }}</p>
    <p v-if="busy" role="status">正在处理房间设置…</p>
    <div v-else-if="!rooms.length && !error" class="empty-state"><span aria-hidden="true">▦</span><h3>尚无绑定房间</h3><p>登录后在 HakiSub 创建房间，或用原房主浏览器进入旧房间并绑定账号。</p><a class="secondary" :href="projectOrigin" target="_blank" rel="noopener noreferrer">打开 HakiSub ↗</a></div>
    <div v-if="!selectedRoom" class="room-grid" :class="{ 'summary-grid': overview }"><article v-for="room in displayedRooms" :key="room.code" class="room-card"><div class="room-card-heading"><span class="room-icon" aria-hidden="true">▦</span><div><small>HAKISUB ROOM</small><h3>{{ room.name ?? `房间 ${room.code}` }}</h3><p class="muted">房间号 {{ room.code }}</p></div></div><dl class="room-status"><div><dt>豆包 ASR</dt><dd><span class="status-dot" :class="{ enabled: room.asrEnabled }"></span>{{ room.asrEnabled ? '已开启' : '已暂停' }}</dd></div><div><dt>API Key</dt><dd>{{ room.keyState === 'deleted' ? '房主已删除' : room.configured ? '已配置' : '未配置' }}</dd></div></dl><div v-if="!overview" class="room-card-actions"><button class="secondary" :disabled="busy" @click="selectRoom(room.code)">管理房间</button><a :href="`${projectOrigin}/${room.code}/`" target="_blank" rel="noopener noreferrer">进入房间 ↗</a></div></article></div>
    <template v-if="selectedRoom && !overview">
    <article v-for="room in [selectedRoom]" :key="room.code" class="room-management">
      <div class="settings-card"><h3>房间名称</h3><p class="muted">{{ room.name ?? `房间 ${room.code}` }} · 房间号 {{ room.code }}</p>
        <form @submit.prevent="manage(room, 'rename')"><fieldset :disabled="busy || room.busy"><label :for="`name-${room.code}`">房间名称</label><input :id="`name-${room.code}`" v-model="newRoomName" :placeholder="room.name" maxlength="24" :aria-invalid="countNameUnits(newRoomName.trim()) > ROOM_NAME_MAXIMUM_UNITS" required />
          <div class="button-row"><button type="submit" class="secondary" :disabled="!isValidDisplayName(newRoomName.trim(), ROOM_NAME_MAXIMUM_UNITS)">保存房间名称</button></div>
        </fieldset></form><p class="muted">最多12个汉字或24个英文／数字，混合折算 {{ countNameUnits(newRoomName.trim()) }}/24。修改后同房成员同步看到新名称，房间号和分享链接保持不变。</p>
      </div>
      <div class="settings-card"><h3>房间入房码</h3><p class="muted">{{ room.requiresPassword ? '已设置四位入房码' : '未设置，可直接加入' }}</p>
        <p v-if="room.requiresPassword" class="current-access-code">房间密码已设置；只能更换或移除。</p>
        <form @submit.prevent="manage(room, 'access-code')"><fieldset :disabled="busy || room.busy"><label :for="`entry-code-${room.code}`">{{ room.requiresPassword ? '更换四位入房码' : '设置四位入房码' }}</label><PinCodeInput :id="`entry-code-${room.code}`" v-model="newAccessCode" />
          <div class="button-row"><button type="submit" class="secondary" :disabled="!/^\d{4}$/.test(newAccessCode)">保存入房码</button><button v-if="room.requiresPassword" type="button" class="secondary" @click="manage(room, 'access-code', '')">移除入房码</button></div>
        </fieldset></form><p class="muted">简单入房凭证。设置或更换后，其他成员需重新验证；登录账号验证一次后跨设备、重启仍免输。</p>
      </div>
      <div class="settings-card"><div class="section-heading"><div><h3>豆包语音识别</h3><p class="muted">房主 · 当前账号</p></div><a :href="`${projectOrigin}/${room.code}/`" target="_blank" rel="noopener noreferrer">进入房间 ↗</a></div><p><span class="status-dot" :class="{ enabled: room.asrEnabled }"></span>{{ room.asrEnabled ? '豆包 ASR 已开启' : '豆包 ASR 已暂停' }}</p><button type="button" class="secondary" :disabled="busy || room.busy" @click="manage(room, 'asr')">{{ room.asrEnabled ? '暂停豆包 ASR' : '开启豆包 ASR' }}</button><small>开启后仍需有效 Key，各成员须手动开麦。</small></div>
      <div class="settings-card"><h3>API Key</h3><p class="muted">{{ room.keyState === 'deleted' ? '房主已删除' : room.configured ? '已配置' : '未配置' }} · 仅新输入的密钥可显示，已保存的密钥不能回读。</p>
      <form @submit.prevent="manage(room, 'save')"><fieldset :disabled="busy || room.busy">
        <label :for="`key-${room.code}`">{{ room.configured ? '替换房间 API Key' : '设置房间 API Key' }}</label>
        <div class="secret-field"><input :id="`key-${room.code}`" :value="keys[room.code] || revealedKeys[room.code] || (room.configured && !editingKeys[room.code] ? '********' : '')" @input="editKey(room.code, $event)" @focus="editingKeys[room.code] = true" @blur="editingKeys[room.code] = false" :type="visibleKeys[room.code] ? 'text' : 'password'" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="粘贴新的豆包 API Key"><button type="button" :aria-controls="`key-${room.code}`" :aria-pressed="!!visibleKeys[room.code]" :disabled="!keys[room.code] && !room.configured" @click="toggleKey(room)">{{ keys[room.code] ? (visibleKeys[room.code] ? '隐藏' : '显示') : '更换密钥' }}</button></div>
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
