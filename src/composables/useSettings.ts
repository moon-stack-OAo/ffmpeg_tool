import { computed, reactive, ref, watch, type WatchStopHandle } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CONCURRENCY_HINT,
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_AUDIO_NAME_TEMPLATE,
  DEFAULT_COMPOSE_NAME_TEMPLATE,
  DEFAULT_CONCAT_NAME_TEMPLATE,
  DEFAULT_IMAGE_NAME_TEMPLATE,
  DEFAULT_NAME_TEMPLATE,
  type AppSettings,
  type AspectRatioId,
  type AudioFormat,
  type CloseAction,
  type CompatProfile,
  type CompressOptions,
  DEFAULT_PRESETS,
  DEFAULT_VIDEO_AUDIO_BITRATE,
  type EncodePreset,
  type EncoderId,
  type FpsMode,
  type ImageEngineId,
  type OutputDirMode,
  type OutputFormat,
  type PresetId,
  type Rotate90,
  type ScaleMode,
  type ScalePadMode,
  type TaskMode,
  type ThemeMode,
  type WatermarkMode,
  type WatermarkPosition
} from '@shared/types'

const BUILTIN_NAME_TEMPLATES = new Set([
  DEFAULT_NAME_TEMPLATE,
  DEFAULT_AUDIO_NAME_TEMPLATE,
  DEFAULT_IMAGE_NAME_TEMPLATE,
  DEFAULT_CONCAT_NAME_TEMPLATE,
  DEFAULT_COMPOSE_NAME_TEMPLATE,
  '{name}_{preset}',
  '{name}_{date}'
])

function isImageTaskMode(mode: TaskMode): boolean {
  return mode === 'image' || mode === 'image-crop' || mode === 'image-stitch'
}

export interface UseSettingsOptions {
  /** 压缩参数变更时回调（用于同步待处理任务 options） */
  onOptionsChange?: () => void
}

