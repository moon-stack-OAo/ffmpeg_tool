<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import {
  ASPECT_RATIO_OPTIONS,
  type AspectRatioId,
  AUDIO_BITRATE_OPTIONS,
  AUDIO_FORMAT_OPTIONS,
  type AudioFormat,
  COMPAT_PROFILE_OPTIONS,
  type CompatProfile,
  CONCURRENCY_HINT,
  CONCURRENCY_OPTIONS,
  DEFAULT_PRESETS,
  ENCODE_PRESET_OPTIONS,
  type EncodePreset,
  ENCODER_OPTIONS,
  type EncoderDetectResult,
  type EncoderId,
  FPS_OPTIONS,
  type FpsMode,
  IMAGE_EXTENSIONS,
  IMAGE_FORMAT_OPTIONS,
  IMAGE_LAYOUT_OPTIONS,
  NAME_TEMPLATE_OPTIONS,
  OUTPUT_DIR_MODE_OPTIONS,
  OUTPUT_FORMAT_OPTIONS,
  type OutputDirMode,
  type OutputFormat,
  type PresetId,
  ROTATE90_OPTIONS,
  type Rotate90,
  SCALE_MODE_OPTIONS,
  SCALE_PAD_OPTIONS,
  type ScaleMode,
  type ScalePadMode,
  TASK_MODE_OPTIONS,
  type TaskMode,
  TOOL_GROUP_MODES,
  TOOL_GROUP_OPTIONS,
  type ToolGroup,
  toolGroupOfMode,
  VIDEO_EXTENSIONS,
  WATERMARK_MODE_OPTIONS,
  WATERMARK_POSITION_OPTIONS,
  type WatermarkMode,
  type WatermarkPosition
} from '@shared/types'
import type { CropRect } from '@shared/cropUiLogic'
import ImageCropDialog from './ImageCropDialog.vue'

const props = withDefaults(
  defineProps<{
    taskMode: TaskMode
    audioFormat: AudioFormat
    audioBitrate: string
    presetId: PresetId
    encoder: EncoderId
    concurrency: number
    nameTemplate: string
    nameTemplateCustom: boolean
    outputDir: string
    outputDirMode: OutputDirMode
    targetSizeMb: number
    /** 目标体积时两遍编码 */
    twoPass: boolean
    isCustom: boolean
    isWebm: boolean
    isAudioMode: boolean
    isImageMode: boolean
    isVideoConcatMode: boolean
    isMediaComposeMode: boolean
    isVideoCompressMode: boolean
    presetDescription: string
    encoderInfo: EncoderDetectResult | null
    /** 裁剪开始秒，0 表示不裁剪 */
    trimStart: number
    /** 裁剪结束秒，0 表示到结尾 */
    trimEnd: number
    /** 画面旋转 90° */
    rotate90: Rotate90
    /** 去掉音轨 */
    muteAudio: boolean
    /** H.264 兼容档 */
    compatProfile: CompatProfile
    /** 视频模式音轨码率 */
    videoAudioBitrate: string
    /** 输出帧率 */
    fps: FpsMode
    /** x264 编码速度 */
    encodePreset: EncodePreset
    watermarkMode: WatermarkMode
    watermarkImagePath: string
    watermarkText: string
    watermarkPosition: WatermarkPosition
    watermarkOpacity: number
    watermarkScalePercent: number
    watermarkFontSize: number
    watermarkMargin: number
    imageFormat: 'jpeg' | 'png' | 'webp' | 'keep'
    imageQuality: number
    imageMaxEdge: number
    imageStrip: boolean
    imageLayout: 'horizontal' | 'vertical' | 'grid'
    imageGridCols: number
    imageGap: number
    imageBackground: string
    cropX: number
    cropY: number
    cropW: number
    cropH: number
    concatPreferCopy: boolean
    composeIntroPath: string
    composeIntroDuration: number
    composeOutroPath: string
    composeOutroDuration: number
    composeOverlayPath: string
    composeOverlayPosition: WatermarkPosition
    composeOverlayOpacity: number
    composeOverlayScalePercent: number
    composeOverlayMargin: number
    composeOverlayStartSec: number
    composeOverlayEndSec: number
    composeFitIntroOutro: boolean
    /** 可视化裁切预览路径（任务 inputPath，可空） */
    cropPreviewPath?: string
    /** 是否存在可单独编辑的压缩任务 */
    mosaicEditable?: boolean
    /** 多任务全局草稿下裁切/混剪危险提示 */
    showCropComposeWarning?: boolean
    cropComposeWarningText?: string
    /** 分辨率缩放模式（custom） */
    scaleMode: ScaleMode
    outWidth: number
    outHeight: number
    aspectRatio: AspectRatioId
    scalePad: ScalePadMode
    custom: {
      crf: number
      maxEdge: number
      format: OutputFormat
    }
  }>(),
  {
    cropPreviewPath: '',
    mosaicEditable: false,
    showCropComposeWarning: false,
    cropComposeWarningText: ''
  }
)

const emit = defineEmits<{
  taskModeChange: [mode: TaskMode]
  audioFormatChange: [v: AudioFormat]
  audioBitrateChange: [v: string]
  presetChange: [id: PresetId]
  encoderChange: [v: EncoderId]
  concurrencyChange: [n: number]
  nameTemplateChange: [v: string]
  customNameTemplateInput: [v: string]
  outputDirModeChange: [v: OutputDirMode]
  selectOutput: []
  targetSizeMbChange: [v: number]
  twoPassChange: [v: boolean]
  trimStartChange: [v: number]
  trimEndChange: [v: number]
  rotate90Change: [v: Rotate90]
  muteAudioChange: [v: boolean]
  compatProfileChange: [v: CompatProfile]
  videoAudioBitrateChange: [v: string]
  fpsChange: [v: FpsMode]
  encodePresetChange: [v: EncodePreset]
  watermarkModeChange: [v: WatermarkMode]
  watermarkImagePathChange: [v: string]
  watermarkTextChange: [v: string]
  watermarkPositionChange: [v: WatermarkPosition]
  watermarkOpacityChange: [v: number]
  watermarkScalePercentChange: [v: number]
  watermarkFontSizeChange: [v: number]
  watermarkMarginChange: [v: number]
  selectWatermarkImage: []
  imageFormatChange: [v: 'jpeg' | 'png' | 'webp' | 'keep']
  imageQualityChange: [v: number]
  imageMaxEdgeChange: [v: number]
  imageStripChange: [v: boolean]
  imageLayoutChange: [v: 'horizontal' | 'vertical' | 'grid']
  imageGridColsChange: [v: number]
  imageGapChange: [v: number]
  imageBackgroundChange: [v: string]
  cropXChange: [v: number]
  cropYChange: [v: number]
  cropWChange: [v: number]
  cropHChange: [v: number]
  concatPreferCopyChange: [v: boolean]
  composeIntroPathChange: [v: string]
  composeIntroDurationChange: [v: number]
  composeOutroPathChange: [v: string]
  composeOutroDurationChange: [v: number]
  composeOverlayPathChange: [v: string]
  composeOverlayPositionChange: [v: WatermarkPosition]
  composeOverlayOpacityChange: [v: number]
  composeOverlayScalePercentChange: [v: number]
  composeOverlayMarginChange: [v: number]
  composeOverlayStartSecChange: [v: number]
  composeOverlayEndSecChange: [v: number]
  composeFitIntroOutroChange: [v: boolean]
  selectComposeIntroImage: []
  selectComposeOutroImage: []
  selectComposeOverlayImage: []
  scaleModeChange: [v: ScaleMode]
  outWidthChange: [v: number]
  outHeightChange: [v: number]
  aspectRatioChange: [v: AspectRatioId]
  scalePadChange: [v: ScalePadMode]
  applyToPending: []
  editMosaics: []
}>()

