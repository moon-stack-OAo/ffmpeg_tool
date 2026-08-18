<script lang="ts" setup>
import {ref, toRef} from 'vue'
import {ElMessage} from 'element-plus'
import {type CompressTask, formatFileSize} from '@shared/types'
import {
  formatEta,
  modeLabel as modeLabelText,
  optionsSummary,
  sizeCompareClass,
  sizeCompareText,
  statusLabel,
  statusType
} from '../utils/taskUi'
import {useTaskThumbs} from '../composables/useTaskThumbs'

const props = defineProps<{
  tasks: CompressTask[]
  hasPending: boolean
  hasActive: boolean
  selectedTaskId?: string | null
}>()

const { thumbUrl, thumbLoading, isAudioMode, ensurePreview } = useTaskThumbs(
  toRef(props, 'tasks')
)

const previewVisible = ref(false)
const previewUrl = ref('')
const previewTitle = ref('')
const previewBusy = ref(false)

async function openThumbPreview(task: CompressTask, e?: Event): Promise<void> {
  e?.stopPropagation()
  if (isAudioMode(task.options?.mode)) return
  if (!thumbUrl(task.id) && !thumbLoading(task.id)) return
  previewTitle.value = task.fileName || task.id
  previewUrl.value = thumbUrl(task.id) || ''
  previewVisible.value = true
  previewBusy.value = true
  try {
    const hi = await ensurePreview(task.id)
    if (hi) previewUrl.value = hi
  } finally {
    previewBusy.value = false
  }
}

const emit = defineEmits<{
  startOne: [task: CompressTask]
  cancelOne: [taskId: string]
  removeOne: [taskId: string]
  openOutput: [task: CompressTask]
  showInFolder: [task: CompressTask]
  selectTask: [taskId: string]
  startAll: []
  cancelAll: []
  clearFinished: []
  clearAll: []
  removeStitchInput: [taskId: string, index: number]
  appendStitchInputs: [taskId: string]
  reorderStitchInput: [taskId: string, index: number, direction: 'up' | 'down']
}>()

function onRowClick(row: CompressTask): void {
  emit('selectTask', row.id)
}

function rowClassName({ row }: { row: CompressTask }): string {
  return props.selectedTaskId && row.id === props.selectedTaskId
    ? 'task-row-selected'
    : ''
}

/** 任务模式简写 */
function modeLabel(task: CompressTask): string {
  return modeLabelText(task.options?.mode)
}

function modeTagType(
  task: CompressTask
): '' | 'success' | 'warning' | 'info' | 'danger' {
  const m = task.options?.mode
  if (m === 'audio') return 'warning'
  if (m === 'image' || m === 'image-crop' || m === 'image-stitch') return 'success'
  if (m === 'video-concat') return 'danger'
  if (m === 'media-compose') return 'warning'
  return 'info'
}

const detailVisible = ref(false)
const detailTask = ref<CompressTask | null>(null)
/** 展开的拼接输入列表 taskId */
const expandedStitchIds = ref<Set<string>>(new Set())

function openDetail(task: CompressTask): void {
  detailTask.value = task
  detailVisible.value = true
}

async function copyCommand(): Promise<void> {
  const cmd = detailTask.value?.commandLine
  if (!cmd) return
  try {
    await navigator.clipboard.writeText(cmd)
    ElMessage.success('已复制命令行')
  } catch {
    ElMessage.error('复制失败')
  }
}

function onActionCommand(cmd: string, row: CompressTask): void {
  if (cmd === 'folder') emit('showInFolder', row)
  else if (cmd === 'detail') openDetail(row)
  else if (cmd === 'remove') emit('removeOne', row.id)
}

function isStitchTask(task: CompressTask): boolean {
  const m = task.options?.mode
  return m === 'image-stitch' || m === 'video-concat'
}

function stitchPaths(task: CompressTask): string[] {
  const multi = (task.inputPaths || [])
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  if (multi.length > 0) return multi
  const single =
    typeof task.inputPath === 'string' ? task.inputPath.trim() : ''
  return single ? [single] : []
}

function stitchCount(task: CompressTask): number {
  return stitchPaths(task).length
}

function isStitchEditable(task: CompressTask): boolean {
  return (
    isStitchTask(task) &&
    (task.status === 'pending' || task.status === 'failed')
  )
}

function isStitchExpanded(taskId: string): boolean {
  return expandedStitchIds.value.has(taskId)
}