/** 应用设置：输出目录 / 预设 / 编码器 / 并发 / 命名模板 / 自定义参数 / 任务模式，并持久化 */
export function useSettings(options: UseSettingsOptions = {}) {
  const outputDir = ref('')
  const presetId = ref<PresetId>('standard')
  const encoder = ref<EncoderId>('auto')
  const concurrency = ref(2)
  const nameTemplate = ref(DEFAULT_NAME_TEMPLATE)
  /** 是否使用自定义命名模板（下拉选「自定义」） */
  const nameTemplateCustom = ref(false)
  const outputDirMode = ref<OutputDirMode>('fixed')
  /** 目标体积 MB，0=不限制 */
  const targetSizeMb = ref(0)
  /** 目标体积时是否两遍编码，默认 true */
  const twoPass = ref(true)
  const taskMode = ref<TaskMode>('compress')
  const audioFormat = ref<AudioFormat>('m4a')
  const audioBitrate = ref(DEFAULT_AUDIO_BITRATE)
  const notifyOnComplete = ref(true)
  const persistTasks = ref(true)
  /** 主题：light | dark | system */
  const theme = ref<ThemeMode>('system')
  /** 自定义 ffmpeg bin 目录（含 ffmpeg 与 ffprobe），空串=自动探测 */
  const ffmpegBinDir = ref('')
  /** 图片处理引擎 */
  const imageEngine = ref<ImageEngineId>('sharp')
  /** ImageMagick 路径（全路径或目录），空串=自动探测 */
  const imagemagickPath = ref('')
  /** 图片输出格式（可持久化） */
  const imageFormat = ref<'jpeg' | 'png' | 'webp' | 'keep'>('jpeg')
  /** 图片质量 1–100 */
  const imageQuality = ref(80)
  /** 图片最长边，0=不限制 */
  const imageMaxEdge = ref(1920)
  /** 去掉图片元数据 */
  const imageStrip = ref(true)
  /** 拼接布局 */
  const imageLayout = ref<'horizontal' | 'vertical' | 'grid'>('horizontal')
  /** 网格列数 */
  const imageGridCols = ref(2)
  /** 拼接间距 */
  const imageGap = ref(0)
  /** 拼接背景色 */
  const imageBackground = ref('#000000')
  /** 画面裁切（任务级，不持久化） */
  const cropX = ref(0)
  const cropY = ref(0)
  const cropW = ref(0)
  const cropH = ref(0)
  /** 视频拼接优先流复制 */
  const concatPreferCopy = ref(true)
  /** 图+视频混剪（任务级，不持久化） */
  const composeIntroPath = ref('')
  const composeIntroDuration = ref(3)
  const composeOutroPath = ref('')
  const composeOutroDuration = ref(3)
  const composeOverlayPath = ref('')
  const composeOverlayPosition = ref<WatermarkPosition>('br')
  const composeOverlayOpacity = ref(0.8)
  const composeOverlayScalePercent = ref(15)
  const composeOverlayMargin = ref(16)
  const composeOverlayStartSec = ref(0)
  const composeOverlayEndSec = ref(0)
  const composeFitIntroOutro = ref(true)
  /** 关闭按钮行为：ask | tray | quit */
  const closeAction = ref<CloseAction>('ask')
  /** 裁剪开始秒，0 表示不裁剪（任务级，不持久化到 settings） */
  const trimStart = ref(0)
  /** 裁剪结束秒，0 表示到结尾 */
  const trimEnd = ref(0)
  /** 画面旋转 90°（任务级，不持久化到 settings） */
  const rotate90 = ref<Rotate90>('none')
  /** 去掉音轨（任务级） */
  const muteAudio = ref(false)
  /** H.264 兼容档（任务级） */
  const compatProfile = ref<CompatProfile>('auto')
  /** 视频模式音轨码率（任务级） */
  const videoAudioBitrate = ref(DEFAULT_VIDEO_AUDIO_BITRATE)
  /** 输出帧率（任务级） */
  const fps = ref<FpsMode>('source')
  /** x264 编码速度（任务级） */
  const encodePreset = ref<EncodePreset>('medium')
  /** 水印（任务级，不持久化到 settings） */
  const watermarkMode = ref<WatermarkMode>('none')
  const watermarkImagePath = ref('')
  const watermarkText = ref('')
  const watermarkPosition = ref<WatermarkPosition>('br')
  const watermarkOpacity = ref(0.8)
  const watermarkScalePercent = ref(15)
  const watermarkFontSize = ref(24)
  const watermarkMargin = ref(16)
  const custom = reactive({
    crf: 23,
    maxEdge: 0,
    format: 'mp4' as OutputFormat
  })
  /** 分辨率缩放模式（custom 区；预设仅 maxEdge 兼容） */
  const scaleMode = ref<ScaleMode>('maxEdge')
  const outWidth = ref(1920)
  const outHeight = ref(1080)
  const aspectRatio = ref<AspectRatioId>('16:9')
  const scalePad = ref<ScalePadMode>('black')

  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let stopCustomWatch: WatchStopHandle | undefined
  /** 会话内硬件高并发仅提示一次，避免刷屏 */
  let hwConcurrencyWarned = false

  const currentPreset = computed(() => {
    return DEFAULT_PRESETS.find((p) => p.id === presetId.value) || DEFAULT_PRESETS[1]
  })

  const isCustom = computed(() => presetId.value === 'custom')

  /** 是否选择了 WebM（硬件加速不适用） */
  const isWebm = computed(() => {
    if (presetId.value === 'custom') return custom.format === 'webm'
    return currentPreset.value.format === 'webm'
  })

  /** 是否为仅抽音频模式 */
  const isAudioMode = computed(() => taskMode.value === 'audio')

  /** 是否为图片相关模式 */
  const isImageMode = computed(
    () =>
      taskMode.value === 'image' ||
      taskMode.value === 'image-crop' ||
      taskMode.value === 'image-stitch'
  )

  /** 是否为视频拼接模式 */
  const isVideoConcatMode = computed(() => taskMode.value === 'video-concat')

  /** 是否为图+视频混剪模式 */
  const isMediaComposeMode = computed(() => taskMode.value === 'media-compose')

  /** 是否显示视频压缩高级选项（CRF/编码器等） */
  const isVideoCompressMode = computed(() => taskMode.value === 'compress')

  function buildCropRect():
    | { x: number; y: number; w: number; h: number }
    | undefined {
    const w = cropW.value
    const h = cropH.value
    if (
      typeof w !== 'number' ||
      typeof h !== 'number' ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return undefined
    }
    const x =
      typeof cropX.value === 'number' && Number.isFinite(cropX.value)
        ? Math.max(0, Math.round(cropX.value))
        : 0
    const y =
      typeof cropY.value === 'number' && Number.isFinite(cropY.value)
        ? Math.max(0, Math.round(cropY.value))
        : 0
    return { x, y, w: Math.round(w), h: Math.round(h) }
  }

  function buildOptions(): CompressOptions {
    const p = currentPreset.value
    const trimStartSec =
      typeof trimStart.value === 'number' && trimStart.value > 0
        ? trimStart.value
        : undefined
    const trimEndSec =
      typeof trimEnd.value === 'number' && trimEnd.value > 0
        ? trimEnd.value
        : undefined
    const rotate =
      rotate90.value === 'cw' ||
      rotate90.value === 'ccw' ||
      rotate90.value === '180'
        ? rotate90.value
        : undefined
    const mute = muteAudio.value === true ? true : undefined
    const compat =
      compatProfile.value === 'main-l4' || compatProfile.value === 'high'
        ? compatProfile.value
        : undefined
    const videoBr =
      videoAudioBitrate.value &&
      videoAudioBitrate.value !== DEFAULT_VIDEO_AUDIO_BITRATE
        ? videoAudioBitrate.value
        : undefined
    const fpsMode =
      fps.value === '24' || fps.value === '30' || fps.value === '60'
        ? fps.value
        : undefined
    const preset =
      encodePreset.value === 'fast' || encodePreset.value === 'slow'
        ? encodePreset.value
        : undefined
    const target =
      typeof targetSizeMb.value === 'number' &&
      Number.isFinite(targetSizeMb.value) &&
      targetSizeMb.value > 0
        ? targetSizeMb.value
        : undefined
    let watermark: CompressOptions['watermark']
    if (
      taskMode.value === 'compress' &&
      watermarkMode.value !== 'none'
    ) {
      const opacity =
        typeof watermarkOpacity.value === 'number' &&
        Number.isFinite(watermarkOpacity.value)
          ? Math.max(0, Math.min(1, watermarkOpacity.value))
          : 0.8
      const margin =
        typeof watermarkMargin.value === 'number' &&
        Number.isFinite(watermarkMargin.value)
          ? Math.max(0, Math.round(watermarkMargin.value))
          : 16
      if (watermarkMode.value === 'image' && watermarkImagePath.value.trim()) {
        const scalePct =
          typeof watermarkScalePercent.value === 'number' &&
          Number.isFinite(watermarkScalePercent.value)
            ? Math.max(1, Math.min(100, watermarkScalePercent.value))
            : 15
        watermark = {
          mode: 'image',
          imagePath: watermarkImagePath.value.trim(),
          position: watermarkPosition.value || 'br',
          opacity,
          scalePercent: scalePct,
          marginX: margin,
          marginY: margin
        }
      } else if (watermarkMode.value === 'text' && watermarkText.value) {
        const fontSize =
          typeof watermarkFontSize.value === 'number' &&
          Number.isFinite(watermarkFontSize.value) &&
          watermarkFontSize.value > 0
            ? Math.round(watermarkFontSize.value)
            : 24
        watermark = {
          mode: 'text',
          text: watermarkText.value,
          fontSize,
          position: watermarkPosition.value || 'br',
          opacity,
          marginX: margin,
          marginY: margin
        }
      }
    }
    const base: CompressOptions =
      presetId.value === 'custom'
        ? {
            presetId: 'custom',
            crf: custom.crf,
            maxEdge: custom.maxEdge,
            format: custom.format,
            outputDir: outputDir.value,
            encoder: encoder.value,
            nameTemplate: nameTemplate.value,
            outputDirMode: outputDirMode.value,
            targetSizeMb: target,
            twoPass: target != null ? twoPass.value : undefined,
            mode: taskMode.value,
            audioFormat: audioFormat.value,
            audioBitrate: audioBitrate.value,
            trimStart: trimStartSec,
            trimEnd: trimEndSec,
            rotate90: rotate,
            muteAudio: mute,
            compatProfile: compat,
            videoAudioBitrate: videoBr,
            fps: fpsMode,
            encodePreset: preset,
            watermark
          }
        : {
            presetId: p.id,
            crf: p.crf,
            maxEdge: p.maxEdge,
            format: p.format,
            outputDir: outputDir.value,
            encoder: encoder.value,
            nameTemplate: nameTemplate.value,
            outputDirMode: outputDirMode.value,
            targetSizeMb: target,
            twoPass: target != null ? twoPass.value : undefined,
            mode: taskMode.value,
            audioFormat: audioFormat.value,
            audioBitrate: audioBitrate.value,
            trimStart: trimStartSec,
            trimEnd: trimEndSec,
            rotate90: rotate,
            muteAudio: mute,
            compatProfile: compat,
            videoAudioBitrate: videoBr,
            fps: fpsMode,
            encodePreset: preset,
            watermark
          }

    // 分辨率模式：custom 写入完整字段；预设保持仅 maxEdge（兼容）
    if (taskMode.value === 'compress' && presetId.value === 'custom') {
      const sm = scaleMode.value
      base.scaleMode = sm
      if (sm === 'fixed') {
        base.outWidth =
          typeof outWidth.value === 'number' && outWidth.value > 0
            ? Math.round(outWidth.value)
            : undefined
        base.outHeight =
          typeof outHeight.value === 'number' && outHeight.value > 0
            ? Math.round(outHeight.value)
            : undefined
        base.scalePad = scalePad.value === 'none' ? 'none' : 'black'
      } else if (sm === 'aspect') {
        base.aspectRatio = aspectRatio.value
        base.outWidth =
          typeof outWidth.value === 'number' && outWidth.value > 0
            ? Math.round(outWidth.value)
            : undefined
        // aspect 可用 maxEdge 作长边回退
        base.scalePad = scalePad.value === 'none' ? 'none' : 'black'
      } else if (sm === 'none') {
        base.maxEdge = 0
      }
      // maxEdge 模式：沿用 custom.maxEdge
    }

    const cropRect = buildCropRect()
    if (isImageTaskMode(taskMode.value)) {
      base.image = {
        format: imageFormat.value,
        quality: imageQuality.value,
        maxEdge: imageMaxEdge.value,
        strip: imageStrip.value,
        layout: imageLayout.value,
        gridCols: imageGridCols.value,
        gap: imageGap.value,
        background: imageBackground.value || '#000000',
        ...(cropRect ? { crop: cropRect } : {})
      }
      if (cropRect && taskMode.value === 'image-crop') {
        base.crop = cropRect
      }
    } else if (taskMode.value === 'compress' && cropRect) {
      base.crop = cropRect
    }

    if (taskMode.value === 'video-concat') {
      base.concatPreferCopy = concatPreferCopy.value
    }

    if (taskMode.value === 'media-compose') {
      const compose: NonNullable<CompressOptions['compose']> = {}
      if (composeIntroPath.value.trim()) {
        compose.intro = {
          imagePath: composeIntroPath.value.trim(),
          durationSec:
            typeof composeIntroDuration.value === 'number' &&
            composeIntroDuration.value > 0
              ? composeIntroDuration.value
              : 3
        }
      }
      if (composeOutroPath.value.trim()) {
        compose.outro = {
          imagePath: composeOutroPath.value.trim(),
          durationSec:
            typeof composeOutroDuration.value === 'number' &&
            composeOutroDuration.value > 0
              ? composeOutroDuration.value
              : 3
        }
      }
      if (composeOverlayPath.value.trim()) {
        const opacity =
          typeof composeOverlayOpacity.value === 'number' &&
          Number.isFinite(composeOverlayOpacity.value)
            ? Math.max(0, Math.min(1, composeOverlayOpacity.value))
            : 0.8
        const scalePct =
          typeof composeOverlayScalePercent.value === 'number' &&
          Number.isFinite(composeOverlayScalePercent.value)
            ? Math.max(1, Math.min(100, composeOverlayScalePercent.value))
            : 15
        const margin =
          typeof composeOverlayMargin.value === 'number' &&
          Number.isFinite(composeOverlayMargin.value)
            ? Math.max(0, Math.round(composeOverlayMargin.value))
            : 16
        const startSec =
          typeof composeOverlayStartSec.value === 'number' &&
          composeOverlayStartSec.value > 0
            ? composeOverlayStartSec.value
            : undefined
        const endSec =
          typeof composeOverlayEndSec.value === 'number' &&
          composeOverlayEndSec.value > 0
            ? composeOverlayEndSec.value
            : undefined
        compose.overlay = {
          imagePath: composeOverlayPath.value.trim(),
          position: composeOverlayPosition.value || 'br',
          opacity,
          scalePercent: scalePct,
          marginX: margin,
          marginY: margin,
          startSec,
          endSec
        }
      }
      if (composeFitIntroOutro.value === false) {
        compose.fitIntroOutro = false
      }
      base.compose = compose
    }

    return base
  }

  /** 防抖写入主进程设置 */
  function persist(partial?: Partial<{
    outputDir: string
    presetId: PresetId
    encoder: EncoderId
    concurrency: number
    customCrf: number
    customMaxEdge: number
    customFormat: OutputFormat
    scaleMode: ScaleMode
    outWidth: number
    outHeight: number
    aspectRatio: AspectRatioId
    scalePad: ScalePadMode
    nameTemplate: string
    outputDirMode: OutputDirMode
    targetSizeMb: number
    twoPass: boolean
    taskMode: TaskMode
    audioFormat: AudioFormat
    audioBitrate: string
    notifyOnComplete: boolean
    persistTasks: boolean
    theme: ThemeMode
    closeAction: CloseAction
    imageEngine: ImageEngineId
    imagemagickPath: string
    imageFormat: AppSettings['imageFormat']
    imageQuality: number
    imageMaxEdge: number
    imageStrip: boolean
    imageLayout: AppSettings['imageLayout']
    imageGridCols: number
    imageGap: number
    imageBackground: string
    concatPreferCopy: boolean
  }>): void {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const payload = partial ?? {
        outputDir: outputDir.value,
        presetId: presetId.value,
        encoder: encoder.value,
        concurrency: concurrency.value,
        customCrf: custom.crf,
        customMaxEdge: custom.maxEdge,
        customFormat: custom.format,
        scaleMode: scaleMode.value,
        outWidth: outWidth.value,
        outHeight: outHeight.value,
        aspectRatio: aspectRatio.value,
        scalePad: scalePad.value,
        nameTemplate: nameTemplate.value,
        outputDirMode: outputDirMode.value,
        targetSizeMb: targetSizeMb.value,
        twoPass: twoPass.value,
        taskMode: taskMode.value,
        audioFormat: audioFormat.value,
        audioBitrate: audioBitrate.value,
        notifyOnComplete: notifyOnComplete.value,
        persistTasks: persistTasks.value,
        theme: theme.value,
        closeAction: closeAction.value,
        imageEngine: imageEngine.value,
        imagemagickPath: imagemagickPath.value,
        imageFormat: imageFormat.value,
        imageQuality: imageQuality.value,
        imageMaxEdge: imageMaxEdge.value,
        imageStrip: imageStrip.value,
        imageLayout: imageLayout.value,
        imageGridCols: imageGridCols.value,
        imageGap: imageGap.value,
        imageBackground: imageBackground.value,
        concatPreferCopy: concatPreferCopy.value
      }
      void window.electronAPI.setSettings(payload)
    }, 300)
  }

  function persistNow(partial: Parameters<typeof window.electronAPI.setSettings>[0]): void {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    void window.electronAPI.setSettings(partial)
  }

  /** 用一份设置快照覆盖全部 ref（loadSettings / 重置后复用） */
  function applyLoadedSettings(s: AppSettings): void {
    outputDir.value = s.outputDir || ''
    presetId.value = s.presetId || 'standard'
    encoder.value = s.encoder || 'auto'
    concurrency.value = s.concurrency || 2
    custom.crf = s.customCrf ?? 23
    custom.maxEdge = s.customMaxEdge ?? 0
    custom.format = s.customFormat || 'mp4'
    scaleMode.value =
      s.scaleMode === 'none' ||
      s.scaleMode === 'maxEdge' ||
      s.scaleMode === 'fixed' ||
      s.scaleMode === 'aspect'
        ? s.scaleMode
        : 'maxEdge'
    outWidth.value =
      typeof s.outWidth === 'number' && Number.isFinite(s.outWidth) && s.outWidth > 0
        ? Math.round(s.outWidth)
        : 1920
    outHeight.value =
      typeof s.outHeight === 'number' &&
      Number.isFinite(s.outHeight) &&
      s.outHeight > 0
        ? Math.round(s.outHeight)
        : 1080
    aspectRatio.value =
      s.aspectRatio === '16:9' ||
      s.aspectRatio === '9:16' ||
      s.aspectRatio === '1:1' ||
      s.aspectRatio === '4:3'
        ? s.aspectRatio
        : '16:9'
    scalePad.value = s.scalePad === 'none' ? 'none' : 'black'
    nameTemplate.value = s.nameTemplate || DEFAULT_NAME_TEMPLATE
    nameTemplateCustom.value = !BUILTIN_NAME_TEMPLATES.has(nameTemplate.value)
    outputDirMode.value =
      s.outputDirMode === 'sidecar' || s.outputDirMode === 'dated'
        ? s.outputDirMode
        : 'fixed'
    targetSizeMb.value =
      typeof s.targetSizeMb === 'number' && Number.isFinite(s.targetSizeMb)
        ? Math.max(0, s.targetSizeMb)
        : 0
    twoPass.value = typeof s.twoPass === 'boolean' ? s.twoPass : true
    taskMode.value =
      s.taskMode === 'audio' ||
      s.taskMode === 'image' ||
      s.taskMode === 'image-crop' ||
      s.taskMode === 'image-stitch' ||
      s.taskMode === 'video-concat' ||
      s.taskMode === 'media-compose' ||
      s.taskMode === 'compress'
        ? s.taskMode
        : 'compress'
    audioFormat.value = s.audioFormat || 'm4a'
    audioBitrate.value = s.audioBitrate || DEFAULT_AUDIO_BITRATE
    notifyOnComplete.value =
      typeof s.notifyOnComplete === 'boolean' ? s.notifyOnComplete : true
    persistTasks.value =
      typeof s.persistTasks === 'boolean' ? s.persistTasks : true
    theme.value =
      s.theme === 'light' || s.theme === 'dark' || s.theme === 'system'
        ? s.theme
        : 'system'
    ffmpegBinDir.value =
      typeof s.ffmpegBinDir === 'string' ? s.ffmpegBinDir : ''
    imageEngine.value = s.imageEngine === 'imagemagick' ? 'imagemagick' : 'sharp'
    imagemagickPath.value =
      typeof s.imagemagickPath === 'string' ? s.imagemagickPath : ''
    imageFormat.value =
      s.imageFormat === 'png' ||
      s.imageFormat === 'webp' ||
      s.imageFormat === 'keep' ||
      s.imageFormat === 'jpeg'
        ? s.imageFormat
        : 'jpeg'
    imageQuality.value =
      typeof s.imageQuality === 'number' && Number.isFinite(s.imageQuality)
        ? Math.max(1, Math.min(100, Math.round(s.imageQuality)))
        : 80
    imageMaxEdge.value =
      typeof s.imageMaxEdge === 'number' && Number.isFinite(s.imageMaxEdge)
        ? Math.max(0, Math.round(s.imageMaxEdge))
        : 1920
    imageStrip.value = typeof s.imageStrip === 'boolean' ? s.imageStrip : true
    imageLayout.value =
      s.imageLayout === 'vertical' ||
      s.imageLayout === 'grid' ||
      s.imageLayout === 'horizontal'
        ? s.imageLayout
        : 'horizontal'
    imageGridCols.value =
      typeof s.imageGridCols === 'number' && Number.isFinite(s.imageGridCols)
        ? Math.max(1, Math.min(20, Math.round(s.imageGridCols)))
        : 2
    imageGap.value =
      typeof s.imageGap === 'number' && Number.isFinite(s.imageGap)
        ? Math.max(0, Math.round(s.imageGap))
        : 0
    imageBackground.value =
      typeof s.imageBackground === 'string' && s.imageBackground.trim()
        ? s.imageBackground.trim()
        : '#000000'
    concatPreferCopy.value =
      typeof s.concatPreferCopy === 'boolean' ? s.concatPreferCopy : true
    closeAction.value =
      s.closeAction === 'tray' || s.closeAction === 'quit' || s.closeAction === 'ask'
        ? s.closeAction
        : 'ask'
  }

  async function loadSettings(): Promise<void> {
    try {
      const s = await window.electronAPI.getSettings()
      applyLoadedSettings(s)
    } catch {
      // 使用默认值
    }
  }

  /** 设置自定义 ffmpeg bin 目录；空串=清除覆盖（成功时同步本地 ref） */
  async function onSetFfmpegBinDir(dir: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await window.electronAPI.setFfmpegBinDir(dir)
      if (res.ok) {
        ffmpegBinDir.value = (dir || '').trim()
        return { ok: true }
      }
      return { ok: false, error: res.error }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  }

  function onImageEngineChange(v: ImageEngineId): void {
    imageEngine.value = v === 'imagemagick' ? 'imagemagick' : 'sharp'
    persist({ imageEngine: imageEngine.value })
  }

  /** 设置 ImageMagick 路径；空串=清除覆盖 */
  async function onSetMagickPath(p: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await window.electronAPI.setMagickPath(p)
      if (res.ok) {
        imagemagickPath.value = (p || '').trim()
        return { ok: true }
      }
      return { ok: false, error: res.error }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  }

  function onPresetChange(id: PresetId): void {
    presetId.value = id
    const p = DEFAULT_PRESETS.find((x) => x.id === id)
    if (p && id !== 'custom') {
      custom.crf = p.crf
      custom.maxEdge = p.maxEdge
      custom.format = p.format
    }
    persist({
      presetId: id,
      customCrf: custom.crf,
      customMaxEdge: custom.maxEdge,
      customFormat: custom.format
    })
    options.onOptionsChange?.()
  }

  function maybeWarnHwConcurrency(enc: EncoderId, n: number): void {
    const isHw =
      enc === 'auto' ||
      enc === 'nvenc' ||
      enc === 'qsv' ||
      enc === 'amf' ||
      enc === 'videotoolbox' ||
      enc === 'h264_nvenc' ||
      enc === 'h264_qsv' ||
      enc === 'h264_amf' ||
      enc === 'h264_videotoolbox' ||
      enc === 'h264_mf' ||
      enc === 'hevc_nvenc' ||
      enc === 'hevc_qsv' ||
      enc === 'hevc_amf' ||
      enc === 'hevc_videotoolbox' ||
      enc === 'hevc_mf'
    if (isHw && n > 2 && !hwConcurrencyWarned) {
      hwConcurrencyWarned = true
      ElMessage.warning(CONCURRENCY_HINT)
    }
  }

  function onEncoderChange(v: EncoderId): void {
    encoder.value = v
    persist({ encoder: v })
    maybeWarnHwConcurrency(v, concurrency.value)
    options.onOptionsChange?.()
  }

  async function onConcurrencyChange(n: number): Promise<void> {
    concurrency.value = n
    const res = await window.electronAPI.setConcurrency(n)
    concurrency.value = res.concurrency
    persist({ concurrency: res.concurrency })
    maybeWarnHwConcurrency(encoder.value, res.concurrency)
  }

  function onNameTemplateChange(v: string): void {
    if (v === '__custom__') {
      nameTemplateCustom.value = true
      // 保留当前实际模板供编辑
      if (
        nameTemplate.value === '__custom__' ||
        !nameTemplate.value
      ) {
        nameTemplate.value = DEFAULT_NAME_TEMPLATE
      }
    } else {
      nameTemplateCustom.value = false
      nameTemplate.value = v || DEFAULT_NAME_TEMPLATE
    }
    persist({ nameTemplate: nameTemplate.value })
    options.onOptionsChange?.()
  }

  /** 自定义模板字符串编辑 */
  function onCustomNameTemplateInput(v: string): void {
    nameTemplateCustom.value = true
    nameTemplate.value = v || DEFAULT_NAME_TEMPLATE
    persist({ nameTemplate: nameTemplate.value })
    options.onOptionsChange?.()
  }

  function onOutputDirModeChange(v: OutputDirMode): void {
    outputDirMode.value = v || 'fixed'
    persist({ outputDirMode: outputDirMode.value })
    options.onOptionsChange?.()
  }

  function onTargetSizeMbChange(v: number): void {
    targetSizeMb.value =
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
    persist({ targetSizeMb: targetSizeMb.value })
    options.onOptionsChange?.()
  }

  function onTwoPassChange(v: boolean): void {
    twoPass.value = Boolean(v)
    persist({ twoPass: twoPass.value })
    options.onOptionsChange?.()
  }

  function onThemeChange(v: ThemeMode): void {
    theme.value = v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
    persist({ theme: theme.value })
  }

  /**
   * 切换任务模式；若当前是内置默认模板则自动切换到对应模式模板
   */
  function onTaskModeChange(mode: TaskMode): void {
    taskMode.value = mode
    const cur = nameTemplate.value
    const isBuiltin = BUILTIN_NAME_TEMPLATES.has(cur)
    if (isBuiltin) {
      if (isImageTaskMode(mode)) {
        nameTemplate.value = DEFAULT_IMAGE_NAME_TEMPLATE
        nameTemplateCustom.value = false
      } else if (mode === 'video-concat') {
        nameTemplate.value = DEFAULT_CONCAT_NAME_TEMPLATE
        nameTemplateCustom.value = false
      } else if (mode === 'media-compose') {
        nameTemplate.value = DEFAULT_COMPOSE_NAME_TEMPLATE
        nameTemplateCustom.value = false
      } else if (mode === 'audio') {
        nameTemplate.value = DEFAULT_AUDIO_NAME_TEMPLATE
        nameTemplateCustom.value = false
      } else if (mode === 'compress') {
        nameTemplate.value = DEFAULT_NAME_TEMPLATE
        nameTemplateCustom.value = false
      }
    }
    persist({
      taskMode: mode,
      nameTemplate: nameTemplate.value
    })
    options.onOptionsChange?.()
  }

  function onImageFormatChange(v: AppSettings['imageFormat']): void {
    imageFormat.value =
      v === 'png' || v === 'webp' || v === 'keep' || v === 'jpeg' ? v : 'jpeg'
    persist({ imageFormat: imageFormat.value })
    options.onOptionsChange?.()
  }

  function onImageQualityChange(v: number): void {
    imageQuality.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(1, Math.min(100, Math.round(v)))
        : 80
    persist({ imageQuality: imageQuality.value })
    options.onOptionsChange?.()
  }

  function onImageMaxEdgeChange(v: number): void {
    imageMaxEdge.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.round(v))
        : 1920
    persist({ imageMaxEdge: imageMaxEdge.value })
    options.onOptionsChange?.()
  }

  function onImageStripChange(v: boolean): void {
    imageStrip.value = Boolean(v)
    persist({ imageStrip: imageStrip.value })
    options.onOptionsChange?.()
  }

  function onImageLayoutChange(v: AppSettings['imageLayout']): void {
    imageLayout.value =
      v === 'vertical' || v === 'grid' || v === 'horizontal' ? v : 'horizontal'
    persist({ imageLayout: imageLayout.value })
    options.onOptionsChange?.()
  }

  function onImageGridColsChange(v: number): void {
    imageGridCols.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(1, Math.min(20, Math.round(v)))
        : 2
    persist({ imageGridCols: imageGridCols.value })
    options.onOptionsChange?.()
  }

  function onImageGapChange(v: number): void {
    imageGap.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.round(v))
        : 0
    persist({ imageGap: imageGap.value })
    options.onOptionsChange?.()
  }

  function onImageBackgroundChange(v: string): void {
    imageBackground.value =
      typeof v === 'string' && v.trim() ? v.trim() : '#000000'
    persist({ imageBackground: imageBackground.value })
    options.onOptionsChange?.()
  }

  function onCropXChange(v: number): void {
    cropX.value =
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
    options.onOptionsChange?.()
  }

  function onCropYChange(v: number): void {
    cropY.value =
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
    options.onOptionsChange?.()
  }

  function onCropWChange(v: number): void {
    cropW.value =
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
    options.onOptionsChange?.()
  }

  function onCropHChange(v: number): void {
    cropH.value =
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
    options.onOptionsChange?.()
  }

  function onConcatPreferCopyChange(v: boolean): void {
    concatPreferCopy.value = Boolean(v)
    persist({ concatPreferCopy: concatPreferCopy.value })
    options.onOptionsChange?.()
  }

  function onAudioFormatChange(v: AudioFormat): void {
    audioFormat.value = v
    persist({ audioFormat: v })
    options.onOptionsChange?.()
  }

  function onAudioBitrateChange(v: string): void {
    audioBitrate.value = v || DEFAULT_AUDIO_BITRATE
    persist({ audioBitrate: audioBitrate.value })
    options.onOptionsChange?.()
  }

  function onNotifyOnCompleteChange(v: boolean): void {
    notifyOnComplete.value = v
    persist({ notifyOnComplete: v })
  }

  function onPersistTasksChange(v: boolean): void {
    persistTasks.value = v
    persist({ persistTasks: v })
  }

  function onCloseActionChange(v: CloseAction): void {
    closeAction.value =
      v === 'tray' || v === 'quit' || v === 'ask' ? v : 'ask'
    persist({ closeAction: closeAction.value })
  }

  /** 裁剪变更：仅同步 pending 任务，不写入 settings */
  function onTrimStartChange(v: number): void {
    trimStart.value = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
    options.onOptionsChange?.()
  }

  function onTrimEndChange(v: number): void {
    trimEnd.value = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
    options.onOptionsChange?.()
  }

  function onRotate90Change(v: Rotate90): void {
    rotate90.value =
      v === 'cw' || v === 'ccw' || v === '180' ? v : 'none'
    options.onOptionsChange?.()
  }

  function onMuteAudioChange(v: boolean): void {
    muteAudio.value = Boolean(v)
    options.onOptionsChange?.()
  }

  function onCompatProfileChange(v: CompatProfile): void {
    compatProfile.value =
      v === 'main-l4' || v === 'high' ? v : 'auto'
    options.onOptionsChange?.()
  }

  function onVideoAudioBitrateChange(v: string): void {
    videoAudioBitrate.value = v || DEFAULT_VIDEO_AUDIO_BITRATE
    options.onOptionsChange?.()
  }

  function onFpsChange(v: FpsMode): void {
    fps.value = v === '24' || v === '30' || v === '60' ? v : 'source'
    options.onOptionsChange?.()
  }

  function onEncodePresetChange(v: EncodePreset): void {
    encodePreset.value =
      v === 'fast' || v === 'slow' || v === 'medium' ? v : 'medium'
    options.onOptionsChange?.()
  }

  function onWatermarkModeChange(v: WatermarkMode): void {
    watermarkMode.value =
      v === 'image' || v === 'text' ? v : 'none'
    options.onOptionsChange?.()
  }

  function onWatermarkImagePathChange(v: string): void {
    watermarkImagePath.value = typeof v === 'string' ? v : ''
    options.onOptionsChange?.()
  }

  function onWatermarkTextChange(v: string): void {
    watermarkText.value = typeof v === 'string' ? v : ''
    options.onOptionsChange?.()
  }

  function onWatermarkPositionChange(v: WatermarkPosition): void {
    const ok = [
      'tl',
      'tc',
      'tr',
      'ml',
      'mc',
      'mr',
      'bl',
      'bc',
      'br'
    ] as const
    watermarkPosition.value = (ok as readonly string[]).includes(v)
      ? v
      : 'br'
    options.onOptionsChange?.()
  }

  function onWatermarkOpacityChange(v: number): void {
    watermarkOpacity.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.min(1, v))
        : 0.8
    options.onOptionsChange?.()
  }

  function onWatermarkScalePercentChange(v: number): void {
    watermarkScalePercent.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(1, Math.min(100, v))
        : 15
    options.onOptionsChange?.()
  }

  function onWatermarkFontSizeChange(v: number): void {
    watermarkFontSize.value =
      typeof v === 'number' && Number.isFinite(v) && v > 0
        ? Math.round(v)
        : 24
    options.onOptionsChange?.()
  }

  function onWatermarkMarginChange(v: number): void {
    watermarkMargin.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.round(v))
        : 16
    options.onOptionsChange?.()
  }

  async function onSelectWatermarkImage(): Promise<void> {
    try {
      const res = await window.electronAPI.selectImage()
      if (res.path) {
        watermarkImagePath.value = res.path
        if (watermarkMode.value !== 'image') {
          watermarkMode.value = 'image'
        }
        options.onOptionsChange?.()
      }
    } catch {
      // ignore
    }
  }

  function notifyComposeChange(): void {
    options.onOptionsChange?.()
  }

  function onComposeIntroPathChange(v: string): void {
    composeIntroPath.value = typeof v === 'string' ? v : ''
    notifyComposeChange()
  }

  function onComposeIntroDurationChange(v: number): void {
    composeIntroDuration.value =
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 3
    notifyComposeChange()
  }

  function onComposeOutroPathChange(v: string): void {
    composeOutroPath.value = typeof v === 'string' ? v : ''
    notifyComposeChange()
  }

  function onComposeOutroDurationChange(v: number): void {
    composeOutroDuration.value =
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 3
    notifyComposeChange()
  }

  function onComposeOverlayPathChange(v: string): void {
    composeOverlayPath.value = typeof v === 'string' ? v : ''
    notifyComposeChange()
  }

  function onComposeOverlayPositionChange(v: WatermarkPosition): void {
    composeOverlayPosition.value = v || 'br'
    notifyComposeChange()
  }

  function onComposeOverlayOpacityChange(v: number): void {
    composeOverlayOpacity.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.min(1, v))
        : 0.8
    notifyComposeChange()
  }

  function onComposeOverlayScalePercentChange(v: number): void {
    composeOverlayScalePercent.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(1, Math.min(100, v))
        : 15
    notifyComposeChange()
  }

  function onComposeOverlayMarginChange(v: number): void {
    composeOverlayMargin.value =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.round(v))
        : 16
    notifyComposeChange()
  }

  function onComposeOverlayStartSecChange(v: number): void {
    composeOverlayStartSec.value =
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
    notifyComposeChange()
  }

  function onComposeOverlayEndSecChange(v: number): void {
    composeOverlayEndSec.value =
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
    notifyComposeChange()
  }

  function onComposeFitIntroOutroChange(v: boolean): void {
    composeFitIntroOutro.value = Boolean(v)
    notifyComposeChange()
  }

  async function pickComposeImage(
    target: 'intro' | 'outro' | 'overlay'
  ): Promise<void> {
    try {
      const res = await window.electronAPI.selectImage()
      if (!res.path) return
      if (target === 'intro') composeIntroPath.value = res.path
      else if (target === 'outro') composeOutroPath.value = res.path
      else composeOverlayPath.value = res.path
      notifyComposeChange()
    } catch {
      // ignore
    }
  }

  async function onSelectComposeIntroImage(): Promise<void> {
    await pickComposeImage('intro')
  }

  async function onSelectComposeOutroImage(): Promise<void> {
    await pickComposeImage('outro')
  }

  async function onSelectComposeOverlayImage(): Promise<void> {
    await pickComposeImage('overlay')
  }

  async function onSelectOutput(): Promise<void> {
    const res = await window.electronAPI.selectDirectory(outputDir.value || undefined)
    if (res.path) {
      outputDir.value = res.path
      persist({ outputDir: res.path })
    }
  }

  function onScaleModeChange(v: ScaleMode): void {
    scaleMode.value =
      v === 'none' || v === 'maxEdge' || v === 'fixed' || v === 'aspect'
        ? v
        : 'maxEdge'
    persist({ scaleMode: scaleMode.value })
    options.onOptionsChange?.()
  }

  function onOutWidthChange(v: number): void {
    outWidth.value =
      typeof v === 'number' && Number.isFinite(v) && v >= 0
        ? Math.round(v)
        : 1920
    persist({ outWidth: outWidth.value })
    options.onOptionsChange?.()
  }

  function onOutHeightChange(v: number): void {
    outHeight.value =
      typeof v === 'number' && Number.isFinite(v) && v >= 0
        ? Math.round(v)
        : 1080
    persist({ outHeight: outHeight.value })
    options.onOptionsChange?.()
  }

  function onAspectRatioChange(v: AspectRatioId): void {
    aspectRatio.value =
      v === '16:9' || v === '9:16' || v === '1:1' || v === '4:3' ? v : '16:9'
    persist({ aspectRatio: aspectRatio.value })
    options.onOptionsChange?.()
  }

  function onScalePadChange(v: ScalePadMode): void {
    scalePad.value = v === 'none' ? 'none' : 'black'
    persist({ scalePad: scalePad.value })
    options.onOptionsChange?.()
  }

  /** 监听自定义参数变更：同步 pending 任务并持久化 */
  function startWatchers(): void {
    stopCustomWatch?.()
    stopCustomWatch = watch(
      () =>
        [
          custom.crf,
          custom.maxEdge,
          custom.format,
          scaleMode.value,
          outWidth.value,
          outHeight.value,
          aspectRatio.value,
          scalePad.value
        ] as const,
      () => {
        if (presetId.value === 'custom') {
          options.onOptionsChange?.()
        }
        persist({
          customCrf: custom.crf,
          customMaxEdge: custom.maxEdge,
          customFormat: custom.format,
          scaleMode: scaleMode.value,
          outWidth: outWidth.value,
          outHeight: outHeight.value,
          aspectRatio: aspectRatio.value,
          scalePad: scalePad.value
        })
      }
    )
  }

  function stopWatchers(): void {
    stopCustomWatch?.()
    stopCustomWatch = undefined
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
  }

  return {
    outputDir,
    presetId,
    encoder,
    concurrency,
    nameTemplate,
    nameTemplateCustom,
    outputDirMode,
    targetSizeMb,
    twoPass,
    taskMode,
    audioFormat,
    audioBitrate,
    notifyOnComplete,
    persistTasks,
    theme,
    ffmpegBinDir,
    imageEngine,
    imagemagickPath,
    imageFormat,
    imageQuality,
    imageMaxEdge,
    imageStrip,
    imageLayout,
    imageGridCols,
    imageGap,
    imageBackground,
    cropX,
    cropY,
    cropW,
    cropH,
    concatPreferCopy,
    composeIntroPath,
    composeIntroDuration,
    composeOutroPath,
    composeOutroDuration,
    composeOverlayPath,
    composeOverlayPosition,
    composeOverlayOpacity,
    composeOverlayScalePercent,
    composeOverlayMargin,
    composeOverlayStartSec,
    composeOverlayEndSec,
    composeFitIntroOutro,
    closeAction,
    trimStart,
    trimEnd,
    rotate90,
    muteAudio,
    compatProfile,
    videoAudioBitrate,
    fps,
    encodePreset,
    watermarkMode,
    watermarkImagePath,
    watermarkText,
    watermarkPosition,
    watermarkOpacity,
    watermarkScalePercent,
    watermarkFontSize,
    watermarkMargin,
    custom,
    scaleMode,
    outWidth,
    outHeight,
    aspectRatio,
    scalePad,
    currentPreset,
    isCustom,
    isWebm,
    isAudioMode,
    isImageMode,
    isVideoConcatMode,
    isMediaComposeMode,
    isVideoCompressMode,
    buildOptions,
    loadSettings,
    applyLoadedSettings,
    onSetFfmpegBinDir,
    onImageEngineChange,
    onSetMagickPath,
    persist,
    persistNow,
    onPresetChange,
    onEncoderChange,
    onConcurrencyChange,
    onNameTemplateChange,
    onCustomNameTemplateInput,
    onOutputDirModeChange,
    onTargetSizeMbChange,
    onTwoPassChange,
    onThemeChange,
    onTaskModeChange,
    onImageFormatChange,
    onImageQualityChange,
    onImageMaxEdgeChange,
    onImageStripChange,
    onImageLayoutChange,
    onImageGridColsChange,
    onImageGapChange,
    onImageBackgroundChange,
    onCropXChange,
    onCropYChange,
    onCropWChange,
    onCropHChange,
    onConcatPreferCopyChange,
    onAudioFormatChange,
    onAudioBitrateChange,
    onNotifyOnCompleteChange,
    onPersistTasksChange,
    onCloseActionChange,
    onTrimStartChange,
    onTrimEndChange,
    onRotate90Change,
    onMuteAudioChange,
    onCompatProfileChange,
    onVideoAudioBitrateChange,
    onFpsChange,
    onEncodePresetChange,
    onWatermarkModeChange,
    onWatermarkImagePathChange,
    onWatermarkTextChange,
    onWatermarkPositionChange,
    onWatermarkOpacityChange,
    onWatermarkScalePercentChange,
    onWatermarkFontSizeChange,
    onWatermarkMarginChange,
    onScaleModeChange,
    onOutWidthChange,
    onOutHeightChange,
    onAspectRatioChange,
    onScalePadChange,
    onSelectWatermarkImage,
    onComposeIntroPathChange,
    onComposeIntroDurationChange,
    onComposeOutroPathChange,
    onComposeOutroDurationChange,
    onComposeOverlayPathChange,
    onComposeOverlayPositionChange,
    onComposeOverlayOpacityChange,
    onComposeOverlayScalePercentChange,
    onComposeOverlayMarginChange,
    onComposeOverlayStartSecChange,
    onComposeOverlayEndSecChange,
    onComposeFitIntroOutroChange,
    onSelectComposeIntroImage,
    onSelectComposeOutroImage,
    onSelectComposeOverlayImage,
    onSelectOutput,
    startWatchers,
    stopWatchers
  }
}
