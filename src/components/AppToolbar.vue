<script lang="ts" setup>
import { Folder, FolderOpened, QuestionFilled } from '@element-plus/icons-vue'
import type { FfmpegStatus, ThemeMode } from '@shared/types'
import { THEME_OPTIONS } from '@shared/types'

defineProps<{
  ffmpegStatus: FfmpegStatus
  outputDir: string
  appVersion: string
  updateChecking: boolean
  hasPending: boolean
  hasActive: boolean
  taskCount: number
  /** 主题：light | dark | system */
  theme: ThemeMode
}>()

const emit = defineEmits<{
  selectFiles: []
  selectOutput: []
  checkUpdate: []
  startAll: []
  cancelAll: []
  clearFinished: []
  clearAll: []
  themeChange: [v: ThemeMode]
  showShortcuts: []
}>()
</script>

<template>
  <div class="toolbar">
    <el-tag :type="ffmpegStatus.ready ? 'success' : 'danger'" effect="plain">
      FFmpeg {{ ffmpegStatus.ready ? '就绪' : '未就绪' }}
    </el-tag>
    <span v-if="!ffmpegStatus.ready" class="status-bad" style="font-size: 12px">
      {{ ffmpegStatus.error }}
    </span>

    <el-button :icon="FolderOpened" type="primary" @click="emit('selectFiles')">
      添加视频
    </el-button>
    <el-button :icon="Folder" @click="emit('selectOutput')">输出目录</el-button>
    <span :title="outputDir" class="path-text">
      {{ outputDir || '未选择输出目录' }}
    </span>

    <div style="flex: 1" />

    <el-select
      :model-value="theme"
      size="small"
      style="width: 110px"
      title="主题"
      @change="(v: ThemeMode) => emit('themeChange', v)"
    >
      <el-option
        v-for="opt in THEME_OPTIONS"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>

    <el-button
      :icon="QuestionFilled"
      circle
      plain
      size="small"
      title="快捷键 (F1)"
      @click="emit('showShortcuts')"
    />

    <el-tag effect="plain" size="small" type="info">v{{ appVersion }}</el-tag>
    <el-button :loading="updateChecking" plain size="small" @click="emit('checkUpdate')">
      检查更新
    </el-button>

    <el-button :disabled="!hasPending && !taskCount" type="success" @click="emit('startAll')">
      全部开始
    </el-button>
    <el-button :disabled="!hasActive" type="warning" @click="emit('cancelAll')">全部取消</el-button>
    <el-button @click="emit('clearFinished')">清除已完成</el-button>
    <el-button plain type="danger" @click="emit('clearAll')">清空列表</el-button>
  </div>
</template>
