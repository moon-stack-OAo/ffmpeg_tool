<script lang="ts" setup>
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import type {AppInfo, ImageEngineStatus, LanStatus} from '@shared/types'
import {IMAGE_EXTENSIONS} from '@shared/types'
import TitleBar from './components/TitleBar.vue'
import CompressOptionsPanel from './components/CompressOptionsPanel.vue'
import DropZone from './components/DropZone.vue'
import CloseConfirmDialog from './components/CloseConfirmDialog.vue'
import SettingsDrawer from './components/SettingsDrawer.vue'
import ShortcutHelpDialog from './components/ShortcutHelpDialog.vue'
import SizeSummaryBar from './components/SizeSummaryBar.vue'
import TaskTable from './components/TaskTable.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import {useDragDrop} from './composables/useDragDrop'
import {useFfmpegStatus} from './composables/useFfmpegStatus'
import {subscribeHotkeys} from './composables/useHotkeys'
import {useSettings} from './composables/useSettings'
import {useTasks} from './composables/useTasks'
import {useTheme} from './composables/useTheme'
import {useUpdater} from './composables/useUpdater'

const {ffmpegStatus, encoderInfo, loadStatus} = useFfmpegStatus()

// 任务依赖 settings，先占位；sync 在 settings 回调里绑定
let syncPendingOptionsRef: (() => void) | undefined

const settings = useSettings({
  onOptionsChange: () => syncPendingOptionsRef?.()
})

const {
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
  theme,
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
  buildOptions,
  loadSettings,
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
  onSelectOutput,
  startWatchers,
  stopWatchers,
  persistTasks,
  ffmpegBinDir,
  imageEngine,
  imagemagickPath,
  applyLoadedSettings,
  onSetFfmpegBinDir,
  onImageEngineChange,
  onSetMagickPath
} = settings

const {
  tasks,
  lastDropOkAt,
  hasPending,
  hasActive,
  sizeSummary,
  addFiles,
  onSelectFiles,
  startOne,
  startAll,
  cancelOne,
  cancelAll,
  clearFinished,
  clearAll,
  removeOne,
  openOutput,
  showInFolder,
  applyOptionsToPending,
  syncPendingOptions,
  loadTasks,
  subscribe: subscribeTasks
} = useTasks({
  buildOptions,
  outputDir,
  ffmpegStatus,
  concurrency,
  persistTasks,
  taskMode
})

syncPendingOptionsRef = syncPendingOptions

/** 可视化裁切预览：取第一个 pending/failed 任务路径 */
const cropPreviewPath = computed(() => {
  const mode = taskMode.value
  if (mode !== 'image-crop' && mode !== 'compress') return ''
  const preferImage = mode === 'image-crop'
  const imageExts = new Set(
    (IMAGE_EXTENSIONS as string[]).map((e) => e.toLowerCase())
  )
  const candidates = tasks.value.filter(
    (t) => t.status === 'pending' || t.status === 'failed'
  )
  for (const t of candidates) {
    const p = (t.inputPath || '').trim()
    if (!p) continue
    const ext = p.includes('.') ? p.slice(p.lastIndexOf('.')).toLowerCase() : ''
    if (preferImage) {
      if (imageExts.has(ext)) return p
    } else {
      return p
    }
  }
  // image-crop 时若无 pending 图，再扫全部任务
  if (preferImage) {
    for (const t of tasks.value) {
      const p = (t.inputPath || '').trim()
      if (!p) continue
      const ext = p.includes('.') ? p.slice(p.lastIndexOf('.')).toLowerCase() : ''
      if (imageExts.has(ext)) return p
    }
  }
  return candidates[0]?.inputPath?.trim() || ''
})

const {
  appVersion,
  isPackaged,
  updateDialogVisible,
  updateChecking,
  updateDownloading,
  updateInfo,
  loadVersion,
  onCheckUpdate,
  onDownloadUpdate,
  onCancelDownload,
  onInstallUpdate,
  subscribe: subscribeUpdater
} = useUpdater()

const {
  dragging,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  subscribe: subscribeDragDrop
} = useDragDrop({
  addFiles,
  lastDropOkAt
})

const {
  start: startTheme,
  stop: stopTheme,
  toggleLightDark
} = useTheme({
  theme,
  setTheme: onThemeChange
})