function toggleStitchExpand(taskId: string, e?: Event): void {
  e?.stopPropagation()
  const next = new Set(expandedStitchIds.value)
  if (next.has(taskId)) next.delete(taskId)
  else next.add(taskId)
  expandedStitchIds.value = next
}

function baseName(p: string): string {
  const s = p.replace(/\\/g, '/')
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}
</script>

<template>
  <div class="panel task-table">
    <div class="panel-title">
      <div class="panel-title-left">
        <span>任务列表</span>
        <span class="muted">共 {{ tasks.length }} 项</span>
      </div>
      <div class="panel-title-actions">
        <el-button
          :disabled="!hasPending && !tasks.length"
          size="small"
          type="success"
          @click="emit('startAll')"
        >
          全部开始
        </el-button>
        <el-button
          :disabled="!hasActive"
          size="small"
          type="warning"
          @click="emit('cancelAll')"
        >
          全部取消
        </el-button>
        <el-button size="small" @click="emit('clearFinished')">清除已完成</el-button>
        <el-button plain size="small" type="danger" @click="emit('clearAll')">
          清空列表
        </el-button>
      </div>
    </div>

    <div class="task-table-body">
    <el-table
      :data="tasks"
      :row-class-name="rowClassName"
      empty-text="暂无任务，请添加文件"
      height="100%"
      highlight-current-row
      stripe
      @row-click="onRowClick"
    >
      <el-table-column label="文件名" min-width="220">
        <template #default="{ row }">
          <div class="file-cell-row">
            <button
              :class="{
                'is-audio': isAudioMode(row.options?.mode),
                'is-loading': thumbLoading(row.id),
                'is-empty':
                  !thumbUrl(row.id) &&
                  !thumbLoading(row.id) &&
                  !isAudioMode(row.options?.mode),
                'is-clickable': Boolean(thumbUrl(row.id))
              }"
              :disabled="!thumbUrl(row.id)"
              :title="thumbUrl(row.id) ? '点击查看大图' : undefined"
              class="file-thumb"
              type="button"
              @click="openThumbPreview(row, $event)"
            >
              <img
                v-if="thumbUrl(row.id)"
                :src="thumbUrl(row.id)!"
                alt=""
                class="file-thumb-img"
                draggable="false"
              />
            </button>
            <div class="file-cell">
            <span class="file-name" :title="row.fileName">{{ row.fileName }}</span>
            <template v-if="isStitchTask(row)">
              <button
                type="button"
                class="stitch-count-btn"
                :class="{ warn: stitchCount(row) < 2 }"
                @click="toggleStitchExpand(row.id, $event)"
              >
                共 {{ stitchCount(row) }} 个文件
                <span class="stitch-chevron" :class="{ open: isStitchExpanded(row.id) }">▸</span>
              </button>
              <div
                v-if="isStitchExpanded(row.id)"
                class="stitch-list"
                @click.stop
              >
                <div
                  v-for="(p, idx) in stitchPaths(row)"
                  :key="`${row.id}-${idx}-${p}`"
                  class="stitch-item"
                >
                  <span class="stitch-idx">{{ idx + 1 }}.</span>
                  <span class="stitch-name" :title="p">{{ baseName(p) }}</span>
                  <template v-if="isStitchEditable(row)">
                    <el-button
                      link
                      size="small"
                      :disabled="idx === 0"
                      @click="emit('reorderStitchInput', row.id, idx, 'up')"
                    >
                      上移
                    </el-button>
                    <el-button
                      link
                      size="small"
                      :disabled="idx >= stitchPaths(row).length - 1"
                      @click="emit('reorderStitchInput', row.id, idx, 'down')"
                    >
                      下移
                    </el-button>
                    <el-button
                      link
                      size="small"
                      type="danger"
                      :disabled="stitchPaths(row).length <= 1"
                      @click="emit('removeStitchInput', row.id, idx)"
                    >
                      移除
                    </el-button>
                  </template>
                </div>
                <div v-if="isStitchEditable(row)" class="stitch-actions">
                  <el-button
                    size="small"
                    type="primary"
                    plain
                    @click="emit('appendStitchInputs', row.id)"
                  >
                    追加文件
                  </el-button>
                  <span v-if="stitchCount(row) < 2" class="stitch-warn">
                    至少 2 个文件才能启动
                  </span>
                </div>
              </div>
            </template>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="模式" width="64">
        <template #default="{ row }">
          <el-tag
            :type="modeTagType(row)"
            effect="plain"
            size="small"
          >
            {{ modeLabel(row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="进度" min-width="130">
        <template #default="{ row }">
          <el-progress
            :percentage="Number(row.progress || 0)"
            :status="
              row.status === 'completed'
                ? 'success'
                : row.status === 'failed'
                  ? 'exception'
                  : undefined
            "
            :stroke-width="12"
          />
        </template>
      </el-table-column>
      <el-table-column label="原始" width="88">
        <template #default="{ row }">
          <span class="size-text">{{ formatFileSize(row.inputSize) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="输出" width="88">
        <template #default="{ row }">
          <span class="size-text">
            {{ row.status === 'completed' ? formatFileSize(row.outputSize) : '—' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="节省" width="80">
        <template #default="{ row }">
          <span :class="sizeCompareClass(row)" class="size-text">
            {{ sizeCompareText(row) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="时间/速度" width="140">
        <template #default="{ row }">
          <span class="meta-text">
            {{ row.time || '-' }}
            <template v-if="row.speed"> / {{ row.speed }}</template>
            <template v-if="row.status === 'running' && row.etaSec != null">
              <br />
              <span class="meta-muted">{{ formatEta(row.etaSec) }}</span>
            </template>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="信息" min-width="110">
        <template #default="{ row }">
          <span v-if="row.error" :title="row.error" class="err-text">{{ row.error }}</span>
          <span
            v-else-if="row.status === 'completed'"
            :title="row.resolvedEncoder"
            class="meta-ok"
          >
            完成{{ row.resolvedEncoder ? ` · ${row.resolvedEncoder}` : '' }}
          </span>
          <span v-else class="meta-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column fixed="right" label="操作" width="130" class-name="task-actions-col">
        <template #default="{ row }">
          <div class="task-actions">
            <el-button
              v-if="
                row.status === 'pending' ||
                row.status === 'failed' ||
                row.status === 'cancelled'
              "
              link
              size="small"
              type="primary"
              @click="emit('startOne', row)"
            >
              开始
            </el-button>
            <el-button
              v-else-if="row.status === 'running' || row.status === 'queued'"
              link
              size="small"
              type="warning"
              @click="emit('cancelOne', row.id)"
            >
              取消
            </el-button>
            <el-button
              v-else-if="row.status === 'completed' && row.outputPath"
              link
              size="small"
              type="primary"
              @click="emit('openOutput', row)"
            >
              打开
            </el-button>

            <el-dropdown trigger="click" @command="(cmd: string) => onActionCommand(cmd, row)">
              <el-button link size="small">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-if="row.status === 'completed' && row.outputPath"
                    command="folder"
                  >
                    文件夹
                  </el-dropdown-item>
                  <el-dropdown-item command="detail">详情</el-dropdown-item>
                  <el-dropdown-item command="remove" divided>
                    <span class="action-danger">移除</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-drawer
      v-model="detailVisible"
      title="任务详情"
      size="480px"
      direction="rtl"
    >
      <template v-if="detailTask">
        <div class="detail-block">
          <div class="detail-label">输入</div>
          <div class="detail-value mono">{{ detailTask.inputPath }}</div>
        </div>
        <div class="detail-block">
          <div class="detail-label">输出</div>
          <div class="detail-value mono">{{ detailTask.outputPath || '—' }}</div>
        </div>
        <div class="detail-block">
          <div class="detail-label">状态</div>
          <div class="detail-value">
            {{ statusLabel(detailTask.status) }}
            <template v-if="detailTask.resolvedEncoder">
              · {{ detailTask.resolvedEncoder }}
            </template>
          </div>
        </div>
        <div class="detail-block">
          <div class="detail-label">参数摘要</div>
          <pre class="detail-pre">{{ optionsSummary(detailTask) }}</pre>
        </div>
        <div class="detail-block">
          <div class="detail-label">
            命令行
            <el-button
              v-if="detailTask.commandLine"
              link
              size="small"
              type="primary"
              @click="copyCommand"
            >
              复制
            </el-button>
          </div>
          <pre class="detail-pre mono">{{ detailTask.commandLine || '（任务结束后可查看）' }}</pre>
        </div>
        <div v-if="detailTask.error" class="detail-block">
          <div class="detail-label">错误</div>
          <pre class="detail-pre err">{{ detailTask.error }}</pre>
        </div>
      </template>
    </el-drawer>

    <el-dialog
      v-model="previewVisible"
      :title="previewTitle || '预览'"
      align-center
      class="thumb-preview-dialog"
      destroy-on-close
      width="min(920px, 94vw)"
      @closed="previewUrl = ''"
    >
       <div :class="{ 'is-loading': previewBusy }" class="thumb-preview-body">
         <span v-if="previewBusy" aria-hidden="true" class="thumb-preview-loading"></span>
         <img
          v-if="previewUrl"
          :alt="previewTitle"
          :src="previewUrl"
          class="thumb-preview-img"
        />
        <div v-else class="thumb-preview-empty muted">暂无预览</div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.panel-title-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.panel-title-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  min-width: 0;
}

.task-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.task-table-body {
  flex: 1;
  min-height: 180px;
  overflow: hidden;
}

.meta-text {
  font-size: var(--fs-sm);
  color: var(--app-fg-secondary);
}

.meta-muted {
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
}

.meta-ok {
  font-size: var(--fs-sm);
  color: var(--status-ok);
}

.detail-block {
  margin-bottom: var(--space-4);
}

.detail-label {
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  margin-bottom: var(--space-1);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.detail-value {
  font-size: var(--fs-md);
  color: var(--app-fg);
  word-break: break-all;
}

.detail-pre {
  margin: 0;
  padding: var(--space-2) 10px;
  background: var(--notes-bg);
  border-radius: var(--radius-xs);
  font-size: var(--fs-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
  color: var(--app-fg-secondary);
}

.detail-pre.mono,
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.detail-pre.err {
  color: var(--status-bad);
  background: color-mix(in srgb, var(--status-bad) 12%, transparent);
}

.task-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: nowrap;
}

.action-danger {
  color: var(--status-bad);
}

:deep(.task-row-selected > td.el-table__cell) {
  background: color-mix(in srgb, var(--el-color-primary) 14%, transparent) !important;
}

:deep(.el-table__body tr.task-row-selected:hover > td.el-table__cell) {
  background: color-mix(in srgb, var(--el-color-primary) 20%, transparent) !important;
}

.file-cell-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 2px 0;
}

.file-thumb {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 8px;
  flex-shrink: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--app-fg-muted) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-fg-muted) 22%, transparent);
  cursor: default;
}

.file-thumb.is-clickable {
  cursor: zoom-in;
}

.file-thumb.is-clickable:hover {
  border-color: color-mix(in srgb, var(--el-color-primary) 55%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 22%, transparent);
}

.file-thumb:disabled {
  cursor: default;
}

.file-thumb.is-audio {
  background: color-mix(in srgb, var(--el-color-warning) 16%, transparent);
  border-color: color-mix(in srgb, var(--el-color-warning) 28%, transparent);
}

.file-thumb.is-loading {
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--app-fg-muted) 10%, transparent) 25%,
      color-mix(in srgb, var(--app-fg-muted) 18%, transparent) 37%,
      color-mix(in srgb, var(--app-fg-muted) 10%, transparent) 63%
    );
  background-size: 400% 100%;
  animation: thumb-shimmer 1.2s ease-in-out infinite;
}

.file-thumb.is-empty {
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--app-fg-muted) 14%, transparent),
      color-mix(in srgb, var(--app-fg-muted) 6%, transparent)
    );
}

