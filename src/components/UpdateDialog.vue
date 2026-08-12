<script lang="ts" setup>
import { computed } from 'vue'
import {
  CircleCheckFilled,
  Download,
  InfoFilled,
  Loading,
  Refresh,
  WarningFilled
} from '@element-plus/icons-vue'
import type { UpdateStatusPayload } from '@shared/types'

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
      return { type: 'info' as const, label: '正在检查', icon: Loading }
    case 'available':
      return { type: 'primary' as const, label: '发现新版本', icon: Download }
    case 'downloading':
      return { type: 'primary' as const, label: '下载中', icon: Download }
    case 'downloaded':
      return { type: 'success' as const, label: '下载完成', icon: CircleCheckFilled }
    case 'not-available':
      return { type: 'success' as const, label: '已是最新', icon: CircleCheckFilled }
    case 'error':
      return { type: 'danger' as const, label: '更新失败', icon: WarningFilled }
    default:
      return { type: 'info' as const, label: '软件更新', icon: InfoFilled }
  }
})

const showVersionCompare = computed(() => {
  const s = state.value
  return Boolean(
    props.updateInfo.version &&
      (s === 'available' || s === 'downloading' || s === 'downloaded')
  )
})

const downloadPercent = computed(() =>
  Math.min(100, Math.max(0, Math.round(props.updateInfo.percent || 0)))
)

const downloadDetail = computed(() => {
  const { transferred, total, bytesPerSecond } = props.updateInfo
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
  // 若为 HTML，去掉标签保留文本结构
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

  // 去掉顶层大标题（与弹窗版本信息重复）
  text = text.replace(/^#\s+FFmpeg[^\n]*\n+/i, '')

  const lines = text.split('\n')
  const blocks: NotesBlock[] = []
  let listItems: string[] = []
  let para: string[] = []

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'ul', items: listItems })
      listItems = []
    }
  }
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join(' ').trim() })
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
      blocks.push({ type: 'h', level, text: heading[2].trim() })
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

/** 行内 **粗体** 与 `代码` */
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
    width="min(680px, 94vw)"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="update-header">
        <div class="update-header-icon" :class="`is-${statusMeta.type}`">
          <el-icon :size="20" :class="{ 'is-loading': state === 'checking' }">
            <component :is="statusMeta.icon" />
          </el-icon>
        </div>
        <div class="update-header-text">
          <div class="update-title">{{ statusMeta.label }}</div>
          <div class="update-subtitle">
            <span>当前 v{{ appVersion }}</span>
            <span v-if="!isPackaged" class="update-dev">开发模式</span>
          </div>
        </div>
      </div>
    </template>

    <div class="update-body">
      <div v-if="showVersionCompare" class="update-version-row">
        <div class="ver-card">
          <span class="ver-label">当前</span>
          <span class="ver-num">v{{ appVersion }}</span>
        </div>
        <span class="ver-arrow" aria-hidden="true">→</span>
        <div class="ver-card is-new">
          <span class="ver-label">最新</span>
          <span class="ver-num">v{{ updateInfo.version }}</span>
        </div>
      </div>

      <p
        v-if="updateInfo.message"
        class="update-msg"
        :class="{
          'is-error': state === 'error',
          'is-ok': state === 'not-available' || state === 'downloaded'
        }"
      >
        {{ updateInfo.message }}
      </p>

      <div v-if="state === 'downloading'" class="update-progress">
        <el-progress
          :percentage="downloadPercent"
          :stroke-width="10"
          striped
          striped-flow
        />
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
    </div>

    <template #footer>
      <div class="update-footer">
        <el-button @click="close">关闭</el-button>
        <el-button
          v-if="state === 'available'"
          :loading="updateDownloading"
          type="primary"
          @click="emit('downloadUpdate')"
        >
          <el-icon v-if="!updateDownloading" class="btn-icon"><Download /></el-icon>
          下载更新
        </el-button>
        <el-button
          v-if="state === 'downloaded'"
          type="success"
          @click="emit('installUpdate')"
        >
          <el-icon class="btn-icon"><Refresh /></el-icon>
          重启并安装
        </el-button>
        <el-button
          v-if="state === 'error' || state === 'not-available' || state === 'idle'"
          :loading="updateChecking"
          type="primary"
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
  gap: var(--space-3);
  min-width: 0;
}

.update-header-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary);
}

.update-header-icon.is-success {
  background: color-mix(in srgb, var(--status-ok) 16%, transparent);
  color: var(--status-ok);
}

.update-header-icon.is-danger {
  background: color-mix(in srgb, var(--status-bad) 16%, transparent);
  color: var(--status-bad);
}

.update-header-icon.is-info {
  background: color-mix(in srgb, var(--app-fg-muted) 12%, transparent);
  color: var(--app-fg-secondary);
}

.update-header-text {
  min-width: 0;
}

.update-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  color: var(--app-fg);
  line-height: 1.3;
}

.update-subtitle {
  margin-top: 2px;
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.update-dev {
  color: var(--status-warn);
  font-size: var(--fs-xs);
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--status-warn) 14%, transparent);
}

.update-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--fs-md);
  color: var(--app-fg-secondary);
  line-height: 1.55;
}

.update-version-row {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
}

.ver-card {
  flex: 1;
  min-width: 0;
  padding: 10px var(--space-3);
  border-radius: var(--radius-md);
  border: none;
  background: var(--notes-bg);
  box-shadow: var(--ring-soft);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ver-card.is-new {
  background: color-mix(in srgb, var(--primary) 8%, var(--notes-bg));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 40%, transparent);
}

.ver-label {
  font-size: var(--fs-xs);
  color: var(--app-fg-muted);
}

.ver-num {
  font-size: var(--fs-lg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--app-fg);
}

.ver-card.is-new .ver-num {
  color: var(--link-color);
}

.ver-arrow {
  align-self: center;
  color: var(--app-fg-muted);
  font-size: var(--fs-lg);
  flex-shrink: 0;
  padding: 0 2px;
}

.update-msg {
  margin: 0;
  color: var(--app-fg);
  font-size: var(--fs-md);
}

.update-msg.is-error {
  color: var(--status-bad);
}

.update-msg.is-ok {
  color: var(--status-ok);
}

.update-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.update-progress-meta {
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.update-notes {
  border: none;
  border-radius: var(--radius-md);
  background: var(--notes-bg);
  box-shadow: var(--ring-soft);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.update-notes-title {
  flex-shrink: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--app-fg-secondary);
  padding: 10px var(--space-3) 8px;
  border-bottom: none;
  box-shadow: inset 0 -1px 0 0 var(--panel-border);
}

.update-notes-scroll {
  max-height: min(400px, 52vh);
  overflow: auto;
  padding: var(--space-3) 10px var(--space-3) var(--space-3);
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
  color: var(--app-fg-muted);
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

.is-loading {
  animation: update-spin 0.9s linear infinite;
}

@keyframes update-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
