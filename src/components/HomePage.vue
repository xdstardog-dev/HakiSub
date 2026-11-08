<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import type { AccountIdentity } from '../accountClient'
import type { RememberedRoom } from '../rememberedRooms'
import AccountAccess from './AccountAccess.vue'
import RoomCarousel from './RoomCarousel.vue'
import RoomListDialog from './RoomListDialog.vue'
defineProps<{ rooms: RememberedRoom[]; busy: boolean }>()
const emit = defineEmits<{ identity: [user: AccountIdentity | null]; enter: [room: RememberedRoom]; create: []; join: [] }>()
const listOpen = ref(false)
function selectRoom(room: RememberedRoom) { listOpen.value = false; emit('enter', room) }

const brandCats = Object.entries(import.meta.glob<string>('../assets/home-cats/*.svg', {
  query: '?raw', import: 'default',
})).sort(([first], [second]) => first.localeCompare(second, 'en', { numeric: true }))
type BrandCat = {
  id: number; asset: string; body: string; sparks?: string
  left: number; top: number; size: number; travel: number; hopHeight: number
  hissLeft: number; hissTop: number; hissSize: number
}
const maximumActiveCats = 4
const activeCats = shallowRef<BrandCat[]>([])
const brandArtworkCache = new Map<string, ReturnType<typeof loadBrandArtwork>>()
const brandMark = ref<HTMLElement | null>(null)
const brandMotions: Keyframe[][] = [
  [
    { transform: 'none' },
    { transform: 'translateX(-1.5px) scale(.88)', offset: .16 },
    { transform: 'translateX(1.5px) scale(1.08)', offset: .31 },
    { transform: 'translateX(-.9px) scale(.98)', offset: .47 },
    { transform: 'translateX(.5px)', offset: .63 },
    { transform: 'none' },
  ],
  [
    { transform: 'none' },
    { transform: 'translateX(-3px) translateY(-6px) rotate(-3deg)', offset: .17 },
    { transform: 'translateX(3px) translateY(-4px) rotate(3deg)', offset: .32 },
    { transform: 'translateX(-2px) translateY(1px) rotate(-2deg)', offset: .48 },
    { transform: 'translateX(1px) translateY(-1px) rotate(1deg)', offset: .64 },
    { transform: 'none' },
  ],
  [
    { transform: 'none', opacity: 1, filter: 'brightness(1)' },
    { transform: 'translateX(-1.5px)', opacity: .65, filter: 'brightness(.8)', offset: .16 },
    { transform: 'translateX(1.5px)', opacity: 1, filter: 'brightness(1.17)', offset: .31 },
    { transform: 'translateX(-.9px)', opacity: .83, filter: 'brightness(.94)', offset: .47 },
    { transform: 'translateX(.5px)', opacity: 1, filter: 'brightness(1)', offset: .63 },
    { transform: 'none', opacity: 1, filter: 'brightness(1)' },
  ],
  [
    { transform: 'none' },
    { transform: 'translateX(-3px) translateY(5px) rotate(-3deg)', offset: .17 },
    { transform: 'translateX(3px) translateY(7px) rotate(3deg)', offset: .32 },
    { transform: 'translateX(-2px) translateY(4px) rotate(-2deg)', offset: .48 },
    { transform: 'translateX(1px) translateY(2px) rotate(1deg)', offset: .64 },
    { transform: 'none' },
  ],
  [
    { transform: 'none' },
    { transform: 'translateX(-1.5px)', offset: .15 },
    { transform: 'translateX(1.5px)', offset: .28 },
    { transform: 'translateX(-1px)', offset: .41 },
    { transform: 'translateX(.65px)', offset: .54 },
    { transform: 'translateX(-.3px)', offset: .68 },
    { transform: 'none' },
  ],
]
let brandAnimation: Animation | undefined
let lastCat = -1
let brandClick = 0
let loadingCat = false
let disposed = false

function activateBrand(event: MouseEvent) {
  // 素材未就绪或 Logo 还在播放时丢弃连点，避免异步加载排队。
  const feedbackState = brandAnimation?.playState
  if (loadingCat || feedbackState === 'running' || feedbackState === 'paused'
    || activeCats.value.length >= maximumActiveCats) return
  void summonBrandCat(event)
  if (!brandMark.value?.animate) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const frames = reducedMotion ? [{ opacity: 1 }, { opacity: .8 }, { opacity: 1 }]
    : brandMotions[Math.floor(Math.random() * brandMotions.length)]
  brandAnimation = brandMark.value.animate(frames, { duration: reducedMotion ? 180 : 260, easing: 'ease-out' })
}

