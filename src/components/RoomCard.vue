<script setup lang="ts">
import type { RememberedRoom } from '../rememberedRooms'
import RoomAvatarIcon from './RoomAvatarIcon.vue'
defineProps<{ room?: RememberedRoom; busy: boolean }>()
const emit = defineEmits<{ enter: [room: RememberedRoom]; create: []; join: [] }>()
const roomActions = [
  { event: 'create', cat: 'black-cat', label: '创建房间' },
  { event: 'join', cat: 'white-cat', label: '加入房间' },
] as const
</script>

<template>
  <button v-if="room" type="button" class="home-room-card" :disabled="busy" :aria-label="`进入${room.roomName ?? `房间 ${room.code}`}，房间号 ${room.code}`" @click="emit('enter', room)">
    <span class="home-room-avatar-space"><span class="home-room-avatar" aria-hidden="true"><RoomAvatarIcon :avatar-id="room.avatarId" /></span></span>
    <span class="home-room-details"><strong>{{ room.roomName ?? `房间 ${room.code}` }}</strong><small>房间号 {{ room.code }}</small></span>
  </button>
  <section v-else class="home-room-card home-function-card" aria-label="创建或加入房间">
    <button
      v-for="{ event, cat, label } in roomActions"
      :key="event"
      type="button"
      class="home-cat-button"
      :class="`home-cat-button--${event}`"
      :disabled="busy"
      @click="event === 'create' ? emit('create') : emit('join')"
    >
      <img class="home-cat-shadow" :src="`/room-entry/${cat}-shadow.svg`" alt="" />
      <span class="home-cat-face">
        <img :src="`/room-entry/${cat}.svg`" alt="" />
        <span class="home-cat-label">{{ label }}</span>
        <img class="home-cat-surprise" src="/room-entry/cat-surprise.svg" alt="" />
      </span>
    </button>
  </section>
</template>
