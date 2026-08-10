<script lang="ts" setup>
import type { UpdateStatusPayload } from '@shared/types'

defineProps<{
  modelValue: boolean
  appVersion: string
  isPackaged: boolean
  updateInfo: UpdateStatusPayload
  updateChecking: boolean
  updateDownloading: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  checkUpdate: []
  downloadUpdate: []
  installUpdate: []
}>()

function close(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :close-on-click-modal="false"
    title="软件更新"
    width="480px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="update-body">
      <p>
        当前版本：<strong>v{{ appVersion }}</strong>
        <span v-if="!isPackaged" class="update-dev">（开发模式，不会真正更新）</span>
      </p>
      <p v-if="updateInfo.version && updateInfo.state === 'available'">
        最新版本：<strong class="update-new">v{{ updateInfo.version }}</strong>
      </p>
      <p v-if="updateInfo.message" class="update-msg">{{ updateInfo.message }}</p>

      <el-progress
        v-if="updateInfo.state === 'downloading'"
        :percentage="Math.min(100, Math.round(updateInfo.percent || 0))"
        :stroke-width="14"
        striped
        striped-flow
      />

      <div v-if="updateInfo.releaseNotes" class="update-notes">
        <div class="update-notes-title">更新说明</div>
        <pre>{{ updateInfo.releaseNotes }}</pre>
      </div>
    </div>
    <template #footer>
      <el-button @click="close">关闭</el-button>
      <el-button
        v-if="updateInfo.state === 'available'"
        :loading="updateDownloading"
        type="primary"
        @click="emit('downloadUpdate')"
      >
        下载更新
      </el-button>
      <el-button
        v-if="updateInfo.state === 'downloaded'"
        type="success"
        @click="emit('installUpdate')"
      >
        重启并安装
      </el-button>
      <el-button
        v-if="
          updateInfo.state === 'error' ||
          updateInfo.state === 'not-available' ||
          updateInfo.state === 'idle'
        "
        :loading="updateChecking"
        type="primary"
        @click="emit('checkUpdate')"
      >
        重新检查
      </el-button>
    </template>
  </el-dialog>
</template>
