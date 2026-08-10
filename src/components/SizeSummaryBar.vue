<script lang="ts" setup>
import { formatFileSize } from '@shared/types'

defineProps<{
  count: number
  totalIn: number
  totalOut: number
  ratio: string | null
}>()
</script>

<template>
  <div v-if="count > 0" class="panel summary-bar">
    <span>
      已完成 {{ count }} 个 · 总原始
      <b>{{ formatFileSize(totalIn) }}</b>
      → 总输出
      <b>{{ formatFileSize(totalOut) }}</b>
    </span>
    <span
      v-if="ratio"
      :class="ratio.startsWith('-') ? 'save-good' : 'save-bad'"
    >
      总体积变化 {{ ratio }}
    </span>
  </div>
</template>
