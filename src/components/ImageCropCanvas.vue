<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  applyAspectRatio,
  clampCropRect,
  computeContainRect,
  defaultCropRect,
  displayToNatural,
  naturalToDisplay,
  type CropRect
} from '@shared/cropUiLogic'

const props = withDefaults(
  defineProps<{
    src: string
    naturalWidth: number
    naturalHeight: number
    modelValue: CropRect
    aspectRatio?: number | null
    disabled?: boolean
  }>(),
  {
    aspectRatio: null,
    disabled: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [v: CropRect]
}>()

const containerRef = ref<HTMLElement | null>(null)
const containerW = ref(0)
const containerH = ref(0)

type DragMode =
  | 'move'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | null

const dragMode = ref<DragMode>(null)
const dragStartClient = ref({ x: 0, y: 0 })
const dragStartRect = ref<CropRect>({ x: 0, y: 0, w: 1, h: 1 })

const contain = computed(() =>
  computeContainRect(
    containerW.value,
    containerH.value,
    props.naturalWidth,
    props.naturalHeight
  )
)

const displayRect = computed(() => {
  const c = contain.value
  if (!(c.width > 0 && c.height > 0)) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  const tl = naturalToDisplay(
    props.modelValue.x,
    props.modelValue.y,
    c.width,
    c.height,
    props.naturalWidth,
    props.naturalHeight
  )
  const br = naturalToDisplay(
    props.modelValue.x + props.modelValue.w,
    props.modelValue.y + props.modelValue.h,
    c.width,
    c.height,
    props.naturalWidth,
    props.naturalHeight
  )
  return {
    left: c.left + tl.x,
    top: c.top + tl.y,
    width: Math.max(1, br.x - tl.x),
    height: Math.max(1, br.y - tl.y)
  }
})

function measure(): void {
  const el = containerRef.value
  if (!el) return
  containerW.value = el.clientWidth
  containerH.value = el.clientHeight
}

let ro: ResizeObserver | null = null

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
    ro = new ResizeObserver(() => measure())
    ro.observe(containerRef.value)
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  ensureDefaultRect()
})

onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
})

watch(
  () => [props.naturalWidth, props.naturalHeight, props.src] as const,
  () => {
    measure()
    ensureDefaultRect()
  }
)

function ensureDefaultRect(): void {
  const nw = props.naturalWidth
  const nh = props.naturalHeight
  if (!(nw > 0 && nh > 0)) return
  const v = props.modelValue
  if (!(v.w > 0 && v.h > 0)) {
    let next = defaultCropRect(nw, nh)
    if (props.aspectRatio != null && props.aspectRatio > 0) {
      next = applyAspectRatio(next, props.aspectRatio, nw, nh)
    }
    emit('update:modelValue', next)
  } else {
    emit('update:modelValue', clampCropRect(v, nw, nh))
  }
}

watch(
  () => props.aspectRatio,
  (ar) => {
    if (ar == null || !(ar > 0)) return
    const nw = props.naturalWidth
    const nh = props.naturalHeight
    if (!(nw > 0 && nh > 0)) return
    const next = applyAspectRatio(props.modelValue, ar, nw, nh)
    emit('update:modelValue', next)
  }
)

function clientToNatural(clientX: number, clientY: number): { x: number; y: number } {
  const el = containerRef.value
  const c = contain.value
  if (!el || !(c.width > 0)) return { x: 0, y: 0 }
  const box = el.getBoundingClientRect()
  const dx = clientX - box.left - c.left
  const dy = clientY - box.top - c.top
  return displayToNatural(
    dx,
    dy,
    c.width,
    c.height,
    props.naturalWidth,
    props.naturalHeight
  )
}

function startDrag(mode: DragMode, e: PointerEvent): void {
  if (props.disabled || !mode) return
  e.preventDefault()
  e.stopPropagation()
  dragMode.value = mode
  dragStartClient.value = { x: e.clientX, y: e.clientY }
  dragStartRect.value = { ...props.modelValue }
}

