import { computed, reactive, ref, watch, type WatchStopHandle } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CONCURRENCY_HINT,
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_AUDIO_NAME_TEMPLATE,
  DEFAULT_NAME_TEMPLATE,
  type AppSettings,
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
  type TaskMode,
  type ThemeMode,
  type WatermarkMode,
  type WatermarkPosition
} from '@shared/types'

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
    if (taskMode.value !== 'audio' && watermarkMode.value !== 'none') {
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
        imagemagickPath: imagemagickPath.value
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
    nameTemplate.value = s.nameTemplate || DEFAULT_NAME_TEMPLATE
    // 若模板不在预设列表中，视为自定义
    const presets = [
      '{name}_compressed',
      '{name}_audio',
      '{name}_{preset}',
      '{name}_{date}'
    ]
    nameTemplateCustom.value = !presets.includes(nameTemplate.value)
    outputDirMode.value =
      s.outputDirMode === 'sidecar' || s.outputDirMode === 'dated'
        ? s.outputDirMode
        : 'fixed'
    targetSizeMb.value =
      typeof s.targetSizeMb === 'number' && Number.isFinite(s.targetSizeMb)
        ? Math.max(0, s.targetSizeMb)
        : 0
    twoPass.value = typeof s.twoPass === 'boolean' ? s.twoPass : true
    taskMode.value = s.taskMode === 'audio' ? 'audio' : 'compress'
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
      enc === 'nvenc' || enc === 'qsv' || enc === 'amf' || enc === 'videotoolbox'
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
   * 切换任务模式；若仍是默认压缩模板则切到 audio 时自动改为 {name}_audio
   */
  function onTaskModeChange(mode: TaskMode): void {
    taskMode.value = mode
    if (mode === 'audio' && nameTemplate.value === DEFAULT_NAME_TEMPLATE) {
      nameTemplate.value = DEFAULT_AUDIO_NAME_TEMPLATE
      nameTemplateCustom.value = false
    } else if (mode === 'compress' && nameTemplate.value === DEFAULT_AUDIO_NAME_TEMPLATE) {
      nameTemplate.value = DEFAULT_NAME_TEMPLATE
      nameTemplateCustom.value = false
    }
    persist({
      taskMode: mode,
      nameTemplate: nameTemplate.value
    })
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

  async function onSelectOutput(): Promise<void> {
    const res = await window.electronAPI.selectDirectory()
    if (res.path) {
      outputDir.value = res.path
      persist({ outputDir: res.path })
    }
  }

  /** 监听自定义参数变更：同步 pending 任务并持久化 */
  function startWatchers(): void {
    stopCustomWatch?.()
    stopCustomWatch = watch(
      () => [custom.crf, custom.maxEdge, custom.format] as const,
      () => {
        if (presetId.value === 'custom') {
          options.onOptionsChange?.()
        }
        persist({
          customCrf: custom.crf,
          customMaxEdge: custom.maxEdge,
          customFormat: custom.format
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
    currentPreset,
    isCustom,
    isWebm,
    isAudioMode,
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
    onSelectWatermarkImage,
    onSelectOutput,
    startWatchers,
    stopWatchers
  }
}
