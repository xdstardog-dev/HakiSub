<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
let composing = false
const digitsOnly = (value: string) => value.replace(/[^0-9]/g, '')

function updateValue(event: Event) {
  if (composing || (event as InputEvent).isComposing) return
  const input = event.target as HTMLInputElement
  const value = digitsOnly(input.value).slice(0, 4)
  // 过滤后按光标前的有效数字数恢复位置，避免中途编辑时跳到末尾。
  if (input.value !== value) {
    const position = digitsOnly(input.value.slice(0, input.selectionStart ?? input.value.length)).length
    input.value = value
    input.setSelectionRange(Math.min(position, 4), Math.min(position, 4))
  }
  emit('update:modelValue', value)
}

function finishComposition(event: CompositionEvent) {
  composing = false
  updateValue(event)
}

function pasteDigits(event: ClipboardEvent) {
  if (!event.clipboardData) return
  event.preventDefault()
  const input = event.target as HTMLInputElement
  const digits = digitsOnly(event.clipboardData.getData('text'))
  if (!digits) return
  const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start
  // 先过滤再限制长度，避免原生 maxlength 把带空格的粘贴内容提前截断。
  input.setRangeText(digits.slice(0, Math.max(0, 4 - input.value.length + end - start)), start, end, 'end')
  updateValue(event)
}
</script>

<template>
  <div class="pin-code-input">
    <input v-bind="$attrs" class="pin-code-native" :value="props.modelValue" :disabled="disabled" type="text" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" autocapitalize="off" :spellcheck="false" enterkeyhint="done" required @input="updateValue" @paste="pasteDigits" @compositionstart="composing = true" @compositionend="finishComposition" />
    <span v-for="position in 4" :key="position" class="pin-code-character" :class="{ 'is-empty': !modelValue[position - 1] }" aria-hidden="true">{{ modelValue[position - 1] || '●' }}</span>
  </div>
</template>

<style scoped>
.pin-code-input { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; width: 224px; max-width: 100%; height: 56px; margin-inline: auto; color: var(--home-text, inherit); font-size: 28px; font-variant-numeric: tabular-nums; line-height: 1; }
.pin-code-character { display: grid; place-items: center; pointer-events: none; }
.pin-code-character.is-empty { color: var(--home-secondary-text, #62666a); font-size: 12px; opacity: .65; }
.pin-code-input:focus-within .is-empty { opacity: 1; }
/* 原生输入覆盖整排字符，点击直接命中 input；不转移焦点或接管系统键盘。 */
.pin-code-input > input.pin-code-native, .pin-code-input > input.pin-code-native:is(:focus, :focus-visible) { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; outline: none; box-shadow: none; background: transparent; color: transparent; caret-color: transparent; font: inherit; cursor: text; }
.pin-code-native::selection { background: transparent; color: transparent; }
</style>
