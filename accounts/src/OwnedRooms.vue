<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { accountRequest } from './accountApi'
const props = defineProps({ uid: { type: String, required: true }, projectOrigin: { type: String, required: true } })
const rooms = ref([]), keys = ref({}), busy = ref(false), error = ref(''), message = ref(''), deleting = ref('')
const revealedKeys = ref({}), visibleKeys = ref({}), editingKeys = ref({})
function clearKeyDisplay() { revealedKeys.value = {}; visibleKeys.value = {}; editingKeys.value = {} }
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
  keys.value = {}; clearKeyDisplay(); error.value = ''; busy.value = true
  try {
    const result = await accountRequest('/api/projects/hakisub/rooms')
    if (!disposed && current === generation) rooms.value = result.rooms
  } catch (issue) { if (!disposed && current === generation) { rooms.value = []; error.value = issue.message } }
  finally { if (!disposed && current === generation) busy.value = false }
}
async function manage(room, action) {
  if (busy.value) return
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
    }
  } finally { if (!disposed && current === generation) busy.value = false }
}
function focus() { if (!busy.value) void refresh() }
watch(() => props.uid, () => { rooms.value = []; message.value = ''; void refresh() })
onMounted(() => { void refresh(); window.addEventListener('focus', focus) })
onUnmounted(() => { disposed = true; generation++; keys.value = {}; clearKeyDisplay(); window.removeEventListener('focus', focus) })
</script>
<template>
  <section class="section-divider" aria-labelledby="owned-rooms-title" :aria-busy="busy">
    <h3 id="owned-rooms-title">我的 HakiSub 房间</h3>
    <p class="muted">这里只显示绑定当前 UID 的真实房间。保存过的入口及偏好存档不代表房主身份。无需进入房间即可管理。</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" class="success" role="status">{{ message }}</p>
    <p v-if="busy" role="status">正在处理房间设置…</p>
    <p v-else-if="!rooms.length && !error" class="muted">尚无绑定房间。登录后在 HakiSub 创建房间，或用原房主浏览器进入旧房间并绑定账号。</p>
    <article v-for="room in rooms" :key="room.code" class="preset">
      <h3>房间 {{ room.code }}</h3><p class="muted">房主 · 当前账号</p>
      <p>API Key：{{ room.keyState === 'deleted' ? '房主已删除' : room.configured ? '已配置' : '未配置' }}<br>豆包 ASR：{{ room.asrEnabled ? '已开启' : '已暂停' }}</p>
      <form @submit.prevent="manage(room, 'save')"><fieldset :disabled="busy || room.busy">
        <label :for="`key-${room.code}`">{{ room.configured ? '替换房间 API Key' : '设置房间 API Key' }}</label>
        <div class="secret-field"><input :id="`key-${room.code}`" :value="keys[room.code] || revealedKeys[room.code] || (room.configured && !editingKeys[room.code] ? '********' : '')" @input="editKey(room.code, $event)" @focus="editingKeys[room.code] = true" @blur="editingKeys[room.code] = false" :type="visibleKeys[room.code] ? 'text' : 'password'" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="粘贴新的豆包 API Key"><button type="button" :aria-controls="`key-${room.code}`" :aria-pressed="!!visibleKeys[room.code]" :disabled="!keys[room.code] && !room.configured" @click="toggleKey(room)">{{ visibleKeys[room.code] ? '隐藏' : '显示' }}</button></div>
        <div class="button-row"><button class="secondary" :disabled="!keys[room.code]?.trim()">保存 Key</button><button type="button" class="secondary" :disabled="!room.configured" @click="manage(room, 'test')">测试 Key</button><button type="button" class="danger" :disabled="!room.configured" @click="deleting = room.code">删除 Key</button></div>
        <div v-if="deleting === room.code" class="button-row"><span>删除后豆包识别停止，不会使用默认 Key。</span><button type="button" class="danger" @click="manage(room, 'delete')">确认删除</button><button type="button" @click="deleting = ''">取消</button></div>
        <div class="button-row"><button type="button" class="secondary" @click="manage(room, 'asr')">{{ room.asrEnabled ? '暂停豆包 ASR' : '开启豆包 ASR' }}</button><a :href="`${props.projectOrigin}/${room.code}/`" target="_blank" rel="noopener noreferrer">进入房间 ↗</a></div>
      </fieldset></form>
    </article>
    <p class="muted">更换或删除 Key、切换开关会终止本房间现有豆包会话。Key 仅当前后端进程有效，启动或重启后须由房主重填。开启后仍需有效 Key，各成员须手动开麦。测试只检查云端连接，不采集音频。</p>
    <button class="text-button" :disabled="busy" @click="refresh">刷新我的房间</button>
  </section>
</template>