async function summonBrandCat(event: MouseEvent) {
  if (!brandCats.length) return
  const id = ++brandClick

  // 除第一只之外，从其余编号中随机抽取，避免连续点出同一只。
  const skipLast = lastCat >= 0 && brandCats.length > 1
  const choice = Math.floor(Math.random() * (brandCats.length - Number(skipLast)))
  lastCat = skipLast && choice >= lastCat ? choice + 1 : choice
  const [asset, loadCat] = brandCats[lastCat]
  const button = (event.currentTarget as HTMLButtonElement).getBoundingClientRect()
  const x = event.detail ? event.clientX : button.right
  const y = event.detail ? event.clientY : button.top + button.height / 2

  let artwork: Awaited<ReturnType<typeof loadBrandArtwork>>
  loadingCat = true
  try {
    let pendingArtwork = brandArtworkCache.get(asset)
    if (!pendingArtwork) {
      pendingArtwork = loadBrandArtwork(loadCat)
      brandArtworkCache.set(asset, pendingArtwork)
    }
    artwork = await pendingArtwork
  } catch {
    brandArtworkCache.delete(asset)
    return
  } finally {
    loadingCat = false
  }
  if (disposed) return

  const { innerWidth, innerHeight } = window
  const size = Math.min(160, Math.floor(Math.min(innerWidth, innerHeight) * .34))
  const left = Math.max(12, Math.min(innerWidth - size - 12, x + 20))
  const floor = Math.min(innerHeight - 16, Math.max(button.bottom + size * .95, y + size))
  const top = Math.max(8, floor - size * .95)
  // 窄屏从右边缘入场；宽屏最多走约两只半猫身，横移和跳高同向收缩。
  const edgeTravel = Math.max(0, innerWidth - left - size * .18)
  const travel = innerWidth < 768 ? edgeTravel : Math.min(size * 2.35, edgeTravel)
  const hopHeight = Math.max(0, Math.min(travel * .38, size * .75, top + size * .12 - 6))
  const hissSize = Math.round(size * (.14 + Math.random() * .08))
  activeCats.value = [...activeCats.value, {
    id, asset: asset.slice(asset.lastIndexOf('/') + 1), ...artwork, left, top, size, travel, hopHeight,
    hissLeft: Math.max(8 - left + hissSize * 2.65, size * (.1 + Math.random() * .17)),
    hissTop: 28 + Math.random() * 12,
    hissSize,
  }]
}

function removeBrandCat(id: number) {
  activeCats.value = activeCats.value.filter(cat => cat.id !== id)
}

async function loadBrandArtwork(loadCat: () => Promise<string>) {
  const svg = new DOMParser().parseFromString(await loadCat(), 'image/svg+xml').documentElement
  if (svg.localName !== 'svg') throw new Error('无效的猫咪 SVG')
  const serializer = new XMLSerializer()
  const asImage = (layer: Element) => 'data:image/svg+xml,' + encodeURIComponent(serializer.serializeToString(layer))
  const marks = svg.querySelector('#shout-marks') ?? svg.querySelector('#sparks')
  let sparks: string | undefined
  if (marks) {
    // 保留同一 viewBox，让哈气符号层能准确盖在猫身上。
    const overlay = svg.cloneNode(false) as Element
    for (const child of svg.children) {
      if (child.localName === 'defs' || child.localName === 'style') overlay.append(child.cloneNode(true))
    }
    overlay.append(marks)
    sparks = asImage(overlay)
  }
  const body = asImage(svg)
  // 解码后才起跳，冷缓存也不会在动画中途才显示图。
  await Promise.all((sparks ? [body, sparks] : [body]).map(url => {
    const image = new Image()
    image.src = url
    return image.decode()
  }))
  return { body, sparks }
}

onBeforeUnmount(() => {
  disposed = true
  brandAnimation?.cancel()
})
</script>

<template>
  <div class="home-background-texture" aria-hidden="true"></div>
  <header class="home-header home-container">
    <button type="button" class="home-brand" aria-label="哈基字幕 HakiSub，召唤猫咪" @click="activateBrand">
      <span ref="brandMark" class="home-brand-mark">
        <span class="home-logo" aria-hidden="true"><img src="/hakisub-logo.svg" alt="" width="56" height="56" /></span>
        <span><b>哈基字幕</b><small>HakiSub</small></span>
      </span>
    </button>
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
  <div v-if="activeCats.length" class="home-brand-cat-layer" aria-hidden="true">
    <div v-for="brandCat in activeCats" :key="brandCat.id" class="home-brand-cat" :data-asset="brandCat.asset"
      :style="{ left: brandCat.left + 'px', top: brandCat.top + 'px', width: brandCat.size + 'px', height: brandCat.size + 'px',
        '--brand-cat-travel': brandCat.travel + 'px', '--brand-cat-hop-height': brandCat.hopHeight + 'px' }"
      @animationend.self="removeBrandCat(brandCat.id)">
      <div class="home-brand-cat-motion">
        <img class="home-brand-cat-art" :src="brandCat.body" alt="" draggable="false" />
        <img v-if="brandCat.sparks" class="home-brand-cat-sparks" :src="brandCat.sparks" alt="" draggable="false" />
        <span class="home-brand-cat-hiss" :style="{ left: brandCat.hissLeft + 'px', top: brandCat.hissTop + '%', fontSize: brandCat.hissSize + 'px' }">哈！</span>
      </div>
    </div>
  </div>
  <RoomListDialog v-if="listOpen" :rooms="rooms" :busy="busy" @close="listOpen = false" @enter="selectRoom" />
</template>
