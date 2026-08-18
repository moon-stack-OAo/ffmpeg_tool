import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  CompressTask,
  ElectronAPI,
  ImageProcessOptions,
  LanRemoteConfigInput,
  ProgressPayload,
  SelectFilesOptions,
  TaskEndPayload,
  TrayCommand,
  UpdateStatusPayload
} from '../../shared/types'
import { IpcChannels } from '../../shared/types'

type DroppedFile = { path: string; name: string }

function baseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || filePath
}

/** file:///C:/a/b.mp4 或 file:///C%3A/... → Windows 本地路径 */
function fileUrlToPath(url: string): string {
  const raw = url.trim()
  if (!raw) return ''
  try {
    // 处理 file:// 与 file:///
    if (!/^file:/i.test(raw)) return ''
    const u = new URL(raw)
    let p = decodeURIComponent(u.pathname || '')
    // Windows: /C:/Users/... → C:/Users/...
    if (/^\/[A-Za-z]:\//.test(p)) {
      p = p.slice(1)
    }
    // 统一成系统分隔符观感（Node/ffmpeg 在 Windows 接受 / 或 \）
    return p.replace(/\//g, '\\')
  } catch {
    return ''
  }
}

function resolveFilePath(file: File): string {
  if (!file) return ''

  // 1) Electron 官方
  try {
    const p = webUtils.getPathForFile(file)
    if (typeof p === 'string' && p.trim()) return p.trim()
  } catch (err) {
    console.warn('[preload] webUtils.getPathForFile failed:', err)
  }

  // 2) 旧版 File.path
  const legacy = (file as File & { path?: string }).path
  if (typeof legacy === 'string' && legacy.trim()) return legacy.trim()

  return ''
}

/** 从 DataTransfer 的 URI 列表解析路径（dev/http 页面下很有用） */
function extractPathsFromUriList(dt: DataTransfer): string[] {
  const paths: string[] = []
  const candidates: string[] = []

  try {
    const uriList = dt.getData('text/uri-list')
    if (uriList) candidates.push(uriList)
  } catch {
    // ignore
  }
  try {
    const plain = dt.getData('text/plain')
    if (plain) candidates.push(plain)
  } catch {
    // ignore
  }

  for (const block of candidates) {
    const lines = block.split(/\r?\n/)
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      if (/^file:/i.test(t)) {
        const p = fileUrlToPath(t)
        if (p) paths.push(p)
      } else if (/^[A-Za-z]:[\\/]/.test(t) || t.startsWith('\\\\')) {
        // 直接是 Windows 路径
        paths.push(t)
      }
    }
  }
  return paths
}

function extractDroppedFiles(dt: DataTransfer | null): DroppedFile[] {
  if (!dt) return []

  const result: DroppedFile[] = []
  const seen = new Set<string>()

  const pushPath = (filePath: string, nameHint?: string): void => {
    if (!filePath || seen.has(filePath)) return
    seen.add(filePath)
    result.push({
      path: filePath,
      name: (nameHint && nameHint.trim()) || baseName(filePath)
    })
  }

  // A. FileList / items + webUtils
  try {
    const items = dt.items
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!item || item.kind !== 'file') continue
        const file = item.getAsFile()
        if (!file) continue
        const p = resolveFilePath(file)
        if (p) pushPath(p, file.name)
      }
    }
  } catch (err) {
    console.warn('[preload] items extract failed:', err)
  }

  if (result.length === 0) {
    try {
      const files = dt.files
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files.item(i)
          if (!file) continue
          const p = resolveFilePath(file)
          if (p) pushPath(p, file.name)
        }
      }
    } catch (err) {
      console.warn('[preload] files extract failed:', err)
    }
  }

  // B. text/uri-list 兜底（尤其 npm run dev 加载 localhost 时）
  if (result.length === 0) {
    for (const p of extractPathsFromUriList(dt)) {
      pushPath(p)
    }
  }

  console.log('[preload] drop resolved files:', result.length, result)
  return result
}

function forwardDroppedFiles(files: DroppedFile[]): void {
  ipcRenderer.send(IpcChannels.FILES_DROPPED_FROM_PRELOAD, files)
}

