import type {BrowserWindow} from 'electron'
import type {CompressTask, ProgressPayload, TaskEndPayload} from '../../shared/types'
import {IpcChannels} from '../../shared/types'
import {buildOutputPath, detectHardwareEncoders, getFileSize, runCompress, uniqueOutputPath} from './ffmpeg'

interface QueueItem {
  task: CompressTask
  signal: { cancelled: boolean }
}

/**
 * 并行任务队列
 * - 可配置 concurrency（默认 2），同时跑 N 个 ffmpeg
 * - 支持单任务 / 全部取消
 * - 并发变更仅影响后续调度，不中断运行中任务
 */
export class TaskQueue {
  private queue: QueueItem[] = []
  /** 正在运行的任务（按 taskId） */
  private running = new Map<string, QueueItem>()
  private win: BrowserWindow | null = null
  private concurrency = 2
  /** 防止 pump 重入造成竞态 */
  private pumping = false

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

  enqueue(task: CompressTask): void {
    // 确保输出路径唯一
    const rawOut = task.outputPath || buildOutputPath(task.inputPath, task.options)
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
      const end: TaskEndPayload = {
        taskId: item.task.id,
        status: 'cancelled',
        error: '已取消',
        inputSize: item.task.inputSize
      }
      this.send(IpcChannels.TASK_END, end)
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
      const end: TaskEndPayload = {
        taskId: item.task.id,
        status: 'cancelled',
        error: '已取消',
        inputSize: item.task.inputSize
      }
      this.send(IpcChannels.TASK_END, end)
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
      // 预探测一次，同批任务可复用缓存
      let detect = null
      try {
        detect = await detectHardwareEncoders()
      } catch {
        detect = null
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
        this.send(IpcChannels.TASK_END, {
          taskId: task.id,
          status: 'cancelled',
          error: '已取消',
          inputSize: result.inputSize ?? task.inputSize,
          resolvedEncoder: result.resolvedEncoder
        } satisfies TaskEndPayload)
      } else if (result.code === 0) {
        this.send(IpcChannels.TASK_END, {
          taskId: task.id,
          status: 'completed',
          outputPath: task.outputPath,
          inputSize: result.inputSize ?? task.inputSize,
          outputSize: result.outputSize,
          resolvedEncoder: result.resolvedEncoder
        } satisfies TaskEndPayload)
      } else {
        this.send(IpcChannels.TASK_END, {
          taskId: task.id,
          status: 'failed',
          error: result.error || '压缩失败',
          inputSize: result.inputSize ?? task.inputSize,
          resolvedEncoder: result.resolvedEncoder
        } satisfies TaskEndPayload)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.send(IpcChannels.TASK_END, {
        taskId: task.id,
        status: 'failed',
        error: msg,
        inputSize: task.inputSize
      } satisfies TaskEndPayload)
    } finally {
      this.running.delete(task.id)
      void this.pump()
    }
  }
}

export const taskQueue = new TaskQueue()
