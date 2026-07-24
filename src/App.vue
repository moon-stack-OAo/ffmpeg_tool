<script lang="ts" setup>
import {computed, onMounted, onUnmounted, reactive, ref, watch} from 'vue'
import {ElMessage} from 'element-plus'
import {Folder, FolderOpened} from '@element-plus/icons-vue'
import {
  type CompressOptions,
  type CompressTask,
  CONCURRENCY_OPTIONS,
  DEFAULT_PRESETS,
  ENCODER_OPTIONS,
  type EncoderDetectResult,
  type EncoderId,
  type FfmpegStatus,
  formatFileSize,
  formatSaveRatio,
  OUTPUT_FORMAT_OPTIONS,
  type OutputFormat,
  type PresetId,
  type TaskStatus,
  type UpdateStatusPayload,
  VIDEO_EXTENSIONS
} from '@shared/types'

const ffmpegStatus = ref<FfmpegStatus>({ ready: false })
const encoderInfo = ref<EncoderDetectResult | null>(null)
const outputDir = ref('')
const presetId = ref<PresetId>('standard')
const tasks = ref<CompressTask[]>([])
const dragging = ref(false)
const concurrency = ref(2)
const encoder = ref<EncoderId>('auto')

/** 当前应用版本与自动更新 */
const appVersion = ref('—')
const isPackaged = ref(false)
const updateDialogVisible = ref(false)
const updateChecking = ref(false)
const updateDownloading = ref(false)
const updateInfo = ref<UpdateStatusPayload>({ state: 'idle' })

const custom = reactive({
  crf: 23,
  maxEdge: 0,
  format: 'mp4' as OutputFormat
})

let offProgress: (() => void) | undefined
let offEnd: (() => void) | undefined
let offQueued: (() => void) | undefined
let offUpdate: (() => void) | undefined

const currentPreset = computed(() => {
  return DEFAULT_PRESETS.find((p) => p.id === presetId.value) || DEFAULT_PRESETS[1]
})

const isCustom = computed(() => presetId.value === 'custom')

const hasPending = computed(() =>
  tasks.value.some((t) => t.status === 'pending' || t.status === 'failed')
)

const hasActive = computed(() =>
  tasks.value.some((t) => t.status === 'running' || t.status === 'queued')
)

/** 是否选择了 WebM（硬件加速不适用） */
const isWebm = computed(() => {
  if (presetId.value === 'custom') return custom.format === 'webm'
  return currentPreset.value.format === 'webm'
})

/** 汇总体积对比（仅已完成任务） */
const sizeSummary = computed(() => {
  const done = tasks.value.filter(
    (t) =>
      t.status === 'completed' &&
      t.inputSize != null &&
      t.outputSize != null &&
      t.inputSize > 0
  )
  const totalIn = done.reduce((s, t) => s + (t.inputSize || 0), 0)
  const totalOut = done.reduce((s, t) => s + (t.outputSize || 0), 0)
  return {
    count: done.length,
    totalIn,
    totalOut,
    ratio: formatSaveRatio(totalIn, totalOut)
  }
})

