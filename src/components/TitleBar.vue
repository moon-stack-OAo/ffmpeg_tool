<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { Close, FullScreen, Minus, QuestionFilled, Setting } from '@element-plus/icons-vue'

defineProps<{
  appVersion: string
}>()

const emit = defineEmits<{
  openSettings: []
  showShortcuts: []
}>()

const maximized = ref(false)
let offMaximized: (() => void) | undefined

onMounted(async () => {
  try {
    maximized.value = await window.electronAPI.windowIsMaximized()
  } catch {
    maximized.value = false
  }
  offMaximized = window.electronAPI.onWindowMaximizedChanged((v) => {
    maximized.value = v
  })
})

onUnmounted(() => {
  offMaximized?.()
})

async function minimize(): Promise<void> {
  await window.electronAPI.windowMinimize()
}

async function toggleMaximize(): Promise<void> {
  maximized.value = await window.electronAPI.windowMaximizeToggle()
}

async function close(): Promise<void> {
  await window.electronAPI.windowClose()
}
</script>

<template>
  <header class="title-bar" @dblclick="toggleMaximize">
    <div class="title-bar-left">
      <img class="title-bar-icon" src="../favicon.png" alt="" draggable="false" />
      <span class="title-bar-name">FFmpeg 视频压缩工具</span>
      <span class="title-bar-ver">v{{ appVersion }}</span>
    </div>

    <div class="title-bar-drag" aria-hidden="true" />

    <div class="title-bar-actions">
      <button
        type="button"
        class="tb-btn"
        title="快捷键 (F1)"
        @click="emit('showShortcuts')"
      >
        <el-icon :size="15"><QuestionFilled /></el-icon>
      </button>
      <button
        type="button"
        class="tb-btn"
        title="设置"
        @click="emit('openSettings')"
      >
        <el-icon :size="15"><Setting /></el-icon>
      </button>
      <button type="button" class="tb-btn" title="最小化" @click="minimize">
        <el-icon :size="14"><Minus /></el-icon>
      </button>
      <button
        type="button"
        class="tb-btn"
        :title="maximized ? '还原' : '最大化'"
        @click="toggleMaximize"
      >
        <el-icon v-if="!maximized" :size="13"><FullScreen /></el-icon>
        <span v-else class="tb-restore" aria-hidden="true" />
      </button>
      <button type="button" class="tb-btn tb-close" title="关闭" @click="close">
        <el-icon :size="15"><Close /></el-icon>
      </button>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  display: flex;
  align-items: stretch;
  height: 36px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--panel-bg) 92%, var(--app-bg));
  box-shadow: inset 0 -1px 0 0 var(--panel-border);
  user-select: none;
  z-index: 20;
}

.title-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 14px;
  min-width: 0;
  -webkit-app-region: drag;
}

.title-bar-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 3px;
  pointer-events: none;
}

.title-bar-name {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--app-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-bar-ver {
  font-size: var(--fs-xs);
  color: var(--app-fg-muted);
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-fg) var(--overlay-subtle), transparent);
}

.title-bar-drag {
  flex: 1 1 auto;
  min-width: 24px;
  -webkit-app-region: drag;
}

.title-bar-actions {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.tb-btn {
  width: 46px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-fg-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}

.tb-btn:hover {
  background: color-mix(in srgb, var(--app-fg) 8%, transparent);
  color: var(--app-fg);
}

.tb-btn:active {
  background: color-mix(in srgb, var(--app-fg) 12%, transparent);
}

.tb-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
  z-index: 1;
}

.tb-close:hover {
  background: #e81123;
  color: #fff;
}

.tb-close:active {
  background: #c50f1f;
  color: #fff;
}

/* 还原：双框图标 */
.tb-restore {
  width: 10px;
  height: 10px;
  position: relative;
  box-shadow:
    inset 0 0 0 1.2px currentColor,
    2px -2px 0 -0.2px transparent,
    2px -2px 0 0 currentColor;
  border-radius: 1px;
}
</style>
