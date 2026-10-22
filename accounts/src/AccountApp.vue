<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { accountRequest } from './accountApi'
import QuestionFields from './QuestionFields.vue'
import OwnedRooms from './OwnedRooms.vue'
const user = ref(null), projects = ref([]), view = ref('login'), busy = ref(false), checking = ref(true), error = ref(''), message = ref('')
const username = ref(''), nickname = ref(''), password = ref(''), confirmPassword = ref(''), currentPassword = ref(''), recoveryStarted = ref(false)
const questions = ref(emptyQuestions()), presets = ref([]), editingNames = ref({}), projectOrigin = ref('https://hakisub.xdstar.work')
const titles = { login: '欢迎回来', register: '从一个账号开始', recovery: '找回你的账号', center: '你的个人空间', settings: '账号设置', presets: 'HakiSub 房间存档' }
const title = computed(() => titles[view.value])
function emptyQuestions() { return ['你为自己记住的第一段私密短语是什么？', '你为自己记住的第二段私密短语是什么？', '你为自己记住的第三段私密短语是什么？'].map(question => ({ question, answer: '' })) }
function clearSecrets() { password.value = ''; confirmPassword.value = ''; currentPassword.value = ''; questions.value = emptyQuestions(); recoveryStarted.value = false }
function navigate(next) { clearSecrets(); error.value = ''; message.value = ''; view.value = next; if (next === 'presets') loadPresets(); if (next === 'center') refreshIdentity() }
async function execute(operation) {
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try { await operation() }
  catch (issue) { error.value = issue.message; if (issue.status === 401 && user.value) { user.value = null; presets.value = []; view.value = 'login' } }
  finally { password.value = ''; confirmPassword.value = ''; currentPassword.value = ''; questions.value.forEach(item => { item.answer = '' }); busy.value = false }
}
async function refreshIdentity() {
  try {
    const data = await accountRequest('/api/account/me')
    if (user.value?.uid !== data.user.uid) presets.value = []
    user.value = data.user; projects.value = data.projects; nickname.value = data.user.nickname
    if (['login', 'register'].includes(view.value)) view.value = 'center'
  } catch (issue) {
    if (issue.status !== 401) error.value = issue.message
    user.value = null; presets.value = []; projects.value = []
    if (['center', 'settings', 'presets'].includes(view.value)) view.value = 'login'
  } finally { checking.value = false }
}
async function authenticate(register = false) {
  await execute(async () => {
    const body = register ? { username: username.value, nickname: nickname.value, password: password.value, confirmPassword: confirmPassword.value, questions: questions.value } : { username: username.value, password: password.value }
    user.value = (await accountRequest(`/api/account/${register ? 'register' : 'login'}`, 'POST', body)).user
    nickname.value = user.value.nickname; projects.value = []; presets.value = []; view.value = 'center'
    await refreshIdentity()
    if (user.value) message.value = register ? '注册成功，已自动登录。' : '登录成功。'
  })
}
async function logout() { await execute(async () => { await accountRequest('/api/account/logout', 'POST', {}); user.value = null; presets.value = []; projects.value = []; view.value = 'login'; message.value = '已退出登录。' }) }
async function changeNickname() { await execute(async () => { user.value = (await accountRequest('/api/account/nickname', 'PATCH', { nickname: nickname.value })).user; message.value = '用户昵称已更新，下次进入 HakiSub 时使用新昵称。' }) }
async function changePassword() { await execute(async () => { message.value = (await accountRequest('/api/account/password', 'POST', { currentPassword: currentPassword.value, password: password.value, confirmPassword: confirmPassword.value })).message }) }
async function changeQuestions() { await execute(async () => { message.value = (await accountRequest('/api/account/security-questions', 'POST', { currentPassword: currentPassword.value, questions: questions.value })).message }) }
async function startRecovery() { await execute(async () => { const data = await accountRequest('/api/account/recovery/start', 'POST', { username: username.value }); questions.value = data.questions.map(question => ({ question, answer: '' })); recoveryStarted.value = true }) }
async function resetPassword() { await execute(async () => { message.value = (await accountRequest('/api/account/recovery/reset', 'POST', { answers: questions.value.map(item => item.answer), password: password.value, confirmPassword: confirmPassword.value })).message; user.value = null; recoveryStarted.value = false; view.value = 'login' }) }
async function loadPresets() {
  await execute(async () => {
    presets.value = (await accountRequest('/api/projects/hakisub/presets')).presets
    editingNames.value = Object.fromEntries(presets.value.map(preset => [preset.id, preset.name]))
  })
}
async function renamePreset(preset) { await execute(async () => { const updated = (await accountRequest(`/api/projects/hakisub/presets/${preset.id}`, 'PATCH', { name: editingNames.value[preset.id] })).preset; presets.value = presets.value.map(item => item.id === preset.id ? updated : item); message.value = '存档名称已更新。' }) }
async function deletePreset(preset) { if (!confirm(`删除存档“${preset.name}”？这不会销毁实时房间。`)) return; await execute(async () => { await accountRequest(`/api/projects/hakisub/presets/${preset.id}`, 'DELETE', {}); presets.value = presets.value.filter(item => item.id !== preset.id); message.value = '存档已删除。' }) }
const date = value => new Date(value).toLocaleString('zh-CN')
const onFocus = () => { if (!busy.value) refreshIdentity() }
onMounted(async () => { await refreshIdentity(); try { projectOrigin.value = (await accountRequest('/api/account/client-configuration')).projectOrigin } catch {} window.addEventListener('focus', onFocus) })
onUnmounted(() => { clearSecrets(); window.removeEventListener('focus', onFocus) })
</script>
<template>
  <div class="account-shell">
    <header><a class="brand" href="/">✳ XDstar<span>.</span></a><a :href="projectOrigin" target="_blank" rel="noopener noreferrer">打开 HakiSub ↗</a></header>
    <main>
      <aside class="intro"><span class="eyebrow">YOUR LITTLE SPACE</span><h1>一个账号，<br>记住你的<span>小空间。</span></h1><p>属于 xdstar.work 的统一账号。<br>保存偏好，继续上一次的小想法。</p><div class="intro-detail">✦ 登录账号用于验证身份<br>✦ 用户昵称用于对外显示<br>✦ 实时字幕依然不留历史</div></aside>
      <section class="panel" aria-labelledby="page-title" :aria-busy="busy || checking">
        <nav v-if="user" class="tabs" aria-label="个人中心"><button :class="{ selected: view === 'center' }" @click="navigate('center')" :disabled="busy">概览</button><button :class="{ selected: view === 'settings' }" @click="navigate('settings')" :disabled="busy">账号设置</button><button :class="{ selected: view === 'presets' }" @click="navigate('presets')" :disabled="busy">房间存档</button></nav>
        <nav v-else class="tabs" aria-label="账号入口"><button :class="{ selected: view === 'login' }" @click="navigate('login')" :disabled="busy">登录</button><button :class="{ selected: view === 'register' }" @click="navigate('register')" :disabled="busy">注册</button><button :class="{ selected: view === 'recovery' }" @click="navigate('recovery')" :disabled="busy">找回密码</button></nav>
        <p class="eyebrow">XDSTAR ACCOUNT</p><h2 id="page-title">{{ title }}</h2>
        <p v-if="checking" role="status">正在读取登录状态…</p><p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" class="success" role="status">{{ message }}</p>
        <form v-if="!checking && ['login', 'register'].includes(view)" @submit.prevent="authenticate(view === 'register')"><fieldset :disabled="busy">
          <label for="username">登录账号</label><input id="username" v-model="username" autocomplete="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]{3,32}" required><small>3～32 位英文字母、数字或下划线，注册后暂不可修改。</small>
          <template v-if="view === 'register'"><label for="nickname">用户昵称</label><input id="nickname" v-model="nickname" autocomplete="nickname" maxlength="20" required><small>向伙伴展示的名字，可以与登录账号不同，也可以重名。</small></template>
          <label for="password">{{ view === 'register' ? '设置密码' : '密码' }}</label><input id="password" v-model="password" type="password" :autocomplete="view === 'register' ? 'new-password' : 'current-password'" :minlength="view === 'register' ? 12 : 1" maxlength="128" required>
          <template v-if="view === 'register'"><small>12～128 个字符，建议使用密码管理器生成独立密码。</small><label for="confirm-password">确认密码</label><input id="confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><h3>设置三道密保</h3><QuestionFields :questions="questions" /></template>
          <button class="primary" type="submit">{{ busy ? '请稍候…' : view === 'register' ? '注册并登录 →' : '登录 →' }}</button>
        </fieldset></form>
        <template v-if="!checking && view === 'recovery'"><p class="muted">回答注册时设置的全部三道问题，可重置密码。问题与答案请勿向他人透露。</p>
          <form v-if="!recoveryStarted" @submit.prevent="startRecovery"><fieldset :disabled="busy"><label for="recovery-username">登录账号</label><input id="recovery-username" v-model="username" autocomplete="username" maxlength="32" required><button class="primary">继续 →</button></fieldset></form>
          <form v-else @submit.prevent="resetPassword"><fieldset :disabled="busy"><QuestionFields :questions="questions" recovery /><label for="reset-password">新密码</label><input id="reset-password" v-model="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><label for="reset-confirm">确认新密码</label><input id="reset-confirm" v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><button class="primary">重置密码</button><button type="button" class="text-button" @click="navigate('recovery')">重新输入账号</button></fieldset></form>
        </template>
        <template v-if="user && view === 'center'"><div class="welcome">你好，{{ user.nickname }} <span>✳</span></div><dl><div><dt>登录账号 · 仅本人可见</dt><dd>{{ user.username }}</dd></div><div><dt>UID</dt><dd class="uid">{{ user.uid }}</dd></div><div><dt>注册时间</dt><dd>{{ date(user.createdAt) }}</dd></div></dl><h3>关联的子项目</h3><a class="project-card" :href="projectOrigin" target="_blank" rel="noopener noreferrer"><strong>HakiSub ↗</strong><span>面对面交流的实时字幕</span><small>{{ projects.some(item => item.key === 'hakisub') ? '已关联个人存档' : '保存第一份房间配置后关联' }}</small></a><p class="muted">HakiSub 仍支持游客参与。账号登录不代表拥有房主权限或付费语音使用额度。</p><button class="text-button" @click="logout" :disabled="busy">退出登录</button></template>
        <OwnedRooms v-if="user && view === 'center'" :key="user.uid" :uid="user.uid" :project-origin="projectOrigin" />
        <template v-if="user && view === 'settings'">
          <form @submit.prevent="changeNickname"><fieldset :disabled="busy"><h3>用户昵称</h3><label for="new-nickname">新的用户昵称</label><input id="new-nickname" v-model="nickname" maxlength="20" autocomplete="nickname" required><button class="secondary">保存昵称</button></fieldset></form>
          <form class="section-divider" @submit.prevent="changePassword"><fieldset :disabled="busy"><h3>修改密码</h3><label for="current-password">当前密码</label><input id="current-password" v-model="currentPassword" type="password" autocomplete="current-password" maxlength="128" required><label for="new-password">新密码</label><input id="new-password" v-model="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><label for="new-password-confirm">确认新密码</label><input id="new-password-confirm" v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><button class="secondary">更新密码</button></fieldset></form>
          <form class="section-divider" @submit.prevent="changeQuestions"><fieldset :disabled="busy"><h3>修改三道密保</h3><label for="security-password">验证当前密码</label><input id="security-password" v-model="currentPassword" type="password" autocomplete="current-password" maxlength="128" required><QuestionFields :questions="questions" /><button class="secondary">替换全部密保</button></fieldset></form>
        </template>
        <template v-if="user && view === 'presets'"><p class="muted">存档仅保存识别来源和布局偏好。加载后仍需选择房间并手动开麦，不包含 API Key 或房主权限。</p><p v-if="!presets.length">还没有存档。在 HakiSub 的“个人房间存档”中保存当前配置。</p><article v-for="preset in presets" :key="preset.id" class="preset"><form @submit.prevent="renamePreset(preset)"><label :for="`preset-${preset.id}`">存档名称</label><input :id="`preset-${preset.id}`" v-model="editingNames[preset.id]" maxlength="60" required :disabled="busy"><small>更新于 {{ date(preset.updatedAt) }}</small><div class="button-row"><button class="secondary" :disabled="busy">保存名称</button><a :href="`${projectOrigin}/?preset=${encodeURIComponent(preset.id)}`" target="_blank" rel="noopener noreferrer">在 HakiSub 加载 ↗</a><button type="button" class="danger" @click="deletePreset(preset)" :disabled="busy">删除</button></div></form></article><button class="text-button" @click="loadPresets" :disabled="busy">刷新存档</button></template>
      </section>
    </main><footer>XDstar ✳ 小工具与新想法 <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">鄂ICP备2026059859号-1</a></footer>
  </div>
</template>
