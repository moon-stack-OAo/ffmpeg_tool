<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import ImageCropCanvas from './ImageCropCanvas.vue'
import type { CropRect } from '@shared/cropUiLogic'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    /** 预览图片本地路径（图片模式） */
    imagePath: string
    crop: CropRect
    /** 对话框标题 */
    title?: string
    /** 额外说明（如视频参考图提示） */
    hint?: string
    /** 预加载 dataUrl（视频抽帧）；有则优先于 imagePath 加载 */
    initialDataUrl?: string
    /** 与 initialDataUrl 配套的源视频/图显示宽 */
    naturalWidth?: number
    /** 与 initialDataUrl 配套的源视频/图显示高 */
    naturalHeight?: number
    /** 视频路径：提供时显示时间点重新抽帧 */
    videoPath?: string
    /** 当前抽帧时间点（秒） */
    frameTimeSec?: number
  }>(),
  {
    title: '可视化裁切',
    hint: '',
    initialDataUrl: '',
    naturalWidth: 0,
    naturalHeight: 0,
    videoPath: '',
    frameTimeSec: 0
  }
)

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  confirm: [rect: CropRect]
}>()

const loading = ref(false)
const error = ref('')
const dataUrl = ref('')
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const draft = ref<CropRect>({ x: 0, y: 0, w: 0, h: 0 })
/** 0 = 自由 */
const aspectKey = ref(0)
/** 视频抽帧时间点 */
const timeSec = ref(0)

const aspectOptions: Array<{ label: string; value: number; ratio: number | null }> = [
  { label: '自由', value: 0, ratio: null },
  { label: '1:1', value: 1, ratio: 1 },
  { label: '4:3', value: 2, ratio: 4 / 3 },
  { label: '16:9', value: 3, ratio: 16 / 9 },
  { label: '9:16', value: 4, ratio: 9 / 16 }
]

const aspectRatio = computed((): number | null => {
  const opt = aspectOptions.find((o) => o.value === aspectKey.value)
  return opt?.ratio ?? null
})

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const sizeLabel = computed(() => {
  if (!(naturalWidth.value > 0 && naturalHeight.value > 0)) return ''
  return `${naturalWidth.value} × ${naturalHeight.value}`
})

const isVideoMode = computed(
  () => !!(props.videoPath && props.videoPath.trim())
)

function applyDraftFromProps(): void {
  draft.value = {
    x: props.crop.x,
    y: props.crop.y,
    w: props.crop.w,
    h: props.crop.h
  }
}

function applyPreloaded(): boolean {
  const url = (props.initialDataUrl || '').trim()
  const w = props.naturalWidth || 0
  const h = props.naturalHeight || 0
  if (!url || !(w > 0 && h > 0)) return false
  dataUrl.value = url
  naturalWidth.value = w
  naturalHeight.value = h
  applyDraftFromProps()
  return true
}