function onPointerMove(e: PointerEvent): void {
  const mode = dragMode.value
  if (!mode || props.disabled) return
  const nw = props.naturalWidth
  const nh = props.naturalHeight
  if (!(nw > 0 && nh > 0)) return

  const start = dragStartRect.value
  const p0 = clientToNatural(dragStartClient.value.x, dragStartClient.value.y)
  const p1 = clientToNatural(e.clientX, e.clientY)
  const ddx = p1.x - p0.x
  const ddy = p1.y - p0.y

  let x = start.x
  let y = start.y
  let w = start.w
  let h = start.h
  const ar = props.aspectRatio

  if (mode === 'move') {
    x = start.x + ddx
    y = start.y + ddy
  } else {
    // 边缘/角缩放
    if (mode.includes('e')) w = start.w + ddx
    if (mode.includes('s')) h = start.h + ddy
    if (mode.includes('w')) {
      x = start.x + ddx
      w = start.w - ddx
    }
    if (mode.includes('n')) {
      y = start.y + ddy
      h = start.h - ddy
    }

    if (ar != null && ar > 0) {
      // 以对角/主方向保持比例
      if (mode === 'e' || mode === 'w') {
        h = Math.round(w / ar)
        if (mode === 'w') {
          // 右边缘固定
          const right = start.x + start.w
          x = right - w
        }
        y = start.y + (start.h - h) / 2
      } else if (mode === 'n' || mode === 's') {
        w = Math.round(h * ar)
        if (mode === 'n') {
          const bottom = start.y + start.h
          y = bottom - h
        }
        x = start.x + (start.w - w) / 2
      } else {
        // 角：以 w 为主，再调 h
        if (Math.abs(ddx) * ar >= Math.abs(ddy)) {
          h = Math.round(w / ar)
        } else {
          w = Math.round(h * ar)
        }
        if (mode.includes('w')) {
          const right = start.x + start.w
          x = right - w
        }
        if (mode.includes('n')) {
          const bottom = start.y + start.h
          y = bottom - h
        }
      }
    }
  }

  if (w < 1) {
    if (mode.includes('w')) x = start.x + start.w - 1
    w = 1
  }
  if (h < 1) {
    if (mode.includes('n')) y = start.y + start.h - 1
    h = 1
  }

  emit('update:modelValue', clampCropRect({ x, y, w, h }, nw, nh))
}

function onPointerUp(): void {
  dragMode.value = null
}

const boxStyle = computed(() => {
  const r = displayRect.value
  return {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`
  }
})

const imgStyle = computed(() => {
  const c = contain.value
  return {
    left: `${c.left}px`,
    top: `${c.top}px`,
    width: `${c.width}px`,
    height: `${c.height}px`
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="crop-canvas"
    :class="{ disabled }"
  >
    <img
      v-if="src"
      class="crop-img"
      :src="src"
      :style="imgStyle"
      alt="裁切预览"
      draggable="false"
      @dragstart.prevent
    />
    <div
      v-if="src && displayRect.width > 0"
      class="crop-box"
      :style="boxStyle"
      @pointerdown="startDrag('move', $event)"
    >
      <span class="crop-handle n" @pointerdown="startDrag('n', $event)" />
      <span class="crop-handle s" @pointerdown="startDrag('s', $event)" />
      <span class="crop-handle e" @pointerdown="startDrag('e', $event)" />
      <span class="crop-handle w" @pointerdown="startDrag('w', $event)" />
      <span class="crop-handle nw" @pointerdown="startDrag('nw', $event)" />
      <span class="crop-handle ne" @pointerdown="startDrag('ne', $event)" />
      <span class="crop-handle sw" @pointerdown="startDrag('sw', $event)" />
      <span class="crop-handle se" @pointerdown="startDrag('se', $event)" />
    </div>
  </div>
</template>

<style scoped>
.crop-canvas {
  position: relative;
  width: 100%;
  height: 420px;
  max-height: min(420px, 55vh);
  overflow: hidden;
  border-radius: var(--radius-xs, 4px);
  background: color-mix(in srgb, var(--app-fg, #333) 8%, transparent);
  user-select: none;
  touch-action: none;
}

.crop-canvas.disabled {
  pointer-events: none;
  opacity: 0.65;
}

.crop-img {
  position: absolute;
  display: block;
  max-width: none;
  pointer-events: none;
  object-fit: fill;
}

.crop-box {
  position: absolute;
  box-sizing: border-box;
  border: 1.5px solid var(--primary, #409eff);
  background: transparent;
  cursor: move;
  /* 半透明遮罩：选区外变暗 */
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.35),
    0 0 0 9999px rgba(0, 0, 0, 0.45);
}

.crop-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 1.5px solid var(--primary, #409eff);
  border-radius: 1px;
  box-sizing: border-box;
  z-index: 2;
}

.crop-handle.n {
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
  cursor: n-resize;
}

.crop-handle.s {
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  cursor: s-resize;
}

.crop-handle.e {
  right: -5px;
  top: 50%;
  transform: translateY(-50%);
  cursor: e-resize;
}

.crop-handle.w {
  left: -5px;
  top: 50%;
  transform: translateY(-50%);
  cursor: w-resize;
}

.crop-handle.nw {
  left: -5px;
  top: -5px;
  cursor: nw-resize;
}

.crop-handle.ne {
  right: -5px;
  top: -5px;
  cursor: ne-resize;
}

.crop-handle.sw {
  left: -5px;
  bottom: -5px;
  cursor: sw-resize;
}

.crop-handle.se {
  right: -5px;
  bottom: -5px;
  cursor: se-resize;
}
</style>
