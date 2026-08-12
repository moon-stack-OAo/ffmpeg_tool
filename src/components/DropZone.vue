<script lang="ts" setup>
import { UploadFilled } from '@element-plus/icons-vue'

defineProps<{
  dragging: boolean
  /** 有任务时压缩高度，把空间留给任务列表 */
  compact?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <div
    :class="{ active: dragging, compact: compact }"
    class="drop-zone"
    @click="emit('click')"
  >
    <el-icon class="drop-icon" :size="compact ? 22 : 32">
      <UploadFilled />
    </el-icon>
    <div class="drop-title">
      {{ compact ? '点击或拖拽继续添加视频' : '点击或拖拽添加视频文件' }}
    </div>
    <div class="hint">
      支持 mp4 / mkv / mov / avi / webm 等 · 可拖到窗口任意位置
    </div>
  </div>
</template>