.file-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.thumb-preview-body {
  position: relative;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--app-fg-muted) 8%, transparent);
  border-radius: 10px;
  overflow: auto;
  max-height: min(78vh, 760px);
}

.thumb-preview-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  border: 2px solid color-mix(in srgb, var(--app-fg-muted) 25%, transparent);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: thumb-preview-spin 0.8s linear infinite;
  pointer-events: none;
}

@keyframes thumb-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

.thumb-preview-img {
  max-width: 100%;
  max-height: min(78vh, 760px);
  object-fit: contain;
  display: block;
}

.thumb-preview-empty {
  padding: 40px 16px;
  font-size: var(--fs-sm);
}

@keyframes thumb-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}

.file-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.stitch-count-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--el-color-primary);
  font-size: var(--fs-sm);
  cursor: pointer;
  line-height: 1.3;
}

.stitch-count-btn.warn {
  color: var(--el-color-warning);
}

.stitch-count-btn:hover {
  text-decoration: underline;
}

.stitch-chevron {
  display: inline-block;
  font-size: 10px;
  transition: transform 0.15s ease;
}

.stitch-chevron.open {
  transform: rotate(90deg);
}

.stitch-list {
  width: 100%;
  max-width: 360px;
  margin-top: 2px;
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--app-fg) 6%, transparent);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stitch-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: var(--fs-sm);
}

.stitch-idx {
  color: var(--app-fg-muted);
  flex-shrink: 0;
}

.stitch-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-fg-secondary);
}

.stitch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.stitch-warn {
  font-size: var(--fs-sm);
  color: var(--el-color-warning);
}
</style>