/** 高级选项默认折叠 */
const advancedOpen = ref(false)
/** 视频画面裁切折叠 */
const videoCropOpen = ref(false)

/** 工具分组（视频 / 图片 / 合成） */
const toolGroup = ref<ToolGroup>(toolGroupOfMode(props.taskMode))

watch(
  () => props.taskMode,
  (mode) => {
    toolGroup.value = toolGroupOfMode(mode)
  }
)

const secondaryModeOptions = computed(() => {
  const modes = TOOL_GROUP_MODES[toolGroup.value] || []
  return TASK_MODE_OPTIONS.filter((o) => modes.includes(o.value))
})

function onToolGroupChange(v: string | number | boolean | undefined): void {
  const g = (v as ToolGroup) || 'video'
  toolGroup.value = g
  const modes = TOOL_GROUP_MODES[g] || []
  if (!modes.length) return
  if (modes.includes(props.taskMode)) return
  emit('taskModeChange', modes[0])
}

/** 编码器探测简短 chips */
const encoderChips = computed(() => {
  const info = props.encoderInfo
  if (!info) return [] as Array<{ key: string; ok: boolean; label: string }>
  return [
    { key: 'nvenc', ok: !!info.nvenc, label: 'NVENC' },
    { key: 'qsv', ok: !!info.qsv, label: 'QSV' },
    { key: 'amf', ok: !!info.amf, label: 'AMF' },
    {
      key: 'vt',
      ok: !!info.videotoolbox,
      label: 'VT'
    }
  ]
})

const hasComposeAssets = computed(() => {
  const intro = (props.composeIntroPath || '').trim()
  const outro = (props.composeOutroPath || '').trim()
  const overlay = (props.composeOverlayPath || '').trim()
  return !!(intro || outro || overlay)
})

const cropDialogOpen = ref(false)
const cropDialogPath = ref('')
const cropDialogHint = ref('')
const cropDialogTitle = ref('可视化裁切')
/** 视频抽帧预加载（与 path 二选一） */
const cropDialogInitialDataUrl = ref('')
const cropDialogNaturalW = ref(0)
const cropDialogNaturalH = ref(0)
const cropDialogVideoPath = ref('')
const cropDialogTimeSec = ref(0)

const IMAGE_EXT_SET = new Set(
  (IMAGE_EXTENSIONS as string[]).map((e) => e.toLowerCase())
)
const VIDEO_EXT_SET = new Set(
  (VIDEO_EXTENSIONS as string[]).map((e) => e.toLowerCase())
)

