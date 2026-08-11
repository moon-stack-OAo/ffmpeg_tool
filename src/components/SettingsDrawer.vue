<script lang="ts" setup>
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import type { AppInfo, FfmpegStatus, ThemeMode } from '@shared/types'
import {
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
  browseFfmpegDir: []
  clearFfmpegBinDir: []
  reDetectFfmpeg: []
  openAppData: []
  changeDataDir: []
  clearStoredTasks: []
  resetSettings: []
  checkUpdate: []
}>()

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
</script>

<template>
  <el-drawer
    :model-value="visible"
    class="settings-drawer"
    size="420px"
    title="设置"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <div class="drawer-body">
      <!-- 通用 -->
      <div class="setting-group">
        <div class="group-title">通用</div>
        <div class="setting-row">
          <span class="setting-label">主题</span>
          <el-select
            :model-value="theme"
            size="small"
            style="width: 140px"
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
            style="width: 90px"
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
      </div>

      <!-- 编码环境 -->
      <div class="setting-group">
        <div class="group-title">编码环境</div>
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

      <!-- 数据 -->
      <div class="setting-group">
        <div class="group-title">数据</div>
        <div class="setting-row">
          <span class="setting-label">数据目录</span>
          <span
            class="setting-value clickable"
            :title="appInfo?.userDataPath ? '点击复制' : ''"
            @click="copyUserDataPath"
          >
            {{ appInfo?.userDataPath || '—' }}
          </span>
        </div>
        <div class="setting-row actions">
          <el-button size="small" @click="emit('openAppData')">打开数据目录</el-button>
          <el-button size="small" @click="emit('changeDataDir')">修改数据目录…</el-button>
          <el-button size="small" plain type="danger" @click="confirmClearTasks">
            清空已持久化任务
          </el-button>
          <el-button size="small" type="danger" @click="confirmReset">
            重置全部设置
          </el-button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="setting-group">
        <div class="group-title">关于</div>
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
        <div class="setting-row">
          <span class="setting-label">数据目录</span>
          <span
            class="setting-value clickable"
            :title="appInfo?.userDataPath ? '点击复制' : ''"
            @click="copyUserDataPath"
          >
            {{ appInfo?.userDataPath || '—' }}
          </span>
        </div>
        <div class="setting-row actions">
          <el-button :loading="updateChecking" size="small" @click="emit('checkUpdate')">
            检查更新
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
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
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.setting-value {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
}

.setting-value.clickable {
  cursor: pointer;
}

.setting-value.clickable:hover {
  color: var(--el-color-primary);
}

.setting-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-error {
  font-size: 12px;
  color: var(--el-color-danger);
}

.bin-dir-input {
  flex: 1;
  min-width: 0;
}

.setting-row.actions {
  flex-wrap: wrap;
  gap: 8px;
}
</style>