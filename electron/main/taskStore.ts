import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { CompressTask } from '../../shared/types'
import {
  DEFAULT_MAX_COMPLETED_TASKS,
  normalizeTasksForRestore,
  serializeTasksForPersist
} from '../../shared/taskNormalize'

function tasksFilePath(): string {
  return path.join(app.getPath('userData'), 'tasks.json')
}

/**
 * 从 userData/tasks.json 加载可恢复任务
 * - running/queued → pending
 * - 源文件不存在 → failed +「源文件已不存在」
 */
export function loadTasks(opts?: {
  maxCompleted?: number
}): CompressTask[] {
  try {
    const file = tasksFilePath()
    if (!fs.existsSync(file)) {
      return []
    }
    const text = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(text) as unknown
    const list = Array.isArray(parsed)
      ? parsed
      : isObject(parsed) && Array.isArray((parsed as { tasks?: unknown }).tasks)
        ? (parsed as { tasks: unknown[] }).tasks
        : []

    return normalizeTasksForRestore(list, {
      inputExists: (p) => {
        try {
          return fs.existsSync(p)
        } catch {
          return false
        }
      },
      maxCompleted: opts?.maxCompleted ?? DEFAULT_MAX_COMPLETED_TASKS
    })
  } catch (err) {
    console.warn('[taskStore] loadTasks failed:', err)
    return []
  }
}

/**
 * 将任务列表写入 userData/tasks.json
 */
export function saveTasks(
  tasks: CompressTask[],
  opts?: { maxCompleted?: number }
): { ok: boolean; error?: string } {
  try {
    const file = tasksFilePath()
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const payload = serializeTasksForPersist(tasks || [], {
      maxCompleted: opts?.maxCompleted ?? DEFAULT_MAX_COMPLETED_TASKS
    })
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[taskStore] saveTasks failed:', err)
    return { ok: false, error: msg }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}
