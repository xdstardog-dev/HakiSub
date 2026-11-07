<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ id: string; label: string; volume: number; muted: boolean; disabled: boolean }>()
const emit = defineEmits<{ volume: [value: number]; toggle: [] }>()
const displayedVolume = computed(() => `${props.muted ? 0 : props.volume}%`)
</script>

<template>
  <div class="sound-volume-control" :class="{ 'is-muted': muted }">
    <label :for="id">{{ label }} <output>{{ displayedVolume }}</output></label>
    <div class="volume-row">
      <button
        type="button"
        class="sound-toggle"
        :aria-label="`${muted ? '恢复' : '静音'}${label}`"
        :aria-pressed="muted"
        :title="muted ? '恢复音量' : '静音'"
        @click="emit('toggle')"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path fill="currentColor" d="M11 4.4a.75.75 0 0 1 1.2.6v14a.75.75 0 0 1-1.2.6L6 16H3.5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1H6Z" />
          <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
            <path v-if="muted" d="m16 9 5 6m0-6-5 6" />
            <path v-else d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
          </g>
        </svg>
      </button>
      <div class="volume-slider" :style="{ '--volume-position': displayedVolume }">
        <div class="volume-track" aria-hidden="true">
          <div class="volume-travel">
            <span v-if="!muted" class="volume-fill"></span>
            <svg class="volume-cat" viewBox="0 0 30 28">
              <path fill="currentColor" d="M10 8h10a10 10 0 0 1 0 20H10a10 10 0 0 1 0-20Z" />
              <!-- 通用猫头的耳朵和额头按原比例缩放，底边叠在圆脸内。 -->
              <path fill="currentColor" transform="translate(-2.6 -2.725) scale(.275)"
                d="M19 59C15 47 17 27 24 23C29 19 43 29 53 40C60 38.5 68 38.5 75 40C85 29 99 19 104 23C111 27 113 47 109 59Z" />
              <path v-if="muted" d="M5.3 18h6.4m6.6 0h6.4" fill="none" stroke="var(--room-card-bg)" stroke-width="1.8" stroke-linecap="round" />
              <g v-else fill="none" stroke="var(--room-card-bg)" stroke-width="1.2">
                <circle cx="8.5" cy="18" r="3.5" />
                <circle cx="21.5" cy="18" r="3.5" />
              </g>
            </svg>
          </div>
        </div>
        <input :id="id" type="range" min="0" max="100" :value="volume" :aria-valuetext="displayedVolume" :disabled="disabled" @input="emit('volume', Number(($event.target as HTMLInputElement).value))" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sound-volume-control { --volume-color: var(--home-bg); }
.sound-volume-control.is-muted { --volume-color: #92989e; }
.sound-volume-control label { display: flex; justify-content: space-between; gap: 8px; margin: 12px 0 6px; font-size: 14px; }
.sound-volume-control.is-muted label { color: var(--volume-color); }
.sound-volume-control:has(input:focus-visible) label { text-decoration: underline; text-underline-offset: 3px; }
.volume-row { display: flex; align-items: center; gap: 8px; }
.sound-toggle {
  display: grid; place-items: center; flex: 0 0 40px; min-height: 44px;
  padding: 0; border-radius: 9px; background: transparent; color: var(--volume-color);
}
.volume-slider {
  --head-width: 27.9px;
  /* 填充条的高度等于脸颊直径，直边与圆弧相切。 */
  --fill-height: calc(var(--head-width) * 20 / 30);
  position: relative; flex: 1; min-width: 0; color: var(--volume-color);
}
.volume-track { position: absolute; inset: 0; pointer-events: none; }
.volume-track::before {
  content: ''; position: absolute; inset-inline: 0; top: 50%; translate: 0 -50%;
  box-sizing: border-box; height: calc(var(--fill-height) * .8);
  border: 1px solid var(--home-border); border-radius: 999px;
}
/* 滑杆两端各留半个猫头，绘制位置与原生滑块的中心一致。 */
.volume-travel { position: absolute; inset: 0 calc(var(--head-width) / 2); }
.volume-fill, .volume-cat { position: absolute; bottom: calc(50% - var(--fill-height) / 2); }
.volume-fill {
  left: calc(var(--head-width) / -2);
  right: calc(100% - var(--volume-position) - var(--head-width) / 6);
  height: var(--fill-height); border-radius: 999px 0 0 999px; background: currentColor;
}
.volume-cat { left: var(--volume-position); translate: -50% 0; width: var(--head-width); }
input[type='range'] {
  appearance: none; position: relative; display: block; width: 100%; height: 44px;
  margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent; cursor: pointer;
}
input[type='range']::-webkit-slider-thumb { appearance: none; width: var(--head-width); height: 44px; background: transparent; }
input[type='range']::-moz-range-thumb { width: var(--head-width); height: 44px; border: 0; background: transparent; }
input[type='range']:focus { outline: none; box-shadow: none; }
.sound-toggle:focus-visible { outline: 2px solid var(--home-secondary-text); outline-offset: 2px; }
input[type='range']:disabled { cursor: not-allowed; }
</style>