function buildOptions(): CompressOptions {
  const p = currentPreset.value
  if (presetId.value === 'custom') {
    return {
      presetId: 'custom',
      crf: custom.crf,
      maxEdge: custom.maxEdge,
      format: custom.format,
      outputDir: outputDir.value,
      encoder: encoder.value
    }
  }
  return {
    presetId: p.id,
    crf: p.crf,
    maxEdge: p.maxEdge,
    format: p.format,
    outputDir: outputDir.value,
    encoder: encoder.value
  }
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isVideoExt(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  const idx = lower.lastIndexOf('.')
  if (idx < 0) return false
  const ext = lower.slice(idx)
  return (VIDEO_EXTENSIONS as string[]).includes(ext)
}

function addFiles(files: Array<{ path: string; name: string }>): void {
  const existing = new Set(tasks.value.map((t) => t.inputPath))
  let added = 0
  let skippedDup = 0
  let skippedInvalid = 0
  for (const f of files) {
    if (!f.path) {
      skippedInvalid += 1
      continue
    }
    if (!isVideoExt(f.name || f.path)) {
      skippedInvalid += 1
      continue
    }
    if (existing.has(f.path)) {
      skippedDup += 1
      continue
    }
    const options = buildOptions()
    const task: CompressTask = {
      id: genId(),
      inputPath: f.path,
      fileName: f.name,
      outputPath: '',
      status: 'pending',
      progress: 0,
      options
    }
    tasks.value.push(task)
    existing.add(f.path)
    added += 1
  }
  if (added > 0) {
    ElMessage.success(`已添加 ${added} 个文件`)
  } else if (skippedDup > 0 && skippedInvalid === 0) {
    ElMessage.info('文件已在列表中')
  } else if (skippedInvalid > 0 && added === 0) {
    ElMessage.warning('未添加有效视频文件')
  }
}

async function onSelectFiles(): Promise<void> {
  const res = await window.electronAPI.selectFiles()
  addFiles(res.files)
}

async function onSelectOutput(): Promise<void> {
  const res = await window.electronAPI.selectDirectory()
  if (res.path) {
    outputDir.value = res.path
  }
}

function syncPendingOptions(): void {
  const opts = buildOptions()
  tasks.value = tasks.value.map((t) => {
    if (t.status === 'pending' || t.status === 'failed') {
      return { ...t, options: { ...opts } }
    }
    return t
  })
}

function onPresetChange(id: PresetId): void {
  presetId.value = id
  const p = DEFAULT_PRESETS.find((x) => x.id === id)
  if (p && id !== 'custom') {
    custom.crf = p.crf
    custom.maxEdge = p.maxEdge
    custom.format = p.format
  }
  syncPendingOptions()
}

function onEncoderChange(v: EncoderId): void {
  encoder.value = v
  syncPendingOptions()
}

async function onConcurrencyChange(n: number): Promise<void> {
  concurrency.value = n
  const res = await window.electronAPI.setConcurrency(n)
  concurrency.value = res.concurrency
}

function statusLabel(s: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    pending: '待处理',
    queued: '排队中',
    running: '压缩中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
  return map[s] || s
}

function statusType(s: TaskStatus): '' | 'success' | 'warning' | 'info' | 'danger' {
  if (s === 'completed') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'running') return 'warning'
  if (s === 'queued') return 'info'
  if (s === 'cancelled') return 'info'
  return ''
}

/** 任务体积对比文案（仅完成态） */
function sizeCompareText(row: CompressTask): string {
  if (row.status !== 'completed') return '—'
  const ratio = formatSaveRatio(row.inputSize, row.outputSize)
  if (!ratio) return '—'
  return ratio
}

function sizeCompareClass(row: CompressTask): string {
  if (row.status !== 'completed') return ''
  const ratio = formatSaveRatio(row.inputSize, row.outputSize)
  if (!ratio) return ''
  if (ratio.startsWith('-')) return 'save-good'
  if (ratio.startsWith('+')) return 'save-bad'
  return ''
}

async function startOne(task: CompressTask): Promise<void> {
  if (!outputDir.value) {
    ElMessage.warning('请先选择输出目录')
    return
  }
  if (!ffmpegStatus.value.ready) {
    ElMessage.error(ffmpegStatus.value.error || 'ffmpeg 未就绪')
    return
  }

  const options = { ...buildOptions(), outputDir: outputDir.value }
  const payload: CompressTask = {
    ...task,
    options,
    status: 'queued',
    progress: 0,
    error: undefined,
    outputSize: undefined
  }

  updateTask(task.id, {
    options,
    status: 'queued',
    progress: 0,
    error: undefined,
    outputSize: undefined
  })

  const res = await window.electronAPI.startTask(payload)
  if (!res.ok) {
    updateTask(task.id, { status: 'failed', error: res.error })
    ElMessage.error(res.error || '启动失败')
  }
}

async function startAll(): Promise<void> {
  if (!outputDir.value) {
    ElMessage.warning('请先选择输出目录')
    return
  }
  if (!ffmpegStatus.value.ready) {
    ElMessage.error(ffmpegStatus.value.error || 'ffmpeg 未就绪')
    return
  }

  const candidates = tasks.value.filter(
    (t) => t.status === 'pending' || t.status === 'failed' || t.status === 'cancelled'
  )
  if (!candidates.length) {
    ElMessage.info('没有可开始的任务')
    return
  }

  const options = { ...buildOptions(), outputDir: outputDir.value }
  const payload = candidates.map((t) => ({
    ...t,
    options,
    status: 'queued' as const,
    progress: 0,
    error: undefined,
    outputSize: undefined
  }))

  for (const t of payload) {
    updateTask(t.id, {
      options,
      status: 'queued',
      progress: 0,
      error: undefined,
      outputSize: undefined
    })
  }

  const res = await window.electronAPI.startTasks(payload)
  if (!res.ok) {
    ElMessage.error(res.error || '批量启动失败')
  } else {
    ElMessage.success(`已提交 ${payload.length} 个任务（并发 ${concurrency.value}）`)
  }
}

