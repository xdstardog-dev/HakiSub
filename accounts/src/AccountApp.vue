<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { accountRequest } from './accountApi'
import QuestionFields from './QuestionFields.vue'
import OwnedRooms from './OwnedRooms.vue'
import AccountNavigation from './AccountNavigation.vue'
const user = ref(null), projects = ref([]), view = ref('login'), busy = ref(false), checking = ref(true), error = ref(''), message = ref('')
const username = ref(''), nickname = ref(''), password = ref(''), confirmPassword = ref(''), currentPassword = ref(''), securityPassword = ref(''), recoveryStarted = ref(false)
const questions = ref(emptyQuestions()), presets = ref([]), editingNames = ref({}), projectOrigin = ref('https://hakisub.xdstar.work'), registrationStep = ref(1)
const titles = { login: '欢迎回来', register: '创建你的 XDstar 账号', recovery: '找回密码', center: '总览', rooms: '我的房间', presets: '房间存档', profile: '个人资料', security: '安全设置' }
const descriptions = { center: '从这里继续你的小空间。', rooms: '管理绑定当前账号的 HakiSub 房间。', presets: '保存偏好，在下次交流时继续使用。', profile: '管理你的公开昵称与账号信息。', security: '保护账号，保持恢复方式可用。' }
const visibleSecrets = ref({}), navigationDialog = ref(null), pageHeading = ref(null), drawerOpen = ref(false)
const title = computed(() => titles[view.value])
let identityGeneration = 0, disposed = false, mobileQuery, returnFocus, scrollLock
function emptyQuestions() { return ['你为自己记住的第一段私密短语是什么？', '你为自己记住的第二段私密短语是什么？', '你为自己记住的第三段私密短语是什么？'].map(question => ({ question, answer: '' })) }
function clearSecrets() { visibleSecrets.value = {}; password.value = ''; confirmPassword.value = ''; currentPassword.value = ''; securityPassword.value = ''; questions.value = emptyQuestions(); recoveryStarted.value = false }
function clearIdentity() { identityGeneration++; clearSecrets(); user.value = null; projects.value = []; presets.value = []; editingNames.value = {}; nickname.value = ''; view.value = 'login'; registrationStep.value = 1; closeDrawer() }
function navigate(next) {
  if (busy.value) return
  if (view.value !== next) { clearSecrets(); registrationStep.value = 1 }
  error.value = ''; message.value = ''; view.value = next; closeDrawer()
  if (next === 'presets') void loadPresets()
  nextTick(() => pageHeading.value?.focus())
}
function nextRegistrationStep() {
  error.value = ''; visibleSecrets.value = {}
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username.value) || !nickname.value.trim() || nickname.value.length > 20 || password.value.length < 8 || password.value.length > 128) { error.value = '请检查账号、昵称和密码的填写要求。'; return }
  if (password.value !== confirmPassword.value) { error.value = '两次输入的密码不一致。'; return }
  registrationStep.value = 2; nextTick(() => pageHeading.value?.focus())
}
function previousRegistrationStep() { registrationStep.value = 1; error.value = ''; visibleSecrets.value = {}; nextTick(() => pageHeading.value?.focus()) }
async function execute(operation) {
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try { await operation() }
  catch (issue) { error.value = issue.message; if (issue.status === 401 && user.value) clearIdentity() }
  // 失败保留当前表单供修正；成功提交、离开页面和退出时清理敏感内容。
  finally { visibleSecrets.value = {}; busy.value = false }
}
async function refreshIdentity() {
  const current = ++identityGeneration
  try {
    const data = await accountRequest('/api/account/me')
    if (disposed || current !== identityGeneration) return
    if (user.value?.uid !== data.user.uid) { clearSecrets(); presets.value = []; editingNames.value = {}; nickname.value = data.user.nickname }
    user.value = data.user; projects.value = data.projects
    if (['login', 'register', 'recovery'].includes(view.value)) view.value = 'center'
  } catch (issue) {
    if (disposed || current !== identityGeneration) return
    if (issue.status === 401) { if (user.value) clearIdentity() }
    else error.value = issue.message
  } finally { if (!disposed && current === identityGeneration) checking.value = false }
}
async function authenticate(register = false) {
  await execute(async () => {
    const body = register ? { username: username.value, nickname: nickname.value, password: password.value, confirmPassword: confirmPassword.value, questions: questions.value } : { username: username.value, password: password.value }
    identityGeneration++
    user.value = (await accountRequest(`/api/account/${register ? 'register' : 'login'}`, 'POST', body)).user
    clearSecrets(); registrationStep.value = 1; nickname.value = user.value.nickname; projects.value = []; presets.value = []; view.value = 'center'
    await refreshIdentity()
    if (user.value) message.value = register ? '注册成功，已自动登录。' : '登录成功。'
  })
}
async function logout() { await execute(async () => { await accountRequest('/api/account/logout', 'POST', {}); clearIdentity(); username.value = ''; message.value = '已退出登录。' }) }
async function changeNickname() { await execute(async () => { user.value = (await accountRequest('/api/account/nickname', 'PATCH', { nickname: nickname.value })).user; message.value = '用户昵称已更新，下次进入 HakiSub 时使用新昵称。' }) }
async function changePassword() { await execute(async () => { message.value = (await accountRequest('/api/account/password', 'POST', { currentPassword: currentPassword.value, password: password.value, confirmPassword: confirmPassword.value })).message; currentPassword.value = ''; password.value = ''; confirmPassword.value = '' }) }
async function changeQuestions() { await execute(async () => { message.value = (await accountRequest('/api/account/security-questions', 'POST', { currentPassword: securityPassword.value, questions: questions.value })).message; securityPassword.value = ''; questions.value = emptyQuestions() }) }
async function startRecovery() { await execute(async () => { const data = await accountRequest('/api/account/recovery/start', 'POST', { username: username.value }); questions.value = data.questions.map(question => ({ question, answer: '' })); recoveryStarted.value = true }) }
function restartRecovery() { clearSecrets(); error.value = ''; message.value = '' }
async function resetPassword() { await execute(async () => { const result = await accountRequest('/api/account/recovery/reset', 'POST', { answers: questions.value.map(item => item.answer), password: password.value, confirmPassword: confirmPassword.value }); clearIdentity(); message.value = result.message }) }
async function loadPresets() {
  await execute(async () => {
    presets.value = (await accountRequest('/api/projects/hakisub/presets')).presets
    editingNames.value = Object.fromEntries(presets.value.map(preset => [preset.id, preset.name]))
  })
}
async function renamePreset(preset) { await execute(async () => { const updated = (await accountRequest(`/api/projects/hakisub/presets/${preset.id}`, 'PATCH', { name: editingNames.value[preset.id] })).preset; presets.value = presets.value.map(item => item.id === preset.id ? updated : item); message.value = '存档名称已更新。' }) }
async function deletePreset(preset) { if (!confirm(`删除存档“${preset.name}”？这不会销毁实时房间。`)) return; await execute(async () => { await accountRequest(`/api/projects/hakisub/presets/${preset.id}`, 'DELETE', {}); presets.value = presets.value.filter(item => item.id !== preset.id); message.value = '存档已删除。' }) }
function openDrawer() {
  if (!navigationDialog.value || drawerOpen.value) return
  returnFocus = document.activeElement
  const body = document.body
  scrollLock = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow, y: window.scrollY }
  // 固定背景以兼容手机浏览器，关闭时恢复原来的位置和内联样式。
  Object.assign(body.style, { position: 'fixed', top: `-${scrollLock.y}px`, width: '100%', overflow: 'hidden' })
  drawerOpen.value = true; navigationDialog.value.showModal()
}
function finishDrawerClose() {
  if (!drawerOpen.value) return
  drawerOpen.value = false
  if (scrollLock) { const { y, ...styles } = scrollLock; Object.assign(document.body.style, styles); window.scrollTo(0, y); scrollLock = null }
  returnFocus?.focus(); returnFocus = null
}
function closeDrawer() { if (navigationDialog.value?.open) navigationDialog.value.close(); finishDrawerClose() }
function onViewportChange(event) { if (!event.matches) closeDrawer() }
function expireSession() { clearIdentity(); error.value = '登录已过期，请重新登录。' }
const date = value => new Date(value).toLocaleString('zh-CN')
const onFocus = () => { if (!busy.value) void refreshIdentity() }
onMounted(async () => {
  mobileQuery = window.matchMedia('(max-width: 900px)'); mobileQuery.addEventListener('change', onViewportChange)
  window.addEventListener('focus', onFocus)
  await refreshIdentity()
  try { const configuration = await accountRequest('/api/account/client-configuration'); if (!disposed) projectOrigin.value = configuration.projectOrigin } catch {}
})
onUnmounted(() => { disposed = true; identityGeneration++; closeDrawer(); clearSecrets(); window.removeEventListener('focus', onFocus); mobileQuery?.removeEventListener('change', onViewportChange) })
</script>
<template>
  <div class="account-shell" :class="user ? 'workspace-shell' : 'authentication-shell'">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <template v-if="user">
      <aside class="desktop-sidebar">
        <a class="brand" href="/" aria-label="XDstar 首页"><span class="brand-mark" aria-hidden="true">✳</span> XDstar<span>.</span></a>
        <AccountNavigation :view="view" :user="user" :busy="busy" @navigate="navigate" @logout="logout" />
      </aside>
      <header class="mobile-header">
        <button class="icon-button" aria-label="打开导航菜单" aria-controls="mobile-navigation" :aria-expanded="drawerOpen" @click="openDrawer">☰</button>
        <a class="brand" href="/">✳ XDstar<span>.</span></a>
        <button class="avatar" aria-label="打开个人资料" :disabled="busy" @click="navigate('profile')">{{ user.nickname.slice(0, 1) }}</button>
      </header>
      <dialog id="mobile-navigation" ref="navigationDialog" class="navigation-drawer" aria-label="工作台导航菜单" aria-modal="true" @cancel.prevent="closeDrawer" @close="finishDrawerClose" @click="event => { if (event.target === navigationDialog) closeDrawer() }">
        <div class="drawer-heading"><a class="brand" href="/">✳ XDstar<span>.</span></a><button class="icon-button" aria-label="关闭导航菜单" autofocus @click="closeDrawer">×</button></div>
        <AccountNavigation :view="view" :user="user" :busy="busy" @navigate="navigate" @logout="logout" />
      </dialog>
    </template>
    <header v-else class="authentication-header"><a class="brand" href="/">✳ XDstar<span>.</span></a><a :href="projectOrigin" target="_blank" rel="noopener noreferrer">打开 HakiSub ↗</a></header>
    <div class="content-column">
      <main id="main-content" :class="user ? 'workspace-content' : 'authentication-content'" :aria-busy="busy || checking">
        <section :class="user ? 'workspace-page' : 'authentication-card'" aria-labelledby="page-title">
          <div class="page-heading"><p class="eyebrow">{{ user ? '你的工作空间 / ' + (['rooms', 'presets'].includes(view) ? 'HakiSub' : ['profile', 'security'].includes(view) ? '账号' : '工作台') : 'XDSTAR ACCOUNT' }}</p><h1 id="page-title" ref="pageHeading" tabindex="-1">{{ title }}</h1><p v-if="user" class="muted page-description">{{ descriptions[view] }}</p><p v-else-if="view === 'login'" class="muted">登录，继续你的小空间。</p></div>
          <p v-if="checking" role="status">正在读取登录状态…</p><p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" class="success" role="status">{{ message }}</p>
          <ol v-if="view === 'register'" class="registration-progress" aria-label="注册进度"><li :aria-current="registrationStep === 1 ? 'step' : undefined"><span>1</span> 创建账号</li><li :aria-current="registrationStep === 2 ? 'step' : undefined"><span>2</span> 设置密保</li></ol>
          <form v-if="!checking && (view === 'login' || (view === 'register' && registrationStep === 1))" @submit.prevent="view === 'register' ? nextRegistrationStep() : authenticate()"><fieldset :disabled="busy">
          <label for="username">{{ view === 'register' ? '登录账号' : '账号或 UID' }}</label><input id="username" v-model="username" autocomplete="username" minlength="3" maxlength="32" :pattern="view === 'register' ? '[A-Za-z0-9_]{3,32}' : undefined" required><small>{{ view === 'register' ? '3～32 位英文字母、数字或下划线，注册后暂不可修改。' : '输入登录账号或六位数字 UID。' }}</small>
          <template v-if="view === 'register'"><label for="nickname">用户昵称</label><input id="nickname" v-model="nickname" autocomplete="nickname" maxlength="20" required><small>向伙伴展示的名字，可以与登录账号不同，也可以重名。</small></template>
          <label for="password">{{ view === 'register' ? '设置密码' : '密码' }}</label><div class="secret-field"><input id="password" v-model="password" :type="visibleSecrets['password'] ? 'text' : 'password'" :autocomplete="view === 'register' ? 'new-password' : 'current-password'" :minlength="view === 'register' ? 8 : 1" maxlength="128" required><button type="button" :aria-controls="'password'" :aria-pressed="!!visibleSecrets['password']" @click="visibleSecrets['password'] = !visibleSecrets['password']">{{ visibleSecrets['password'] ? '隐藏' : '显示' }}</button></div>
          <template v-if="view === 'register'"><small>8～128 个字符，建议使用密码管理器生成独立密码。</small><label for="confirm-password">确认密码</label><div class="secret-field"><input id="confirm-password" v-model="confirmPassword" :type="visibleSecrets['confirm-password'] ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="128" required><button type="button" :aria-controls="'confirm-password'" :aria-pressed="!!visibleSecrets['confirm-password']" @click="visibleSecrets['confirm-password'] = !visibleSecrets['confirm-password']">{{ visibleSecrets['confirm-password'] ? '隐藏' : '显示' }}</button></div></template>
          <button class="primary" type="submit">{{ busy ? '请稍候…' : view === 'register' ? '下一步 →' : '登录 →' }}</button>
        </fieldset></form>

          <form v-if="!checking && view === 'register' && registrationStep === 2" @submit.prevent="authenticate(true)"><fieldset :disabled="busy"><h2>设置三道密保</h2><QuestionFields :questions="questions" /><div class="button-row registration-actions"><button type="button" class="secondary" @click="previousRegistrationStep">返回上一步</button><button class="primary" type="submit">{{ busy ? '正在注册…' : '完成注册' }}</button></div></fieldset></form>
          <div v-if="!checking && view === 'login'" class="authentication-links"><button class="text-button" :disabled="busy" @click="navigate('register')">注册账号</button><button class="text-button" :disabled="busy" @click="navigate('recovery')">忘记密码？</button></div>
          <p v-if="!checking && view === 'register'" class="authentication-return"><button class="text-button" :disabled="busy" @click="navigate('login')">已有账号？返回登录</button></p>
          <template v-if="!checking && view === 'recovery'"><p class="muted">回答注册时设置的全部三道问题，可重置密码。问题与答案请勿向他人透露。</p>
          <form v-if="!recoveryStarted" @submit.prevent="startRecovery"><fieldset :disabled="busy"><label for="recovery-username">账号或 UID</label><input id="recovery-username" v-model="username" autocomplete="username" maxlength="32" required><button class="primary">继续 →</button></fieldset></form>
          <form v-else @submit.prevent="resetPassword"><fieldset :disabled="busy"><QuestionFields :questions="questions" recovery /><label for="reset-password">新密码</label><div class="secret-field"><input id="reset-password" v-model="password" :type="visibleSecrets['reset-password'] ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="128" required><button type="button" :aria-controls="'reset-password'" :aria-pressed="!!visibleSecrets['reset-password']" @click="visibleSecrets['reset-password'] = !visibleSecrets['reset-password']">{{ visibleSecrets['reset-password'] ? '隐藏' : '显示' }}</button></div><label for="reset-confirm">确认新密码</label><div class="secret-field"><input id="reset-confirm" v-model="confirmPassword" :type="visibleSecrets['reset-confirm'] ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="128" required><button type="button" :aria-controls="'reset-confirm'" :aria-pressed="!!visibleSecrets['reset-confirm']" @click="visibleSecrets['reset-confirm'] = !visibleSecrets['reset-confirm']">{{ visibleSecrets['reset-confirm'] ? '隐藏' : '显示' }}</button></div><button class="primary">重置密码</button><button type="button" class="text-button" @click="restartRecovery()">重新输入账号</button></fieldset></form>
        </template>

          <p v-if="!checking && view === 'recovery'" class="authentication-return"><button class="text-button" :disabled="busy" @click="navigate('login')">← 返回登录</button></p>
          <template v-if="user && view === 'center'">
            <div class="welcome-banner"><div><span class="eyebrow">WELCOME HOME</span><h2>你好，{{ user.nickname }} <span aria-hidden="true">✳</span></h2><p>准备好开始一场新的交流了吗？</p></div><span class="welcome-symbol" aria-hidden="true">✳</span></div>
            <div class="section-heading"><h2>你的项目</h2><span class="muted">工具与新想法，从这里出发</span></div>
            <div class="project-grid"><article class="project-card"><span class="project-icon" aria-hidden="true">H</span><div><h3>HakiSub</h3><p>面对面交流的实时字幕，让每一句话都被看见。</p><small>{{ projects.some(item => item.key === 'hakisub') ? '已关联个人存档' : '支持游客参与' }}</small></div><a class="secondary" :href="projectOrigin" target="_blank" rel="noopener noreferrer">打开项目 ↗</a></article></div>
          </template>
          <OwnedRooms v-if="user && ['center', 'rooms'].includes(view)" :key="user.uid" :uid="user.uid" :project-origin="projectOrigin" :overview="view === 'center'" @open-rooms="navigate('rooms')" @session-expired="expireSession" />
          <template v-if="user && view === 'profile'">
            <section class="settings-card"><h2>账号信息</h2><dl class="profile-details"><div><dt>用户昵称 · 对外显示</dt><dd>{{ user.nickname }}</dd></div><div><dt>登录账号 · 仅本人可见</dt><dd>{{ user.username }}<small>用于登录，注册后暂不可修改。</small></dd></div><div><dt>UID · 唯一身份编号</dt><dd class="uid">{{ user.uid }}<small>六位数字，也可用于登录；与登录账号不同。</small></dd></div><div><dt>注册日期</dt><dd>{{ date(user.createdAt) }}</dd></div></dl></section>

          <form class="settings-card" @submit.prevent="changeNickname"><fieldset :disabled="busy"><h3>用户昵称</h3><label for="new-nickname">新的用户昵称</label><input id="new-nickname" v-model="nickname" maxlength="20" autocomplete="nickname" required><button class="secondary">保存昵称</button></fieldset></form>

          </template>
          <template v-if="user && view === 'security'"><form class="settings-card" @submit.prevent="changePassword"><fieldset :disabled="busy"><h3>修改密码</h3><label for="current-password">当前密码</label><div class="secret-field"><input id="current-password" v-model="currentPassword" :type="visibleSecrets['current-password'] ? 'text' : 'password'" autocomplete="current-password" maxlength="128" required><button type="button" :aria-controls="'current-password'" :aria-pressed="!!visibleSecrets['current-password']" @click="visibleSecrets['current-password'] = !visibleSecrets['current-password']">{{ visibleSecrets['current-password'] ? '隐藏' : '显示' }}</button></div><label for="new-password">新密码</label><div class="secret-field"><input id="new-password" v-model="password" :type="visibleSecrets['new-password'] ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="128" required><button type="button" :aria-controls="'new-password'" :aria-pressed="!!visibleSecrets['new-password']" @click="visibleSecrets['new-password'] = !visibleSecrets['new-password']">{{ visibleSecrets['new-password'] ? '隐藏' : '显示' }}</button></div><label for="new-password-confirm">确认新密码</label><div class="secret-field"><input id="new-password-confirm" v-model="confirmPassword" :type="visibleSecrets['new-password-confirm'] ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="128" required><button type="button" :aria-controls="'new-password-confirm'" :aria-pressed="!!visibleSecrets['new-password-confirm']" @click="visibleSecrets['new-password-confirm'] = !visibleSecrets['new-password-confirm']">{{ visibleSecrets['new-password-confirm'] ? '隐藏' : '显示' }}</button></div><button class="secondary">更新密码</button></fieldset></form>
          <form class="settings-card" @submit.prevent="changeQuestions"><fieldset :disabled="busy"><h3>修改三道密保</h3><label for="security-password">验证当前密码</label><div class="secret-field"><input id="security-password" v-model="securityPassword" :type="visibleSecrets['security-password'] ? 'text' : 'password'" autocomplete="current-password" maxlength="128" required><button type="button" :aria-controls="'security-password'" :aria-pressed="!!visibleSecrets['security-password']" @click="visibleSecrets['security-password'] = !visibleSecrets['security-password']">{{ visibleSecrets['security-password'] ? '隐藏' : '显示' }}</button></div><QuestionFields :questions="questions" /><button class="secondary">替换全部密保</button></fieldset></form>
        </template>
          <template v-if="user && view === 'presets'"><p class="muted">存档仅保存识别来源和布局偏好。加载后仍需选择房间并手动开麦，不包含 API Key 或房主权限。</p><div v-if="!presets.length && !busy && !error" class="empty-state"><span aria-hidden="true">▤</span><h2>还没有房间存档</h2><p>在 HakiSub 的“个人房间存档”中保存当前配置，下次就能从这里继续。</p></div><article v-for="preset in presets" :key="preset.id" class="settings-card preset"><form @submit.prevent="renamePreset(preset)"><label :for="`preset-${preset.id}`">存档名称</label><input :id="`preset-${preset.id}`" v-model="editingNames[preset.id]" maxlength="60" required :disabled="busy"><small>更新于 {{ date(preset.updatedAt) }}</small><div class="button-row"><button class="secondary" :disabled="busy">保存名称</button><a :href="`${projectOrigin}/?preset=${encodeURIComponent(preset.id)}`" target="_blank" rel="noopener noreferrer">在 HakiSub 加载 ↗</a><button type="button" class="danger" @click="deletePreset(preset)" :disabled="busy">删除</button></div></form></article><button class="text-button" @click="loadPresets" :disabled="busy">刷新存档</button></template>
        </section>
      </main>
      <footer><span>XDstar ✳ 小工具与新想法</span><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">鄂ICP备2026059859号-1</a></footer>
    </div>
  </div>
</template>
