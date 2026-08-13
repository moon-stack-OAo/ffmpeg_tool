<script lang="ts" setup>
import {computed} from 'vue'
import {
  CircleCheckFilled,
  Download,
  InfoFilled,
  Loading,
  Refresh,
  WarningFilled
} from '@element-plus/icons-vue'
import type {UpdateStatusPayload} from '@shared/types'
import {PRODUCT_NAME} from '@shared/brand'
import faviconUrl from '../favicon.png'

const props = defineProps<{
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

const state = computed(() => props.updateInfo.state)

const statusMeta = computed(() => {
  switch (state.value) {
    case 'checking':
      return {type: 'info' as const, label: '正在检查更新', icon: Loading}
    case 'available':
      return {type: 'primary' as const, label: '发现新版本', icon: Download}
    case 'downloading':
      return {type: 'primary' as const, label: '正在下载更新', icon: Download}
    case 'downloaded':
      return {type: 'success' as const, label: '更新已就绪', icon: CircleCheckFilled}
    case 'not-available':
      return {type: 'success' as const, label: '已是最新版本', icon: CircleCheckFilled}
    case 'error':
      return {type: 'danger' as const, label: '检查更新失败', icon: WarningFilled}
    default:
      return {type: 'info' as const, label: '检查更新', icon: InfoFilled}
  }
})

const showVersionCompare = computed(() => {
  const s = state.value
  return Boolean(
      props.updateInfo.version &&
      (s === 'available' || s === 'downloading' || s === 'downloaded')
  )
})

const showNewBadge = computed(
    () =>
        state.value === 'available' ||
        state.value === 'downloading' ||
        state.value === 'downloaded'
)

/** 无版本对比时的空态（已最新 / 检查中 / 失败 / 开发模式等） */
const isIdleLayout = computed(() => !showVersionCompare.value)

const idleTitle = computed(() => {
  switch (state.value) {
    case 'checking':
      return '正在检查更新'
    case 'not-available':
      return '已是最新版本'
    case 'error':
      return '检查更新失败'
    default:
      return !props.isPackaged ? '开发模式' : '软件更新'
  }
})

const idleHint = computed(() => {
  if (props.updateInfo.message) return props.updateInfo.message
  if (!props.isPackaged) return '开发模式不检查更新，请使用打包后的安装包验证'
  if (state.value === 'checking') return '正在连接更新服务器…'
  return '点击下方按钮检查是否有新版本'
})

const downloadPercent = computed(() =>
    Math.min(100, Math.max(0, Math.round(props.updateInfo.percent || 0)))
)

const downloadDetail = computed(() => {
  const {transferred, total, bytesPerSecond} = props.updateInfo
  if (transferred == null && total == null) return ''
  const parts: string[] = []
  if (transferred != null && total != null && total > 0) {
    parts.push(`${formatBytes(transferred)} / ${formatBytes(total)}`)
  } else if (transferred != null) {
    parts.push(formatBytes(transferred))
  }
  if (bytesPerSecond != null && bytesPerSecond > 0) {
    parts.push(`${formatBytes(bytesPerSecond)}/s`)
  }
  return parts.join(' · ')
})

const notesBlocks = computed(() => parseReleaseNotes(props.updateInfo.releaseNotes))

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

type NotesBlock =
    | { type: 'h'; level: 2 | 3 | 4; text: string }
    | { type: 'p'; text: string }
    | { type: 'ul'; items: string[] }

/** 轻量解析 Release 说明（Markdown 子集 / 纯文本） */
function parseReleaseNotes(raw?: string): NotesBlock[] {
  if (!raw?.trim()) return []

  let text = raw.replace(/\r\n/g, '\n').trim()
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
        .replace(/<\/(h[1-6]|p|div|li|tr)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(ul|ol|table|thead|tbody)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<h([1-6])[^>]*>/gi, (_, lv) => `${'#'.repeat(Number(lv))} `)
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
  }

  text = text.replace(/^#\s+(?:轻影|FFmpeg)[^\n]*\n+/i, '')

  const lines = text.split('\n')
  const blocks: NotesBlock[] = []
  let listItems: string[] = []
  let para: string[] = []

  const flushList = () => {
    if (listItems.length) {
      blocks.push({type: 'ul', items: listItems})
      listItems = []
    }
  }
  const flushPara = () => {
    if (para.length) {
      blocks.push({type: 'p', text: para.join(' ').trim()})
      para = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      flushPara()
      continue
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed)
    if (heading) {
      flushList()
      flushPara()
      const level = Math.min(4, Math.max(2, heading[1].length)) as 2 | 3 | 4
      blocks.push({type: 'h', level, text: heading[2].trim()})
      continue
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed)
    if (bullet) {
      flushPara()
      listItems.push(bullet[1].trim())
      continue
    }

    flushList()
    para.push(trimmed)
  }
  flushList()
  flushPara()
  return blocks
}

function inlineHtml(text: string): string {
  const esc = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  return esc
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
}
</script>

<template>
  <el-dialog
      :model-value="modelValue"
      :close-on-click-modal="false"
      class="update-dialog"
      width="min(760px, 96vw)"
      append-to-body
      destroy-on-close
      align-center
      @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="update-header">
        <div class="update-brand">
          <div class="update-brand-mark" aria-hidden="true">
            <img class="update-brand-icon" :src="faviconUrl" alt="" />
          </div>
          <div class="update-brand-text">
            <div class="update-brand-name">
              {{ PRODUCT_NAME }}
              <span v-if="showNewBadge" class="update-new-pill">NEW</span>
            </div>
            <div class="update-brand-sub" :class="`is-${statusMeta.type}`">
              <el-icon
                :size="13"
                :class="{ 'update-status-spin': state === 'checking' }"
              >
                <component :is="statusMeta.icon" />
              </el-icon>
              <span>{{ statusMeta.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="update-body" :class="{ 'is-idle': isIdleLayout }">
      <template v-if="showVersionCompare">
        <div class="update-version-row">
          <div class="ver-card">
            <span class="ver-label">当前版本</span>
            <span class="ver-num">v{{ appVersion }}</span>
          </div>
          <div class="ver-arrow" aria-hidden="true">
            <span class="ver-arrow-line" />
            <span class="ver-arrow-head">›</span>
          </div>
          <div class="ver-card is-new">
            <span class="ver-label">
              最新版本
              <span class="ver-new-tag">NEW</span>
            </span>
            <span class="ver-num">v{{ updateInfo.version }}</span>
          </div>
        </div>

        <div
          v-if="updateInfo.message"
          class="update-msg"
          :class="{
            'is-error': state === 'error',
            'is-ok': state === 'downloaded'
          }"
        >
          {{ updateInfo.message }}
        </div>

        <div v-if="state === 'downloading'" class="update-progress">
          <div class="update-progress-top">
            <span>下载进度</span>
            <span class="update-progress-pct">{{ downloadPercent }}%</span>
          </div>
          <div class="update-progress-track">
            <div class="update-progress-fill" :style="{ width: `${downloadPercent}%` }" />
          </div>
          <div v-if="downloadDetail" class="update-progress-meta">{{ downloadDetail }}</div>
        </div>

        <div v-if="notesBlocks.length" class="update-notes">
          <div class="update-notes-title">更新内容</div>
          <div class="update-notes-scroll thin-scrollbar">
            <template v-for="(block, i) in notesBlocks" :key="i">
              <div
                v-if="block.type === 'h'"
                class="notes-h"
                :class="`notes-h${block.level}`"
                v-html="inlineHtml(block.text)"
              />
              <p
                v-else-if="block.type === 'p'"
                class="notes-p"
                v-html="inlineHtml(block.text)"
              />
              <ul v-else-if="block.type === 'ul'" class="notes-ul">
                <li v-for="(item, j) in block.items" :key="j" v-html="inlineHtml(item)" />
              </ul>
            </template>
          </div>
        </div>
      </template>

      <div v-else class="update-idle" :class="`is-${statusMeta.type}`">
        <div class="update-idle-icon" aria-hidden="true">
          <el-icon :size="28" :class="{ 'update-status-spin': state === 'checking' }">
            <component :is="statusMeta.icon" />
          </el-icon>
        </div>
        <div class="update-idle-title">{{ idleTitle }}</div>
        <div class="update-idle-ver">
          <span class="update-idle-ver-label">当前版本</span>
          <span class="update-idle-ver-num">v{{ appVersion }}</span>
          <span v-if="!isPackaged" class="update-dev">开发模式</span>
        </div>
        <p class="update-idle-hint">{{ idleHint }}</p>
      </div>
    </div>

    <template #footer>
      <div class="update-footer">
        <el-button class="update-btn-ghost" @click="close">关闭</el-button>
        <el-button
            v-if="state === 'available'"
            :loading="updateDownloading"
            type="primary"
            class="update-btn-primary"
            @click="emit('downloadUpdate')"
        >
          <el-icon v-if="!updateDownloading" class="btn-icon">
            <Download/>
          </el-icon>
          下载更新
        </el-button>
        <el-button
            v-if="state === 'downloaded'"
            type="success"
            class="update-btn-success"
            @click="emit('installUpdate')"
        >
          <el-icon class="btn-icon">
            <Refresh/>
          </el-icon>
          重启并安装
        </el-button>
        <el-button
            v-if="state === 'error' || state === 'not-available' || state === 'idle'"
            :loading="updateChecking"
            type="primary"
            class="update-btn-primary"
            @click="emit('checkUpdate')"
        >
          重新检查
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.update-header {
  display: flex;
  align-items: center;
  min-width: 0;
  padding-right: 28px;
}

.update-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.update-brand-mark {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #1b4dff 0%, #0ea5e9 52%, #14b8a6 100%);
  box-shadow: 0 0 0 1px color-mix(in srgb, #0ea5e9 28%, transparent),
  0 8px 18px color-mix(in srgb, #1b4dff 22%, transparent);
}

.update-brand-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  object-fit: cover;
  background: color-mix(in srgb, #fff 88%, transparent);
}

.update-brand-text {
  min-width: 0;
}

.update-brand-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--app-fg);
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.update-brand-sub {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  line-height: 1.2;
}

.update-brand-sub.is-primary {
  color: color-mix(in srgb, #0ea5e9 55%, var(--app-fg));
}

.update-brand-sub.is-success {
  color: var(--status-ok);
}

.update-brand-sub.is-danger {
  color: var(--status-bad);
}

.update-new-pill {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
  background: linear-gradient(135deg, #1b4dff 0%, #0ea5e9 55%, #14b8a6 100%);
  box-shadow: 0 0 0 1px color-mix(in srgb, #0ea5e9 35%, transparent);
}

.update-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: min(280px, 36vh);
  font-size: var(--fs-md);
  color: var(--app-fg-secondary);
  line-height: 1.55;
}

.update-body.is-idle {
  min-height: min(240px, 32vh);
  justify-content: center;
}

.update-version-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.ver-card {
  flex: 1;
  min-width: 0;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--notes-bg);
  box-shadow: var(--ring-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ver-card.is-new {
  background: linear-gradient(
      145deg,
      color-mix(in srgb, #1b4dff 10%, var(--notes-bg)) 0%,
      color-mix(in srgb, #14b8a6 8%, var(--notes-bg)) 100%
  );
  box-shadow: 0 0 0 1px color-mix(in srgb, #0ea5e9 34%, transparent),
  0 6px 16px color-mix(in srgb, #1b4dff 10%, transparent);
}

.ver-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  color: var(--app-fg-muted);
}

.ver-new-tag {
  display: inline-flex;
  align-items: center;
  height: 14px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
  background: linear-gradient(135deg, #1b4dff 0%, #0ea5e9 55%, #14b8a6 100%);
}

.ver-num {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--app-fg);
  letter-spacing: 0.01em;
}

.ver-card.is-new .ver-num {
  background: linear-gradient(120deg, #1b4dff 0%, #0ea5e9 50%, #14b8a6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.ver-arrow {
  align-self: center;
  display: flex;
  align-items: center;
  gap: 0;
  color: var(--app-fg-muted);
  flex-shrink: 0;
  padding: 0 2px;
  opacity: 0.85;
}

.ver-arrow-line {
  width: 12px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, color-mix(in srgb, #1b4dff 40%, transparent), #14b8a6);
}

.ver-arrow-head {
  font-size: 18px;
  line-height: 1;
  margin-left: -2px;
  color: #14b8a6;
  font-weight: 600;
}

.update-idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 28px 24px 24px;
  border-radius: 14px;
  background: var(--notes-bg);
  box-shadow: var(--ring-soft);
}

.update-idle-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
  background: color-mix(in srgb, var(--app-fg-muted) 12%, transparent);
  color: var(--app-fg-secondary);
}

.update-idle.is-success .update-idle-icon {
  background: color-mix(in srgb, var(--status-ok) 16%, transparent);
  color: var(--status-ok);
}

.update-idle.is-danger .update-idle-icon {
  background: color-mix(in srgb, var(--status-bad) 16%, transparent);
  color: var(--status-bad);
}

.update-idle.is-primary .update-idle-icon,
.update-idle.is-info .update-idle-icon {
  background: color-mix(in srgb, #0ea5e9 16%, transparent);
  color: color-mix(in srgb, #0ea5e9 40%, var(--app-fg));
}

.update-idle-title {
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--app-fg);
  line-height: 1.3;
}

.update-idle-ver {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-fg) 5%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--panel-border) 85%, transparent);
}

.update-idle-ver-label {
  font-size: var(--fs-xs);
  color: var(--app-fg-muted);
}

.update-idle-ver-num {
  font-size: var(--fs-md);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--app-fg);
}

.update-idle-hint {
  margin: 2px 0 0;
  max-width: 36em;
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  line-height: 1.55;
}

.update-idle.is-success .update-idle-hint {
  color: color-mix(in srgb, var(--status-ok) 55%, var(--app-fg-muted));
}

.update-idle.is-danger .update-idle-hint {
  color: color-mix(in srgb, var(--status-bad) 60%, var(--app-fg-muted));
}

.update-dev {
  color: var(--status-warn);
  font-size: var(--fs-xs);
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--status-warn) 14%, transparent);
}

.update-msg {
  margin: 0;
  padding: 14px 16px;
  border-radius: 10px;
  color: var(--app-fg-secondary);
  font-size: var(--fs-sm);
  line-height: 1.55;
  background: color-mix(in srgb, var(--app-fg) 4%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--panel-border) 80%, transparent);
}

.update-msg.is-error {
  color: var(--status-bad);
  background: color-mix(in srgb, var(--status-bad) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--status-bad) 22%, transparent);
}

.update-msg.is-ok {
  color: var(--status-ok);
  background: color-mix(in srgb, var(--status-ok) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--status-ok) 22%, transparent);
}

.update-msg.is-dev {
  color: color-mix(in srgb, var(--status-warn) 70%, var(--app-fg));
  background: color-mix(in srgb, var(--status-warn) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--status-warn) 22%, transparent);
}

