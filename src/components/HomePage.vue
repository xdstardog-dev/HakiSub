<script setup lang="ts">
import { ref } from 'vue'
import type { AccountIdentity } from '../accountClient'
import type { RememberedRoom } from '../rememberedRooms'
import AccountAccess from './AccountAccess.vue'
import RoomCarousel from './RoomCarousel.vue'
import RoomListDialog from './RoomListDialog.vue'
defineProps<{ rooms: RememberedRoom[]; busy: boolean }>()
const emit = defineEmits<{ identity: [user: AccountIdentity | null]; enter: [room: RememberedRoom]; create: []; join: [] }>()
const listOpen = ref(false)
function selectRoom(room: RememberedRoom) { listOpen.value = false; emit('enter', room) }
</script>

<template>
  <header class="home-header home-container">
    <a href="/" class="home-brand" aria-label="哈基字幕 HakiSub 首页"><span class="home-logo" aria-hidden="true"><img src="/hakisub-logo.svg" alt="" width="56" height="56" /></span><span><b>哈基字幕</b><small>HakiSub</small></span></a>
    <nav aria-label="首页导航"><AccountAccess @identity="emit('identity', $event)" /></nav>
  </header>
  <main class="home-content home-container">
    <div class="home-room-heading">
      <h1>我的房间</h1>
      <button class="home-list-button" type="button" aria-label="房间列表" :aria-expanded="listOpen" aria-haspopup="dialog" @click="listOpen = true"><span aria-hidden="true">☷</span></button>
    </div>
    <RoomCarousel :rooms="rooms" :busy="busy" @enter="emit('enter', $event)" @create="emit('create')" @join="emit('join')" />
    <slot />
  </main>
  <RoomListDialog v-if="listOpen" :rooms="rooms" :busy="busy" @close="listOpen = false" @enter="selectRoom" />
</template>
