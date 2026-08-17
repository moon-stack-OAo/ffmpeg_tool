import { Notification, shell, type BrowserWindow } from 'electron'
import path from 'path'
import type {
  CompressTask,
  ImageProcessOptions,
  ProgressPayload,
  TaskEndPayload
} from '../../shared/types'
import { IpcChannels } from '../../shared/types'
import { isImageMode } from '../../shared/ffmpegLogic'
import {
  buildOutputPath,
  detectHardwareEncoders,
  getFileSize,
  runCompress,
  runMediaCompose,
  runVideoConcat,
  uniqueOutputPath
} from './ffmpeg'
import { processImage } from './image'
import { getSettings } from './settings'

interface QueueItem {
  task: CompressTask
  signal: { cancelled: boolean }
}

/** 队列外部监听（局域网服务等） */
export interface TaskQueueListener {
  onProgress?: (payload: ProgressPayload) => void
  onEnd?: (payload: TaskEndPayload) => void
  onQueued?: (taskId: string, task: CompressTask) => void
}

/**
 * 并行任务队列
 * - 可配置 concurrency（默认 2），同时跑 N 个 ffmpeg
 * - 支持单任务 / 全部取消
 * - 并发变更仅影响后续调度，不中断运行中任务
 * - 队列从忙碌变为空闲时汇总完成通知
 */
export class TaskQueue {
  private queue: QueueItem[] = []
  /** 正在运行的任务（按 taskId） */
  private running = new Map<string, QueueItem>()
  private win: BrowserWindow | null = null
  private concurrency = 2
  /** 防止 pump 重入造成竞态 */
  private pumping = false
  private listeners = new Set<TaskQueueListener>()

  /** 本批统计（running+queue 从 >0 变为 0 时汇总） */
  private batchCompleted = 0
  private batchFailed = 0
  private batchCancelled = 0
  /** 本批最近一次完成任务的输出路径（单任务通知用） */
  private lastCompletedOutput: string | undefined
  private lastCompletedName: string | undefined
  private lastFailedError: string | undefined

  setWindow(win: BrowserWindow | null): void {
    this.win = win
  }

