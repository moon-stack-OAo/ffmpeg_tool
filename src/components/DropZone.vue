<script lang="ts" setup>
defineProps<{
  dragging: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <div
    :class="{ active: dragging }"
    class="drop-zone"
    @click="emit('click')"
  >
    点击或拖拽添加视频文件（支持多选）
    <div class="hint">
      支持 mp4 / mkv / mov / avi / webm 等 · 可拖到窗口任意位置 · 输出 mp4 / mkv / mov / webm
    </div>
  </div>
</template>
