import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  type CompressOptions,
  type CompressTask,
  type FfmpegStatus,
  formatSaveRatio,
  IMAGE_EXTENSIONS,
  type TaskMode,
  VIDEO_EXTENSIONS
} from '@shared/types'

export interface UseTasksDeps {
  buildOptions: () => CompressOptions
  outputDir: Ref<string>
  ffmpegStatus: Ref<FfmpegStatus>
  concurrency: Ref<number>
  /** 是否持久化任务列表，默认 true */
  persistTasks?: Ref<boolean>
  /** 当前任务模式（用于扩展名过滤） */
  taskMode?: Ref<TaskMode>
}

function getExt(fileName: string): string {
  const lower = fileName.toLowerCase()
  const idx = lower.lastIndexOf('.')
  if (idx < 0) return ''
  return lower.slice(idx)
}

function isImageMode(mode?: TaskMode | null): boolean {
  return mode === 'image' || mode === 'image-crop' || mode === 'image-stitch'
}

function needsFfmpeg(mode?: TaskMode | null): boolean {
  return !isImageMode(mode)
}

/** 压缩任务列表与启停控制 */
export function useTasks(deps: UseTasksDeps) {
  const tasks = ref<CompressTask[]>([])
  /** 最近一次成功添加文件时间戳（拖拽双通道去重用） */
  const lastDropOkAt = ref(0)
  /** 防抖保存定时器 */
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  /** 加载完成前不写盘，避免空列表覆盖 */
  let persistReady = false

  const hasPending = computed(() =>
    tasks.value.some((t) => t.status === 'pending' || t.status === 'failed')
  )

  const hasActive = computed(() =>
    tasks.value.some((t) => t.status === 'running' || t.status === 'queued')
  )

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

  function genId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }

  function currentMode(): TaskMode {
    return deps.taskMode?.value || deps.buildOptions().mode || 'compress'
  }

  /** 按当前模式判断是否允许该扩展名 */
  function isAllowedMedia(fileName: string, mode?: TaskMode): boolean {
    const ext = getExt(fileName)
    if (!ext) return false
    const m = mode || currentMode()
    if (isImageMode(m)) {
      return (IMAGE_EXTENSIONS as string[]).includes(ext)
    }
    return (VIDEO_EXTENSIONS as string[]).includes(ext)
  }

  function updateTask(id: string, patch: Partial<CompressTask>): void {
    tasks.value = tasks.value.map((t) => (t.id === id ? { ...t, ...patch } : t))
  }

  /** 将当前选项写回所有待处理 / 失败任务，并清空旧输出路径 */
  function syncPendingOptions(): void {
    const opts = deps.buildOptions()
    tasks.value = tasks.value.map((t) => {
      if (t.status === 'pending' || t.status === 'failed') {
        return { ...t, options: { ...opts }, outputPath: '' }
      }
      return t
    })
  }

  /** 手动「应用到待处理」：同步 options 并提示 */
  function applyOptionsToPending(): void {
    const targets = tasks.value.filter(
      (t) => t.status === 'pending' || t.status === 'failed'
    )
    if (!targets.length) {
      ElMessage.info('没有待处理或失败的任务')
      return
    }
    syncPendingOptions()
    ElMessage.success(`已将当前选项应用到 ${targets.length} 个任务`)
  }

  function invalidMediaMessage(mode: TaskMode): string {
    if (isImageMode(mode)) return '未添加有效图片文件'
    return '未添加有效视频文件'
  }

  function addFiles(files: Array<{ path: string; name: string }>): void {
    const mode = currentMode()
    const valid = files.filter((f) => {
      if (!f.path) return false
      return isAllowedMedia(f.name || f.path, mode)
    })
    const invalidCount = files.length - valid.length

    // 拼接模式：一次多选 → 一个任务
    if (
      (mode === 'image-stitch' || mode === 'video-concat') &&
      valid.length > 0
    ) {
      const paths = valid.map((f) => f.path)
      const taskOptions = deps.buildOptions()
      const n = paths.length
      const fileName =
        mode === 'image-stitch' ? `拼接 ${n} 张` : `拼接 ${n} 段`
      const task: CompressTask = {
        id: genId(),
        inputPath: paths[0],
        inputPaths: paths,
        fileName,
        outputPath: '',
        status: 'pending',
        progress: 0,
        options: taskOptions
      }
      tasks.value.push(task)
      lastDropOkAt.value = Date.now()
      ElMessage.success(
        mode === 'image-stitch'
          ? `已添加拼接任务（${n} 张图片）`
          : `已添加拼接任务（${n} 段视频）`
      )
      if (invalidCount > 0) {
        ElMessage.warning(`已忽略 ${invalidCount} 个不支持的文件`)
      }
      return
    }

    const existing = new Set(tasks.value.map((t) => t.inputPath))
    let added = 0
    let skippedDup = 0
    let skippedInvalid = invalidCount

    for (const f of valid) {
      if (existing.has(f.path)) {
        skippedDup += 1
        continue
      }
      const taskOptions = deps.buildOptions()
      const task: CompressTask = {
        id: genId(),
        inputPath: f.path,
        fileName: f.name,
        outputPath: '',
        status: 'pending',
        progress: 0,
        options: taskOptions
      }
      tasks.value.push(task)
      existing.add(f.path)
      added += 1
    }

    if (added > 0) {
      lastDropOkAt.value = Date.now()
      ElMessage.success(`已添加 ${added} 个文件`)
    } else if (skippedDup > 0 && skippedInvalid === 0) {
      ElMessage.info('文件已在列表中')
    } else if (skippedInvalid > 0 && added === 0) {
      ElMessage.warning(invalidMediaMessage(mode))
    }
  }

  async function onSelectFiles(): Promise<void> {
    const res = await window.electronAPI.selectFiles()
    addFiles(res.files)
  }

  function requireOutputDir(opts: CompressOptions): boolean {
    // sidecar 写出到源目录，可不选固定输出目录
    if (opts.outputDirMode === 'sidecar') return true
    if (!deps.outputDir.value) {
      ElMessage.warning('请先选择输出目录')
      return false
    }
    return true
  }

  function resolveInputPaths(task: CompressTask): string[] {
    const multi = (task.inputPaths || [])
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean)
    if (multi.length > 0) return multi
    const single =
      typeof task.inputPath === 'string' ? task.inputPath.trim() : ''
    return single ? [single] : []
  }

  function validateTaskForStart(task: CompressTask, mode: TaskMode): string | null {
    if (mode === 'image-stitch' || mode === 'video-concat') {
      const paths = resolveInputPaths(task)
      if (paths.length < 2) {
        return mode === 'image-stitch'
          ? '图片拼接至少需要 2 张图片'
          : '视频拼接至少需要 2 段视频'
      }
    }
    if (mode === 'image-crop') {
      const crop = task.options?.crop || task.options?.image?.crop
      if (!crop || !(crop.w > 0 && crop.h > 0)) {
        return '请设置有效的裁切区域（宽高须大于 0）'
      }
    }
    if (mode === 'media-compose') {
      const c = task.options?.compose
      const hasIntro =
        typeof c?.intro?.imagePath === 'string' && c.intro.imagePath.trim()
      const hasOutro =
        typeof c?.outro?.imagePath === 'string' && c.outro.imagePath.trim()
      const hasOverlay =
        typeof c?.overlay?.imagePath === 'string' && c.overlay.imagePath.trim()
      if (!hasIntro && !hasOutro && !hasOverlay) {
        return '请设置片头、片尾或叠加图'
      }
    }
    return null
  }

  async function startOne(task: CompressTask): Promise<void> {
    const draftOpts = deps.buildOptions()
    if (!requireOutputDir(draftOpts)) return

    const mode = draftOpts.mode || task.options?.mode || 'compress'
    if (needsFfmpeg(mode) && !deps.ffmpegStatus.value.ready) {
      ElMessage.error(deps.ffmpegStatus.value.error || 'ffmpeg 未就绪')
      return
    }

    const options = { ...draftOpts, outputDir: deps.outputDir.value }
    const payload: CompressTask = {
      ...task,
      options,
      outputPath: '',
      status: 'queued',
      progress: 0,
      error: undefined,
      outputSize: undefined
    }

    const err = validateTaskForStart(payload, mode)
    if (err) {
      ElMessage.warning(err)
      return
    }

    updateTask(task.id, {
      options,
      outputPath: '',
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
    const draftOpts = deps.buildOptions()
    if (!requireOutputDir(draftOpts)) return

    const mode = draftOpts.mode || 'compress'
    if (needsFfmpeg(mode) && !deps.ffmpegStatus.value.ready) {
      ElMessage.error(deps.ffmpegStatus.value.error || 'ffmpeg 未就绪')
      return
    }

    const candidates = tasks.value.filter(
      (t) => t.status === 'pending' || t.status === 'failed' || t.status === 'cancelled'
    )
    if (!candidates.length) {
      ElMessage.info('没有可开始的任务')
      return
    }

    const options = { ...draftOpts, outputDir: deps.outputDir.value }
    const payload: CompressTask[] = []
    let skipped = 0

    for (const t of candidates) {
      const item: CompressTask = {
        ...t,
        options,
        outputPath: '',
        status: 'queued',
        progress: 0,
        error: undefined,
        outputSize: undefined
      }
      const err = validateTaskForStart(item, mode)
      if (err) {
        skipped += 1
        updateTask(t.id, { error: err })
        continue
      }
      payload.push(item)
    }

    if (!payload.length) {
      ElMessage.warning(
        skipped > 0
          ? `没有可开始的任务（${skipped} 个未通过校验）`
          : '没有可开始的任务'
      )
      return
    }

    for (const t of payload) {
      updateTask(t.id, {
        options,
        outputPath: '',
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
      const extra =
        skipped > 0 ? `，跳过 ${skipped} 个未通过校验` : ''
      ElMessage.success(
        `已提交 ${payload.length} 个任务（并发 ${deps.concurrency.value}）${extra}`
      )
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

  /** 打开输出文件 */
  async function openOutput(task: CompressTask): Promise<void> {
    if (!task.outputPath) {
      ElMessage.warning('输出路径不可用')
      return
    }
    const res = await window.electronAPI.openPath(task.outputPath)
    if (!res.ok) {
      ElMessage.error(res.error || '打开失败')
    }
  }

  /** 在资源管理器中显示输出文件 */
  async function showInFolder(task: CompressTask): Promise<void> {
    if (!task.outputPath) {
      ElMessage.warning('输出路径不可用')
      return
    }
    await window.electronAPI.showItemInFolder(task.outputPath)
  }

  /** 是否允许写盘 */
  function shouldPersist(): boolean {
    if (!persistReady) return false
    if (deps.persistTasks && deps.persistTasks.value === false) return false
    return true
  }

  /** 防抖保存任务列表到主进程 */
  function scheduleSaveTasks(): void {
    if (!shouldPersist()) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (!shouldPersist()) return
      void window.electronAPI.saveTasks(tasks.value).catch(() => {
        // 静默失败
      })
    }, 400)
  }

  /** 启动时加载可恢复任务 */
  async function loadTasks(): Promise<void> {
    try {
      if (deps.persistTasks && deps.persistTasks.value === false) {
        persistReady = true
        return
      }
      const list = await window.electronAPI.loadTasks()
      if (Array.isArray(list) && list.length > 0) {
        tasks.value = list
      }
    } catch {
      // 使用空列表
    } finally {
      persistReady = true
    }
  }

  /** 立即落盘（卸载时） */
  function flushSaveTasks(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!shouldPersist()) return
    void window.electronAPI.saveTasks(tasks.value).catch(() => {
      // ignore
    })
  }

  /** 订阅主进程任务事件，返回清理函数 */
  function subscribe(): () => void {
    // 任务列表变化 → 防抖持久化
    const stopWatch = watch(
      tasks,
      () => {
        scheduleSaveTasks()
      },
      { deep: true }
    )

    const offProgress = window.electronAPI.onTaskProgress((p) => {
      updateTask(p.taskId, {
        status: 'running',
        progress: p.percent,
        time: p.time,
        speed: p.speed,
        etaSec: p.etaSec
      })
    })

    const offEnd = window.electronAPI.onTaskEnd((p) => {
      updateTask(p.taskId, {
        status: p.status,
        progress: p.status === 'completed' ? 100 : undefined,
        error: p.error,
        outputPath: p.outputPath,
        inputSize: p.inputSize,
        outputSize: p.outputSize,
        resolvedEncoder: p.resolvedEncoder,
        commandLine: p.commandLine,
        etaSec: p.status === 'completed' ? 0 : undefined
      })
      if (p.status === 'failed') {
        ElMessage.error(p.error || '任务失败')
      } else if (p.status === 'completed' && p.fallbackNote) {
        // 硬件失败已自动回退软件时给出提示
        ElMessage.warning(p.fallbackNote)
      }
    })

    const offQueued = window.electronAPI.onTaskQueued((taskId) => {
      updateTask(taskId, { status: 'queued' })
    })

    // 局域网上传等外部入队：补全任务到列表
    const offAdded = window.electronAPI.onTaskAdded((task) => {
      const exists = tasks.value.some((t) => t.id === task.id)
      if (exists) {
        updateTask(task.id, {
          ...task,
          status: task.status || 'queued'
        })
      } else {
        tasks.value = [...tasks.value, { ...task, status: task.status || 'queued' }]
      }
    })

    return () => {
      stopWatch()
      offProgress()
      offEnd()
      offQueued()
      offAdded()
      flushSaveTasks()
    }
  }

  onUnmounted(() => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  })

  return {
    tasks,
    lastDropOkAt,
    hasPending,
    hasActive,
    sizeSummary,
    addFiles,
    onSelectFiles,
    startOne,
    startAll,
    cancelOne,
    cancelAll,
    clearFinished,
    clearAll,
    removeOne,
    openOutput,
    showInFolder,
    applyOptionsToPending,
    updateTask,
    syncPendingOptions,
    loadTasks,
    scheduleSaveTasks,
    subscribe
  }
}
