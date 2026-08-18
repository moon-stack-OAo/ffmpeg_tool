<script lang="ts" setup>
import { computed } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import type { TaskMode } from '@shared/types'

const props = defineProps<{
  dragging: boolean
  /** 有任务时压缩高度，把空间留给任务列表 */
  compact?: boolean
  taskMode?: TaskMode
  /** 多任务时提示可选中任务单独编辑裁切 */
  showTaskEditHint?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()

const title = computed(() => {
  const m = props.taskMode || 'compress'
  if (props.compact) {
    if (m === 'image' || m === 'image-crop') return '点击或拖拽继续添加图片'
    if (m === 'image-stitch') return '点击或拖拽添加多张图片（一次多选=一组拼接）'
    if (m === 'video-concat') return '点击或拖拽添加多段视频（一次多选=一组拼接）'
    if (m === 'media-compose') return '点击或拖拽添加主视频（片头/片尾/叠加图在选项中设置）'
    if (m === 'audio') return '点击或拖拽继续添加视频'
    return '点击或拖拽继续添加视频'
  }
  if (m === 'image' || m === 'image-crop') return '添加图片开始处理'
  if (m === 'image-stitch') return '添加多张图片开始拼接'
  if (m === 'video-concat') return '添加多段视频开始拼接'
  if (m === 'media-compose') return '添加主视频开始混剪（图片在选项中选择）'
  if (m === 'audio') return '添加视频抽取音频'
  return '添加视频开始处理'
})

const hint = computed(() => {
  const m = props.taskMode || 'compress'
  let base =
    m === 'image' || m === 'image-crop' || m === 'image-stitch'
      ? '支持 jpg / png / webp / bmp / tiff 等 · 可拖到窗口任意位置'
      : '支持 mp4 / mkv / mov / avi / webm 等 · 可拖到窗口任意位置'
  if (props.showTaskEditHint) {
    base += ' · 选中任务可单独编辑裁切/混剪'
  }
  return base
})

const step1 = computed(() => {
  const m = props.taskMode || 'compress'
  if (m === 'image' || m === 'image-crop' || m === 'image-stitch') return '添加图片'
  return '添加视频'
})

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
      <div class="drop-title">{{ title }}</div>
      <div class="hint">
        {{ hint }}
      </div>
    </template>

    <template v-else>
      <div class="drop-title">{{ title }}</div>
      <ol class="drop-steps">
        <li><span class="step-num">①</span>{{ step1 }}</li>
        <li><span class="step-num">②</span>确认选项 / 输出</li>
        <li><span class="step-num">③</span>全部开始</li>
      </ol>
      <div class="hint">
        {{ hint }}
      </div>
    </template>
  </div>
</template>