const appInfo = ref<AppInfo | null>(null)
const imageStatus = ref<ImageEngineStatus | null>(null)
const lanStatus = ref<LanStatus | null>(null)
const lanSaving = ref(false)
const shortcutHelpVisible = ref(false)
const settingsVisible = ref(false)
const closeConfirmVisible = ref(false)

async function refreshLanStatus(): Promise<void> {
  try {
    lanStatus.value = await window.electronAPI.getLanStatus()
  } catch {
    lanStatus.value = null
  }
}

async function onSaveLanConfig(config: {
  enabled?: boolean
  port?: number
  username?: string
  password?: string
}): Promise<void> {
  lanSaving.value = true
  try {
    const res = await window.electronAPI.setLanRemoteConfig(config)
    lanStatus.value = res.status
    if (res.ok) {
      if (config.password) {
        ElMessage.success('远程设置已保存（密码已更新，旧会话已失效）')
      } else if (res.status.running) {
        ElMessage.success('远程访问已开启')
      } else if (config.enabled === false) {
        ElMessage.success('远程访问已关闭')
      } else {
        ElMessage.success('远程设置已保存')
      }
    } else {
      ElMessage.error(res.error || res.status.error || '保存远程设置失败')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage.error(message || '保存远程设置失败')
  } finally {
    lanSaving.value = false
  }
}

async function loadImageStatus(): Promise<void> {
  try {
    imageStatus.value = await window.electronAPI.getImageEngineStatus()
  } catch {
    imageStatus.value = null
  }
}

let cleanupTasks: (() => void) | undefined
let cleanupUpdater: (() => void) | undefined
let cleanupDrag: (() => void) | undefined
let cleanupHotkeys: (() => void) | undefined
let cleanupCloseAsk: (() => void) | undefined
let cleanupTray: (() => void) | undefined

onMounted(async () => {
  // 1) 恢复持久化设置
  await loadSettings()

  // 1.1) 应用主题（依赖已加载的 theme）
  startTheme()

  // 1.2) 应用信息（设置抽屉「关于」展示）
  window.electronAPI
      .getAppInfo()
      .then((i) => {
        appInfo.value = i
      })
      .catch(() => {
        // 忽略失败，抽屉中显示占位
      })

  // 2) 将并发同步到主进程任务队列
  try {
    const res = await window.electronAPI.setConcurrency(concurrency.value)
    concurrency.value = res.concurrency
  } catch {
    // ignore
  }

  // 3) 恢复任务列表（依赖 settings.persistTasks）
  await loadTasks()

  // 4) FFmpeg 状态 + 编码器探测
  await loadStatus()

  // 4.1) 图片引擎状态
  await loadImageStatus()

  // 4.2) 局域网远程状态
  await refreshLanStatus()

  // 5) 版本信息
  await loadVersion()

  // 6) 自定义参数监听（持久化 + 同步 pending）
  startWatchers()

  // 7) 订阅事件
  cleanupTasks = subscribeTasks()
  cleanupUpdater = subscribeUpdater()
  cleanupDrag = subscribeDragDrop()
  cleanupHotkeys = subscribeHotkeys({
    startAll,
    cancelAll,
    onSelectFiles,
    onSelectOutput,
    clearFinished,
    toggleTheme: toggleLightDark,
    showHelp: () => {
      shortcutHelpVisible.value = true
    }
  })
  cleanupCloseAsk = window.electronAPI.onWindowCloseAsk(() => {
    closeConfirmVisible.value = true
  })
  cleanupTray = window.electronAPI.onTrayCommand((cmd) => {
    if (cmd === 'check-update') {
      void onCheckUpdate()
    } else if (cmd === 'open-settings') {
      settingsVisible.value = true
    }
  })
})

onUnmounted(() => {
  stopWatchers()
  stopTheme()
  cleanupTasks?.()
  cleanupUpdater?.()
  cleanupDrag?.()
  cleanupHotkeys?.()
  cleanupCloseAsk?.()
  cleanupTray?.()
})

async function onCloseDecide(
    action: 'tray' | 'quit',
    remember: boolean
): Promise<void> {
  if (remember) {
    onCloseActionChange(action)
  }
  try {
    await window.electronAPI.windowCloseDecision(action, remember)
  } catch {
    // ignore
  }
}

function onCloseCancel(): void {
  void window.electronAPI.windowCloseCancel()
}

/** 浏览并设置自定义 ffmpeg bin 目录 */
async function onBrowseFfmpegDir(): Promise<void> {
  const res = await window.electronAPI.selectDirectory(ffmpegBinDir.value || undefined)
  if (!res.path) return
  const r = await onSetFfmpegBinDir(res.path)
  if (r.ok) {
    ElMessage.success('已设置自定义 ffmpeg 目录')
    await loadStatus()
  } else {
    ElMessage.error(r.error || '设置 ffmpeg 目录失败')
  }
}

/** 清除自定义 bin 目录覆盖（回退自动探测） */
async function onClearFfmpegBinDir(): Promise<void> {
  const r = await onSetFfmpegBinDir('')
  if (r.ok) {
    ElMessage.success('已恢复自动探测 ffmpeg')
    await loadStatus()
  } else {
    ElMessage.error(r.error || '清除 ffmpeg 目录失败')
  }
}

async function onBrowseMagickPath(): Promise<void> {
  const res = await window.electronAPI.selectDirectory(imagemagickPath.value || undefined)
  if (!res.path) return
  const r = await onSetMagickPath(res.path)
  if (r.ok) {
    ElMessage.success('已设置 ImageMagick 路径')
    await loadImageStatus()
  } else {
    ElMessage.error(r.error || '设置 ImageMagick 路径失败')
  }
}

async function onClearMagickPath(): Promise<void> {
  const r = await onSetMagickPath('')
  if (r.ok) {
    ElMessage.success('已清除 ImageMagick 路径覆盖')
    await loadImageStatus()
  } else {
    ElMessage.error(r.error || '清除失败')
  }
}

async function onImageEngineSelect(v: typeof imageEngine.value): Promise<void> {
  onImageEngineChange(v)
  await loadImageStatus()
}

/** 选一张图输出到临时目录，验证当前图片引擎 */
async function onTestImageEngine(): Promise<void> {
  try {
    const pick = await window.electronAPI.selectImage()
    if (!pick.path) return
    const inputPath = pick.path
    const stamp = Date.now()
    const base =
        inputPath.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'test'
    const outDir =
        (typeof window !== 'undefined' &&
            (appInfo.value?.userDataPath
                ? `${appInfo.value.userDataPath}\\image-test`
                : '')) ||
        ''
    // 输出路径由主进程确保目录；userData 不可用时用输入同目录
    const outputPath = outDir
        ? `${outDir}\\${base}_${stamp}.jpg`
        : inputPath.replace(/(\.[^.]+)?$/, `_${stamp}.jpg`)
    const result = await window.electronAPI.processImage({
      inputPath,
      outputPath,
      maxEdge: 1280,
      format: 'jpeg',
      quality: 80,
      strip: true
    })
    if (result.ok && result.outputPath) {
      ElMessage.success(
          `引擎测试成功（${result.engine || imageEngine.value}）→ ${result.width || '?'}×${result.height || '?'}`
      )
      await window.electronAPI.showItemInFolder(result.outputPath)
      await loadImageStatus()
    } else {
      ElMessage.error(result.error || '图片引擎测试失败')
      await loadImageStatus()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage.error(message || '图片引擎测试失败')
  }
}

/** 打开用户数据目录 */
async function onOpenAppData(): Promise<void> {
  const p = appInfo.value?.userDataPath
  if (!p) {
    ElMessage.error('数据目录不可用')
    return
  }
  const res = await window.electronAPI.openPath(p)
  if (!res.ok) {
    ElMessage.error(res.error || '打开数据目录失败')
  }
}

/** 修改用户数据目录（需重启生效） */
async function onChangeDataDir(): Promise<void> {
  const res = await window.electronAPI.selectDirectory(
      appInfo.value?.userDataPath || undefined
  )
  if (!res.path) return
  try {
    const r = await window.electronAPI.setDataDir(res.path)
    if (!r.ok) {
      ElMessage.error(r.error || '修改数据目录失败')
      return
    }
    if (r.restart === false) {
      ElMessage.info('已是当前数据目录')
      return
    }
    if (appInfo.value) {
      appInfo.value = {...appInfo.value, userDataPath: res.path}
    }
    const migrated = r.migrated?.length ?? 0
    const migrateErr = r.migrateErrors?.length ?? 0
    const tip =
        migrated > 0
            ? `已迁移 ${migrated} 项到新目录（缓存类目录已跳过）`
            : '数据目录已更新（无可迁移文件或目标已存在同名文件）'
    if (migrateErr > 0) {
      ElMessage.warning(`${tip}；${migrateErr} 项迁移失败`)
    } else {
      ElMessage.success(`${tip}，重启后完全生效`)
    }
    try {
      await ElMessageBox.confirm(
          '数据目录已切换，设置与任务列表会尽量迁移到新目录（不覆盖已有文件；Chromium 缓存不迁移）。是否立即重启？',
          '重启应用',
          {
            type: 'info',
            confirmButtonText: '立即重启',
            cancelButtonText: '稍后'
          }
      )
      await window.electronAPI.relaunchApp()
    } catch {
      // 用户取消重启
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage.error(message || '修改数据目录失败')
  }
}

/** 清空已持久化任务（磁盘 + 当前列表） */
async function onClearStoredTasks(): Promise<void> {
  const res = await window.electronAPI.clearStoredTasks()
  if (!res.ok) {
    ElMessage.error(res.error || '清空持久化任务失败')
    return
  }
  clearAll()
  ElMessage.success('已清空持久化任务')
}

/** 重置全部设置：覆盖 ref → 应用主题 → 重新探测 ffmpeg */
async function onResetSettings(): Promise<void> {
  try {
    const prevPersistTasks = persistTasks.value
    const s = await window.electronAPI.resetSettings()
    applyLoadedSettings(s)
    // 重置后并发回到默认，需同步主进程队列
    try {
      const res = await window.electronAPI.setConcurrency(concurrency.value)
      concurrency.value = res.concurrency
    } catch {
      // ignore
    }
    startTheme()
    await loadStatus()
    await loadImageStatus()
    await refreshLanStatus()
    if (persistTasks.value !== prevPersistTasks) {
      await loadTasks()
    }
    ElMessage.success('设置已重置')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage.error(message || '重置设置失败')
  }
}
</script>

<template>
  <div
      class="page"
      :class="{ 'page-dragging': dragging }"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover="onDragOver"
      @drop="onDrop"
  >
    <TitleBar
        :app-version="appVersion"
        :ffmpeg-status="ffmpegStatus"
        :update-available="
          updateInfo.state === 'available' || updateInfo.state === 'downloading'
        "
        :update-downloaded="updateInfo.state === 'downloaded'"
        :update-version="updateInfo.version"
        @open-settings="settingsVisible = true"
        @show-shortcuts="shortcutHelpVisible = true"
        @open-update="updateDialogVisible = true"
    />

    <SettingsDrawer
        v-model:visible="settingsVisible"
        :app-info="appInfo"
        :app-version="appVersion"
        :close-action="closeAction"
        :concurrency="concurrency"
        :ffmpeg-bin-dir="ffmpegBinDir"
        :ffmpeg-status="ffmpegStatus"
        :image-engine="imageEngine"
        :imagemagick-path="imagemagickPath"
        :image-status="imageStatus"
        :is-packaged="isPackaged"
        :lan-saving="lanSaving"
        :lan-status="lanStatus"
        :notify-on-complete="notifyOnComplete"
        :persist-tasks="persistTasks"
        :theme="theme"
        :update-checking="updateChecking"
        @browse-ffmpeg-dir="onBrowseFfmpegDir"
        @browse-magick-path="onBrowseMagickPath"
        @change-data-dir="onChangeDataDir"
        @check-update="onCheckUpdate"
        @clear-ffmpeg-bin-dir="onClearFfmpegBinDir"
        @clear-magick-path="onClearMagickPath"
        @clear-stored-tasks="onClearStoredTasks"
        @close-action-change="onCloseActionChange"
        @concurrency-change="onConcurrencyChange"
        @image-engine-change="onImageEngineSelect"
        @notify-on-complete-change="onNotifyOnCompleteChange"
        @open-app-data="onOpenAppData"
        @persist-tasks-change="onPersistTasksChange"
        @re-detect-ffmpeg="loadStatus"
        @re-detect-image="loadImageStatus"
        @refresh-lan-status="refreshLanStatus"
        @reset-settings="onResetSettings"
        @save-lan-config="onSaveLanConfig"
        @test-image-engine="onTestImageEngine"
        @theme-change="onThemeChange"
    />

    <UpdateDialog
        v-model="updateDialogVisible"
        :app-version="appVersion"
        :is-packaged="isPackaged"
        :update-checking="updateChecking"
        :update-downloading="updateDownloading"
        :update-info="updateInfo"
        @check-update="onCheckUpdate"
        @download-update="onDownloadUpdate"
        @cancel-download="onCancelDownload"
        @install-update="onInstallUpdate"
    />

    <ShortcutHelpDialog v-model="shortcutHelpVisible"/>

    <CloseConfirmDialog
        v-model="closeConfirmVisible"
        @cancel="onCloseCancel"
        @decide="onCloseDecide"
    />

    <CompressOptionsPanel
        :audio-bitrate="audioBitrate"
        :audio-format="audioFormat"
        :concurrency="concurrency"
        :custom="custom"
        :encoder="encoder"
        :encoder-info="encoderInfo"
        :is-audio-mode="isAudioMode"
        :is-image-mode="isImageMode"
        :is-video-concat-mode="isVideoConcatMode"
        :is-media-compose-mode="isMediaComposeMode"
        :is-video-compress-mode="isVideoCompressMode"
        :is-custom="isCustom"
        :is-webm="isWebm"
        :name-template="nameTemplate"
        :name-template-custom="nameTemplateCustom"
        :output-dir="outputDir"
        :output-dir-mode="outputDirMode"
        :preset-description="currentPreset.description"
        :preset-id="presetId"
        :target-size-mb="targetSizeMb"
        :task-mode="taskMode"
        :compat-profile="compatProfile"
        :encode-preset="encodePreset"
        :fps="fps"
        :mute-audio="muteAudio"
        :rotate90="rotate90"
        :trim-end="trimEnd"
        :trim-start="trimStart"
        :two-pass="twoPass"
        :video-audio-bitrate="videoAudioBitrate"
        :watermark-mode="watermarkMode"
        :watermark-image-path="watermarkImagePath"
        :watermark-text="watermarkText"
        :watermark-position="watermarkPosition"
        :watermark-opacity="watermarkOpacity"
        :watermark-scale-percent="watermarkScalePercent"
        :watermark-font-size="watermarkFontSize"
        :watermark-margin="watermarkMargin"
        :image-format="imageFormat"
        :image-quality="imageQuality"
        :image-max-edge="imageMaxEdge"
        :image-strip="imageStrip"
        :image-layout="imageLayout"
        :image-grid-cols="imageGridCols"
        :image-gap="imageGap"
        :image-background="imageBackground"
        :crop-x="cropX"
        :crop-y="cropY"
        :crop-w="cropW"
        :crop-h="cropH"
        :crop-preview-path="cropPreviewPath"
        :concat-prefer-copy="concatPreferCopy"
        :compose-intro-path="composeIntroPath"
        :compose-intro-duration="composeIntroDuration"
        :compose-outro-path="composeOutroPath"
        :compose-outro-duration="composeOutroDuration"
        :compose-overlay-path="composeOverlayPath"
        :compose-overlay-position="composeOverlayPosition"
        :compose-overlay-opacity="composeOverlayOpacity"
        :compose-overlay-scale-percent="composeOverlayScalePercent"
        :compose-overlay-margin="composeOverlayMargin"
        :compose-overlay-start-sec="composeOverlayStartSec"
        :compose-overlay-end-sec="composeOverlayEndSec"
        :compose-fit-intro-outro="composeFitIntroOutro"
        :scale-mode="scaleMode"
        :out-width="outWidth"
        :out-height="outHeight"
        :aspect-ratio="aspectRatio"
        :scale-pad="scalePad"
        @apply-to-pending="applyOptionsToPending"
        @audio-bitrate-change="onAudioBitrateChange"
        @audio-format-change="onAudioFormatChange"
        @compat-profile-change="onCompatProfileChange"
        @concurrency-change="onConcurrencyChange"
        @custom-name-template-input="onCustomNameTemplateInput"
        @encode-preset-change="onEncodePresetChange"
        @encoder-change="onEncoderChange"
        @fps-change="onFpsChange"
        @mute-audio-change="onMuteAudioChange"
        @name-template-change="onNameTemplateChange"
        @output-dir-mode-change="onOutputDirModeChange"
        @preset-change="onPresetChange"
        @rotate90-change="onRotate90Change"
        @select-output="onSelectOutput"
        @select-watermark-image="onSelectWatermarkImage"
        @target-size-mb-change="onTargetSizeMbChange"
        @task-mode-change="onTaskModeChange"
        @trim-end-change="onTrimEndChange"
        @trim-start-change="onTrimStartChange"
        @two-pass-change="onTwoPassChange"
        @video-audio-bitrate-change="onVideoAudioBitrateChange"
        @watermark-mode-change="onWatermarkModeChange"
        @watermark-image-path-change="onWatermarkImagePathChange"
        @watermark-text-change="onWatermarkTextChange"
        @watermark-position-change="onWatermarkPositionChange"
        @watermark-opacity-change="onWatermarkOpacityChange"
        @watermark-scale-percent-change="onWatermarkScalePercentChange"
        @watermark-font-size-change="onWatermarkFontSizeChange"
        @watermark-margin-change="onWatermarkMarginChange"
        @image-format-change="onImageFormatChange"
        @image-quality-change="onImageQualityChange"
        @image-max-edge-change="onImageMaxEdgeChange"
        @image-strip-change="onImageStripChange"
        @image-layout-change="onImageLayoutChange"
        @image-grid-cols-change="onImageGridColsChange"
        @image-gap-change="onImageGapChange"
        @image-background-change="onImageBackgroundChange"
        @crop-x-change="onCropXChange"
        @crop-y-change="onCropYChange"
        @crop-w-change="onCropWChange"
        @crop-h-change="onCropHChange"
        @concat-prefer-copy-change="onConcatPreferCopyChange"
        @compose-intro-path-change="onComposeIntroPathChange"
        @compose-intro-duration-change="onComposeIntroDurationChange"
        @compose-outro-path-change="onComposeOutroPathChange"
        @compose-outro-duration-change="onComposeOutroDurationChange"
        @compose-overlay-path-change="onComposeOverlayPathChange"
        @compose-overlay-position-change="onComposeOverlayPositionChange"
        @compose-overlay-opacity-change="onComposeOverlayOpacityChange"
        @compose-overlay-scale-percent-change="onComposeOverlayScalePercentChange"
        @compose-overlay-margin-change="onComposeOverlayMarginChange"
        @compose-overlay-start-sec-change="onComposeOverlayStartSecChange"
        @compose-overlay-end-sec-change="onComposeOverlayEndSecChange"
        @compose-fit-intro-outro-change="onComposeFitIntroOutroChange"
        @select-compose-intro-image="onSelectComposeIntroImage"
        @select-compose-outro-image="onSelectComposeOutroImage"
        @select-compose-overlay-image="onSelectComposeOverlayImage"
        @scale-mode-change="onScaleModeChange"
        @out-width-change="onOutWidthChange"
        @out-height-change="onOutHeightChange"
        @aspect-ratio-change="onAspectRatioChange"
        @scale-pad-change="onScalePadChange"
    />

    <div class="workspace">
      <DropZone
          :compact="tasks.length > 0"
          :dragging="dragging"
          :task-mode="taskMode"
          @click="onSelectFiles"
      />

      <SizeSummaryBar
          :count="sizeSummary.count"
          :ratio="sizeSummary.ratio"
          :total-in="sizeSummary.totalIn"
          :total-out="sizeSummary.totalOut"
      />

      <TaskTable
          :has-active="hasActive"
          :has-pending="hasPending"
          :tasks="tasks"
          @cancel-all="cancelAll"
          @cancel-one="cancelOne"
          @clear-all="clearAll"
          @clear-finished="clearFinished"
          @open-output="openOutput"
          @remove-one="removeOne"
          @show-in-folder="showInFolder"
          @start-all="startAll"
          @start-one="startOne"
      />
    </div>
  </div>
</template>