  /** 注册监听器，返回取消函数 */
  addListener(listener: TaskQueueListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setConcurrency(n: number): number {
    const v = Math.max(1, Math.min(4, Math.floor(n) || 1))
    this.concurrency = v
    void this.pump()
    return this.concurrency
  }

  getConcurrency(): number {
    return this.concurrency
  }

  /** 当前是否有排队或运行中任务 */
  private hasWork(): boolean {
    return this.running.size > 0 || this.queue.length > 0
  }

  private resetBatchStats(): void {
    this.batchCompleted = 0
    this.batchFailed = 0
    this.batchCancelled = 0
    this.lastCompletedOutput = undefined
    this.lastCompletedName = undefined
    this.lastFailedError = undefined
  }

  /** 全部空闲时按设置发送完成通知 */
  private maybeNotifyBatchEnd(): void {
    if (this.hasWork()) return

    const settings = getSettings()
    if (!settings.notifyOnComplete) {
      this.resetBatchStats()
      return
    }

    const total =
      this.batchCompleted + this.batchFailed + this.batchCancelled
    if (total === 0) {
      this.resetBatchStats()
      return
    }

    if (!Notification.isSupported()) {
      this.resetBatchStats()
      return
    }

    let title = '任务完成'
    let body = ''

    if (total === 1 && this.batchCompleted === 1) {
      const name = this.lastCompletedName || '文件'
      title = '处理完成'
      body = `${name} 已完成`
    } else if (total === 1 && this.batchFailed === 1) {
      title = '任务失败'
      body = this.lastFailedError || '处理失败'
    } else if (total === 1 && this.batchCancelled === 1) {
      // 仅取消不弹通知
      this.resetBatchStats()
      return
    } else {
      const parts: string[] = []
      if (this.batchCompleted > 0) parts.push(`完成 ${this.batchCompleted} 个`)
      if (this.batchFailed > 0) parts.push(`失败 ${this.batchFailed} 个`)
      if (this.batchCancelled > 0) parts.push(`取消 ${this.batchCancelled} 个`)
      title = '全部任务结束'
      body = parts.join('，')
    }

    try {
      const n = new Notification({ title, body })
      const out = this.lastCompletedOutput
      if (out && this.batchCompleted > 0) {
        n.on('click', () => {
          shell.showItemInFolder(out)
        })
      }
      n.show()
    } catch (err) {
      console.warn('[taskQueue] Notification failed:', err)
    }

    this.resetBatchStats()
  }

  /** 解析任务输入路径列表 */
  private resolveInputPaths(task: CompressTask): string[] {
    const multi = (task.inputPaths || [])
      .map((p) => (p || '').trim())
      .filter(Boolean)
    if (multi.length > 0) return multi
    const single = (task.inputPath || '').trim()
    return single ? [single] : []
  }

  /** 多文件输入大小求和 */
  private sumInputSize(paths: string[]): number | undefined {
    let total = 0
    let any = false
    for (const p of paths) {
      const s = getFileSize(p)
      if (typeof s === 'number') {
        total += s
        any = true
      }
    }
    return any ? total : undefined
  }

  enqueue(task: CompressTask): void {
    const paths = this.resolveInputPaths(task)
    const primaryInput = paths[0] || task.inputPath
    // 始终按当前 options 重建输出路径，避免旧模板/模式残留
    const rawOut = buildOutputPath(primaryInput, task.options)
    const outputPath = uniqueOutputPath(rawOut)
    // 任务开始前记录输入大小（多输入求和）
    const inputSize =
      task.inputSize ??
      (paths.length > 1
        ? this.sumInputSize(paths)
        : getFileSize(primaryInput))
    const prepared: CompressTask = {
      ...task,
      inputPath: primaryInput,
      inputPaths: paths.length > 1 ? paths : task.inputPaths,
      outputPath,
      status: 'queued',
      progress: 0,
      inputSize
    }
    const item: QueueItem = {
      task: prepared,
      signal: { cancelled: false }
    }
    this.queue.push(item)
    this.send(IpcChannels.TASK_QUEUED, task.id)
    Array.from(this.listeners).forEach((l) => {
      try {
        l.onQueued?.(task.id, prepared)
      } catch (err) {
        console.warn('[taskQueue] onQueued listener error:', err)
      }
    })
    void this.pump()
  }

  /**
   * 向渲染进程推送完整任务（局域网上传入队时，桌面 UI 同步列表）
   */
  notifyTaskAdded(task: CompressTask): void {
    this.send(IpcChannels.TASK_ADDED, task)
  }

  enqueueMany(tasks: CompressTask[]): void {
    for (const t of tasks) {
      this.enqueue(t)
    }
  }

  cancel(taskId: string): void {
    const running = this.running.get(taskId)
    if (running) {
      running.signal.cancelled = true
      return
    }
    const idx = this.queue.findIndex((q) => q.task.id === taskId)
    if (idx >= 0) {
      const [item] = this.queue.splice(idx, 1)
      this.batchCancelled += 1
      const end: TaskEndPayload = {
        taskId: item.task.id,
        status: 'cancelled',
        error: '已取消',
        inputSize: item.task.inputSize
      }
      this.send(IpcChannels.TASK_END, end)
      this.maybeNotifyBatchEnd()
    }
  }

  cancelAll(): void {
    // 杀掉所有运行中进程
    Array.from(this.running.values()).forEach((item) => {
      item.signal.cancelled = true
    })
    // 清空等待队列
    const pending = this.queue.splice(0, this.queue.length)
    for (const item of pending) {
      this.batchCancelled += 1
      const end: TaskEndPayload = {
        taskId: item.task.id,
        status: 'cancelled',
        error: '已取消',
        inputSize: item.task.inputSize
      }
      this.send(IpcChannels.TASK_END, end)
    }
    // 若没有运行中任务，立即汇总；否则等 runItem finally
    if (this.running.size === 0) {
      this.maybeNotifyBatchEnd()
    }
  }

  private send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload)
    }
    // 同步外部监听（局域网服务等）
    if (channel === IpcChannels.TASK_PROGRESS) {
      Array.from(this.listeners).forEach((l) => {
        try {
          l.onProgress?.(payload as ProgressPayload)
        } catch (err) {
          console.warn('[taskQueue] onProgress listener error:', err)
        }
      })
    } else if (channel === IpcChannels.TASK_END) {
      Array.from(this.listeners).forEach((l) => {
        try {
          l.onEnd?.(payload as TaskEndPayload)
        } catch (err) {
          console.warn('[taskQueue] onEnd listener error:', err)
        }
      })
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.running.size < this.concurrency && this.queue.length > 0) {
        const next = this.queue.shift()
        if (!next) break
        this.running.set(next.task.id, next)
        // 异步执行，不 await 全部，各自完成后回调
        void this.runItem(next)
      }
    } finally {
      this.pumping = false
    }
  }

  private emitResult(
    task: CompressTask,
    result: {
      code: number
      error?: string
      inputSize?: number
      outputSize?: number
      resolvedEncoder?: string
      fallbackNote?: string
      commandLine?: string
    },
    signal: { cancelled: boolean }
  ): void {
    if (result.code === -1 || signal.cancelled) {
      this.batchCancelled += 1
      this.send(IpcChannels.TASK_END, {
        taskId: task.id,
        status: 'cancelled',
        error: '已取消',
        inputSize: result.inputSize ?? task.inputSize,
        resolvedEncoder: result.resolvedEncoder,
        fallbackNote: result.fallbackNote,
        commandLine: result.commandLine
      } satisfies TaskEndPayload)
    } else if (result.code === 0) {
      this.batchCompleted += 1
      this.lastCompletedOutput = task.outputPath
      this.lastCompletedName =
        task.fileName || path.basename(task.inputPath)
      this.send(IpcChannels.TASK_END, {
        taskId: task.id,
        status: 'completed',
        outputPath: task.outputPath,
        inputSize: result.inputSize ?? task.inputSize,
        outputSize: result.outputSize,
        resolvedEncoder: result.resolvedEncoder,
        fallbackNote: result.fallbackNote,
        commandLine: result.commandLine
      } satisfies TaskEndPayload)
    } else {
      this.batchFailed += 1
      this.lastFailedError = result.error || '处理失败'
      this.send(IpcChannels.TASK_END, {
        taskId: task.id,
        status: 'failed',
        error: result.error || '压缩失败',
        inputSize: result.inputSize ?? task.inputSize,
        resolvedEncoder: result.resolvedEncoder,
        fallbackNote: result.fallbackNote,
        commandLine: result.commandLine
      } satisfies TaskEndPayload)
    }
  }

  private async runImageTask(
    task: CompressTask,
    paths: string[],
    onProgress: (payload: ProgressPayload) => void,
    signal: { cancelled: boolean }
  ): Promise<void> {
    const mode = task.options?.mode
    if (mode === 'image-stitch' && paths.length < 2) {
      this.emitResult(
        task,
        { code: 1, error: '图片拼接至少需要 2 张图片', inputSize: task.inputSize },
        signal
      )
      return
    }

    if (signal.cancelled) {
      this.emitResult(task, { code: -1, error: '已取消', inputSize: task.inputSize }, signal)
      return
    }

    onProgress({ taskId: task.id, percent: 5 })

    const imgOpts = task.options.image || {}
    const processOpts: ImageProcessOptions = {
      inputPath: paths[0],
      outputPath: task.outputPath,
      maxEdge: imgOpts.maxEdge ?? task.options.maxEdge,
      format: imgOpts.format || 'jpeg',
      quality: imgOpts.quality ?? 80,
      strip: imgOpts.strip !== false,
      crop:
        imgOpts.crop ||
        (mode === 'image-crop' ? task.options.crop : undefined) ||
        task.options.crop,
      inputs: mode === 'image-stitch' ? paths : undefined,
      layout: imgOpts.layout,
      gridCols: imgOpts.gridCols,
      gap: imgOpts.gap,
      background: imgOpts.background
    }

    const r = await processImage(processOpts)

    if (signal.cancelled) {
      this.emitResult(
        task,
        { code: -1, error: '已取消', inputSize: task.inputSize },
        signal
      )
      return
    }

    if (r.ok) {
      onProgress({ taskId: task.id, percent: 100 })
      const outPath = r.outputPath || task.outputPath
      // 若引擎改写了扩展名，更新 task.outputPath 以便 UI 打开正确文件
      if (outPath && outPath !== task.outputPath) {
        task.outputPath = outPath
      }
      this.emitResult(
        task,
        {
          code: 0,
          inputSize: task.inputSize,
          outputSize: r.size,
          resolvedEncoder: r.engine,
          commandLine: r.commandLine
        },
        signal
      )
    } else {
      this.emitResult(
        task,
        {
          code: 1,
          error: r.error || '图片处理失败',
          inputSize: task.inputSize,
          resolvedEncoder: r.engine,
          commandLine: r.commandLine
        },
        signal
      )
    }
  }

  private async runItem(item: QueueItem): Promise<void> {
    const { task, signal } = item

    const onProgress = (payload: ProgressPayload): void => {
      this.send(IpcChannels.TASK_PROGRESS, payload)
    }

    try {
      const mode = task.options?.mode
      const paths = this.resolveInputPaths(task)

      if (isImageMode(mode)) {
        await this.runImageTask(task, paths, onProgress, signal)
        return
      }

      if (mode === 'video-concat') {
        const result = await runVideoConcat({
          taskId: task.id,
          inputPaths: paths,
          outputPath: task.outputPath,
          options: task.options,
          onProgress,
          signal
        })
        this.emitResult(task, result, signal)
        return
      }

      if (mode === 'media-compose') {
        const result = await runMediaCompose({
          taskId: task.id,
          inputPath: task.inputPath,
          outputPath: task.outputPath,
          options: task.options,
          onProgress,
          signal
        })
        this.emitResult(task, result, signal)
        return
      }

      // 现有 compress / audio（crop 已在 buildVideoFilter 中）
      const isAudio = mode === 'audio'
      let detect = null
      if (!isAudio) {
        try {
          detect = await detectHardwareEncoders()
        } catch {
          detect = null
        }
      }

      const result = await runCompress({
        taskId: task.id,
        inputPath: task.inputPath,
        outputPath: task.outputPath,
        options: task.options,
        onProgress,
        signal,
        detect
      })

      this.emitResult(task, result, signal)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.batchFailed += 1
      this.lastFailedError = msg
      this.send(IpcChannels.TASK_END, {
        taskId: task.id,
        status: 'failed',
        error: msg,
        inputSize: task.inputSize
      } satisfies TaskEndPayload)
    } finally {
      this.running.delete(task.id)
      this.maybeNotifyBatchEnd()
      void this.pump()
    }
  }
}

export const taskQueue = new TaskQueue()