.update-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--notes-bg);
  box-shadow: var(--ring-soft);
}

.update-progress-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--fs-sm);
  color: var(--app-fg-secondary);
}

.update-progress-pct {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--app-fg);
}

.update-progress-track {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--app-fg) 8%, transparent);
}

.update-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1b4dff 0%, #0ea5e9 50%, #14b8a6 100%);
  box-shadow: 0 0 12px color-mix(in srgb, #0ea5e9 35%, transparent);
  transition: width 0.25s ease;
}

.update-progress-meta {
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.update-notes {
  flex: 1 1 auto;
  border-radius: 12px;
  background: var(--notes-bg);
  box-shadow: var(--ring-soft);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: min(200px, 28vh);
}

.update-notes-title {
  flex-shrink: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--app-fg-secondary);
  padding: 12px 16px 10px;
  box-shadow: inset 0 -1px 0 0 var(--panel-border);
}

.update-notes-scroll {
  flex: 1 1 auto;
  max-height: min(420px, 52vh);
  min-height: 160px;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.notes-h {
  margin: 0;
  color: var(--app-fg);
  font-weight: 600;
  line-height: 1.35;
}

.notes-h2 {
  font-size: var(--fs-lg);
  margin-top: 2px;
}

.notes-h3 {
  font-size: var(--fs-md);
  margin-top: 4px;
}

.notes-h4 {
  font-size: var(--fs-sm);
  color: var(--app-fg-secondary);
  margin-top: 2px;
}

.notes-p {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--app-fg-secondary);
  line-height: 1.55;
}

