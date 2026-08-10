import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

export interface UseDragDropOptions {
  addFiles: (files: Array<{ path: string; name: string }>) => void
  /** 最近成功添加时间戳，用于双通道去重警告 */
  lastDropOkAt: Ref<number>
}

/** 窗口级拖拽：渲染进程 drop 与 preload IPC 双通道 */
export function useDragDrop(options: UseDragDropOptions) {
  const dragging = ref(false)

  function fileUrlToPath(url: string): string {
    const raw = url.trim()
    if (!raw || !/^file:/i.test(raw)) return ''
    try {
      const u = new URL(raw)
      let p = decodeURIComponent(u.pathname || '')
      if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1)
      return p.replace(/\//g, '\\')
    } catch {
      return ''
    }
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
    dragging.value = true
  }

  function onDragEnter(e: DragEvent): void {
    e.preventDefault()
    dragging.value = true
  }

  function onDragLeave(e: DragEvent): void {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    const related = e.relatedTarget as Node | null
    if (related && target.contains(related)) return
    dragging.value = false
  }

  /** 渲染进程 drop 兜底（与 preload IPC 双通道，谁先到谁加） */
  function onDrop(e: DragEvent): void {
    e.preventDefault()
    dragging.value = false

    const dt = e.dataTransfer
    if (!dt) return

    const collected: Array<{ path: string; name: string }> = []
    const seen = new Set<string>()

    const push = (path: string, name?: string): void => {
      if (!path || seen.has(path)) return
      seen.add(path)
      collected.push({
        path,
        name: name || path.replace(/^.*[\\/]/, '')
      })
    }

    // 1) webUtils via preload
    try {
      const list = dt.files
      for (let i = 0; i < (list?.length || 0); i++) {
        const file = list.item(i)
        if (!file) continue
        let path = ''
        try {
          path = window.electronAPI.getPathForFile(file)
        } catch {
          path = ''
        }
        if (path) push(path, file.name)
      }
    } catch {
      // ignore
    }

    // 2) text/uri-list
    if (!collected.length) {
      try {
        const uriList = dt.getData('text/uri-list') || dt.getData('text/plain') || ''
        for (const line of uriList.split(/\r?\n/)) {
          const t = line.trim()
          if (!t || t.startsWith('#')) continue
          if (/^file:/i.test(t)) {
            const p = fileUrlToPath(t)
            if (p) push(p)
          } else if (/^[A-Za-z]:[\\/]/.test(t)) {
            push(t)
          }
        }
      } catch {
        // ignore
      }
    }

    if (collected.length) {
      options.addFiles(collected)
    }
    // 若为空，等待 preload→IPC 通道（onFilesDropped）
  }

  /** 订阅 preload 拖拽通道，返回清理函数 */
  function subscribe(): () => void {
    return window.electronAPI.onFilesDropped((files) => {
      dragging.value = false
      console.log('[renderer] onFilesDropped', files)
      if (!files.length) {
        // 另一通道刚成功添加则不弹警告
        if (Date.now() - options.lastDropOkAt.value < 800) return
        ElMessage.warning('拖拽未识别到视频文件（或无法读取路径），请改用「添加视频」')
        return
      }
      options.addFiles(files)
    })
  }

  return {
    dragging,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    fileUrlToPath,
    subscribe
  }
}
