<script setup lang="ts">
import type { RememberedRoom } from '../rememberedRooms'
import RoomAvatarIcon from './RoomAvatarIcon.vue'
defineProps<{ room?: RememberedRoom; busy: boolean }>()
const emit = defineEmits<{ enter: [room: RememberedRoom]; create: []; join: [] }>()
</script>

<template>
  <button v-if="room" type="button" class="home-room-card" :disabled="busy" :aria-label="`进入${room.roomName ?? `房间 ${room.code}`}，房间号 ${room.code}`" @click="emit('enter', room)">
    <span class="home-room-avatar-space"><span class="home-room-avatar" aria-hidden="true"><RoomAvatarIcon :avatar-id="room.avatarId" /></span></span>
    <span class="home-room-details"><strong>{{ room.roomName ?? `房间 ${room.code}` }}</strong><small>房间号 {{ room.code }}</small></span>
  </button>
  <section v-else class="home-room-card home-function-card" aria-label="创建或加入房间">
    <div class="home-function-actions">
      <button type="button" :disabled="busy" @click="emit('create')">创建房间</button>
      <button type="button" :disabled="busy" @click="emit('join')">加入房间</button>
    </div>
  </section>
</template>