.notes-ul {
  margin: 0;
  padding: 0 0 0 1.15em;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-sm);
  color: var(--app-fg-secondary);
  line-height: 1.5;
}

.notes-ul li::marker {
  color: #0ea5e9;
}

.notes-p :deep(code),
.notes-ul :deep(code),
.notes-h :deep(code) {
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Consolas, monospace;
  font-size: 0.92em;
  padding: 0 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--app-fg) var(--overlay-subtle), transparent);
  color: var(--app-fg);
}

.notes-p :deep(strong),
.notes-ul :deep(strong),
.notes-h :deep(strong) {
  color: var(--app-fg);
  font-weight: 600;
}

.update-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.btn-icon {
  margin-right: 4px;
  vertical-align: middle;
}

/* 仅标题状态图标旋转；勿用 is-loading，会与 el-button loading 类名冲突导致整钮旋转 */
.update-status-spin {
  animation: update-status-spin 0.9s linear infinite;
}

@keyframes update-status-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<style>
/* 弹窗外壳：与品牌一致的圆角与顶栏光感 */
.update-dialog.el-dialog {
  border-radius: 16px !important;
  overflow: hidden;
  background: var(--panel-bg) !important;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--panel-border) 90%, transparent),
  0 18px 48px rgba(0, 0, 0, 0.22) !important;
}

