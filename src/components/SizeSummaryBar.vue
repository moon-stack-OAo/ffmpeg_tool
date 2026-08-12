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
    <span class="summary-main">
      已完成 <b>{{ count }}</b> 个
      <span class="summary-sep">·</span>
      原始 <b>{{ formatFileSize(totalIn) }}</b>
      <span class="summary-arrow">→</span>
      输出 <b>{{ formatFileSize(totalOut) }}</b>
    </span>
    <span
      v-if="ratio"
      :class="ratio.startsWith('-') ? 'save-good' : 'save-bad'"
      class="summary-ratio"
    >
      体积变化 {{ ratio }}
    </span>
  </div>
</template>
