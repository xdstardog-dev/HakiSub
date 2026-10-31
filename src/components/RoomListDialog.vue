<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RememberedRoom } from '../rememberedRooms'
import HomeDialog from './HomeDialog.vue'
import RoomAvatarIcon from './RoomAvatarIcon.vue'
const props = defineProps<{ rooms: RememberedRoom[]; busy: boolean }>()
const emit = defineEmits<{ close: []; enter: [room: RememberedRoom] }>()
const search = ref('')
const filteredRooms = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return props.rooms.filter(room => (room.roomName ?? `房间 ${room.code}`).toLocaleLowerCase().includes(query) || room.code.includes(query))
})
</script>

<template>
  <HomeDialog title="房间列表" title-id="home-room-list-title" @close="emit('close')">
    <div class="home-list-search">
      <div class="home-search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input id="home-room-search" v-model="search" type="search" aria-label="搜索房间名称或房间号" placeholder="搜索房间名称或房间号" autocomplete="off" autofocus />
      </div>
    </div>
    <div class="home-room-list">
      <button v-for="room in filteredRooms" :key="room.code" type="button" :disabled="busy" @click="emit('enter', room)">
        <span class="home-list-avatar" aria-hidden="true"><RoomAvatarIcon :avatar-id="room.avatarId" /></span>
        <span class="home-list-details"><strong>{{ room.roomName ?? `房间 ${room.code}` }}</strong><small>房间号 {{ room.code }}</small></span>
      </button>
      <p v-if="!filteredRooms.length" class="home-list-empty" role="status">{{ rooms.length ? '没有匹配的房间' : '还没有房间，可从首页卡片创建或加入。' }}</p>
    </div>
  </HomeDialog>
</template>
