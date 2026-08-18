<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import type { MosaicRegion } from '@shared/types'
import type { CropRect } from '@shared/cropUiLogic'
import ImageCropCanvas from './ImageCropCanvas.vue'

const props = defineProps<{
  modelValue: boolean
  videoPath: string
  regions: MosaicRegion[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [regions: MosaicRegion[]]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})
const loading = ref(false)
const error = ref('')
const dataUrl = ref('')
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const timeSec = ref(0)
const draft = ref<CropRect>({ x: 0, y: 0, w: 0, h: 0 })
const draftStart = ref(0)
const draftEnd = ref(0)
const draftMode = ref<MosaicRegion['mode']>('pixelate')
const draftStrength = ref(16)
const rules = ref<MosaicRegion[]>([])

function cloneRegions(regions: MosaicRegion[]): MosaicRegion[] {
  return regions.map((region) => ({ ...region }))
}

async function loadFrame(): Promise<void> {
  if (!props.videoPath) return
  loading.value = true
  error.value = ''
  try {
    const result = await window.electronAPI.extractVideoFrame({
      path: props.videoPath,
      timeSec: Math.max(0, timeSec.value),
      maxEdge: 1600
    })
    if (!result.ok || !result.dataUrl || !result.width || !result.height) {
      error.value = result.error || '抽帧失败'
      return
    }
    dataUrl.value = result.dataUrl
    naturalWidth.value = result.width
    naturalHeight.value = result.height
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

function resetDraft(): void {
  draft.value = { x: 0, y: 0, w: 0, h: 0 }
  draftStart.value = Math.max(0, timeSec.value)
  draftEnd.value = 0
  draftMode.value = 'pixelate'
  draftStrength.value = 16
}

function addRule(): void {
  if (!(draft.value.w > 1 && draft.value.h > 1)) {
    error.value = '请先在画面中框选打码区域'
    return
  }
  if (draftEnd.value > 0 && draftEnd.value <= draftStart.value) {
    error.value = '结束时间必须大于开始时间'
    return
  }
  rules.value.push({
    id: `mosaic-${Date.now()}-${rules.value.length + 1}`,
    startSec: Math.round(Math.max(0, draftStart.value) * 1000) / 1000,
    endSec: draftEnd.value > 0 ? Math.round(draftEnd.value * 1000) / 1000 : undefined,
    x: Math.round(draft.value.x),
    y: Math.round(draft.value.y),
    w: Math.round(draft.value.w),
    h: Math.round(draft.value.h),
    mode: draftMode.value,
    strength: Math.max(2, Math.min(128, Math.round(draftStrength.value)))
  })
  error.value = ''
  resetDraft()
}

function removeRule(index: number): void {
  rules.value.splice(index, 1)
}

function confirm(): void {
  emit('confirm', cloneRegions(rules.value))
  visible.value = false
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    rules.value = cloneRegions(props.regions || [])
    timeSec.value = 0
    resetDraft()
    void loadFrame()
  }
)
</script>

<template>
  <el-dialog v-model="visible" title="视频打码" width="760px" destroy-on-close append-to-body>
    <div class="toolbar">
      <span>预览时间(秒)</span>
      <el-input-number v-model="timeSec" :min="0" :max="86400" :step="0.5" :precision="2" size="small" controls-position="right" />
      <el-button size="small" :loading="loading" @click="loadFrame">重新抽帧</el-button>
      <span v-if="naturalWidth && naturalHeight" class="muted">原视频 {{ naturalWidth }} x {{ naturalHeight }}</span>
    </div>
    <div v-if="loading" class="status">加载预览中...</div>
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" show-icon />
    <template v-else-if="dataUrl">
      <ImageCropCanvas v-model="draft" :src="dataUrl" :natural-width="naturalWidth" :natural-height="naturalHeight" />
      <div class="toolbar rule-form">
        <span>开始</span><el-input-number v-model="draftStart" :min="0" :max="86400" :step="0.5" :precision="2" size="small" controls-position="right" />
        <span>结束</span><el-input-number v-model="draftEnd" :min="0" :max="86400" :step="0.5" :precision="2" size="small" controls-position="right" />
        <el-select v-model="draftMode" size="small" class="mode-select"><el-option label="像素化" value="pixelate" /><el-option label="模糊" value="blur" /></el-select>
        <el-input-number v-model="draftStrength" :min="2" :max="128" :step="1" size="small" controls-position="right" />
        <el-button type="primary" size="small" @click="addRule">添加区域</el-button>
      </div>
    </template>
    <div v-if="rules.length" class="rules">
      <div v-for="(rule, index) in rules" :key="rule.id" class="rule-row">
        <span>{{ index + 1 }}. {{ rule.mode === 'blur' ? '模糊' : '像素化' }} {{ rule.w }} x {{ rule.h }} @ {{ rule.x }},{{ rule.y }}</span>
        <span>{{ rule.startSec }}s - {{ rule.endSec || '结束' }}</span>
        <el-button text type="danger" size="small" @click="removeRule(index)">删除</el-button>
      </div>
    </div>
    <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" @click="confirm">保存打码规则</el-button></template>
  </el-dialog>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; font-size: var(--fs-sm, 12px); color: var(--app-fg-secondary, #666); }
.rule-form { margin-top: 10px; }
.mode-select { width: 92px; }
.status { padding: 48px; text-align: center; color: var(--app-fg-muted, #888); }
.muted { color: var(--app-fg-muted, #888); }
.rules { margin-top: 12px; border-top: 1px solid var(--panel-border); }
.rule-row { display: flex; align-items: center; gap: 12px; padding: 7px 0; font-size: var(--fs-sm, 12px); font-variant-numeric: tabular-nums; }
.rule-row span:first-child { flex: 1; min-width: 0; }
</style>