function extOf(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

function isImagePath(p: string): boolean {
  return IMAGE_EXT_SET.has(extOf(p))
}

function isVideoPath(p: string): boolean {
  return VIDEO_EXT_SET.has(extOf(p))
}

const cropModel = computed(
  (): CropRect => ({
    x: props.cropX,
    y: props.cropY,
    w: props.cropW,
    h: props.cropH
  })
)

function resetCropDialogPreload(): void {
  cropDialogInitialDataUrl.value = ''
  cropDialogNaturalW.value = 0
  cropDialogNaturalH.value = 0
  cropDialogVideoPath.value = ''
  cropDialogTimeSec.value = 0
}

async function openVisualCrop(): Promise<void> {
  let path = (props.cropPreviewPath || '').trim()
  let hint = ''
  let title = '可视化裁切'
  resetCropDialogPreload()

  if (path && isVideoPath(path)) {
    // 优先从视频抽帧预览
    try {
      if (!window.electronAPI?.extractVideoFrame) {
        throw new Error('抽帧接口不可用')
      }
      ElMessage.info('正在从视频抽取预览帧…')
      const res = await window.electronAPI.extractVideoFrame({
        path,
        timeSec: 0,
        maxEdge: 1600
      })
      if (res.ok && res.dataUrl && res.width && res.height) {
        cropDialogPath.value = path
        cropDialogInitialDataUrl.value = res.dataUrl
        cropDialogNaturalW.value = res.width
        cropDialogNaturalH.value = res.height
        cropDialogVideoPath.value = path
        cropDialogTimeSec.value = 0
        cropDialogHint.value =
          '已从视频抽帧预览。裁切坐标基于源视频显示分辨率（像素）。可调整时间点重新抽帧。'
        cropDialogTitle.value = '可视化裁切（视频帧）'
        cropDialogOpen.value = true
        return
      }
      ElMessage.warning(res.error || '视频抽帧失败，请选择参考截图')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      ElMessage.warning(msg || '视频抽帧失败，请选择参考截图')
    }
    const picked = await window.electronAPI.selectImage()
    if (!picked?.path) return
    path = picked.path
    hint =
      '当前为参考图定框：请确保参考图与视频分辨率一致。裁切坐标将按像素写入视频 crop 滤镜。'
    title = '可视化裁切（参考图）'
  } else if (!path || !isImagePath(path)) {
    const picked = await window.electronAPI.selectImage()
    if (!picked?.path) {
      ElMessage.warning('请先添加任务图片或选择一张预览图')
      return
    }
    path = picked.path
    if (props.taskMode === 'compress') {
      hint =
        '视频模式下使用图片定框；请确保参考图与视频分辨率一致。'
      title = '可视化裁切（参考图）'
    }
  }

  cropDialogPath.value = path
  cropDialogHint.value = hint
  cropDialogTitle.value = title
  cropDialogOpen.value = true
}

function onCropDialogConfirm(rect: CropRect): void {
  emit('cropXChange', rect.x)
  emit('cropYChange', rect.y)
  emit('cropWChange', rect.w)
  emit('cropHChange', rect.h)
}

function modeDesc(): string {
  if (props.isAudioMode) return '仅抽取音频'
  if (props.taskMode === 'image') return '图片压缩 / 格式转换'
  if (props.taskMode === 'image-crop') return '按像素裁切图片'
  if (props.taskMode === 'image-stitch') return '多图拼接为一张'
  if (props.taskMode === 'video-concat') return '多段视频首尾拼接'
  if (props.taskMode === 'media-compose') return '片头/片尾静图 + 图叠主视频'
  return props.presetDescription
}

/** 下拉展示值：自定义时用哨兵 */
function nameSelectValue(nameTemplate: string, isCustom: boolean): string {
  if (isCustom) return '__custom__'
  const known = NAME_TEMPLATE_OPTIONS.find(
    (o) => o.id !== 'custom' && o.value === nameTemplate
  )
  return known ? known.value : '__custom__'
}

function encoderTitle(isWebm: boolean, info: EncoderDetectResult | null): string {
  if (isWebm) return 'WebM 强制软件 VP9'
  const base = '优先使用 GPU 编码降低 CPU；失败自动回退软编'
  if (!info) return base
  const found: string[] = []
  if (info.nvenc) found.push('NVENC')
  if (info.qsv) found.push('QSV')
  if (info.amf) found.push('AMF')
  if (info.videotoolbox) found.push('VT')
  if (info.codecs?.h264_mf) found.push('MF')
  if (info.codecs?.hevc_nvenc) found.push('HEVC')
  const hw = found.length ? `硬件: ${found.join(' ')}` : '硬件: 未检测到'
  return `${base}。${hw}`
}

/** 某 EncoderId 是否可用（无探测信息时默认可用） */
function isEncoderOptionAvailable(id: EncoderId): boolean {
  if (id === 'auto' || id === 'software' || id === 'libx264') return true
  const info = props.encoderInfo
  if (!info) return true
  if (info.availability?.length) {
    const row = info.availability.find((a) => a.id === id)
    if (row) return row.available
  }
  if (info.codecs) {
    const map: Partial<Record<EncoderId, keyof typeof info.codecs>> = {
      h264_nvenc: 'h264_nvenc',
      h264_qsv: 'h264_qsv',
      h264_amf: 'h264_amf',
      h264_videotoolbox: 'h264_videotoolbox',
      h264_mf: 'h264_mf',
      hevc_nvenc: 'hevc_nvenc',
      hevc_qsv: 'hevc_qsv',
      hevc_amf: 'hevc_amf',
      hevc_videotoolbox: 'hevc_videotoolbox',
      hevc_mf: 'hevc_mf',
      libx265: 'libx265',
      nvenc: 'h264_nvenc',
      qsv: 'h264_qsv',
      amf: 'h264_amf',
      videotoolbox: 'h264_videotoolbox'
    }
    const codec = map[id]
    if (codec && codec in info.codecs) return !!info.codecs[codec]
  }
  // 旧字段回退
  if (id === 'nvenc' || id === 'h264_nvenc') return info.nvenc
  if (id === 'qsv' || id === 'h264_qsv') return info.qsv
  if (id === 'amf' || id === 'h264_amf') return info.amf
  if (id === 'videotoolbox' || id === 'h264_videotoolbox') return !!info.videotoolbox
  return true
}

function encoderOptionLabel(opt: { value: EncoderId; label: string }): string {
  if (isEncoderOptionAvailable(opt.value)) return opt.label
  return `${opt.label}（不可用）`
}

</script>

<template>
  <div class="panel options-panel">
    <div class="options-header">
      <div class="options-header-left">
        <span class="options-title">任务选项</span>
        <span class="options-desc">
          {{ modeDesc() }}
        </span>
      </div>
      <el-button size="small" @click="emit('applyToPending')">应用到待处理</el-button>
    </div>

    <el-alert
      v-if="showCropComposeWarning"
      class="crop-compose-alert"
      type="warning"
      :closable="false"
      show-icon
      :title="cropComposeWarningText || '当前裁切/混剪参数将应用于全部待处理任务'"
    />

    <!-- 第一行：工具分组 / 任务模式 / 预设（或音频 / 图片参数） -->
    <div class="opt-row opt-row-wrap">
      <div class="opt-item">
        <span class="label">工具</span>
        <el-radio-group
          :model-value="toolGroup"
          size="small"
          @change="onToolGroupChange"
        >
          <el-radio-button
            v-for="opt in TOOL_GROUP_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="secondaryModeOptions.length > 1" class="opt-item">
        <span class="label">模式</span>
        <el-radio-group
          :model-value="taskMode"
          size="small"
          @change="(v: string | number | boolean | undefined) => emit('taskModeChange', v as TaskMode)"
        >
          <el-radio-button
            v-for="opt in secondaryModeOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <div class="opt-divider" aria-hidden="true" />

      <template v-if="isAudioMode">
        <div class="opt-item">
          <span class="label">音频格式</span>
          <el-select
            :model-value="audioFormat"
            size="small"
            class="w-3xl"
            @change="(v: AudioFormat) => emit('audioFormatChange', v)"
          >
            <el-option
              v-for="opt in AUDIO_FORMAT_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
        <div class="opt-item">
          <span class="label">码率</span>
          <el-select
            :model-value="audioBitrate"
            size="small"
            class="w-md"
            @change="(v: string) => emit('audioBitrateChange', v)"
          >
            <el-option
              v-for="br in AUDIO_BITRATE_OPTIONS"
              :key="br"
              :label="br"
              :value="br"
            />
          </el-select>
        </div>
      </template>

      <template v-else-if="isImageMode">
        <div class="opt-item">
          <span class="label">格式</span>
          <el-select
            :model-value="imageFormat"
            size="small"
            class="w-3xl"
            @change="(v: 'jpeg' | 'png' | 'webp' | 'keep') => emit('imageFormatChange', v)"
          >
            <el-option
              v-for="opt in IMAGE_FORMAT_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
        <div class="opt-item" title="JPEG / WebP 有效">
          <span class="label">质量</span>
          <el-slider
            :model-value="imageQuality"
            :min="1"
            :max="100"
            :step="1"
            size="small"
            class="w-quality"
            @change="(v: number | number[]) => emit('imageQualityChange', Array.isArray(v) ? v[0] : v)"
          />
          <span class="hint-inline">{{ imageQuality }}</span>
        </div>
        <div class="opt-item" title="0 = 不限制">
          <span class="label">最长边</span>
          <el-input-number
            :model-value="imageMaxEdge"
            :min="0"
            :max="7680"
            :step="10"
            size="small"
            controls-position="right"
            class="w-lg"
            @change="(v: number | undefined) => emit('imageMaxEdgeChange', typeof v === 'number' ? v : 0)"
          />
        </div>
        <div class="opt-item" title="去掉 EXIF 等元数据">
          <span class="label">去元数据</span>
          <el-switch
            :model-value="imageStrip"
            size="small"
            @change="(v: string | number | boolean) => emit('imageStripChange', Boolean(v))"
          />
        </div>
      </template>

      <template v-else-if="isVideoConcatMode">
        <div class="opt-item" title="编码参数一致时可流复制，更快">
          <span class="label">优先流复制</span>
          <el-switch
            :model-value="concatPreferCopy"
            size="small"
            @change="(v: string | number | boolean) => emit('concatPreferCopyChange', Boolean(v))"
          />
          <span class="hint-inline">更快，要求编码一致</span>
        </div>
        <div class="opt-item" :title="encoderTitle(false, encoderInfo)">
          <span class="label">编码器</span>
          <el-select
            :model-value="encoder"
            size="small"
            class="w-4xl"
            @change="(v: EncoderId) => emit('encoderChange', v)"
          >
            <el-option
              v-for="opt in ENCODER_OPTIONS"
              :key="opt.value"
              :label="encoderOptionLabel(opt)"
              :value="opt.value"
              :disabled="!isEncoderOptionAvailable(opt.value)"
            />
          </el-select>
          <span v-if="encoderChips.length" class="encoder-chips">
            <span
              v-for="c in encoderChips"
              :key="c.key"
              class="encoder-chip"
              :class="{ ok: c.ok, bad: !c.ok }"
            >
              {{ c.label }}{{ c.ok ? '✓' : '–' }}
            </span>
          </span>
        </div>
        <span class="hint-inline">流复制失败时将按此编码器重编码</span>
      </template>

      <template v-else-if="isMediaComposeMode">
        <div class="opt-item" title="片头尾静图缩放到主视频尺寸并黑边填充">
          <span class="label">匹配主视频尺寸</span>
          <el-switch
            :model-value="composeFitIntroOutro"
            size="small"
            @change="(v: string | number | boolean) => emit('composeFitIntroOutroChange', Boolean(v))"
          />
          <span class="hint-inline">主视频从任务列表添加；图片在此选择</span>
        </div>
        <div class="opt-item" :title="encoderTitle(false, encoderInfo)">
          <span class="label">编码器</span>
          <el-select
            :model-value="encoder"
            size="small"
            class="w-4xl"
            @change="(v: EncoderId) => emit('encoderChange', v)"
          >
            <el-option
              v-for="opt in ENCODER_OPTIONS"
              :key="opt.value"
              :label="encoderOptionLabel(opt)"
              :value="opt.value"
              :disabled="!isEncoderOptionAvailable(opt.value)"
            />
          </el-select>
          <span v-if="encoderChips.length" class="encoder-chips">
            <span
              v-for="c in encoderChips"
              :key="c.key"
              class="encoder-chip"
              :class="{ ok: c.ok, bad: !c.ok }"
            >
              {{ c.label }}{{ c.ok ? '✓' : '–' }}
            </span>
          </span>
        </div>
        <span class="hint-inline">重编码时使用</span>
      </template>

      <template v-else>
        <div class="opt-item opt-item-fill">
          <span class="label">预设</span>
          <el-radio-group
            :model-value="presetId"
            size="small"
            @change="(v: string | number | boolean | undefined) => emit('presetChange', v as PresetId)"
          >
            <el-radio-button v-for="p in DEFAULT_PRESETS" :key="p.id" :value="p.id">
              {{ p.name }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </template>
    </div>

    <!-- 图片裁切 / 拼接额外选项 -->
    <div v-if="taskMode === 'image-crop'" class="opt-row opt-row-wrap">
      <div class="opt-item" title="原图像素坐标">
        <span class="label">裁切区域</span>
        <span class="hint-inline">X</span>
        <el-input-number
          :model-value="cropX"
          :min="0"
          :max="20000"
          :step="1"
          size="small"
          controls-position="right"
          class="w-lg"
          @change="(v: number | undefined) => emit('cropXChange', typeof v === 'number' ? v : 0)"
        />
        <span class="hint-inline">Y</span>
        <el-input-number
          :model-value="cropY"
          :min="0"
          :max="20000"
          :step="1"
          size="small"
          controls-position="right"
          class="w-lg"
          @change="(v: number | undefined) => emit('cropYChange', typeof v === 'number' ? v : 0)"
        />
        <span class="hint-inline">宽</span>
        <el-input-number
          :model-value="cropW"
          :min="0"
          :max="20000"
          :step="1"
          size="small"
          controls-position="right"
          class="w-lg"
          @change="(v: number | undefined) => emit('cropWChange', typeof v === 'number' ? v : 0)"
        />
        <span class="hint-inline">高</span>
        <el-input-number
          :model-value="cropH"
          :min="0"
          :max="20000"
          :step="1"
          size="small"
          controls-position="right"
          class="w-lg"
          @change="(v: number | undefined) => emit('cropHChange', typeof v === 'number' ? v : 0)"
        />
        <el-button size="small" type="primary" plain @click="openVisualCrop">
          可视化裁切
        </el-button>
        <span class="hint-inline">原图像素，宽高须 &gt; 0</span>
      </div>
    </div>

    <!-- 图+视频混剪选项 -->
    <template v-if="isMediaComposeMode">
      <el-alert
        v-if="!hasComposeAssets"
        class="compose-empty-alert"
        type="info"
        :closable="false"
        show-icon
        title="请先选择片头、片尾或叠加图，再添加主视频并启动任务"
      />
      <div class="opt-row opt-row-wrap">
        <div class="opt-item opt-item-fill">
          <span class="label">片头图</span>
          <el-input
            :model-value="composeIntroPath"
            size="small"
            placeholder="可选：片头静图路径"
            class="w-5xl"
            @update:model-value="(v: string) => emit('composeIntroPathChange', v)"
          />
          <el-button size="small" @click="emit('selectComposeIntroImage')">浏览</el-button>
        </div>
        <div class="opt-item">
          <span class="label">时长秒</span>
          <el-input-number
            :model-value="composeIntroDuration"
            :min="0.1"
            :max="3600"
            :step="0.5"
            :precision="1"
            size="small"
            controls-position="right"
            class="w-lg"
            @change="(v: number | undefined) => emit('composeIntroDurationChange', typeof v === 'number' ? v : 3)"
          />
        </div>
      </div>
      <div class="opt-row opt-row-wrap">
        <div class="opt-item opt-item-fill">
          <span class="label">片尾图</span>
          <el-input
            :model-value="composeOutroPath"
            size="small"
            placeholder="可选：片尾静图路径"
            class="w-5xl"
            @update:model-value="(v: string) => emit('composeOutroPathChange', v)"
          />
          <el-button size="small" @click="emit('selectComposeOutroImage')">浏览</el-button>
        </div>
        <div class="opt-item">
          <span class="label">时长秒</span>
          <el-input-number
            :model-value="composeOutroDuration"
            :min="0.1"
            :max="3600"
            :step="0.5"
            :precision="1"
            size="small"
            controls-position="right"
            class="w-lg"
            @change="(v: number | undefined) => emit('composeOutroDurationChange', typeof v === 'number' ? v : 3)"
          />
        </div>
      </div>
      <div class="opt-row opt-row-wrap">
        <div class="opt-item opt-item-fill">
          <span class="label">叠加图</span>
          <el-input
            :model-value="composeOverlayPath"
            size="small"
            placeholder="可选：叠到主视频上的图片"
            class="w-5xl"
            @update:model-value="(v: string) => emit('composeOverlayPathChange', v)"
          />
          <el-button size="small" @click="emit('selectComposeOverlayImage')">浏览</el-button>
        </div>
        <div class="opt-item">
          <span class="label">位置</span>
          <el-select
            :model-value="composeOverlayPosition"
            size="small"
            class="w-2xl"
            @change="(v: WatermarkPosition) => emit('composeOverlayPositionChange', v)"
          >
            <el-option
              v-for="opt in WATERMARK_POSITION_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
        <div class="opt-item" title="0–1">
          <span class="label">透明度</span>
          <el-input-number
            :model-value="composeOverlayOpacity"
            :min="0"
            :max="1"
            :step="0.1"
            :precision="2"
            size="small"
            controls-position="right"
            class="w-lg"
            @change="(v: number | undefined) => emit('composeOverlayOpacityChange', typeof v === 'number' ? v : 0.8)"
          />
        </div>
        <div class="opt-item" title="相对视频短边宽度 %">
          <span class="label">缩放%</span>
          <el-input-number
            :model-value="composeOverlayScalePercent"
            :min="1"
            :max="100"
            :step="1"
            size="small"
            controls-position="right"
            class="w-lg"
            @change="(v: number | undefined) => emit('composeOverlayScalePercentChange', typeof v === 'number' ? v : 15)"
          />
        </div>
        <div class="opt-item">
          <span class="label">边距</span>
          <el-input-number
            :model-value="composeOverlayMargin"
            :min="0"
            :max="500"
            :step="1"
            size="small"
            controls-position="right"
            class="w-lg"
            @change="(v: number | undefined) => emit('composeOverlayMarginChange', typeof v === 'number' ? v : 16)"
          />
        </div>
        <div class="opt-item" title="0 表示从开头">
          <span class="label">起秒</span>
          <el-input-number
            :model-value="composeOverlayStartSec"
            :min="0"
            :max="86400"
            :step="0.5"
            :precision="1"
            size="small"
            controls-position="right"
            class="w-lg"
            @change="(v: number | undefined) => emit('composeOverlayStartSecChange', typeof v === 'number' ? v : 0)"
          />
        </div>
        <div class="opt-item" title="0 表示到结尾">
          <span class="label">止秒</span>
          <el-input-number
            :model-value="composeOverlayEndSec"
            :min="0"
            :max="86400"
            :step="0.5"
            :precision="1"
            size="small"
            controls-position="right"
            class="w-lg"
            @change="(v: number | undefined) => emit('composeOverlayEndSecChange', typeof v === 'number' ? v : 0)"
          />
        </div>
      </div>
    </template>

    <div v-if="taskMode === 'image-stitch'" class="opt-row opt-row-wrap">
      <div class="opt-item">
        <span class="label">布局</span>
        <el-select
          :model-value="imageLayout"
          size="small"
          class="w-2xl"
          @change="(v: 'horizontal' | 'vertical' | 'grid') => emit('imageLayoutChange', v)"
        >
          <el-option
            v-for="opt in IMAGE_LAYOUT_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>
      <div v-if="imageLayout === 'grid'" class="opt-item">
        <span class="label">列数</span>
        <el-input-number
          :model-value="imageGridCols"
          :min="1"
          :max="20"
          :step="1"
          size="small"
          controls-position="right"
          class="w-lg"
          @change="(v: number | undefined) => emit('imageGridColsChange', typeof v === 'number' ? v : 2)"
        />
      </div>
      <div class="opt-item">
        <span class="label">间距</span>
        <el-input-number
          :model-value="imageGap"
          :min="0"
          :max="500"
          :step="1"
          size="small"
          controls-position="right"
          class="w-lg"
          @change="(v: number | undefined) => emit('imageGapChange', typeof v === 'number' ? v : 0)"
        />
        <span class="hint-inline">px</span>
      </div>
      <div class="opt-item">
        <span class="label">背景</span>
        <el-input
          :model-value="imageBackground"
          size="small"
          placeholder="#000000"
          class="w-3xl"
          @update:model-value="(v: string) => emit('imageBackgroundChange', v)"
        />
      </div>
    </div>

    <!-- 第二行：输出位置 / 命名 -->
    <div class="opt-row opt-row-output">
      <div class="opt-item opt-output">
        <span class="label">输出位置</span>
        <el-select
          :model-value="outputDirMode"
          size="small"
          class="w-2xl"
          @change="(v: OutputDirMode) => emit('outputDirModeChange', v)"
        >
          <el-option
            v-for="opt in OUTPUT_DIR_MODE_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <template v-if="outputDirMode !== 'sidecar'">
          <el-button :icon="Folder" size="small" @click="emit('selectOutput')">
            选择目录
          </el-button>
          <span :title="outputDir || '未选择输出目录'" class="path-text output-path">
            {{ outputDir || '未选择输出目录' }}
          </span>
        </template>
        <span v-else class="hint-inline">与源文件同目录</span>
      </div>

      <div class="opt-divider" aria-hidden="true" />

      <div class="opt-item opt-item-fill">
        <span class="label">输出命名</span>
        <el-select
          :model-value="nameSelectValue(nameTemplate, nameTemplateCustom)"
          size="small"
          class="w-4xl"
          @change="(v: string) => emit('nameTemplateChange', v)"
        >
          <el-option
            v-for="opt in NAME_TEMPLATE_OPTIONS"
            :key="opt.id"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-input
          v-if="nameTemplateCustom || nameSelectValue(nameTemplate, nameTemplateCustom) === '__custom__'"
          :model-value="nameTemplate === '__custom__' ? '' : nameTemplate"
          size="small"
          :placeholder="
            isAudioMode
              ? '{name}_audio'
              : isImageMode
                ? '{name}_img'
                : isVideoConcatMode
                  ? '{name}_concat'
                  : isMediaComposeMode
                    ? '{name}_compose'
                    : '{name}_{preset}'
          "
          class="w-4xl name-template-input"
          @update:model-value="(v: string) => emit('customNameTemplateInput', v)"
        />
      </div>
    </div>

    <!-- 高级：编码 / 裁剪 / 体积 / 自定义（图片 / 视频拼接 / 混剪隐藏视频压缩高级项） -->
    <div
      v-if="!isImageMode && !isVideoConcatMode && !isMediaComposeMode"
      class="opt-advanced"
      :class="{ open: advancedOpen }"
    >
      <button
        type="button"
        class="opt-advanced-toggle"
        :aria-expanded="advancedOpen"
        aria-controls="opt-advanced-body"
        @click="advancedOpen = !advancedOpen"
      >
        <span class="opt-advanced-chevron" :class="{ open: advancedOpen }">▸</span>
        <span>{{
          isAudioMode
            ? '高级选项'
            : '高级选项（水印 / 画面裁切 / 目标体积…）'
        }}</span>
        <span class="muted">{{ isAudioMode ? '并发 · 裁剪' : '编码 · 画面 · 水印 · 音频 · 裁剪' }}</span>
      </button>

      <div v-show="advancedOpen" id="opt-advanced-body" class="opt-advanced-body">
        <template v-if="isAudioMode">
          <div class="opt-row">
            <div class="opt-item" :title="CONCURRENCY_HINT">
              <span class="label">并发数</span>
              <el-select
                :model-value="concurrency"
                size="small"
                class="w-xs"
                @change="(v: number) => emit('concurrencyChange', v)"
              >
                <el-option
                  v-for="n in CONCURRENCY_OPTIONS"
                  :key="n"
                  :label="String(n)"
                  :value="n"
                />
              </el-select>
            </div>

            <div class="opt-divider" aria-hidden="true" />

            <div class="opt-item" title="0 = 不裁剪 / 到结尾">
              <span class="label">裁剪</span>
              <span class="hint-inline">开始(秒)</span>
              <el-input-number
                :model-value="trimStart"
                :min="0"
                :max="86400"
                :step="1"
                :precision="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('trimStartChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">结束(秒)</span>
              <el-input-number
                :model-value="trimEnd"
                :min="0"
                :max="86400"
                :step="1"
                :precision="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('trimEndChange', typeof v === 'number' ? v : 0)"
              />
            </div>
          </div>
        </template>

        <template v-else-if="isVideoCompressMode || isVideoConcatMode || isMediaComposeMode">
          <div class="opt-row">
            <div class="opt-item" :title="encoderTitle(isWebm && isVideoCompressMode, encoderInfo)">
              <span class="label">编码器</span>
              <el-select
                :disabled="isWebm && isVideoCompressMode"
                :model-value="encoder"
                size="small"
                class="w-4xl"
                @change="(v: EncoderId) => emit('encoderChange', v)"
              >
                <el-option
                  v-for="opt in ENCODER_OPTIONS"
                  :key="opt.value"
                  :label="encoderOptionLabel(opt)"
                  :value="opt.value"
                  :disabled="!isEncoderOptionAvailable(opt.value)"
                />
              </el-select>
              <span v-if="encoderChips.length" class="encoder-chips">
                <span
                  v-for="c in encoderChips"
                  :key="c.key"
                  class="encoder-chip"
                  :class="{ ok: c.ok, bad: !c.ok }"
                >
                  {{ c.label }}{{ c.ok ? '✓' : '–' }}
                </span>
              </span>
            </div>

            <template v-if="isVideoCompressMode">
              <div
                class="opt-item"
                :title="isWebm ? 'WebM 不适用' : 'Main@L4 利于旧设备/微信'"
              >
                <span class="label">兼容档</span>
                <el-select
                  :disabled="isWebm"
                  :model-value="compatProfile"
                  size="small"
                  class="w-4xl"
                  @change="(v: CompatProfile) => emit('compatProfileChange', v)"
                >
                  <el-option
                    v-for="opt in COMPAT_PROFILE_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>

              <div class="opt-divider" aria-hidden="true" />

              <div class="opt-item" title="仅软件 x264/x265 生效；越慢越好">
                <span class="label">编码速度</span>
                <el-select
                  :model-value="encodePreset"
                  size="small"
                  class="w-2xl"
                  @change="(v: EncodePreset) => emit('encodePresetChange', v)"
                >
                  <el-option
                    v-for="opt in ENCODE_PRESET_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>

              <div class="opt-item" :title="CONCURRENCY_HINT">
                <span class="label">并发数</span>
                <el-select
                  :model-value="concurrency"
                  size="small"
                  class="w-xs"
                  @change="(v: number) => emit('concurrencyChange', v)"
                >
                  <el-option
                    v-for="n in CONCURRENCY_OPTIONS"
                    :key="n"
                    :label="String(n)"
                    :value="n"
                  />
                </el-select>
              </div>
            </template>
          </div>

          <template v-if="isVideoCompressMode">
          <div class="opt-row">
            <div class="opt-item" title="90° 竖→横；180° 上下颠倒">
              <span class="label">旋转</span>
              <el-select
                :model-value="rotate90"
                size="small"
                class="w-5xl"
                @change="(v: Rotate90) => emit('rotate90Change', v)"
              >
                <el-option
                  v-for="opt in ROTATE90_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>

            <div class="opt-item">
              <span class="label">帧率</span>
              <el-select
                :model-value="fps"
                size="small"
                class="w-2xl"
                @change="(v: FpsMode) => emit('fpsChange', v)"
              >
                <el-option
                  v-for="opt in FPS_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>

            <div class="opt-divider" aria-hidden="true" />

            <div class="opt-item">
              <span class="label">目标体积</span>
              <el-input-number
                :model-value="targetSizeMb"
                :min="0"
                :max="10240"
                :step="1"
                :precision="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('targetSizeMbChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">MB，0=不限制</span>
            </div>

            <div v-if="targetSizeMb > 0" class="opt-item" title="仅软件 x264/VP9；硬件自动单遍">
              <span class="label">两遍编码</span>
              <el-switch
                :model-value="twoPass"
                size="small"
                @change="(v: string | number | boolean) => emit('twoPassChange', Boolean(v))"
              />
              <span class="hint-inline">更准更慢</span>
            </div>

            <template v-if="isCustom">
              <div class="opt-divider" aria-hidden="true" />

              <div class="opt-item">
                <span class="label">缩放模式</span>
                <el-select
                  :model-value="scaleMode"
                  size="small"
                  class="w-2xl"
                  @change="(v: ScaleMode) => emit('scaleModeChange', v)"
                >
                  <el-option
                    v-for="opt in SCALE_MODE_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
              <div class="opt-item">
                <span class="label">CRF</span>
                <el-input-number v-model="custom.crf" :max="51" :min="0" :step="1" size="small" />
              </div>
              <div v-if="scaleMode === 'maxEdge'" class="opt-item">
                <span class="label">最长边</span>
                <el-input-number
                  v-model="custom.maxEdge"
                  :max="7680"
                  :min="0"
                  :step="2"
                  size="small"
                />
                <span class="hint-inline">0 = 不缩放</span>
              </div>
              <template v-if="scaleMode === 'fixed'">
                <div class="opt-item">
                  <span class="label">宽</span>
                  <el-input-number
                    :model-value="outWidth"
                    :min="2"
                    :max="7680"
                    :step="2"
                    size="small"
                    controls-position="right"
                    class="w-lg"
                    @change="(v: number | undefined) => emit('outWidthChange', typeof v === 'number' && v > 0 ? v : 1920)"
                  />
                </div>
                <div class="opt-item">
                  <span class="label">高</span>
                  <el-input-number
                    :model-value="outHeight"
                    :min="2"
                    :max="7680"
                    :step="2"
                    size="small"
                    controls-position="right"
                    class="w-lg"
                    @change="(v: number | undefined) => emit('outHeightChange', typeof v === 'number' && v > 0 ? v : 1080)"
                  />
                </div>
              </template>
              <template v-if="scaleMode === 'aspect'">
                <div class="opt-item">
                  <span class="label">比例</span>
                  <el-select
                    :model-value="aspectRatio"
                    size="small"
                    class="w-2xl"
                    @change="(v: AspectRatioId) => emit('aspectRatioChange', v)"
                  >
                    <el-option
                      v-for="opt in ASPECT_RATIO_OPTIONS"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                </div>
                <div class="opt-item">
                  <span class="label">目标宽</span>
                  <el-input-number
                    :model-value="outWidth"
                    :min="0"
                    :max="7680"
                    :step="2"
                    size="small"
                    controls-position="right"
                    class="w-lg"
                    @change="(v: number | undefined) => emit('outWidthChange', typeof v === 'number' ? Math.max(0, v) : 0)"
                  />
                  <span class="hint-inline">优先；0 时用最长边</span>
                </div>
                <div class="opt-item">
                  <span class="label">最长边</span>
                  <el-input-number
                    v-model="custom.maxEdge"
                    :max="7680"
                    :min="0"
                    :step="2"
                    size="small"
                  />
                  <span class="hint-inline">宽未设时作长边</span>
                </div>
              </template>
              <div
                v-if="scaleMode === 'fixed' || scaleMode === 'aspect'"
                class="opt-item"
              >
                <span class="label">填充</span>
                <el-select
                  :model-value="scalePad"
                  size="small"
                  class="w-2xl"
                  @change="(v: ScalePadMode) => emit('scalePadChange', v)"
                >
                  <el-option
                    v-for="opt in SCALE_PAD_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
              <div class="opt-item">
                <span class="label">格式</span>
                <el-select v-model="custom.format" size="small" class="w-5xl">
                  <el-option
                    v-for="opt in OUTPUT_FORMAT_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
            </template>
          </div>

          <div class="opt-row opt-row-wrap">
            <div class="opt-item">
              <span class="label">水印</span>
              <el-select
                :model-value="watermarkMode"
                size="small"
                class="w-2xl"
                @change="(v: WatermarkMode) => emit('watermarkModeChange', v)"
              >
                <el-option
                  v-for="opt in WATERMARK_MODE_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>

            <template v-if="watermarkMode === 'image'">
              <div class="opt-item opt-item-fill">
                <el-input
                  :model-value="watermarkImagePath"
                  size="small"
                  placeholder="图片路径"
                  class="w-5xl"
                  @update:model-value="(v: string) => emit('watermarkImagePathChange', v)"
                />
                <el-button size="small" @click="emit('selectWatermarkImage')">浏览</el-button>
              </div>
              <div class="opt-item" title="相对视频短边宽度 %">
                <span class="label">缩放%</span>
                <el-input-number
                  :model-value="watermarkScalePercent"
                  :min="1"
                  :max="100"
                  :step="1"
                  size="small"
                  controls-position="right"
                  class="w-lg"
                  @change="(v: number | undefined) => emit('watermarkScalePercentChange', typeof v === 'number' ? v : 15)"
                />
              </div>
            </template>

            <template v-if="watermarkMode === 'text'">
              <div class="opt-item opt-item-fill">
                <el-input
                  :model-value="watermarkText"
                  size="small"
                  placeholder="水印文字"
                  class="w-5xl"
                  @update:model-value="(v: string) => emit('watermarkTextChange', v)"
                />
              </div>
              <div class="opt-item">
                <span class="label">字号</span>
                <el-input-number
                  :model-value="watermarkFontSize"
                  :min="8"
                  :max="200"
                  :step="1"
                  size="small"
                  controls-position="right"
                  class="w-lg"
                  @change="(v: number | undefined) => emit('watermarkFontSizeChange', typeof v === 'number' ? v : 24)"
                />
              </div>
            </template>

            <template v-if="watermarkMode !== 'none'">
              <div class="opt-item">
                <span class="label">位置</span>
                <el-select
                  :model-value="watermarkPosition"
                  size="small"
                  class="w-2xl"
                  @change="(v: WatermarkPosition) => emit('watermarkPositionChange', v)"
                >
                  <el-option
                    v-for="opt in WATERMARK_POSITION_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
              <div class="opt-item" title="0–1">
                <span class="label">透明度</span>
                <el-input-number
                  :model-value="watermarkOpacity"
                  :min="0"
                  :max="1"
                  :step="0.1"
                  :precision="2"
                  size="small"
                  controls-position="right"
                  class="w-lg"
                  @change="(v: number | undefined) => emit('watermarkOpacityChange', typeof v === 'number' ? v : 0.8)"
                />
              </div>
              <div class="opt-item">
                <span class="label">边距</span>
                <el-input-number
                  :model-value="watermarkMargin"
                  :min="0"
                  :max="500"
                  :step="1"
                  size="small"
                  controls-position="right"
                  class="w-lg"
                  @change="(v: number | undefined) => emit('watermarkMarginChange', typeof v === 'number' ? v : 16)"
                />
              </div>
            </template>
          </div>

          <div class="opt-row">
            <div class="opt-item" title="去掉音轨">
              <span class="label">静音</span>
              <el-switch
                :model-value="muteAudio"
                size="small"
                @change="(v: string | number | boolean) => emit('muteAudioChange', Boolean(v))"
              />
            </div>

            <div v-if="!muteAudio" class="opt-item">
              <span class="label">音轨码率</span>
              <el-select
                :model-value="videoAudioBitrate"
                size="small"
                class="w-md"
                @change="(v: string) => emit('videoAudioBitrateChange', v)"
              >
                <el-option
                  v-for="br in AUDIO_BITRATE_OPTIONS"
                  :key="br"
                  :label="br"
                  :value="br"
                />
              </el-select>
            </div>

            <div class="opt-divider" aria-hidden="true" />

            <div class="opt-item" title="0 = 不裁剪 / 到结尾">
              <span class="label">时间裁剪</span>
              <span class="hint-inline">开始(秒)</span>
              <el-input-number
                :model-value="trimStart"
                :min="0"
                :max="86400"
                :step="1"
                :precision="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('trimStartChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">结束(秒)</span>
              <el-input-number
                :model-value="trimEnd"
                :min="0"
                :max="86400"
                :step="1"
                :precision="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('trimEndChange', typeof v === 'number' ? v : 0)"
              />
            </div>
          </div>

          <div class="opt-row opt-row-wrap">
            <div class="opt-item">
              <el-button
                size="small"
                type="primary"
                plain
                :disabled="!mosaicEditable"
                @click="emit('editMosaics')"
              >
                视频打码
              </el-button>
              <span class="hint-inline">仅编辑当前选中的视频</span>
            </div>
          </div>

          <div class="opt-row opt-row-wrap">
            <button
              type="button"
              class="opt-advanced-toggle crop-toggle"
              :aria-expanded="videoCropOpen"
              @click="videoCropOpen = !videoCropOpen"
            >
              <span class="opt-advanced-chevron" :class="{ open: videoCropOpen }">▸</span>
              <span>画面裁切</span>
              <span class="muted">原图像素，宽高为 0 表示不裁切</span>
            </button>
          </div>
          <div v-show="videoCropOpen" class="opt-row opt-row-wrap">
            <div class="opt-item">
              <span class="hint-inline">X</span>
              <el-input-number
                :model-value="cropX"
                :min="0"
                :max="20000"
                :step="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('cropXChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">Y</span>
              <el-input-number
                :model-value="cropY"
                :min="0"
                :max="20000"
                :step="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('cropYChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">宽</span>
              <el-input-number
                :model-value="cropW"
                :min="0"
                :max="20000"
                :step="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('cropWChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">高</span>
              <el-input-number
                :model-value="cropH"
                :min="0"
                :max="20000"
                :step="1"
                size="small"
                controls-position="right"
                class="w-lg"
                @change="(v: number | undefined) => emit('cropHChange', typeof v === 'number' ? v : 0)"
              />
              <el-button size="small" type="primary" plain @click="openVisualCrop">
                可视化裁切
              </el-button>
            </div>
          </div>
          </template>
        </template>
      </div>
    </div>

    <!-- 图片 / 拼接 / 混剪：仅并发 -->
    <div v-if="isImageMode || isVideoConcatMode || isMediaComposeMode" class="opt-row">
      <div class="opt-item" :title="CONCURRENCY_HINT">
        <span class="label">并发数</span>
        <el-select
          :model-value="concurrency"
          size="small"
          class="w-xs"
          @change="(v: number) => emit('concurrencyChange', v)"
        >
          <el-option
            v-for="n in CONCURRENCY_OPTIONS"
            :key="n"
            :label="String(n)"
            :value="n"
          />
        </el-select>
      </div>
    </div>

    <ImageCropDialog
      v-model="cropDialogOpen"
      :image-path="cropDialogPath"
      :crop="cropModel"
      :title="cropDialogTitle"
      :hint="cropDialogHint"
      :initial-data-url="cropDialogInitialDataUrl"
      :natural-width="cropDialogNaturalW"
      :natural-height="cropDialogNaturalH"
      :video-path="cropDialogVideoPath"
      :frame-time-sec="cropDialogTimeSec"
      @confirm="onCropDialogConfirm"
    />
  </div>
</template>

<style scoped>
.options-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: 10px;
  min-width: 0;
}

.crop-compose-alert,
.compose-empty-alert {
  margin-bottom: 10px;
}

.encoder-chips {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-left: 2px;
}

.encoder-chip {
  display: inline-block;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 11px;
  line-height: 18px;
  background: color-mix(in srgb, var(--app-fg) 8%, transparent);
  color: var(--app-fg-muted);
}

.encoder-chip.ok {
  color: var(--status-ok, var(--el-color-success));
  background: color-mix(in srgb, var(--el-color-success) 14%, transparent);
}

.encoder-chip.bad {
  opacity: 0.65;
}

.options-header-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.options-title {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--app-fg);
  white-space: nowrap;
}

