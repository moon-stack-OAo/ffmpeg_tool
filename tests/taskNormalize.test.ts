import { describe, expect, it } from 'vitest'
import {
  normalizeTaskForRestore,
  normalizeTasksForRestore,
  serializeTasksForPersist
} from '../shared/taskNormalize'
import type { CompressOptions, CompressTask } from '../shared/types'

const baseOpts: CompressOptions = {
  presetId: 'standard',
  crf: 23,
  maxEdge: 0,
  format: 'mp4',
  outputDir: 'D:\\out',
  encoder: 'auto'
}

function makeTask(partial: Partial<CompressTask> & { id: string; inputPath: string }): CompressTask {
  return {
    fileName: 'a.mp4',
    outputPath: '',
    status: 'pending',
    progress: 0,
    options: baseOpts,
    ...partial
  }
}

describe('normalizeTaskForRestore', () => {
  it('running → pending 并清 progress', () => {
    const t = normalizeTaskForRestore(
      makeTask({
        id: '1',
        inputPath: 'D:\\v\\a.mp4',
        status: 'running',
        progress: 55
      }),
      { inputExists: () => true }
    )
    expect(t).not.toBeNull()
    expect(t!.status).toBe('pending')
    expect(t!.progress).toBe(0)
  })

  it('queued → pending', () => {
    const t = normalizeTaskForRestore(
      makeTask({ id: '2', inputPath: 'D:\\v\\b.mp4', status: 'queued' }),
      { inputExists: () => true }
    )
    expect(t!.status).toBe('pending')
  })

  it('源文件不存在 → failed + 错误文案', () => {
    const t = normalizeTaskForRestore(
      makeTask({ id: '3', inputPath: 'D:\\missing.mp4', status: 'pending' }),
      { inputExists: () => false }
    )
    expect(t!.status).toBe('failed')
    expect(t!.error).toBe('源文件已不存在')
  })

  it('completed 保留 outputPath/outputSize', () => {
    const t = normalizeTaskForRestore(
      makeTask({
        id: '4',
        inputPath: 'D:\\v\\c.mp4',
        status: 'completed',
        outputPath: 'D:\\out\\c.mp4',
        outputSize: 1234,
        inputSize: 9999,
        resolvedEncoder: 'libx264'
      }),
      { inputExists: () => true }
    )
    expect(t!.status).toBe('completed')
    expect(t!.outputPath).toBe('D:\\out\\c.mp4')
    expect(t!.outputSize).toBe(1234)
    expect(t!.resolvedEncoder).toBe('libx264')
  })

  it('缺 id/inputPath 返回 null', () => {
    expect(normalizeTaskForRestore({ fileName: 'x' })).toBeNull()
  })
})

describe('normalizeTasksForRestore / serializeTasksForPersist', () => {
  it('completed 数量限制（从尾部保留）', () => {
    const list = [
      makeTask({ id: 'c1', inputPath: 'D:\\1.mp4', status: 'completed' }),
      makeTask({ id: 'c2', inputPath: 'D:\\2.mp4', status: 'completed' }),
      makeTask({ id: 'c3', inputPath: 'D:\\3.mp4', status: 'completed' }),
      makeTask({ id: 'p1', inputPath: 'D:\\p.mp4', status: 'pending' })
    ]
    const restored = normalizeTasksForRestore(list, {
      inputExists: () => true,
      maxCompleted: 2
    })
    const completedIds = restored.filter((t) => t.status === 'completed').map((t) => t.id)
    expect(completedIds).toEqual(['c2', 'c3'])
    expect(restored.some((t) => t.id === 'p1')).toBe(true)
  })

  it('serialize 将 running 写成 pending', () => {
    const serialized = serializeTasksForPersist([
      makeTask({
        id: 'r1',
        inputPath: 'D:\\r.mp4',
        status: 'running',
        progress: 80
      })
    ])
    expect(serialized).toHaveLength(1)
    expect(serialized[0].status).toBe('pending')
    expect(serialized[0]).not.toHaveProperty('progress')
  })

  it('serialize 限制 completed 条数', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        id: `c${i}`,
        inputPath: `D:\\${i}.mp4`,
        status: 'completed'
      })
    )
    const out = serializeTasksForPersist(tasks, { maxCompleted: 2 })
    expect(out).toHaveLength(2)
    expect(out.map((t) => t.id)).toEqual(['c3', 'c4'])
  })
})
