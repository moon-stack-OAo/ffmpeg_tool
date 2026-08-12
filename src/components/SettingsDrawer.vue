<script lang="ts" setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import type { AppInfo, CloseAction, FfmpegStatus, ThemeMode } from '@shared/types'
import {
  CLOSE_ACTION_OPTIONS,
  CONCURRENCY_HINT,
  CONCURRENCY_OPTIONS,
  THEME_OPTIONS
} from '@shared/types'

const props = defineProps<{
  visible: boolean
  theme: ThemeMode
  concurrency: number
  notifyOnComplete: boolean
  persistTasks: boolean
  closeAction: CloseAction
  ffmpegBinDir: string
  ffmpegStatus: FfmpegStatus | null
  appVersion: string
  isPackaged: boolean
  appInfo: AppInfo | null
  updateChecking: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  themeChange: [v: ThemeMode]
  concurrencyChange: [n: number]
  notifyOnCompleteChange: [v: boolean]
  persistTasksChange: [v: boolean]
  closeActionChange: [v: CloseAction]
  browseFfmpegDir: []
  clearFfmpegBinDir: []
  reDetectFfmpeg: []
  openAppData: []
  changeDataDir: []
  clearStoredTasks: []
  resetSettings: []
  checkUpdate: []
}>()

const activeTab = ref('general')

watch(
  () => props.visible,
  (v) => {
    if (v) activeTab.value = 'general'
  }
)

async function confirmClearTasks(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将删除本地已持久化的任务记录，进行中的任务不受影响。确定清空吗？',
      '清空持久化任务',
      {
        type: 'warning',
        confirmButtonText: '清空',
        cancelButtonText: '取消'
      }
    )
    emit('clearStoredTasks')
  } catch {
    // 用户取消
  }
}

async function confirmReset(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将恢复所有设置为默认值，包括主题、并发数与自定义 ffmpeg 目录。确定重置吗？',
      '重置全部设置',
      {
        type: 'warning',
        confirmButtonText: '重置',
        cancelButtonText: '取消'
      }
    )
    emit('resetSettings')
  } catch {
    // 用户取消
  }
}

async function copyUserDataPath(): Promise<void> {
  const p = props.appInfo?.userDataPath
  if (!p) return
  try {
    await navigator.clipboard.writeText(p)
    ElMessage.success('已复制数据目录路径')
  } catch {
    ElMessage.error('复制失败')
  }
}

function onPathKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    void copyUserDataPath()
  }
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    class="settings-drawer"
    size="35%"
    title="设置"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="通用" name="general" lazy>
        <div class="setting-pane">
          <div class="setting-row">
            <span class="setting-label">主题</span>
            <el-select
              :model-value="theme"
              size="small"
              class="w-xl"
              @change="(v: ThemeMode) => emit('themeChange', v)"
            >
              <el-option
                v-for="opt in THEME_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="setting-row">
            <span class="setting-label">并发数</span>
            <el-select
              :model-value="concurrency"
              size="small"
              class="w-sm"
              :title="CONCURRENCY_HINT"
              @change="(v: number) => emit('concurrencyChange', v)"
            >
              <el-option
                v-for="n in CONCURRENCY_OPTIONS"
                :key="n"
                :label="String(n)"
                :value="n"
              />
            </el-select>
            <span class="setting-hint" :title="CONCURRENCY_HINT">
              {{ CONCURRENCY_HINT }}
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-label">完成后通知</span>
            <el-switch
              :model-value="notifyOnComplete"
              size="small"
              @change="(v: string | number | boolean) => emit('notifyOnCompleteChange', Boolean(v))"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">持久化任务</span>
            <el-switch
              :model-value="persistTasks"
              size="small"
              @change="(v: string | number | boolean) => emit('persistTasksChange', Boolean(v))"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">关闭窗口</span>
            <el-select
              :model-value="closeAction"
              size="small"
              class="w-xl"
              @change="(v: CloseAction) => emit('closeActionChange', v)"
            >
              <el-option
                v-for="opt in CLOSE_ACTION_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <span class="setting-hint">点击关闭按钮时的默认行为</span>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="编码" name="ffmpeg" lazy>
        <div class="setting-pane">
          <div class="setting-row">
            <span class="setting-label">FFmpeg 状态</span>
            <el-tag
              :type="ffmpegStatus?.ready ? 'success' : 'danger'"
              effect="plain"
              size="small"
            >
              {{ ffmpegStatus?.ready ? '就绪' : '未就绪' }}
            </el-tag>
          </div>
          <div v-if="ffmpegStatus && !ffmpegStatus.ready && ffmpegStatus.error" class="setting-row">
            <span class="setting-label" />
            <span class="setting-error">{{ ffmpegStatus.error }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">ffmpeg</span>
            <span class="setting-value" :title="ffmpegStatus?.ffmpegPath || '内置自动探测'">
              {{ ffmpegStatus?.ffmpegPath || '内置自动探测' }}
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-label">ffprobe</span>
            <span class="setting-value" :title="ffmpegStatus?.ffprobePath || '内置自动探测'">
              {{ ffmpegStatus?.ffprobePath || '内置自动探测' }}
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-label">自定义 bin 目录</span>
            <el-input
              :model-value="ffmpegBinDir"
              class="bin-dir-input"
              placeholder="留空=自动探测（ffmpeg-static）"
              readonly
              size="small"
            />
          </div>
          <div class="setting-row actions">
            <el-button :icon="Folder" size="small" @click="emit('browseFfmpegDir')">
              浏览
            </el-button>
            <el-button size="small" @click="emit('clearFfmpegBinDir')">
              重置自动
            </el-button>
            <el-button size="small" @click="emit('reDetectFfmpeg')">
              重新检测
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="数据" name="data" lazy>
        <div class="setting-pane">
          <div class="setting-row">
            <span class="setting-label">数据目录</span>
            <button
              type="button"
              class="setting-value path-copy-btn"
              :title="appInfo?.userDataPath ? '点击复制' : ''"
              :disabled="!appInfo?.userDataPath"
              @click="copyUserDataPath"
              @keydown="onPathKeydown"
            >
              {{ appInfo?.userDataPath || '—' }}
            </button>
          </div>
          <div class="setting-row actions">
            <el-button size="small" @click="emit('openAppData')">打开数据目录</el-button>
            <el-button size="small" @click="emit('changeDataDir')">修改数据目录…</el-button>
          </div>
          <div class="setting-divider" />
          <div class="setting-row actions">
            <el-button size="small" plain type="danger" @click="confirmClearTasks">
              清空已持久化任务
            </el-button>
            <el-button size="small" type="danger" @click="confirmReset">
              重置全部设置
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="关于" name="about" lazy>
        <div class="setting-pane">
          <div class="setting-row">
            <span class="setting-label">版本</span>
            <span class="setting-value">v{{ appVersion }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">打包状态</span>
            <el-tag :type="isPackaged ? 'success' : 'info'" effect="plain" size="small">
              {{ isPackaged ? '已打包' : '开发态' }}
            </el-tag>
          </div>
          <div class="setting-row">
            <span class="setting-label">Electron</span>
            <span class="setting-value">{{ appInfo?.electron ?? '—' }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">Chrome</span>
            <span class="setting-value">{{ appInfo?.chrome ?? '—' }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">Node</span>
            <span class="setting-value">{{ appInfo?.node ?? '—' }}</span>
          </div>
          <div class="setting-row actions">
            <el-button :loading="updateChecking" size="small" type="primary" @click="emit('checkUpdate')">
              检查更新
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<style scoped>
.settings-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-tabs :deep(.el-tabs__header) {
  margin: 0 0 var(--space-3);
  flex-shrink: 0;
}

.settings-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 0;
  background: none;
}

.settings-tabs :deep(.el-tabs__nav-wrap) {
  box-shadow: inset 0 -1px 0 0 var(--panel-border);
}

.settings-tabs :deep(.el-tabs__item) {
  font-size: var(--fs-md);
  height: 36px;
  line-height: 36px;
  padding: 0 14px;
  color: var(--app-fg-secondary);
}

.settings-tabs :deep(.el-tabs__item.is-active) {
  color: var(--primary);
  font-weight: 600;
}

.settings-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--primary);
}

.settings-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.settings-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.setting-pane {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
}

.setting-divider {
  height: 0;
  margin: var(--space-2) 0;
  box-shadow: inset 0 -1px 0 0 var(--panel-border);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 28px;
}

.setting-label {
  flex-shrink: 0;
  width: 108px;
  font-size: var(--fs-md);
  color: var(--app-fg-secondary);
}

.setting-value {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-fg);
}

.path-copy-btn {
  margin: 0;
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
  color: var(--app-fg);
}

.path-copy-btn:hover:not(:disabled) {
  color: var(--primary);
}

.path-copy-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.path-copy-btn:disabled {
  cursor: default;
  opacity: 0.7;
}

.setting-hint {
  font-size: var(--fs-xs);
  color: var(--app-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-error {
  font-size: var(--fs-sm);
  color: var(--status-bad);
}

.bin-dir-input {
  flex: 1;
  min-width: 0;
}

.setting-row.actions {
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