function installDropCapture(): void {
  const onDragOver = (e: Event): void => {
    e.preventDefault()
    e.stopPropagation()
    const de = e as DragEvent
    try {
      if (de.dataTransfer) {
        de.dataTransfer.dropEffect = 'copy'
      }
    } catch {
      // ignore
    }
  }

  const onDrop = (e: Event): void => {
    e.preventDefault()
    e.stopPropagation()
    const de = e as DragEvent
    const dt = de.dataTransfer
    if (!dt) {
      console.warn('[preload] drop without dataTransfer')
      return
    }

    console.log(
      '[preload] drop event types=',
      Array.from(dt.types || []),
      'files=',
      dt.files?.length,
      'items=',
      dt.items?.length
    )

    const files = extractDroppedFiles(dt)
    forwardDroppedFiles(files)
  }

  const attach = (): void => {
    window.addEventListener('dragenter', onDragOver, true)
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('drop', onDrop, true)
    document.addEventListener('dragenter', onDragOver, true)
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('drop', onDrop, true)
    console.log('[preload] drop capture installed')
  }

  if (typeof document === 'undefined') return
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true })
  } else {
    attach()
  }
}

installDropCapture()

const api: ElectronAPI = {
  selectFiles: (opts?: SelectFilesOptions) =>
    ipcRenderer.invoke(IpcChannels.SELECT_FILES, opts),
  selectDirectory: (defaultPath?: string) =>
    ipcRenderer.invoke(IpcChannels.SELECT_DIR, defaultPath),
  selectImage: () => ipcRenderer.invoke(IpcChannels.SELECT_IMAGE),
  getFfmpegStatus: () => ipcRenderer.invoke(IpcChannels.GET_FFMPEG_STATUS),
  detectEncoders: () => ipcRenderer.invoke(IpcChannels.DETECT_ENCODERS),
  /** 渲染进程 drop 时也可调用（Electron 对 File 有特殊处理） */
  getPathForFile: (file: File) => resolveFilePath(file),
  startTask: (task: CompressTask) => ipcRenderer.invoke(IpcChannels.START_TASK, task),
  startTasks: (tasks: CompressTask[]) =>
    ipcRenderer.invoke(IpcChannels.START_TASKS, tasks),
  cancelTask: (taskId: string) => ipcRenderer.invoke(IpcChannels.CANCEL_TASK, taskId),
  cancelAll: () => ipcRenderer.invoke(IpcChannels.CANCEL_ALL),
  setConcurrency: (n: number) => ipcRenderer.invoke(IpcChannels.SET_CONCURRENCY, n),
  getConcurrency: () => ipcRenderer.invoke(IpcChannels.GET_CONCURRENCY),
  getSettings: () => ipcRenderer.invoke(IpcChannels.SETTINGS_GET),
  setSettings: (partial: Partial<AppSettings>) =>
    ipcRenderer.invoke(IpcChannels.SETTINGS_SET, partial),
  setFfmpegBinDir: (dir: string) =>
    ipcRenderer.invoke(IpcChannels.FFMPEG_SET_BIN_DIR, dir),
  getImageEngineStatus: () => ipcRenderer.invoke(IpcChannels.IMAGE_STATUS),
  processImage: (options: ImageProcessOptions) =>
    ipcRenderer.invoke(IpcChannels.IMAGE_PROCESS, options),
  setMagickPath: (path: string) =>
    ipcRenderer.invoke(IpcChannels.IMAGE_SET_MAGICK_PATH, path),
  getImageInfo: (path: string) =>
    ipcRenderer.invoke(IpcChannels.IMAGE_GET_INFO, path),
  getImageDataUrl: (path: string, maxEdge?: number) =>
    ipcRenderer.invoke(IpcChannels.IMAGE_GET_DATA_URL, path, maxEdge),
  extractVideoFrame: (opts: {
    path: string
    timeSec?: number
    maxEdge?: number
  }) => ipcRenderer.invoke(IpcChannels.VIDEO_EXTRACT_FRAME, opts),
  getLanStatus: () => ipcRenderer.invoke(IpcChannels.LAN_GET_STATUS),
  setLanRemoteConfig: (config: LanRemoteConfigInput) =>
    ipcRenderer.invoke(IpcChannels.LAN_SET_CONFIG, config),
  clearStoredTasks: () => ipcRenderer.invoke(IpcChannels.TASKS_CLEAR),
  resetSettings: () => ipcRenderer.invoke(IpcChannels.SETTINGS_RESET),
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.APP_INFO),
  loadTasks: () => ipcRenderer.invoke(IpcChannels.TASKS_GET),
  saveTasks: (tasks: CompressTask[]) =>
    ipcRenderer.invoke(IpcChannels.TASKS_SAVE, tasks),
  getAppVersion: () => ipcRenderer.invoke(IpcChannels.UPDATE_GET_VERSION),
  checkForUpdates: () => ipcRenderer.invoke(IpcChannels.UPDATE_CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_DOWNLOAD),
  cancelUpdateDownload: () => ipcRenderer.invoke(IpcChannels.UPDATE_CANCEL_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_INSTALL),
  openPath: (p: string) => ipcRenderer.invoke(IpcChannels.OPEN_PATH, p),
  showItemInFolder: (p: string) =>
    ipcRenderer.invoke(IpcChannels.SHOW_ITEM_IN_FOLDER, p),
  setDataDir: (dir: string) => ipcRenderer.invoke(IpcChannels.SET_DATA_DIR, dir),
  relaunchApp: () => ipcRenderer.invoke(IpcChannels.RELAUNCH_APP),
  windowMinimize: () => ipcRenderer.invoke(IpcChannels.WINDOW_MINIMIZE),
  windowMaximizeToggle: () => ipcRenderer.invoke(IpcChannels.WINDOW_MAXIMIZE),
  windowClose: () => ipcRenderer.invoke(IpcChannels.WINDOW_CLOSE),
  windowIsMaximized: () => ipcRenderer.invoke(IpcChannels.WINDOW_IS_MAXIMIZED),
  windowCloseDecision: (action: 'tray' | 'quit', remember: boolean) =>
    ipcRenderer.invoke(IpcChannels.WINDOW_CLOSE_DECISION, action, remember),
  windowCloseCancel: () => ipcRenderer.invoke(IpcChannels.WINDOW_CLOSE_CANCEL),

  onFilesDropped: (callback) => {
    const handler = (
      _event: IpcRendererEvent,
      files: Array<{ path: string; name: string }>
    ): void => {
      callback(Array.isArray(files) ? files : [])
    }
    ipcRenderer.on(IpcChannels.FILES_DROPPED, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.FILES_DROPPED, handler)
    }
  },

  onTaskProgress: (callback) => {
    const handler = (_event: IpcRendererEvent, payload: ProgressPayload): void => {
      callback(payload)
    }
    ipcRenderer.on(IpcChannels.TASK_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.TASK_PROGRESS, handler)
    }
  },

  onTaskEnd: (callback) => {
    const handler = (_event: IpcRendererEvent, payload: TaskEndPayload): void => {
      callback(payload)
    }
    ipcRenderer.on(IpcChannels.TASK_END, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.TASK_END, handler)
    }
  },

  onTaskQueued: (callback) => {
    const handler = (_event: IpcRendererEvent, taskId: string): void => {
      callback(taskId)
    }
    ipcRenderer.on(IpcChannels.TASK_QUEUED, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.TASK_QUEUED, handler)
    }
  },

  onTaskAdded: (callback) => {
    const handler = (_event: IpcRendererEvent, task: CompressTask): void => {
      if (task && typeof task.id === 'string') {
        callback(task)
      }
    }
    ipcRenderer.on(IpcChannels.TASK_ADDED, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.TASK_ADDED, handler)
    }
  },

  onUpdateStatus: (callback) => {
    const handler = (_event: IpcRendererEvent, payload: UpdateStatusPayload): void => {
      callback(payload)
    }
    ipcRenderer.on(IpcChannels.UPDATE_STATUS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.UPDATE_STATUS, handler)
    }
  },

  onWindowMaximizedChanged: (callback) => {
    const handler = (_event: IpcRendererEvent, maximized: boolean): void => {
      callback(Boolean(maximized))
    }
    ipcRenderer.on(IpcChannels.WINDOW_MAXIMIZED_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.WINDOW_MAXIMIZED_CHANGED, handler)
    }
  },

  onWindowCloseAsk: (callback) => {
    const handler = (): void => {
      callback()
    }
    ipcRenderer.on(IpcChannels.WINDOW_CLOSE_ASK, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.WINDOW_CLOSE_ASK, handler)
    }
  },

  onTrayCommand: (callback) => {
    const handler = (_event: IpcRendererEvent, cmd: TrayCommand): void => {
      if (cmd === 'check-update' || cmd === 'open-settings') {
        callback(cmd)
      }
    }
    ipcRenderer.on(IpcChannels.TRAY_COMMAND, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.TRAY_COMMAND, handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
