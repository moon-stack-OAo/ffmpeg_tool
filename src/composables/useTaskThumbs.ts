import {onBeforeUnmount, reactive, type Ref, watch} from 'vue'
import {type CompressTask, IMAGE_EXTENSIONS, type TaskMode, VIDEO_EXTENSIONS} from '@shared/types'

const IMAGE_EXT_SET = new Set(
  (IMAGE_EXTENSIONS as string[]).map((e) => e.toLowerCase())
)
const VIDEO_EXT_SET = new Set(
  (VIDEO_EXTENSIONS as string[]).map((e) => e.toLowerCase())
)

const THUMB_MAX_EDGE = 96
const PREVIEW_MAX_EDGE = 1280
const VIDEO_TIME_SEC = 1
const MAX_CONCURRENT = 2

type ThumbState = 'loading' | 'fail' | string

function extOf(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

function pickThumbPath(task: CompressTask): string | null {
  if (task.options?.mode === 'audio') return null
  const list = [
    ...(Array.isArray(task.inputPaths) ? task.inputPaths : []),
    task.inputPath
  ]
  for (const raw of list) {
    const p = typeof raw === 'string' ? raw.trim() : ''
    if (!p) continue
    const ext = extOf(p)
    if (IMAGE_EXT_SET.has(ext) || VIDEO_EXT_SET.has(ext)) return p
  }
  return null
}

function thumbKind(path: string): 'image' | 'video' | null {
  const ext = extOf(path)
  if (IMAGE_EXT_SET.has(ext)) return 'image'
  if (VIDEO_EXT_SET.has(ext)) return 'video'
  return null
}

function isAudioMode(mode?: TaskMode | null): boolean {
  return mode === 'audio'
}

async function fetchMediaPreview(
  src: string,
  maxEdge: number
): Promise<string | null> {
  const kind = thumbKind(src)
  const api = window.electronAPI
  if (kind === 'image') {
    if (!api?.getImageDataUrl) return null
    const res = await api.getImageDataUrl(src, maxEdge)
    return res && res.ok && res.dataUrl ? res.dataUrl : null
  }
  if (kind === 'video') {
    if (!api?.extractVideoFrame) return null
    const res = await api.extractVideoFrame({
      path: src,
      timeSec: VIDEO_TIME_SEC,
      maxEdge
    })
    return res && res.ok && res.dataUrl ? res.dataUrl : null
  }
  return null
}

/**
 * 任务列表缩略图：按 inputPath 懒加载缓存，不写入任务持久化
 */
export function useTaskThumbs(tasks: Ref<CompressTask[]>) {
  const thumbs = reactive<Record<string, ThumbState>>({})
  const pathKey = reactive<Record<string, string>>({})
  const previews = reactive<Record<string, string>>({})
  const previewLoading = reactive<Record<string, boolean>>({})
  let alive = true
  let running = 0
  const queue: string[] = []
  const queued = new Set<string>()

  function clearTask(taskId: string): void {
    delete thumbs[taskId]
    delete pathKey[taskId]
    delete previews[taskId]
    delete previewLoading[taskId]
  }

  async function loadOne(taskId: string): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task || isAudioMode(task.options?.mode)) {
      thumbs[taskId] = 'fail'
      return
    }
    const src = pickThumbPath(task)
    if (!src) {
      thumbs[taskId] = 'fail'
      return
    }
    pathKey[taskId] = src
    thumbs[taskId] = 'loading'

    try {
      const dataUrl = await fetchMediaPreview(src, THUMB_MAX_EDGE)
      if (!alive) return
      if (pathKey[taskId] !== src) return
      thumbs[taskId] = dataUrl || 'fail'
    } catch {
      if (!alive) return
      if (pathKey[taskId] === src) thumbs[taskId] = 'fail'
    }
  }

  function pump(): void {
    while (alive && running < MAX_CONCURRENT && queue.length > 0) {
      const id = queue.shift()
      if (!id) break
      queued.delete(id)
      running++
      void loadOne(id).finally(() => {
        running--
        pump()
      })
    }
  }

  function enqueue(taskId: string): void {
    if (!alive) return
    if (queued.has(taskId)) return
    const cur = thumbs[taskId]
    if (cur === 'loading' || (typeof cur === 'string' && cur.startsWith('data:'))) {
      return
    }
    queued.add(taskId)
    queue.push(taskId)
    pump()
  }

  function syncFromTasks(list: CompressTask[]): void {
    const aliveIds = new Set(list.map((t) => t.id))
    for (const id of Object.keys(thumbs)) {
      if (!aliveIds.has(id)) clearTask(id)
    }
    for (const t of list) {
      if (isAudioMode(t.options?.mode)) {
        thumbs[t.id] = 'fail'
        continue
      }
      const src = pickThumbPath(t)
      if (!src) {
        thumbs[t.id] = 'fail'
        continue
      }
      if (pathKey[t.id] && pathKey[t.id] !== src) {
        clearTask(t.id)
      }
      if (!thumbs[t.id]) {
        enqueue(t.id)
      }
    }
  }

  watch(
    tasks,
    (list) => {
      syncFromTasks(list || [])
    },
    { immediate: true, deep: true }
  )

  onBeforeUnmount(() => {
    alive = false
    queue.length = 0
    queued.clear()
  })

  function thumbUrl(taskId: string): string | null {
    const v = thumbs[taskId]
    return typeof v === 'string' && v.startsWith('data:') ? v : null
  }

  function thumbLoading(taskId: string): boolean {
    return thumbs[taskId] === 'loading'
  }

  function showThumbPlaceholder(task: CompressTask): boolean {
    if (isAudioMode(task.options?.mode)) return true
    const v = thumbs[task.id]
    return !v || v === 'fail' || v === 'loading'
  }

  function previewUrl(taskId: string): string | null {
    const hi = previews[taskId]
    if (hi) return hi
    return thumbUrl(taskId)
  }

  function isPreviewLoading(taskId: string): boolean {
    return Boolean(previewLoading[taskId])
  }

  async function ensurePreview(taskId: string): Promise<string | null> {
    if (previews[taskId]) return previews[taskId]
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task || isAudioMode(task.options?.mode)) return null
    const src = pickThumbPath(task)
    if (!src) return thumbUrl(taskId)
    if (previewLoading[taskId]) {
      return thumbUrl(taskId)
    }
    previewLoading[taskId] = true
    try {
      const dataUrl = await fetchMediaPreview(src, PREVIEW_MAX_EDGE)
      if (!alive) return null
      if (dataUrl) {
        previews[taskId] = dataUrl
        return dataUrl
      }
      return thumbUrl(taskId)
    } catch {
      return thumbUrl(taskId)
    } finally {
      previewLoading[taskId] = false
    }
  }

  return {
    thumbs,
    thumbUrl,
    thumbLoading,
    showThumbPlaceholder,
    isAudioMode,
    previewUrl,
    isPreviewLoading,
    ensurePreview
  }
}