.update-dialog.el-dialog .el-dialog__header {
  margin: 0;
  padding: 22px 28px 16px;
  position: relative;
}

.update-dialog.el-dialog .el-dialog__header::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: linear-gradient(90deg, #1b4dff 0%, #0ea5e9 50%, #14b8a6 100%);
}

.update-dialog.el-dialog .el-dialog__body {
  padding: 12px 28px 10px;
}

.update-dialog.el-dialog .el-dialog__footer {
  padding: 16px 28px 22px;
}

.update-dialog.el-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
}

.update-dialog .el-button.update-btn-primary,
.update-dialog .el-button.update-btn-primary:focus,
.update-dialog .el-button.update-btn-primary:hover,
.update-dialog .el-button.update-btn-primary:active {
  border: none !important;
  color: #fff !important;
  background-image: linear-gradient(135deg, #1b4dff 0%, #0ea5e9 55%, #14b8a6 100%) !important;
  background-color: #0ea5e9 !important;
  box-shadow: 0 6px 16px color-mix(in srgb, #1b4dff 28%, transparent) !important;
}

.update-dialog .el-button.update-btn-primary:hover {
  filter: brightness(1.06);
}

.update-dialog .el-button.update-btn-primary:active {
  filter: brightness(0.96);
}

.update-dialog .el-button.update-btn-success {
  box-shadow: 0 6px 16px color-mix(in srgb, var(--status-ok) 28%, transparent);
}
</style>
