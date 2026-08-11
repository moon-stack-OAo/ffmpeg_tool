import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron'
import {basename, extname, join} from 'path'
import {existsSync} from 'fs'
import type {AppSettings, CompressTask} from '../../shared/types'
import {IpcChannels, VIDEO_EXTENSIONS} from '../../shared/types'
import {checkFfmpegAvailable, detectHardwareEncoders, setBinaryOverride} from './ffmpeg'
import {collectVideoFiles} from './mediaScan'
import {getSettings, loadSettings, resetSettings, saveSettings} from './settings'
import {clearStoredTasks, loadTasks, saveTasks} from './taskStore'
import {applyUserDataOverride, setUserDataDir} from './dataDir'
import {taskQueue} from './taskQueue'
import {initAutoUpdater, registerUpdaterIpc} from './updater'

// 在读取 userData 之前应用自定义数据目录（须早于 whenReady 中的 loadSettings）
applyUserDataOverride()

function isDev(): boolean {
  return !app.isPackaged
}

let mainWindow: BrowserWindow | null = null

/** 开发态用 build 目录图标；打包后由安装包/exe 承载品牌图标 */
function resolveWindowIcon(): string | undefined {
  const candidates = [
    join(__dirname, '../../build/icon.ico'),
    join(__dirname, '../../build/icon.png'),
    join(__dirname, '../../resources/icon.ico'),
    join(__dirname, '../../resources/icon.png')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

function createWindow(): void {
  const icon = resolveWindowIcon()
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'FFmpeg 视频压缩工具',
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  taskQueue.setWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (mainWindow) {
      initAutoUpdater(mainWindow)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 禁止把拖入的文件当成页面导航打开
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  mainWindow.webContents.on('will-redirect', (event) => {
    event.preventDefault()
  })

  // 开发态自动打开调试工具，便于查看 preload 拖拽日志
  if (isDev()) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // electron-vite 开发态注入 ELECTRON_RENDERER_URL
  if (isDev() && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function isVideoFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return (VIDEO_EXTENSIONS as string[]).includes(ext)
}

function registerIpc(): void {
  ipcMain.handle(IpcChannels.SELECT_FILES, async () => {
    if (!mainWindow) return { files: [] }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择视频文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '视频文件',
          extensions: VIDEO_EXTENSIONS.map((e) => e.replace('.', ''))
        },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePaths.length) {
      return { files: [] }
    }

    const files = result.filePaths
      .filter(isVideoFile)
      .map((p) => ({ path: p, name: basename(p) }))

    return { files }
  })

  ipcMain.handle(IpcChannels.SELECT_DIR, async () => {
    if (!mainWindow) return { path: null }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择输出目录',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || !result.filePaths.length) {
      return { path: null }
    }
    return { path: result.filePaths[0] }
  })

  ipcMain.handle(IpcChannels.GET_FFMPEG_STATUS, async () => {
    return checkFfmpegAvailable()
  })

  ipcMain.handle(IpcChannels.DETECT_ENCODERS, async () => {
    try {
      return await detectHardwareEncoders(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        nvenc: false,
        qsv: false,
        amf: false,
        videotoolbox: false,
        preferred: 'libx264' as const,
        error: msg
      }
    }
  })

  ipcMain.handle(IpcChannels.SET_CONCURRENCY, async (_e, n: number) => {
    const concurrency = taskQueue.setConcurrency(Number(n))
    saveSettings({ concurrency })
    return { concurrency }
  })

  ipcMain.handle(IpcChannels.GET_CONCURRENCY, async () => {
    return { concurrency: taskQueue.getConcurrency() }
  })

  ipcMain.handle(IpcChannels.SETTINGS_GET, async () => {
    return getSettings()
  })

  ipcMain.handle(IpcChannels.SETTINGS_SET, async (_e, partial: Partial<AppSettings>) => {
    // ffmpeg bin 目录需主进程校验；无效则回退不保存（避免把无效目录写盘）
    const part = { ...(partial || {}) }
    if (typeof part.ffmpegBinDir === 'string') {
      const override = setBinaryOverride(part.ffmpegBinDir)
      if (!override.accepted) {
        delete part.ffmpegBinDir
      }
    }
    const next = saveSettings(part)
    if (typeof part.concurrency === 'number') {
      taskQueue.setConcurrency(next.concurrency)
    }
    return next
  })

  // 重置全部设置为默认（删除设置文件、清除 ffmpeg 目录覆盖）
  ipcMain.handle(IpcChannels.SETTINGS_RESET, async () => {
    const next = resetSettings()
    setBinaryOverride('')
    return next
  })

  // 自定义 ffmpeg bin 目录（空串=清除覆盖）
  ipcMain.handle(IpcChannels.FFMPEG_SET_BIN_DIR, async (_e, dir: string) => {
    const value = typeof dir === 'string' ? dir.trim() : ''
    const override = setBinaryOverride(value)
    if (!override.accepted) {
      return { ok: false, error: override.error }
    }
    saveSettings({ ffmpegBinDir: value })
    return { ok: true }
  })

  // 清空已持久化任务
  ipcMain.handle(IpcChannels.TASKS_CLEAR, async () => {
    return clearStoredTasks()
  })

  // 应用信息（「设置」抽屉「关于」）
  ipcMain.handle(IpcChannels.APP_INFO, async () => {
    return {
      version: app.getVersion(),
      packaged: app.isPackaged,
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
      userDataPath: app.getPath('userData')
    }
  })

  // 修改数据目录
  ipcMain.handle(IpcChannels.SET_DATA_DIR, async (_e, dir: string) => {
    return setUserDataDir(typeof dir === 'string' ? dir : '')
  })

  // 重启应用（数据目录等变更后生效）
  ipcMain.handle(IpcChannels.RELAUNCH_APP, async () => {
    app.relaunch()
    app.exit(0)
  })

  // 任务列表持久化：读
  ipcMain.handle(IpcChannels.TASKS_GET, async () => {
    try {
      const settings = getSettings()
      if (settings.persistTasks === false) {
        return []
      }
      return loadTasks()
    } catch (err) {
      console.warn('[main] TASKS_GET failed:', err)
      return []
    }
  })

  // 任务列表持久化：写
  ipcMain.handle(IpcChannels.TASKS_SAVE, async (_e, tasks: CompressTask[]) => {
    try {
      const settings = getSettings()
      if (settings.persistTasks === false) {
        return { ok: true }
      }
      return saveTasks(Array.isArray(tasks) ? tasks : [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle(IpcChannels.START_TASK, async (_e, task: CompressTask) => {
    try {
      if (!task?.inputPath || !existsSync(task.inputPath)) {
        return { ok: false, error: '输入文件不存在' }
      }
      // sidecar 可不选固定输出目录；其它模式仍需 outputDir
      const dirMode = task.options?.outputDirMode || 'fixed'
      if (dirMode !== 'sidecar' && !task.options?.outputDir) {
        return { ok: false, error: '请先选择输出目录' }
      }
      const status = checkFfmpegAvailable()
      if (!status.ready) {
        return { ok: false, error: status.error || 'ffmpeg 未就绪' }
      }

      // 补齐默认 encoder；输出路径由队列按 options 重建
      const options = {
        ...task.options,
        encoder: task.options.encoder || ('auto' as const)
      }

      taskQueue.enqueue({
        ...task,
        options,
        outputPath: '',
        status: 'queued',
        progress: 0
      })
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle(IpcChannels.START_TASKS, async (_e, tasks: CompressTask[]) => {
    try {
      const status = checkFfmpegAvailable()
      if (!status.ready) {
        return { ok: false, error: status.error || 'ffmpeg 未就绪' }
      }
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { ok: false, error: '没有可执行的任务' }
      }

      const prepared: CompressTask[] = []
      for (const task of tasks) {
        if (!task?.inputPath || !existsSync(task.inputPath)) {
          continue
        }
        const dirMode = task.options?.outputDirMode || 'fixed'
        if (dirMode !== 'sidecar' && !task.options?.outputDir) {
          return { ok: false, error: '请先选择输出目录' }
        }
        const options = {
          ...task.options,
          encoder: task.options.encoder || ('auto' as const)
        }
        prepared.push({
          ...task,
          options,
          // 清空旧路径，由队列按最新 options 重建
          outputPath: '',
          status: 'queued',
          progress: 0
        })
      }

      if (!prepared.length) {
        return { ok: false, error: '没有有效的输入文件' }
      }

      taskQueue.enqueueMany(prepared)
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle(IpcChannels.CANCEL_TASK, async (_e, taskId: string) => {
    taskQueue.cancel(taskId)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CANCEL_ALL, async () => {
    taskQueue.cancelAll()
    return { ok: true }
  })

  // 用系统默认程序打开文件或目录
  ipcMain.handle(IpcChannels.OPEN_PATH, async (_e, p: string) => {
    try {
      if (!p || typeof p !== 'string') {
        return { ok: false, error: '路径无效' }
      }
      if (!existsSync(p)) {
        return { ok: false, error: '路径不存在' }
      }
      const err = await shell.openPath(p)
      if (err) {
        return { ok: false, error: err }
      }
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
  })

  // 在资源管理器中显示并选中
  ipcMain.handle(IpcChannels.SHOW_ITEM_IN_FOLDER, async (_e, p: string) => {
    try {
      if (!p || typeof p !== 'string') {
        return { ok: false }
      }
      shell.showItemInFolder(p)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  // preload 拖拽解析结果 → 展开目录后转发到渲染进程
  ipcMain.on(
    IpcChannels.FILES_DROPPED_FROM_PRELOAD,
    (event, files: Array<{ path: string; name: string }>) => {
      const list = Array.isArray(files) ? files : []
      console.log('[main] FILES_DROPPED_FROM_PRELOAD count=', list.length, list)
      const paths = list
        .filter((f) => f && typeof f.path === 'string' && f.path.length > 0)
        .map((f) => f.path)
      // 递归展开目录中的视频（深度 8，最多 500）
      const filtered = collectVideoFiles(paths, 500)
      console.log('[main] forward FILES_DROPPED filtered=', filtered.length, filtered)
      event.sender.send(IpcChannels.FILES_DROPPED, filtered)
    }
  )
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.ffmpeg.tool')
  const settings = loadSettings()
  // 启动即应用用户自定义 ffmpeg bin 目录（无效时回退自动探测）
  setBinaryOverride(settings.ffmpegBinDir)
  taskQueue.setConcurrency(settings.concurrency)
  registerIpc()
  registerUpdaterIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  taskQueue.cancelAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
