<script lang="ts" setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { type CompressTask, formatFileSize } from '@shared/types'
import {
  formatEta,
  optionsSummary,
  sizeCompareClass,
  sizeCompareText,
  statusLabel,
  statusType
} from '../utils/taskUi'

defineProps<{
  tasks: CompressTask[]
}>()

const emit = defineEmits<{
  startOne: [task: CompressTask]
  cancelOne: [taskId: string]
  removeOne: [taskId: string]
  openOutput: [task: CompressTask]
  showInFolder: [task: CompressTask]
}>()

/** 任务模式简写 */
function modeLabel(task: CompressTask): string {
  return task.options?.mode === 'audio' ? '音频' : '压缩'
}

const detailVisible = ref(false)
const detailTask = ref<CompressTask | null>(null)

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
</script>

<template>
  <div class="panel task-table">
    <div class="panel-title">
      <span>任务列表</span>
      <span class="muted">共 {{ tasks.length }} 项</span>
    </div>

    <div class="task-table-body">
    <el-table :data="tasks" empty-text="暂无任务，请添加视频" height="100%" stripe>
      <el-table-column label="文件名" min-width="150" prop="fileName" show-overflow-tooltip />
      <el-table-column label="模式" width="64">
        <template #default="{ row }">
          <el-tag
            :type="row.options?.mode === 'audio' ? 'warning' : 'info'"
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
  </div>
</template>

<style scoped>
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
</style>
