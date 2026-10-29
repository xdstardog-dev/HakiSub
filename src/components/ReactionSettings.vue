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
  <dialog ref="settingsDialog" class="reaction-settings" aria-labelledby="reaction-settings-title" @cancel.prevent="emit('close')">
    <div class="settings-heading"><h2 id="reaction-settings-title">你需要哪五个词汇？</h2><button type="button" aria-label="关闭回应设置" @click="emit('close')">关闭</button></div>
    <p class="settings-help">从词库中选择 1～5 个，作为你自己的快捷回应。</p>
    <p class="selection-count" role="status">已选 {{ selection.length }} / {{ REACTION_SELECTION_LIMIT }}<small v-if="atLimit"> · 先取消一个再替换</small></p>
    <div class="reaction-vocabulary" role="group" aria-label="回应词库">
      <label v-for="option in QUICK_REACTIONS" :key="option.type" :class="{ 'is-selected': selection.includes(option.type), 'is-disabled': atLimit && !selection.includes(option.type) }">
        <input type="checkbox" :value="option.type" :checked="selection.includes(option.type)" :disabled="atLimit && !selection.includes(option.type)" @change="toggleReaction(option.type)" />
        <span aria-hidden="true">{{ option.emoji }}</span><span>{{ option.label }}</span>
      </label>
    </div>
    <p class="settings-help">只影响你的菜单，保存在当前浏览器。</p>
    <div class="settings-actions"><button type="button" @click="restoreDefaults">恢复默认</button><div><button type="button" @click="emit('close')">取消</button><button type="button" class="save-selection" :disabled="!selection.length" @click="save">保存</button></div></div>
  </dialog>
</template>

<style scoped>
.reaction-settings { width: min(440px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); margin: auto; padding: 18px; overflow: auto; border: 1px solid #bacbb7; border-radius: 14px; background: #fff; color: #243b34; box-shadow: 0 8px 32px #18342130; }
.reaction-settings::backdrop { background: #17271e55; }
.settings-heading, .settings-actions, .settings-actions > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.settings-heading h2 { margin: 0; font-size: 18px; }
.settings-heading button { min-height: 36px; font-size: 13px; padding: 6px 8px; }
.settings-help { margin: 10px 0; color: #666; font-size: 12px; line-height: 1.6; }
.selection-count { margin: 10px 0; font-size: 13px; font-weight: 600; }
.selection-count small { color: #666; font-size: 11px; font-weight: 400; }
.reaction-vocabulary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.reaction-vocabulary label { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 8px; border: 1px solid #d6dfd1; border-radius: 8px; font-size: 14px; cursor: pointer; }
.reaction-vocabulary label.is-selected { border-color: #70956b; background: #f0f6ec; }
.reaction-vocabulary label.is-disabled { opacity: .5; cursor: default; }
.reaction-vocabulary input { width: 16px; height: 16px; min-height: 16px; margin: 0; accent-color: #52744d; flex-shrink: 0; }
.settings-actions { margin-top: 14px; padding-top: 12px; border-top: 1px solid #e0e6db; }
.settings-actions button { min-height: 40px; padding: 6px 10px; border-radius: 8px; font-size: 13px; }
.save-selection { background: #e8f0e3; }
</style>
