<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { createAsrSession, type AsrProvider } from './asrSession'
import type { AsrState, AsrSession, AsrUsageEvent, CaptionCallbacks } from './captionEvents'
import { buildScenario, STRESS_DURATION_MS, type ScenarioKey } from './simulation/scenarios'
import { expandScenario } from './simulation/engine'
import { materialState } from './simulation/material'
import MemberCaptionGrid from './components/MemberCaptionGrid.vue'
import ApiSettings from './components/ApiSettings.vue'
import { receiveCaption, expireCaptions, type Caption } from './captions'
type Member = { id: string; name: string; mic: boolean; color: string }
const glasses = ref(location.pathname === '/glasses')
const settingsOpen = ref(false)
const joined = ref(false), mode = ref<'create' | 'join'>('create'), name = ref(''), code = ref(''), room = ref(''), error = ref('')
const members = ref<Member[]>([]), captions = ref<Caption[]>([])
const now = ref(Date.now())
const adaptiveCards = ref(false)
const scenario = ref<ScenarioKey>('rapid')
const scenarioRunning = ref(false)
const simulationStarted = ref<number | null>(null)
const stressProgress = computed(() => {
  if (scenario.value !== 'stress' || simulationStarted.value === null) return ''
  const seconds = Math.min(60, Math.max(0, Math.floor((now.value - simulationStarted.value) / 1000)))
  if (seconds === 60) return scenarioRunning.value ? '60 / 60 秒 · 发言结束，等待字幕自然消失' : '60 / 60 秒 · 压力测试完成'
  return `${seconds} / 60 秒 · ${Math.floor(seconds / 10) % 2 === 0 ? '密集交谈' : '稀疏交谈'}`
})
let simulationEnd = 0
let pending: { at: number; run: () => void }[] = []
// 角色与台词来自 materials/ 目录下的素材包，可独立编辑，不需要改代码。
const materialPack = materialState.packs[0]
const materialError = materialState.errors.join('；')
function characterAt(index: number): { name: string; color: string } {
  const character = materialPack?.characters[index]
  return { name: character?.name ?? (index === 0 ? '我' : '新成员'), color: character?.color ?? '' }
}
const me = computed(() => members.value[0])
const active = computed(() => members.value.filter(m => m.mic))
const inputMode = ref<'simulation' | 'microphone'>('simulation')
const asrProvider = ref<AsrProvider>('browser')
const asrState = ref<AsrState>('idle')
const asrMessage = ref('麦克风已关闭')
const asrActive = computed(() => ['starting', 'listening', 'reconnecting'].includes(asrState.value))
const micStartedAt = ref<number | null>(null)
const micStoppedAt = ref<number | null>(null)
const usageByRequest = new Map<string, AsrUsageEvent>()
const usageTotals = ref({ submitted: 0, completed: 0, returned: 0, returnedSegments: 0 })
const micOpenSeconds = computed(() => micStartedAt.value === null ? 0 : Math.max(0, ((micStoppedAt.value ?? now.value) - micStartedAt.value) / 1000))
function formatUsageDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}分${(seconds % 60).toFixed(1)}秒`
}
function clearMicUsage() {
  micStartedAt.value = null; micStoppedAt.value = null
  usageByRequest.clear()
  usageTotals.value = { submitted: 0, completed: 0, returned: 0, returnedSegments: 0 }
}
const asrCallbacks: CaptionCallbacks = {
  onState(state, message) {
    if (asrProvider.value === 'doubao') {
      if (state === 'listening' && micStartedAt.value === null) micStartedAt.value = Date.now()
      if ((state === 'idle' || state === 'error') && micStartedAt.value !== null && micStoppedAt.value === null) micStoppedAt.value = Date.now()
    }
    asrState.value = state
    asrMessage.value = message
    if (inputMode.value === 'microphone' && me.value) me.value.mic = state === 'listening'
  },
  onCaption({ memberId, utteranceId, text, state }) {
    if (inputMode.value === 'microphone' && joined.value) recognize(memberId, utteranceId, text, state)
  },
  onDiscard(memberId, id) {
    captions.value = captions.value.filter(c => c.memberId !== memberId || c.id !== id || c.state === 'final')
  },
  onUsage(usage) {
    if (asrProvider.value !== 'doubao' || micStartedAt.value === null || micStoppedAt.value !== null) return
    usageByRequest.set(usage.requestId, usage)
    // 同一连接会反复更新累计值，按 requestId 覆盖后再求和，避免把进度重复计入。
    const values = [...usageByRequest.values()]
    usageTotals.value = {
      submitted: values.reduce((sum, value) => sum + value.submittedAudioSeconds, 0),
      completed: values.reduce((sum, value) => sum + value.completedAudioSeconds, 0),
      returned: values.reduce((sum, value) => sum + (value.serverAudioSeconds ?? 0), 0),
      returnedSegments: values.filter(value => value.serverAudioSeconds !== null).length,
    }
  },
}
let currentAsrSession: AsrSession | undefined
const asr = {
  start() {
    if (!me.value) return
    if (asrProvider.value === 'doubao') clearMicUsage()
    currentAsrSession = createAsrSession(asrProvider.value, me.value.id, asrCallbacks)
    currentAsrSession.start()
  },
  stop() { currentAsrSession?.stop(); currentAsrSession = undefined },
}
function changeAsrProvider(event: Event) {
  asr.stop()
  clearMicUsage()
  asrProvider.value = (event.target as HTMLSelectElement).value === 'doubao' ? 'doubao' : 'browser'
  asrState.value = 'idle'; asrMessage.value = '麦克风已关闭'
}
function changeInputMode(event: Event) {
  asr.stop()
  clearMicUsage()
  pending = []; scenarioRunning.value = false; simulationStarted.value = null
  captions.value = []; error.value = ''
  inputMode.value = (event.target as HTMLSelectElement).value === 'microphone' ? 'microphone' : 'simulation'
  members.value.forEach(member => member.mic = inputMode.value === 'simulation')
}
function toggleRealMic() {
  if (asrActive.value) asr.stop()
  else if (joined.value && inputMode.value === 'microphone') asr.start()
}
window.addEventListener('pagehide', asr.stop)
function addMember() {
  if (members.value.length >= 8) { error.value = '房间已满，最多允许 8 人。'; return }
  const character = characterAt(members.value.length)
  members.value.push({ id: crypto.randomUUID(), name: character.name, mic: inputMode.value === 'simulation', color: character.color })
  error.value = ''
}
function setMemberCount(event: Event) {
  const count = Number((event.target as HTMLSelectElement).value)
  if (!Number.isInteger(count) || count < 1 || count > 8) return
  while (members.value.length < count) addMember()
  members.value = members.value.slice(0, count)
  const ids = new Set(members.value.map(member => member.id))
  captions.value = captions.value.filter(caption => ids.has(caption.memberId))
  error.value = ''
}
function toggleMemberMic(id: string) {
  if (inputMode.value === 'microphone') {
    if (id === me.value?.id) toggleRealMic()
    return
  }
  const member = members.value.find(member => member.id === id)
  if (member) {
    member.mic = !member.mic
    if (!member.mic) captions.value = captions.value.filter(c => c.memberId !== id || c.state === 'final')
  }
}
function enter() {
  error.value = ''
  if (!name.value.trim()) { error.value = '请先填写你的显示名称。'; return }
  if (mode.value === 'join' && !/^\d{6}$/.test(code.value)) { error.value = '请输入 6 位数字房间码。'; return }
  room.value = mode.value === 'create' ? String(Math.floor(100000 + Math.random() * 900000)) : code.value
  members.value = [{ id: crypto.randomUUID(), name: name.value.trim(), mic: inputMode.value === 'simulation', color: characterAt(0).color }]
  for (let i = 0; i < 3; i++) addMember()
  joined.value = true
  now.value = Date.now()
}
// Recognition adapter: a stable utterance ID connects interim updates to its final result.
function recognize(memberId: string, id: string, text: string, state: Caption['state']) {
  if (!joined.value || !members.value.some(m => m.id === memberId && m.mic)) return
  receiveCaption(captions.value, memberId, id, text, state, Date.now())
  now.value = Date.now()
}
function runSimulation() {
  if (inputMode.value !== 'simulation' || scenarioRunning.value) return
  if (!materialPack) { error.value = materialError || '未找到可用素材包，请检查 materials 目录下的 JSON 文件。'; return }
  const first = active.value[0]
  if (!['eight', 'stress', 'script'].includes(scenario.value) && !first) { error.value = '请先开启至少一位成员的模拟麦克风。'; return }
  error.value = ''
  const start = Date.now()
  simulationStarted.value = start
  if (scenario.value === 'stress' || scenario.value === 'eight') {
    while (members.value.length < 8) addMember()
    members.value.forEach(member => member.mic = true)
  } else if (scenario.value === 'script') {
    while (members.value.length < Math.min(8, materialPack.characters.length)) addMember()
    members.value.forEach(member => member.mic = true)
  }
  // 场景只描述“谁在什么时间说什么”，这里把成员槽位解析成真实成员，再交给调度队列。
  const firstActiveIndex = first ? members.value.indexOf(first) : 0
  const utterances = buildScenario(scenario.value, materialPack, firstActiveIndex)
  pending = []
  for (const event of expandScenario(utterances, () => crypto.randomUUID())) {
    const memberId = members.value[event.memberIndex]?.id
    if (!memberId) continue
    pending.push({ at: start + event.at, run: () => recognize(memberId, event.utteranceId, event.text, event.state) })
  }
  pending.sort((a, b) => a.at - b.at)
  simulationEnd = scenario.value === 'stress' ? start + STRESS_DURATION_MS : (pending.at(-1)?.at ?? start) + 12000
  scenarioRunning.value = true
  tick()
}
function leave() {
  asr.stop()
  clearMicUsage()
  joined.value = false; members.value = []; captions.value = []; pending = []
  scenarioRunning.value = false; simulationStarted.value = null; error.value = ''
}
function tick() {
  now.value = Date.now()
  while (pending.length && pending[0]!.at <= now.value) pending.shift()!.run()
  captions.value = expireCaptions(captions.value, now.value)
  if (now.value >= simulationEnd && (scenario.value !== 'stress' || !captions.value.length)) scenarioRunning.value = false
}
// Each final has its own immutable deadline; the shared clock never resets it.
const timer = setInterval(tick, 50)
onUnmounted(() => {
  asr.stop(); clearInterval(timer); pending = []
  window.removeEventListener('pagehide', asr.stop)
})
const copied = ref(false)
async function copyCode() { try { await navigator.clipboard.writeText(room.value); copied.value = true; setTimeout(() => copied.value = false, 2000) } catch { error.value = `请手动复制房间码：${room.value}` } }
</script>

<template>
  <div v-if="glasses" class="glasses-page">
    <a href="/" class="back-link">← 返回实时字幕</a>
    <div class="concept-label">实时字幕 / GLASSES CONCEPT</div>
    <h1>智能眼镜字幕预览</h1><p>展示说话人、字幕与设备状态的静态示例，未连接硬件。</p>
    <div class="lens"><div class="lens-top"><span>● 实时字幕 · 4 人交流中</span><span>14:32</span></div><div class="lens-caption"><span>丰川祥子</span><p>周六下午两点，<br>我们在咖啡馆门口见吧。</p><small>若叶睦　好呀，我可以。</small></div><div class="lens-bottom">▰ ▰ ▰　 连接正常 <span>麦克风开启 ●</span></div></div>
    <div class="concept-notes"><span>高对比字幕</span><span>清晰说话人标记</span><span>两行核心信息</span></div>
  </div>
  <div v-else class="app-shell" :class="{ 'in-room': joined }">
    <header v-if="!joined" class="header"><a class="brand" href="/"><span class="brand-icon">≋</span>实时字幕<span class="brand-en">LIVE CAPTIONS</span></a><button @click="settingsOpen = !settingsOpen" :aria-expanded="settingsOpen">设置</button><a class="glasses-link" href="/glasses">▱ AR 预览 <span>↗</span></a></header>
    <ApiSettings v-if="!joined && settingsOpen" @close="settingsOpen = false" />
    <main v-else-if="!joined" class="landing">
      <section class="intro"><div class="eyebrow"><span class="dot"></span> 多人字幕房间 · 交互演示</div><h1>多人<span>实时字幕</span></h1><p>按成员显示实时字幕，让每句话随时间自然消散。</p><div class="feature-tags"><span>◎ 最多 8 名成员</span><span>◷ 每句话独立渐隐</span><span>✦ 无字幕历史记录</span></div></section>
      <section class="entry-card"><span class="small-label">房间设置</span><h2>创建或加入房间</h2><p>输入显示名称；加入房间需填写 6 位数字房间码。</p><div class="mode-tabs"><button :class="{ selected: mode === 'create' }" @click="mode = 'create'; error = ''">创建房间</button><button :class="{ selected: mode === 'join' }" @click="mode = 'join'; error = ''">加入房间</button></div><form @submit.prevent="enter"><label for="display-name">显示名称</label><input id="display-name" v-model="name" maxlength="20" placeholder="输入显示名称" autocomplete="nickname"/><template v-if="mode === 'join'"><label for="room-code">房间码</label><input id="room-code" v-model="code" maxlength="6" inputmode="numeric" placeholder="输入 6 位数字房间码"/></template><p v-if="error" class="error" role="alert">{{ error }}</p><button class="primary" type="submit">{{ mode === 'create' ? '创建房间' : '加入房间' }} <span>→</span></button></form><div class="privacy-note">♧ 字幕确认后显示 3、6 或 10 秒，再用 2 秒渐隐清除。</div><div class="demo-note"><span>DEMO</span> 支持模拟测试和单设备普通话识别，不同设备不互通。真实模式需授权麦克风，音频将交给所选的浏览器或豆包语音服务。</div></section>
    </main>
    <main v-else class="room-layout">
      <header class="room-topbar">
        <div><h1>字幕房间</h1><button class="copy-room" @click="copyCode" aria-label="复制房间码">{{ room }} · {{ copied ? '已复制' : '复制房间码' }}</button></div>
        <button class="room-exit" @click="leave">离开房间</button>
      </header>
      <div class="room-demo-controls">
        <label for="input-mode">输入</label>
        <select id="input-mode" :value="inputMode" @change="changeInputMode">
          <option value="simulation">模拟字幕</option>
          <option value="microphone">真实麦克风</option>
        </select>
        <label for="member-count">人数</label>
        <select id="member-count" :value="members.length" :disabled="scenarioRunning && scenario === 'stress'" @change="setMemberCount">
          <option v-for="count in 8" :key="count" :value="count">{{ count }} 人</option>
        </select>
      </div>
      <div v-if="inputMode === 'microphone'" class="room-demo-controls">
        <label for="asr-provider">识别来源</label>
        <select id="asr-provider" :value="asrProvider" @change="changeAsrProvider">
          <option value="browser">浏览器 ASR</option>
          <option value="doubao">豆包 ASR 2.0</option>
        </select>
      </div>
      <div v-if="inputMode === 'simulation'" class="room-demo-controls simulation-controls">
        <label for="scenario">模拟字幕</label>
        <select id="scenario" v-model="scenario" :disabled="scenarioRunning">
          <option value="rapid">单人连续快速讲话</option>
          <option value="stress">8 人对话 · 1 分钟压力测试</option>
          <option value="eight">8 人同时讲话</option>
          <option value="long">长句（超过 30 字）</option>
          <option value="fade">渐隐时加入新句</option>
          <option value="overflow">卡片内容溢出</option>
          <option value="interim">实时识别到确认</option>
          <option value="script">素材对话（时间轴）</option>
        </select>
        <button @click="runSimulation" :disabled="scenarioRunning">{{ scenarioRunning ? '测试中' : '运行' }}</button>
      </div>
      <p v-else class="room-grid-note">普通话 · 仅“我”接收真实语音 · {{ asrProvider === 'doubao' ? '本地检测到说话后上传至豆包，按服务用量计费' : '音频可能发送至浏览器语音服务' }}</p>
      <label class="layout-experiment"><input v-model="adaptiveCards" type="checkbox" />{{ adaptiveCards ? '动态自适应布局（实验）' : '固定等分布局（原版）' }}</label>
      <section class="room-stage" aria-label="房间内容">
        <MemberCaptionGrid :adaptive="adaptiveCards" :members="members" :captions="captions" :now="now" :self-id="me?.id" :live-input="inputMode === 'microphone'" @toggle-mic="toggleMemberMic" />
      </section>
      <p v-if="error" class="room-error error" role="alert">{{ error }}</p>
      <p v-if="inputMode === 'microphone'" class="room-grid-note" :class="{ error: asrState === 'error' }" role="status">{{ asrMessage }}</p>
      <p v-if="inputMode === 'microphone' && asrProvider === 'doubao' && micStartedAt !== null" class="room-grid-note" aria-label="本次开麦音频用量">
        本次开麦 {{ formatUsageDuration(micOpenSeconds) }} · 提交 {{ formatUsageDuration(usageTotals.submitted) }} · 发送完成 {{ formatUsageDuration(usageTotals.completed) }} · 豆包返回 {{ usageTotals.returnedSegments ? formatUsageDuration(usageTotals.returned) : '尚无时长' }}
        <small>豆包返回的是响应中的音频时长，不是账单计费时长；本次数据仅存页面内存。</small>
      </p>
      <p class="room-grid-note">{{ stressProgress || '确认后按字数显示 3 / 6 / 10 秒，再渐隐 2 秒 · 无历史回看' }}</p>
      <div class="room-bottom-bar">
        <div><strong>{{ inputMode === 'simulation' ? '模拟测试' : '真实麦克风' }}</strong><small>{{ inputMode === 'simulation' ? '未采集音频' : asrProvider === 'doubao' ? '豆包 ASR 2.0 · 普通话' : '浏览器语音识别 · zh-CN' }}</small></div>
        <button v-if="inputMode === 'microphone'" class="room-self-mic" :aria-pressed="asrActive" @click="toggleRealMic">{{ asrActive ? '关闭麦克风' : '开启麦克风' }}</button>
        <button v-else-if="me" class="room-self-mic" :aria-pressed="me.mic" @click="toggleMemberMic(me.id)">{{ me.mic ? '关闭我的麦克风' : '开启我的麦克风' }}</button>
      </div>
    </main>
    <footer v-if="!joined"><span>实时字幕 · 面对面多人交流</span><span>单设备识别 <span class="footer-dot">●</span> 保留模拟测试</span></footer>
  </div>
</template>
