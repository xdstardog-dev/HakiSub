<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { SoundPreferences, SoundState } from '../roomInteractions'
import { QUICK_REACTIONS } from '../roomInteractions'
import type { SoundSlot } from '../reactionSound'

const props = defineProps<{ preferences: SoundPreferences; state: SoundState; storageFailed?: boolean }>()
const emit = defineEmits<{ update: [preferences: SoundPreferences]; preview: [slot: SoundSlot]; close: [] }>()
const settingsDialog = ref<HTMLDialogElement | null>(null)
const previewSlot = ref<SoundSlot>('default')
const statusMessage = computed(() => !props.preferences.enabled ? '音效已关闭' : props.preferences.volume === 0 ? '音量为 0，当前静音' : {
  muted: '音效已关闭', idle: '点击试听，启用提示音', loading: '正在加载音效素材…', ready: '音效已就绪',
  blocked: '浏览器暂未允许播放，请点击试听', unavailable: '音效素材暂时无法播放，回应仍会正常显示',
}[props.state])
function changeEnabled(event: Event) { emit('update', { ...props.preferences, enabled: (event.target as HTMLInputElement).checked }) }
function changeVolume(event: Event) { emit('update', { ...props.preferences, volume: Number((event.target as HTMLInputElement).value) }) }
onMounted(() => settingsDialog.value?.showModal())
onUnmounted(() => settingsDialog.value?.close())
</script>

<template>
  <dialog ref="settingsDialog" class="sound-settings" aria-labelledby="sound-settings-title" @cancel.prevent="emit('close')">
    <div class="sound-heading"><h2 id="sound-settings-title">全局音效</h2><button type="button" aria-label="关闭音效设置" @click="emit('close')">关闭</button></div>
    <p class="sound-help">收到任意成员对任意卡片的快捷回应时播放提示音，与你是否开麦无关。</p>
    <label class="sound-toggle"><input type="checkbox" :checked="preferences.enabled" @change="changeEnabled" />启用快捷回应音效</label>
    <label class="volume-label" for="sound-volume">音效音量 <output>{{ preferences.volume }}%</output></label>
    <input id="sound-volume" type="range" min="0" max="100" step="5" :value="preferences.volume" :disabled="!preferences.enabled" @input="changeVolume" />
    <p class="sound-status" role="status">{{ statusMessage }}</p>
    <label class="volume-label" for="sound-preview">试听内容</label>
    <select id="sound-preview" v-model="previewSlot"><option value="default">通用提示音</option><option v-for="option in QUICK_REACTIONS" :key="option.type" :value="option.type">{{ option.emoji }} {{ option.label }}</option></select>
    <p v-if="storageFailed" class="sound-help">设置已在本页应用，但浏览器未能保存，刷新后可能恢复默认。</p>
    <div class="sound-actions"><small>统一控制当前设备，自动保存。</small><button type="button" :disabled="!preferences.enabled || preferences.volume === 0 || state === 'loading'" @click="emit('preview', previewSlot)">试听音效</button></div>
  </dialog>
</template>

<style scoped>
.sound-settings { width: min(380px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); margin: auto; padding: 18px; overflow: auto; border: 1px solid var(--home-border); border-radius: 14px; background: var(--room-card-bg); color: var(--home-text); box-shadow: 0 8px 32px #00000030; }
.sound-settings::backdrop { background: #181a1d80; }
.sound-heading, .sound-actions, .volume-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sound-heading h2 { margin: 0; font-size: 18px; }
.sound-heading button { min-height: 36px; padding: 6px 8px; font-size: 13px; }
.sound-help { margin: 12px 0; color: var(--home-secondary-text); font-size: 12px; line-height: 1.6; }
.sound-toggle { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 14px; }
.sound-toggle input { width: 18px; height: 18px; min-height: 18px; margin: 0; accent-color: var(--home-bg); }
.volume-label { margin: 12px 0 4px; font-size: 14px; }
input[type="range"] { display: block; width: 100%; min-height: 40px; padding: 0; accent-color: var(--home-bg); }
select { width: 100%; min-height: 40px; padding: 6px 8px; border: 1px solid var(--home-border); border-radius: 8px; background: var(--room-card-bg); color: inherit; font: inherit; font-size: 14px; }
.sound-status { margin: 8px 0; font-size: 12px; line-height: 1.6; }
.sound-actions { border-top: 1px solid var(--home-border); padding-top: 12px; margin-top: 14px; }
.sound-actions small { color: var(--home-secondary-text); font-size: 11px; }
.sound-actions button { min-height: 40px; padding: 8px 12px; border-radius: 8px; background: #dedfdb; font-size: 13px; }
</style>
