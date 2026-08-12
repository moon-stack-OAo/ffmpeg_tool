<script lang="ts" setup>
import { Folder, FolderOpened, QuestionFilled, Setting } from '@element-plus/icons-vue'
import type { FfmpegStatus } from '@shared/types'

defineProps<{
  ffmpegStatus: FfmpegStatus
  outputDir: string
  appVersion: string
  hasPending: boolean
  hasActive: boolean
  taskCount: number
}>()

const emit = defineEmits<{
  selectFiles: []
  selectOutput: []
  startAll: []
  cancelAll: []
  clearFinished: []
  clearAll: []
  showShortcuts: []
  openSettings: []
}>()
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <el-tag :type="ffmpegStatus.ready ? 'success' : 'danger'" effect="plain">
        FFmpeg {{ ffmpegStatus.ready ? '就绪' : '未就绪' }}
      </el-tag>
      <span
        v-if="!ffmpegStatus.ready"
        :title="ffmpegStatus.error"
        class="status-bad toolbar-error"
      >
        {{ ffmpegStatus.error }}
      </span>

      <el-button :icon="FolderOpened" type="primary" @click="emit('selectFiles')">
        添加视频
      </el-button>
      <el-button :icon="Folder" @click="emit('selectOutput')">输出目录</el-button>
      <span :title="outputDir" class="path-text">
        {{ outputDir || '未选择输出目录' }}
      </span>
    </div>

    <div class="toolbar-spacer" />

    <div class="toolbar-right">
      <div class="toolbar-actions">
        <el-button :disabled="!hasPending && !taskCount" type="success" @click="emit('startAll')">
          全部开始
        </el-button>
        <el-button :disabled="!hasActive" type="warning" @click="emit('cancelAll')">
          全部取消
        </el-button>
        <el-button @click="emit('clearFinished')">清除已完成</el-button>
        <el-button plain type="danger" @click="emit('clearAll')">清空列表</el-button>
      </div>

      <div class="toolbar-meta">
        <el-button
          :icon="Setting"
          circle
          plain
          size="small"
          title="设置"
          @click="emit('openSettings')"
        />
        <el-button
          :icon="QuestionFilled"
          circle
          plain
          size="small"
          title="快捷键 (F1)"
          @click="emit('showShortcuts')"
        />
        <el-tag effect="plain" size="small" type="info">v{{ appVersion }}</el-tag>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar-left,
.toolbar-right,
.toolbar-actions,
.toolbar-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.toolbar-left {
  flex: 0 1 auto;
  gap: 10px;
}

.toolbar-spacer {
  flex: 1 1 12px;
  min-width: 8px;
}

.toolbar-right {
  flex: 0 1 auto;
  justify-content: flex-end;
  gap: 12px;
}

.toolbar-error {
  font-size: 12px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-actions {
  gap: 8px;
}

.toolbar-meta {
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--panel-border);
}

.path-text {
  min-width: 0;
  flex: 0 1 260px;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-fg) 4%, transparent);
}
</style>
