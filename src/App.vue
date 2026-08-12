<script lang="ts" setup>
import {onMounted, onUnmounted, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import type {AppInfo} from '@shared/types'
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
  onPersistTasksChange,
  onCloseActionChange,
  onTrimStartChange,
  onTrimEndChange,
  onRotate90Change,
  onSelectOutput,
  startWatchers,
  stopWatchers,
  persistTasks,
  ffmpegBinDir,
  applyLoadedSettings,
  onSetFfmpegBinDir
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

const appInfo = ref<AppInfo | null>(null)
const shortcutHelpVisible = ref(false)
const settingsVisible = ref(false)
const closeConfirmVisible = ref(false)

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
  const res = await window.electronAPI.selectDirectory()
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
  const res = await window.electronAPI.selectDirectory()
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
      appInfo.value = { ...appInfo.value, userDataPath: res.path }
    }
    ElMessage.success('数据目录已更新，重启后完全生效')
    try {
      await ElMessageBox.confirm(
        '数据目录已切换，部分配置需重启应用后完全生效。是否立即重启？',
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
        @open-settings="settingsVisible = true"
        @show-shortcuts="shortcutHelpVisible = true"
    />

    <SettingsDrawer
        v-model:visible="settingsVisible"
        :app-info="appInfo"
        :app-version="appVersion"
        :close-action="closeAction"
        :concurrency="concurrency"
        :ffmpeg-bin-dir="ffmpegBinDir"
        :ffmpeg-status="ffmpegStatus"
        :is-packaged="isPackaged"
        :notify-on-complete="notifyOnComplete"
        :persist-tasks="persistTasks"
        :theme="theme"
        :update-checking="updateChecking"
        @browse-ffmpeg-dir="onBrowseFfmpegDir"
        @change-data-dir="onChangeDataDir"
        @check-update="onCheckUpdate"
        @clear-ffmpeg-bin-dir="onClearFfmpegBinDir"
        @clear-stored-tasks="onClearStoredTasks"
        @close-action-change="onCloseActionChange"
        @concurrency-change="onConcurrencyChange"
        @notify-on-complete-change="onNotifyOnCompleteChange"
        @open-app-data="onOpenAppData"
        @persist-tasks-change="onPersistTasksChange"
        @re-detect-ffmpeg="loadStatus"
        @reset-settings="onResetSettings"
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
        :rotate90="rotate90"
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
        @output-dir-mode-change="onOutputDirModeChange"
        @preset-change="onPresetChange"
        @rotate90-change="onRotate90Change"
        @select-output="onSelectOutput"
        @target-size-mb-change="onTargetSizeMbChange"
        @task-mode-change="onTaskModeChange"
        @trim-end-change="onTrimEndChange"
        @trim-start-change="onTrimStartChange"
        @two-pass-change="onTwoPassChange"
    />

    <div class="workspace">
      <DropZone
          :compact="tasks.length > 0"
          :dragging="dragging"
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
