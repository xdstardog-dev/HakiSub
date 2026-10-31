<script setup lang="ts">
import { computed } from 'vue'
import { ROOM_AVATARS, normalizeRoomAvatar } from '../../accounts/shared/roomAvatars.mjs'
const props = defineProps<{ avatarId?: string }>()
const avatar = computed(() => ROOM_AVATARS.find(avatar => avatar.id === normalizeRoomAvatar(props.avatarId))!)
</script>

<template>
  <svg class="room-avatar-icon" :data-avatar-id="avatar.id" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path v-for="(path, index) in avatar.paths" :key="index" :d="path" /></svg>
</template>