async function loadPreview(path: string): Promise<void> {
  loading.value = true
  error.value = ''
  dataUrl.value = ''
  naturalWidth.value = 0
  naturalHeight.value = 0
  try {
    const api = window.electronAPI
    if (!api?.getImageDataUrl) {
      error.value = '预览接口不可用'
      return
    }
    const res = await api.getImageDataUrl(path)
    if (!res.ok || !res.dataUrl) {
      error.value = res.error || '加载预览失败'
      return
    }
    dataUrl.value = res.dataUrl
    naturalWidth.value = res.width || 0
    naturalHeight.value = res.height || 0
    applyDraftFromProps()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function loadVideoFrame(t: number): Promise<void> {
  const vpath = (props.videoPath || '').trim()
  if (!vpath) return
  loading.value = true
  error.value = ''
  try {
    const api = window.electronAPI
    if (!api?.extractVideoFrame) {
      error.value = '抽帧接口不可用'
      return
    }
    const res = await api.extractVideoFrame({
      path: vpath,
      timeSec: t,
      maxEdge: 1600
    })
    if (!res.ok || !res.dataUrl) {
      error.value = res.error || '抽帧失败'
      return
    }
    dataUrl.value = res.dataUrl
    if (res.width && res.height) {
      naturalWidth.value = res.width
      naturalHeight.value = res.height
    }
    // 换帧时保留已有 draft（同分辨率坐标系）
    if (!(draft.value.w > 0 && draft.value.h > 0)) {
      applyDraftFromProps()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function onRefreshFrame(): void {
  const t =
    typeof timeSec.value === 'number' && Number.isFinite(timeSec.value)
      ? Math.max(0, timeSec.value)
      : 0
  timeSec.value = t
  void loadVideoFrame(t)
}

watch(
  () =>
    [
      props.modelValue,
      props.imagePath,
      props.initialDataUrl,
      props.videoPath
    ] as const,
  ([open]) => {
    if (open) {
      aspectKey.value = 0
      timeSec.value =
        typeof props.frameTimeSec === 'number' &&
        Number.isFinite(props.frameTimeSec)
          ? Math.max(0, props.frameTimeSec)
          : 0
      if (applyPreloaded()) {
        loading.value = false
        error.value = ''
        return
      }
      const path = (props.imagePath || '').trim()
      if (path) {
        void loadPreview(path)
      } else {
        error.value = '无预览路径'
      }
    }
    if (!open) {
      dataUrl.value = ''
      error.value = ''
    }
  }
)

function onConfirm(): void {
  if (!(draft.value.w > 0 && draft.value.h > 0)) {
    error.value = '请选择有效的裁切区域（宽高须大于 0）'
    return
  }
  emit('confirm', {
    x: Math.round(draft.value.x),
    y: Math.round(draft.value.y),
    w: Math.round(draft.value.w),
    h: Math.round(draft.value.h)
  })
  emit('update:modelValue', false)
}

function onCancel(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="720px"
    destroy-on-close
    append-to-body
    class="image-crop-dialog"
  >
    <p v-if="hint" class="crop-dialog-hint">{{ hint }}</p>
    <div v-if="loading" class="crop-dialog-status">加载预览中…</div>
    <el-alert
      v-else-if="error"
      type="error"
      :title="error"
      show-icon
      :closable="false"
      class="crop-dialog-alert"
    />
    <template v-else-if="dataUrl">
      <div class="crop-dialog-toolbar">
        <span class="label">比例</span>
        <el-radio-group v-model="aspectKey" size="small">
          <el-radio-button
            v-for="opt in aspectOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
        <span v-if="sizeLabel" class="muted">原图 {{ sizeLabel }}</span>
      </div>
      <div v-if="isVideoMode" class="crop-dialog-toolbar">
        <span class="label">时间点(秒)</span>
        <el-input-number
          v-model="timeSec"
          :min="0"
          :max="86400"
          :step="0.5"
          :precision="2"
          size="small"
          controls-position="right"
          class="w-time"
        />
        <el-button size="small" :loading="loading" @click="onRefreshFrame">
          重新抽帧
        </el-button>
      </div>
      <ImageCropCanvas
        v-model="draft"
        :src="dataUrl"
        :natural-width="naturalWidth"
        :natural-height="naturalHeight"
        :aspect-ratio="aspectRatio"
      />
      <div class="crop-dialog-nums">
        <span>X {{ draft.x }}</span>
        <span>Y {{ draft.y }}</span>
        <span>宽 {{ draft.w }}</span>
        <span>高 {{ draft.h }}</span>
      </div>
    </template>
    <div v-else class="crop-dialog-status muted">无预览</div>

    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button
        type="primary"
        :disabled="loading || !!error || !(draft.w > 0 && draft.h > 0)"
        @click="onConfirm"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.crop-dialog-hint {
  margin: 0 0 10px;
  font-size: var(--fs-sm, 12px);
  color: var(--app-fg-muted, #888);
  line-height: 1.45;
}

.crop-dialog-status {
  padding: 48px 16px;
  text-align: center;
  color: var(--app-fg-secondary, #666);
  font-size: var(--fs-md, 13px);
}

.crop-dialog-status.muted,
.muted {
  color: var(--app-fg-muted, #888);
}

.crop-dialog-alert {
  margin-bottom: 8px;
}

.crop-dialog-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 10px;
}

.crop-dialog-toolbar .label {
  font-size: var(--fs-sm, 12px);
  color: var(--app-fg-secondary, #666);
}

.crop-dialog-nums {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  margin-top: 10px;
  font-size: var(--fs-sm, 12px);
  color: var(--app-fg-secondary, #666);
  font-variant-numeric: tabular-nums;
}

.w-time {
  width: 120px;
}
</style>
