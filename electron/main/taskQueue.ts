import { Notification, shell, type BrowserWindow } from 'electron'
import path from 'path'
import type { CompressTask, ProgressPayload, TaskEndPayload } from '../../shared/types'
import { IpcChannels } from '../../shared/types'
import { buildOutputPath, detectHardwareEncoders, getFileSize, runCompress, uniqueOutputPath } from './ffmpeg'
import { getSettings } from './settings'

interface QueueItem {
  task: CompressTask
  signal: { cancelled: boolean }
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

  enqueue(task: CompressTask): void {
    // 始终按当前 options 重建输出路径，避免旧模板/模式残留
    const rawOut = buildOutputPath(task.inputPath, task.options)
    const outputPath = uniqueOutputPath(rawOut)
    // 任务开始前记录输入大小
    const inputSize = task.inputSize ?? getFileSize(task.inputPath)
    const item: QueueItem = {
      task: {
        ...task,
        outputPath,
        status: 'queued',
        progress: 0,
        inputSize
      },
      signal: { cancelled: false }
    }
    this.queue.push(item)
    this.send(IpcChannels.TASK_QUEUED, task.id)
    void this.pump()
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

  private async runItem(item: QueueItem): Promise<void> {
    const { task, signal } = item

    const onProgress = (payload: ProgressPayload): void => {
      this.send(IpcChannels.TASK_PROGRESS, payload)
    }

    try {
      const isAudio = task.options?.mode === 'audio'
      // 音频模式不探测硬件
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
