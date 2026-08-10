import type { CompressOptions, CompressTask, TaskStatus } from './types'

/** 默认可保留的已完成任务条数 */
export const DEFAULT_MAX_COMPLETED_TASKS = 100

/** 可持久化的状态 */
const PERSISTABLE_STATUSES: TaskStatus[] = [
  'pending',
  'failed',
  'cancelled',
  'completed',
  'running',
  'queued'
]

/** 恢复后应落为 pending 的运行中状态 */
const RESTORE_TO_PENDING: TaskStatus[] = ['running', 'queued']

/** 持久化时写入磁盘的任务字段（去掉 progress 运行态） */
export interface PersistedTask {
  id: string
  inputPath: string
  fileName: string
  status: TaskStatus
  options: CompressOptions
  inputSize?: number
  outputPath?: string
  error?: string
  outputSize?: number
  resolvedEncoder?: string
  commandLine?: string
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * 将单条任务规范为可恢复形态：
 * - running/queued → pending，并清 progress
 * - 非法 status 丢弃（返回 null）
 */
export function normalizeTaskForRestore(
  raw: unknown,
  opts?: { inputExists?: (p: string) => boolean }
): CompressTask | null {
  if (!isObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : ''
  const inputPath = typeof raw.inputPath === 'string' ? raw.inputPath : ''
  const fileName = typeof raw.fileName === 'string' ? raw.fileName : ''
  if (!id || !inputPath) return null

  let status = raw.status as TaskStatus
  if (!PERSISTABLE_STATUSES.includes(status)) {
    status = 'pending'
  }

  let error = typeof raw.error === 'string' ? raw.error : undefined
  let progress = 0

  if (RESTORE_TO_PENDING.includes(status)) {
    status = 'pending'
    progress = 0
  }

  // 源文件不存在 → failed
  const existsFn = opts?.inputExists
  if (existsFn && !existsFn(inputPath)) {
    status = 'failed'
    error = '源文件已不存在'
    progress = 0
  }

  const options = isObject(raw.options)
    ? (raw.options as unknown as CompressOptions)
    : ({} as CompressOptions)

  const task: CompressTask = {
    id,
    inputPath,
    fileName: fileName || inputPath,
    outputPath: typeof raw.outputPath === 'string' ? raw.outputPath : '',
    status,
    progress,
    error,
    options,
    inputSize:
      typeof raw.inputSize === 'number' && Number.isFinite(raw.inputSize)
        ? raw.inputSize
        : undefined,
    outputSize:
      typeof raw.outputSize === 'number' && Number.isFinite(raw.outputSize)
        ? raw.outputSize
        : undefined,
    resolvedEncoder:
      typeof raw.resolvedEncoder === 'string' ? raw.resolvedEncoder : undefined,
    commandLine:
      typeof raw.commandLine === 'string' ? raw.commandLine : undefined
  }
  return task
}

/**
 * 规范化整表任务（恢复用）
 * completed 仅保留最近 maxCompleted 条（列表尾部视为较新）
 */
export function normalizeTasksForRestore(
  rawList: unknown,
  opts?: {
    inputExists?: (p: string) => boolean
    maxCompleted?: number
  }
): CompressTask[] {
  if (!Array.isArray(rawList)) return []
  const maxCompleted = opts?.maxCompleted ?? DEFAULT_MAX_COMPLETED_TASKS
  const restored: CompressTask[] = []
  for (const item of rawList) {
    const t = normalizeTaskForRestore(item, { inputExists: opts?.inputExists })
    if (t) restored.push(t)
  }

  // 限制 completed 数量：从后往前保留
  let completedCount = 0
  const kept: CompressTask[] = []
  for (let i = restored.length - 1; i >= 0; i--) {
    const t = restored[i]
    if (t.status === 'completed') {
      if (completedCount >= maxCompleted) continue
      completedCount += 1
    }
    kept.push(t)
  }
  return kept.reverse()
}

/**
 * 序列化为可写入 tasks.json 的列表
 * - 跳过 running/queued（应先 normalize 为 pending 再存；此处再兜底转 pending）
 * - completed 最多保留 maxCompleted 条
 */
export function serializeTasksForPersist(
  tasks: CompressTask[],
  opts?: { maxCompleted?: number }
): PersistedTask[] {
  const maxCompleted = opts?.maxCompleted ?? DEFAULT_MAX_COMPLETED_TASKS
  const list: PersistedTask[] = []

  for (const t of tasks) {
    if (!t?.id || !t.inputPath) continue
    let status = t.status
    if (status === 'running' || status === 'queued') {
      status = 'pending'
    }
    if (
      status !== 'pending' &&
      status !== 'failed' &&
      status !== 'cancelled' &&
      status !== 'completed'
    ) {
      continue
    }
    list.push({
      id: t.id,
      inputPath: t.inputPath,
      fileName: t.fileName || t.inputPath,
      status,
      options: t.options,
      inputSize: t.inputSize,
      outputPath: t.outputPath || undefined,
      error: t.error,
      outputSize: t.outputSize,
      resolvedEncoder: t.resolvedEncoder,
      commandLine: t.commandLine
    })
  }

  // 限制 completed
  let completedCount = 0
  const kept: PersistedTask[] = []
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i]
    if (t.status === 'completed') {
      if (completedCount >= maxCompleted) continue
      completedCount += 1
    }
    kept.push(t)
  }
  return kept.reverse()
}