async function cancelOne(taskId: string): Promise<void> {
  await window.electronAPI.cancelTask(taskId)
}

async function cancelAll(): Promise<void> {
  await window.electronAPI.cancelAll()
}

function clearFinished(): void {
  tasks.value = tasks.value.filter(
    (t) => t.status === 'pending' || t.status === 'queued' || t.status === 'running'
  )
}

function clearAll(): void {
  if (hasActive.value) {
    ElMessage.warning('请先取消进行中的任务')
    return
  }
  tasks.value = []
}

function removeOne(taskId: string): void {
  const t = tasks.value.find((x) => x.id === taskId)
  if (!t) return
  if (t.status === 'running' || t.status === 'queued') {
    void cancelOne(taskId)
  }
  tasks.value = tasks.value.filter((x) => x.id !== taskId)
}

function updateTask(id: string, patch: Partial<CompressTask>): void {
  tasks.value = tasks.value.map((t) => (t.id === id ? { ...t, ...patch } : t))
}

function applyUpdateStatus(payload: UpdateStatusPayload): void {
  updateInfo.value = {
    ...payload,
    currentVersion: payload.currentVersion || appVersion.value
  }
  updateChecking.value = payload.state === 'checking'
  updateDownloading.value = payload.state === 'downloading'

  if (payload.state === 'available') {
    updateDialogVisible.value = true
  } else if (payload.state === 'downloaded') {
    updateDialogVisible.value = true
    ElMessage.success(payload.message || '更新已下载')
  } else if (payload.state === 'error') {
    // 手动检查时弹出；启动静默检查只记状态
    if (updateDialogVisible.value) {
      ElMessage.error(payload.message || '检查更新失败')
    }
  } else if (payload.state === 'not-available' && updateDialogVisible.value) {
    ElMessage.success(payload.message || '已是最新版本')
  }
}

async function onCheckUpdate(): Promise<void> {
  updateDialogVisible.value = true
  updateChecking.value = true
  try {
    const res = await window.electronAPI.checkForUpdates()
    // 事件会覆盖最终状态；此处兜底
    if (res?.state && res.state !== 'checking') {
      applyUpdateStatus(res)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    applyUpdateStatus({ state: 'error', message, currentVersion: appVersion.value })
  } finally {
    updateChecking.value = false
  }
}

async function onDownloadUpdate(): Promise<void> {
  updateDownloading.value = true
  const res = await window.electronAPI.downloadUpdate()
  if (!res.ok) {
    updateDownloading.value = false
    ElMessage.error(res.error || '下载失败')
  }
}

async function onInstallUpdate(): Promise<void> {
  const res = await window.electronAPI.installUpdate()
  if (!res.ok) {
    ElMessage.error(res.error || '安装失败')
  }
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
  dragging.value = true
}

function onDragEnter(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  dragging.value = true
}

function onDragLeave(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  // 仅当离开 drop-zone 本身时取消高亮
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as Node | null
  if (related && target.contains(related)) return
  dragging.value = false
}

async function onDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  dragging.value = false

  const fileList = e.dataTransfer?.files
  if (!fileList || fileList.length === 0) {
    ElMessage.info('未检测到文件，请使用「添加视频」按钮')
    return
  }

  const files: Array<{ path: string; name: string }> = []
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList.item(i)
    if (!file) continue
    // 通过 preload 暴露的 webUtils.getPathForFile 取真实路径
    let path = ''
    try {
      path = window.electronAPI.getPathForFile(file)
    } catch {
      path = ''
    }
    if (!path) continue
    files.push({ path, name: file.name })
  }

  if (!files.length) {
    ElMessage.warning('无法获取文件路径，请改用「添加视频」按钮')
    return
  }

  addFiles(files)
}

watch(
  () => [custom.crf, custom.maxEdge, custom.format],
  () => {
    if (presetId.value === 'custom') {
      syncPendingOptions()
    }
  }
)