.options-desc {
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.opt-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 12px 14px;
  min-width: 0;
}

.opt-row + .opt-row {
  margin-top: 10px;
  padding-top: 10px;
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, var(--panel-border) 80%, transparent);
}

.opt-row-wrap {
  flex-wrap: wrap;
}

.opt-divider {
  width: 1px;
  height: 22px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--panel-border) 90%, transparent);
}

.opt-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: nowrap;
  min-height: 28px;
  min-width: 0;
}

.opt-item-fill {
  flex: 1 1 auto;
}

.opt-output {
  flex: 1 1 42%;
  min-width: 0;
}

.opt-output .output-path {
  flex: 1 1 120px;
  min-width: 0;
  max-width: 420px;
}

.opt-advanced {
  margin-top: 10px;
  padding-top: 6px;
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, var(--panel-border) 80%, transparent);
}

.opt-advanced-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--app-fg-secondary);
  font-size: var(--fs-md);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s,
    color 0.15s;
}

.opt-advanced-toggle:hover {
  background: color-mix(in srgb, var(--app-fg) var(--overlay-soft), transparent);
  color: var(--app-fg);
}

.opt-advanced-toggle:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.opt-advanced-toggle .muted {
  font-weight: 400;
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
}

.opt-advanced-chevron {
  display: inline-block;
  width: 1em;
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  transition: transform 0.15s ease;
  transform: rotate(0deg);
}

.opt-advanced-chevron.open {
  transform: rotate(90deg);
}

.opt-advanced-body {
  padding: 10px 0 2px;
}

.name-template-input {
  min-width: 140px;
}

.w-quality {
  width: 120px;
  margin: 0 8px;
}

.crop-toggle {
  width: auto;
  padding-left: 0;
}

@media (max-width: 1100px) {
  .opt-row {
    flex-wrap: wrap;
  }

  .opt-divider {
    display: none;
  }

  .opt-output,
  .opt-item-fill {
    flex: 1 1 100%;
  }
}
</style>
