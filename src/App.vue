<script lang="ts" setup>
import {onMounted, onUnmounted, ref} from 'vue'
import AppToolbar from './components/AppToolbar.vue'
import CompressOptionsPanel from './components/CompressOptionsPanel.vue'
import DropZone from './components/DropZone.vue'
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
  trimStart,
  trimEnd,
  custom,
  currentPreset,
  isCustom,
  isWebm,
  isAudioMode,
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
  onAudioFormatChange,
  onAudioBitrateChange,
  onNotifyOnCompleteChange,
  onTrimStartChange,
  onTrimEndChange,
  onSelectOutput,
  startWatchers,
  stopWatchers,
  persistTasks
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
  persistTasks
})

syncPendingOptionsRef = syncPendingOptions

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

const shortcutHelpVisible = ref(false)

let cleanupTasks: (() => void) | undefined
let cleanupUpdater: (() => void) | undefined
let cleanupDrag: (() => void) | undefined
let cleanupHotkeys: (() => void) | undefined

onMounted(async () => {
  // 1) 恢复持久化设置
  await loadSettings()

  // 1.1) 应用主题（依赖已加载的 theme）
  startTheme()

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
})

onUnmounted(() => {
  stopWatchers()
  stopTheme()
  cleanupTasks?.()
  cleanupUpdater?.()
  cleanupDrag?.()
  cleanupHotkeys?.()
})
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
    <AppToolbar
        :app-version="appVersion"
        :ffmpeg-status="ffmpegStatus"
        :has-active="hasActive"
        :has-pending="hasPending"
        :output-dir="outputDir"
        :task-count="tasks.length"
        :theme="theme"
        :update-checking="updateChecking"
        @cancel-all="cancelAll"
        @check-update="onCheckUpdate"
        @clear-all="clearAll"
        @clear-finished="clearFinished"
        @select-files="onSelectFiles"
        @select-output="onSelectOutput"
        @show-shortcuts="shortcutHelpVisible = true"
        @start-all="startAll"
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
        @install-update="onInstallUpdate"
    />

    <ShortcutHelpDialog v-model="shortcutHelpVisible" />

    <CompressOptionsPanel
        :audio-bitrate="audioBitrate"
        :audio-format="audioFormat"
        :concurrency="concurrency"
        :custom="custom"
        :encoder="encoder"
        :encoder-info="encoderInfo"
        :is-audio-mode="isAudioMode"
        :is-custom="isCustom"
        :is-webm="isWebm"
        :name-template="nameTemplate"
        :name-template-custom="nameTemplateCustom"
        :notify-on-complete="notifyOnComplete"
        :output-dir-mode="outputDirMode"
        :preset-description="currentPreset.description"
        :preset-id="presetId"
        :target-size-mb="targetSizeMb"
        :task-mode="taskMode"
        :trim-end="trimEnd"
        :trim-start="trimStart"
        :two-pass="twoPass"
        @apply-to-pending="applyOptionsToPending"
        @audio-bitrate-change="onAudioBitrateChange"
        @audio-format-change="onAudioFormatChange"
        @concurrency-change="onConcurrencyChange"
        @custom-name-template-input="onCustomNameTemplateInput"
        @encoder-change="onEncoderChange"
        @name-template-change="onNameTemplateChange"
        @notify-on-complete-change="onNotifyOnCompleteChange"
        @output-dir-mode-change="onOutputDirModeChange"
        @preset-change="onPresetChange"
        @target-size-mb-change="onTargetSizeMbChange"
        @task-mode-change="onTaskModeChange"
        @trim-end-change="onTrimEndChange"
        @trim-start-change="onTrimStartChange"
        @two-pass-change="onTwoPassChange"
    />

    <DropZone :dragging="dragging" @click="onSelectFiles"/>

    <SizeSummaryBar
        :count="sizeSummary.count"
        :ratio="sizeSummary.ratio"
        :total-in="sizeSummary.totalIn"
        :total-out="sizeSummary.totalOut"
    />

    <TaskTable
        :tasks="tasks"
        @cancel-one="cancelOne"
        @open-output="openOutput"
        @remove-one="removeOne"
        @show-in-folder="showInFolder"
        @start-one="startOne"
    />
  </div>
</template>