onMounted(async () => {
  ffmpegStatus.value = await window.electronAPI.getFfmpegStatus()

  try {
    const ver = await window.electronAPI.getAppVersion()
    appVersion.value = ver.version
    isPackaged.value = ver.packaged
  } catch {
    appVersion.value = '—'
  }

  try {
    const c = await window.electronAPI.getConcurrency()
    concurrency.value = c.concurrency
  } catch {
    concurrency.value = 2
  }

  try {
    encoderInfo.value = await window.electronAPI.detectEncoders()
  } catch {
    encoderInfo.value = null
  }

  offProgress = window.electronAPI.onTaskProgress((p) => {
    updateTask(p.taskId, {
      status: 'running',
      progress: p.percent,
      time: p.time,
      speed: p.speed
    })
  })

  offEnd = window.electronAPI.onTaskEnd((p) => {
    updateTask(p.taskId, {
      status: p.status,
      progress: p.status === 'completed' ? 100 : undefined,
      error: p.error,
      outputPath: p.outputPath,
      inputSize: p.inputSize,
      outputSize: p.outputSize,
      resolvedEncoder: p.resolvedEncoder
    })
    if (p.status === 'failed') {
      ElMessage.error(p.error || '任务失败')
    }
  })

  offQueued = window.electronAPI.onTaskQueued((taskId) => {
    updateTask(taskId, { status: 'queued' })
  })

  offUpdate = window.electronAPI.onUpdateStatus((p) => {
    applyUpdateStatus(p)
  })
})

