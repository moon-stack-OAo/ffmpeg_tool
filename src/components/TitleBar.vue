<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Close, FullScreen, Minus, QuestionFilled, Setting } from '@element-plus/icons-vue'
import type { FfmpegStatus } from '@shared/types'
import { PRODUCT_NAME } from '@shared/brand'

const props = defineProps<{
  appVersion: string
  ffmpegStatus: FfmpegStatus
  /** 有可用更新时在版本旁显示 NEW */
  updateAvailable?: boolean
  /** 远端版本号，用于 tooltip */
  updateVersion?: string
  /** 已下载待安装 */
  updateDownloaded?: boolean
}>()

const ffmpegReady = computed(() => Boolean(props.ffmpegStatus?.ready))
const ffmpegTip = computed(() => {
  if (ffmpegReady.value) {
    return props.ffmpegStatus.ffmpegPath
      ? `FFmpeg 就绪\n${props.ffmpegStatus.ffmpegPath}`
      : 'FFmpeg 就绪'
  }
  return props.ffmpegStatus?.error || 'FFmpeg 未就绪'
})

const showUpdateBadge = computed(
  () => Boolean(props.updateAvailable || props.updateDownloaded)
)
const updateBadgeLabel = computed(() =>
  props.updateDownloaded ? '就绪' : 'NEW'
)
const updateBadgeTip = computed(() => {
  const ver = props.updateVersion ? ` v${props.updateVersion}` : ''
  if (props.updateDownloaded) return `更新已下载${ver}，点击重启并安装`
  return `发现新版本${ver}，点击查看`
})

const emit = defineEmits<{
  openSettings: []
  showShortcuts: []
  openUpdate: []
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
    <div class="title-bar-left" :title="`${PRODUCT_NAME} v${appVersion}`">
      <img class="title-bar-icon" src="../favicon.png" alt="" draggable="false" />
      <div class="title-bar-text">
        <span class="title-bar-name">{{ PRODUCT_NAME }}</span>
        <span class="title-bar-ver">v{{ appVersion }}</span>
        <button
          v-if="showUpdateBadge"
          type="button"
          class="title-bar-new"
          :class="{ 'is-ready': updateDownloaded }"
          :title="updateBadgeTip"
          @click.stop="emit('openUpdate')"
        >
          {{ updateBadgeLabel }}
        </button>
      </div>
      <span
        class="title-bar-status"
        :class="ffmpegReady ? 'is-ready' : 'is-bad'"
        :title="ffmpegTip"
      >
        <span class="title-bar-status-dot" aria-hidden="true" />
        {{ ffmpegReady ? 'FFmpeg 就绪' : 'FFmpeg 未就绪' }}
      </span>
    </div>

    <div class="title-bar-drag" aria-hidden="true" />

    <div class="title-bar-actions">
      <button
        type="button"
        class="tb-btn"
        title="帮助 (F1)"
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
  gap: 10px;
  padding: 0 10px 0 12px;
  min-width: 0;
  -webkit-app-region: drag;
}

.title-bar-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 4px;
  pointer-events: none;
}

.title-bar-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.title-bar-name {
  font-size: var(--fs-md);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--app-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.title-bar-ver {
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--app-fg-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  opacity: 0.9;
}

.title-bar-new {
  margin: 0 0 0 2px;
  padding: 0 6px;
  height: 16px;
  border: none;
  border-radius: 999px;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  color: #fff;
  background: linear-gradient(135deg, #1b4dff 0%, #0ea5e9 55%, #14b8a6 100%);
  box-shadow: 0 0 0 1px color-mix(in srgb, #0ea5e9 35%, transparent);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    transform 0.12s,
    filter 0.12s,
    box-shadow 0.12s;
  animation: title-bar-new-pulse 2.4s ease-in-out infinite;
}

.title-bar-new:hover {
  filter: brightness(1.08);
  transform: translateY(-0.5px);
  box-shadow: 0 0 0 1px color-mix(in srgb, #14b8a6 45%, transparent);
}

.title-bar-new:active {
  transform: translateY(0);
  filter: brightness(0.96);
}

.title-bar-new:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.title-bar-new.is-ready {
  background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
  box-shadow: 0 0 0 1px color-mix(in srgb, #22c55e 40%, transparent);
  animation: none;
}

@keyframes title-bar-new-pulse {
  0%,
  100% {
    box-shadow:
      0 0 0 1px color-mix(in srgb, #0ea5e9 35%, transparent),
      0 0 0 0 color-mix(in srgb, #0ea5e9 0%, transparent);
  }
  50% {
    box-shadow:
      0 0 0 1px color-mix(in srgb, #0ea5e9 45%, transparent),
      0 0 0 4px color-mix(in srgb, #0ea5e9 18%, transparent);
  }
}

.title-bar-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  margin-left: 2px;
  padding: 2px 8px 2px 7px;
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-bar-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: currentColor;
}

.title-bar-status.is-ready {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 14%, transparent);
}

.title-bar-status.is-bad {
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 14%, transparent);
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
