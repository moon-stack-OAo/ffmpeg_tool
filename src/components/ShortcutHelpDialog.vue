<script lang="ts" setup>
import { computed } from 'vue'

const visible = defineModel<boolean>({ default: false })

/** 是否 macOS 风格修饰键展示 */
const isMac = computed(() => {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
})

const mod = computed(() => (isMac.value ? '⌘' : 'Ctrl'))

const rows = computed(() => [
  { keys: `${mod.value} + Enter`, action: '全部开始' },
  { keys: `${mod.value} + Shift + Enter`, action: '全部取消' },
  { keys: `${mod.value} + Esc`, action: '全部取消' },
  { keys: `${mod.value} + O`, action: '添加视频' },
  { keys: `${mod.value} + Shift + O`, action: '选择输出目录' },
  { keys: `${mod.value} + L`, action: '清除已完成' },
  { keys: `${mod.value} + D`, action: '切换浅色 / 深色主题' },
  { keys: 'F1 或 Ctrl + /', action: '显示本帮助' }
])
</script>

<template>
  <el-dialog
    v-model="visible"
    title="快捷键"
    width="min(480px, 92vw)"
    destroy-on-close
    append-to-body
  >
    <el-table :data="rows" size="small" stripe style="width: 100%">
      <el-table-column prop="keys" label="快捷键" width="200" />
      <el-table-column prop="action" label="动作" />
    </el-table>
    <template #footer>
      <el-button type="primary" @click="visible = false">知道了</el-button>
    </template>
  </el-dialog>
</template>