onUnmounted(() => {
  offProgress?.()
  offEnd?.()
  offQueued?.()
  offUpdate?.()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-tag :type="ffmpegStatus.ready ? 'success' : 'danger'" effect="plain">
        FFmpeg {{ ffmpegStatus.ready ? '就绪' : '未就绪' }}
      </el-tag>
      <span v-if="!ffmpegStatus.ready" class="status-bad" style="font-size: 12px">
        {{ ffmpegStatus.error }}
      </span>

      <el-button :icon="FolderOpened" type="primary" @click="onSelectFiles">
        添加视频
      </el-button>
      <el-button :icon="Folder" @click="onSelectOutput">输出目录</el-button>
      <span :title="outputDir" class="path-text">
        {{ outputDir || '未选择输出目录' }}
      </span>

      <div style="flex: 1" />

      <el-tag effect="plain" size="small" type="info">v{{ appVersion }}</el-tag>
      <el-button :loading="updateChecking" plain size="small" @click="onCheckUpdate">
        检查更新
      </el-button>

      <el-button :disabled="!hasPending && !tasks.length" type="success" @click="startAll">
        全部开始
      </el-button>
      <el-button :disabled="!hasActive" type="warning" @click="cancelAll">全部取消</el-button>
      <el-button @click="clearFinished">清除已完成</el-button>
      <el-button plain type="danger" @click="clearAll">清空列表</el-button>
    </div>

    <el-dialog
      v-model="updateDialogVisible"
      :close-on-click-modal="false"
      title="软件更新"
      width="480px"
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
        <el-button @click="updateDialogVisible = false">关闭</el-button>
        <el-button
          v-if="updateInfo.state === 'available'"
          :loading="updateDownloading"
          type="primary"
          @click="onDownloadUpdate"
        >
          下载更新
        </el-button>
        <el-button
          v-if="updateInfo.state === 'downloaded'"
          type="success"
          @click="onInstallUpdate"
        >
          重启并安装
        </el-button>
        <el-button
          v-if="updateInfo.state === 'error' || updateInfo.state === 'not-available' || updateInfo.state === 'idle'"
          :loading="updateChecking"
          type="primary"
          @click="onCheckUpdate"
        >
          重新检查
        </el-button>
      </template>
    </el-dialog>

    <div class="panel">
      <div class="panel-title">
        <span>压缩选项</span>
        <span style="font-weight: 400; color: #909399; font-size: 12px">
          {{ currentPreset.description }}
        </span>
      </div>

      <div class="options-row">
        <div class="opt-item">
          <span class="label">预设</span>
          <el-radio-group
            :model-value="presetId"
            size="small"
            @change="(v: string | number | boolean | undefined) => onPresetChange(v as PresetId)"
          >
            <el-radio-button v-for="p in DEFAULT_PRESETS" :key="p.id" :value="p.id">
              {{ p.name }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <div class="custom-row" style="margin-top: 12px">
        <div class="opt-item">
          <span class="label">编码器</span>
          <el-select
            :disabled="isWebm"
            :model-value="encoder"
            size="small"
            style="width: 160px"
            @change="(v: EncoderId) => onEncoderChange(v)"
          >
            <el-option
              v-for="opt in ENCODER_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <span v-if="isWebm" class="hint-inline">WebM 强制软件 VP9</span>
          <span v-else-if="encoderInfo" class="hint-inline">
            硬件:
            <template v-if="encoderInfo.nvenc || encoderInfo.qsv || encoderInfo.amf">
              <span v-if="encoderInfo.nvenc">NVENC </span>
              <span v-if="encoderInfo.qsv">QSV </span>
              <span v-if="encoderInfo.amf">AMF</span>
            </template>
            <template v-else>未检测到</template>
          </span>
        </div>

        <div class="opt-item">
          <span class="label">并发数</span>
          <el-select
            :model-value="concurrency"
            size="small"
            style="width: 80px"
            @change="(v: number) => onConcurrencyChange(v)"
          >
            <el-option
              v-for="n in CONCURRENCY_OPTIONS"
              :key="n"
              :label="String(n)"
              :value="n"
            />
          </el-select>
        </div>

        <template v-if="isCustom">
          <div class="opt-item">
            <span class="label">CRF</span>
            <el-input-number v-model="custom.crf" :max="51" :min="0" :step="1" size="small" />
          </div>
          <div class="opt-item">
            <span class="label">最长边</span>
            <el-input-number
              v-model="custom.maxEdge"
              :max="7680"
              :min="0"
              :step="2"
              size="small"
            />
            <span class="hint-inline">0 = 不缩放</span>
          </div>
          <div class="opt-item">
            <span class="label">格式</span>
            <el-select v-model="custom.format" size="small" style="width: 200px">
              <el-option
                v-for="opt in OUTPUT_FORMAT_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
        </template>
      </div>
    </div>

    <div
      :class="{ active: dragging }"
      class="drop-zone"
      @click="onSelectFiles"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      点击或拖拽添加视频文件（支持多选）
      <div class="hint">
        支持 mp4 / mkv / mov / avi / webm 等 · 输出 mp4 / mkv / mov / webm · 拖拽可获取真实路径
      </div>
    </div>

    <div v-if="sizeSummary.count > 0" class="panel summary-bar">
      <span>
        已完成 {{ sizeSummary.count }} 个 · 总原始
        <b>{{ formatFileSize(sizeSummary.totalIn) }}</b>
        → 总输出
        <b>{{ formatFileSize(sizeSummary.totalOut) }}</b>
      </span>
      <span v-if="sizeSummary.ratio" :class="sizeSummary.ratio.startsWith('-') ? 'save-good' : 'save-bad'">
        总体积变化 {{ sizeSummary.ratio }}
      </span>
    </div>

    <div class="panel main task-table">
      <div class="panel-title">
        <span>任务列表（{{ tasks.length }}）</span>
      </div>

      <el-table :data="tasks" empty-text="暂无任务，请添加视频" height="100%" stripe>
        <el-table-column label="文件名" min-width="160" prop="fileName" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="140">
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
        <el-table-column label="时间/速度" width="130">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #606266">
              {{ row.time || '-' }}
              <template v-if="row.speed"> / {{ row.speed }}</template>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="信息" min-width="120">
          <template #default="{ row }">
            <span v-if="row.error" :title="row.error" class="err-text">{{ row.error }}</span>
            <span
              v-else-if="row.status === 'completed'"
              :title="row.resolvedEncoder"
              style="font-size: 12px; color: #67c23a"
            >
              完成{{ row.resolvedEncoder ? ` · ${row.resolvedEncoder}` : '' }}
            </span>
            <span v-else style="font-size: 12px; color: #c0c4cc">—</span>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="160">
          <template #default="{ row }">
            <el-button
              v-if="
                row.status === 'pending' ||
                row.status === 'failed' ||
                row.status === 'cancelled'
              "
              link
              size="small"
              type="primary"
              @click="startOne(row)"
            >
              开始
            </el-button>
            <el-button
              v-if="row.status === 'running' || row.status === 'queued'"
              link
              size="small"
              type="warning"
              @click="cancelOne(row.id)"
            >
              取消
            </el-button>
            <el-button link size="small" type="danger" @click="removeOne(row.id)">
              移除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
