<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { DEFAULT_REACTION_TYPES, normalizeReactionSelection, QUICK_REACTIONS, REACTION_SELECTION_LIMIT, type ReactionType } from '../roomInteractions'

const props = defineProps<{ selected: ReactionType[] }>()
const emit = defineEmits<{ save: [selected: ReactionType[]]; close: [] }>()
const settingsDialog = ref<HTMLDialogElement | null>(null)
const selection = ref<ReactionType[]>(normalizeReactionSelection(props.selected))
const atLimit = computed(() => selection.value.length >= REACTION_SELECTION_LIMIT)
function toggleReaction(type: ReactionType) {
  if (selection.value.includes(type)) selection.value = selection.value.filter(value => value !== type)
  else if (!atLimit.value && QUICK_REACTIONS.some(option => option.type === type)) selection.value.push(type)
}
function restoreDefaults() { selection.value = [...DEFAULT_REACTION_TYPES] }
function save() {
  if (selection.value.length > 0 && selection.value.length <= REACTION_SELECTION_LIMIT) emit('save', [...selection.value])
}
onMounted(() => settingsDialog.value?.showModal())
onUnmounted(() => settingsDialog.value?.close())
</script>

<template>
  <dialog ref="settingsDialog" class="reaction-settings" aria-label="置顶回应设置" @cancel.prevent="emit('close')">
    <div class="settings-heading"><p class="selection-count" role="status">置顶 {{ selection.length }} / {{ REACTION_SELECTION_LIMIT }}</p><button type="button" aria-label="关闭回应设置" @click="emit('close')">×</button></div>
    <div class="reaction-vocabulary" role="group" aria-label="回应词库">
      <button v-for="option in QUICK_REACTIONS" :key="option.type" type="button" :class="{ 'is-selected': selection.includes(option.type) }" :aria-pressed="selection.includes(option.type)" :aria-label="`${option.label || option.emoji}${selection.includes(option.type) ? `，置顶第${selection.indexOf(option.type) + 1}位` : '，未置顶'}`" :disabled="atLimit && !selection.includes(option.type)" @click="toggleReaction(option.type)">
        <span class="pin-order" aria-hidden="true">{{ selection.includes(option.type) ? selection.indexOf(option.type) + 1 : '' }}</span>
        <span :aria-hidden="option.label ? true : undefined">{{ option.emoji }}</span><span>{{ option.label }}</span>
      </button>
    </div>
    <div class="settings-actions"><button type="button" @click="restoreDefaults">恢复默认</button><div><button type="button" @click="emit('close')">取消</button><button type="button" class="save-selection" :disabled="!selection.length" @click="save">保存</button></div></div>
  </dialog>
</template>

<style scoped>
.reaction-settings { width: min(440px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); margin: auto; padding: 18px; overflow: auto; border: 1px solid var(--home-border); border-radius: 14px; background: var(--room-card-bg); color: var(--home-text); box-shadow: 0 8px 32px #00000030; }
.reaction-settings::backdrop { background: #181a1d80; }
.settings-heading, .settings-actions, .settings-actions > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.settings-heading { margin-bottom: 12px; }
.settings-heading button { width: 44px; min-height: 44px; font-size: 24px; padding: 6px 8px; }
.selection-count { margin: 10px 0; font-size: 13px; font-weight: 600; }
.reaction-vocabulary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.reaction-vocabulary button { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 8px; border: 1px solid var(--home-border); border-radius: 8px; font-size: 14px; text-align: left; }
.reaction-vocabulary button.is-selected { border-color: var(--home-bg); background: #dedfdb; }
.pin-order { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: 1px solid var(--home-border); border-radius: 4px; flex-shrink: 0; font-size: 12px; }
.is-selected .pin-order { background: var(--home-bg); color: var(--room-card-bg); border-color: var(--home-bg); }
.settings-actions { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--home-border); }
.settings-actions button { min-height: 40px; padding: 6px 10px; border-radius: 8px; font-size: 13px; }
.save-selection { background: #dedfdb; }
</style>
