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

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('click')
  }
}
</script>

<template>
  <div
    :class="{ active: dragging, compact: compact }"
    class="drop-zone"
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown="onKeydown"
  >
    <el-icon class="drop-icon" :size="compact ? 22 : 40">
      <UploadFilled />
    </el-icon>

    <template v-if="compact">
      <div class="drop-title">点击或拖拽继续添加视频</div>
      <div class="hint">
        支持 mp4 / mkv / mov / avi / webm 等 · 可拖到窗口任意位置
      </div>
    </template>

    <template v-else>
      <div class="drop-title">添加视频开始处理</div>
      <ol class="drop-steps">
        <li><span class="step-num">①</span>添加视频</li>
        <li><span class="step-num">②</span>确认选项 / 输出</li>
        <li><span class="step-num">③</span>全部开始</li>
      </ol>
      <div class="hint">
        支持 mp4 / mkv / mov / avi / webm 等 · 可拖到窗口任意位置
      </div>
    </template>
  </div>
</template>
