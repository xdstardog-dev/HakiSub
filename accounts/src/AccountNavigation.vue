<script setup>
defineProps({ view: String, user: Object, busy: Boolean })
defineEmits(['navigate', 'logout'])
const groups = [
  { title: '工作台', items: [{ id: 'center', label: '总览', icon: '◫' }] },
  { title: 'HakiSub', items: [{ id: 'rooms', label: '我的房间', icon: '▦' }, { id: 'presets', label: '房间存档', icon: '▤' }] },
  { title: '账号', items: [{ id: 'profile', label: '个人资料', icon: '◉' }, { id: 'security', label: '安全设置', icon: '◇' }] },
]
</script>
<template>
  <nav class="workspace-navigation" aria-label="工作台导航">
    <div v-for="group in groups" :key="group.title" class="navigation-group">
      <p class="navigation-label">{{ group.title }}</p>
      <button v-for="item in group.items" :key="item.id" :aria-current="view === item.id ? 'page' : undefined" :disabled="busy" @click="$emit('navigate', item.id)"><span aria-hidden="true">{{ item.icon }}</span>{{ item.label }}</button>
    </div>
  </nav>
  <div class="sidebar-user">
    <span class="avatar" aria-hidden="true">{{ user.nickname.slice(0, 1) }}</span>
    <div><strong>{{ user.nickname }}</strong><small>UID {{ user.uid }}</small></div>
    <button class="text-button logout-button" :disabled="busy" @click="$emit('logout')">退出登录</button>
  </div>
</template>
