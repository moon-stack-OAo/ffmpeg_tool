import {app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray} from 'electron'
import {basename, dirname, extname, join} from 'path'
import {existsSync, statSync} from 'fs'
import type {
  AppSettings,
  CloseAction,
  CompressTask,
  ImageProcessOptions
} from '../../shared/types'
import {IpcChannels, VIDEO_EXTENSIONS} from '../../shared/types'
import {checkFfmpegAvailable, detectHardwareEncoders, setBinaryOverride} from './ffmpeg'
import {
  getImageEngineStatus,
  processImage,
  setImageEngine,
  setMagickPath
} from './image'
import {collectVideoFiles} from './mediaScan'
import {getSettings, loadSettings, resetSettings, saveSettings} from './settings'
import {clearStoredTasks, loadTasks, saveTasks} from './taskStore'
import {applyAppIdentity, applyUserDataOverride, setUserDataDir} from './dataDir'
import {APP_ID, PRODUCT_NAME} from '../../shared/brand'
import {taskQueue} from './taskQueue'
import {initAutoUpdater, registerUpdaterIpc} from './updater'

// 固定 ASCII 应用名后再读 userData，避免落到中文产品名目录
applyAppIdentity()
applyUserDataOverride()

function isDev(): boolean {
  return !app.isPackaged
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** 为 true 时允许真正关闭窗口（退出应用） */
let allowQuit = false
/** 关闭询问中，避免重复弹窗 */
let closeAskPending = false

/** 图标搜索根目录：打包后在 process.resourcesPath/icons，开发态用仓库 resources/build */
function iconSearchRoots(): string[] {
  if (app.isPackaged) {
    return [join(process.resourcesPath, 'icons'), process.resourcesPath]
  }
  return [join(__dirname, '../../resources'), join(__dirname, '../../build')]
}

function resolveIconPath(names: string[]): string | undefined {
  for (const root of iconSearchRoots()) {
    for (const name of names) {
      const p = join(root, name)
      if (existsSync(p)) return p
    }
  }
  return undefined
}

/** 窗口图标；打包后优先 extraResources，其次 exe 内嵌图标 */
function resolveWindowIcon(): string | undefined {
  return (
    resolveIconPath(['icon.ico', 'icon.png', 'icon-256.png', 'icon-128.png']) ||
    (app.isPackaged ? process.execPath : undefined)
  )
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideToTray(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  ensureTray()
  mainWindow.hide()
  closeAskPending = false
}

function quitApp(): void {
  allowQuit = true
  closeAskPending = false
  taskQueue.cancelAll()
  if (tray) {
    tray.destroy()
    tray = null
  }
  app.quit()
}

function normalizeTrayImage(img: Electron.NativeImage): Electron.NativeImage {
  if (img.isEmpty()) return img
  // Windows 托盘约 16–32px；过大时缩到 32，高 DPI 更清晰
  const { width } = img.getSize()
  if (width > 32) {
    return img.resize({ width: 32, height: 32, quality: 'best' })
  }
  return img
}

/** 托盘优先小尺寸 PNG；打包后读 extraResources，再回退 exe 图标 */
function resolveTrayIconSync(): Electron.NativeImage {
  const names = ['icon-32.png', 'icon-24.png', 'icon-16.png', 'icon.ico', 'icon.png']
  for (const root of iconSearchRoots()) {
    for (const name of names) {
      const p = join(root, name)
      if (!existsSync(p)) continue
      try {
        const img = normalizeTrayImage(nativeImage.createFromPath(p))
        if (!img.isEmpty()) return img
      } catch {
        // 忽略无法解析的路径
      }
    }
  }
  if (app.isPackaged) {
    try {
      const fromExe = normalizeTrayImage(nativeImage.createFromPath(process.execPath))
      if (!fromExe.isEmpty()) return fromExe
    } catch {
      // ignore
    }
  }
  return nativeImage.createEmpty()
}

async function resolveTrayIcon(): Promise<Electron.NativeImage> {
  const sync = resolveTrayIconSync()
  if (!sync.isEmpty()) return sync
  // 打包后最后手段：系统读取 exe 文件图标
  if (app.isPackaged) {
    try {
      const fromSystem = await app.getFileIcon(process.execPath, { size: 'small' })
      return normalizeTrayImage(fromSystem)
    } catch {
      // ignore
    }
  }
  return nativeImage.createEmpty()
}

function sendTrayCommand(cmd: 'check-update' | 'open-settings'): void {
  showMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannels.TRAY_COMMAND, cmd)
  }
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: '打开主窗口',
      click: () => showMainWindow()
    },
    {
      label: '检查更新',
      click: () => sendTrayCommand('check-update')
    },
    {
      label: '打开设置',
      click: () => sendTrayCommand('open-settings')
    },
    { type: 'separator' },
    {
      label: '退出应用',
      click: () => quitApp()
    }
  ])
}

function ensureTray(): void {
  if (tray) return
  // 先用同步路径创建，避免 hide 时无托盘；图标异步再校正
  const placeholder = resolveTrayIconSync()
  tray = new Tray(placeholder.isEmpty() ? nativeImage.createEmpty() : placeholder)
  tray.setToolTip(`${PRODUCT_NAME} v${app.getVersion()}`)
  tray.setContextMenu(buildTrayMenu())
  // Windows：左键打开主窗口，右键系统菜单
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())

  if (placeholder.isEmpty()) {
    void resolveTrayIcon().then((image) => {
      if (!tray || image.isEmpty()) return
      tray.setImage(image)
    })
  }
}

function handleCloseRequest(): void {
  if (allowQuit) return
  const action: CloseAction = getSettings().closeAction || 'ask'
  if (action === 'quit') {
    quitApp()
    return
  }
  if (action === 'tray') {
    hideToTray()
    return
  }
  // ask
  if (closeAskPending) return
  closeAskPending = true
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) showMainWindow()
    mainWindow.webContents.send(IpcChannels.WINDOW_CLOSE_ASK)
  } else {
    closeAskPending = false
    quitApp()
  }
}

function createWindow(): void {
  const icon = resolveWindowIcon()
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1360,
    minHeight: 900,
    resizable: false,
    maximizable: true,
    show: false,
    title: PRODUCT_NAME,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  taskQueue.setWindow(mainWindow)

  const sendMaximized = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        IpcChannels.WINDOW_MAXIMIZED_CHANGED,
        mainWindow.isMaximized()
      )
    }
  }
  mainWindow.on('maximize', sendMaximized)
  mainWindow.on('unmaximize', sendMaximized)

  mainWindow.on('close', (e) => {
    if (allowQuit) return
    e.preventDefault()
    handleCloseRequest()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    sendMaximized()
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

  ipcMain.handle(IpcChannels.SELECT_DIR, async (_e, defaultPath?: string) => {
    if (!mainWindow) return { path: null }

    const start = typeof defaultPath === 'string' ? defaultPath.trim() : ''
    let defaultDir: string | undefined
    if (start) {
      try {
        if (existsSync(start)) {
          defaultDir = statSync(start).isDirectory() ? start : dirname(start)
        } else {
          // 目录尚不存在时，尽量落到已存在的父路径
          let cur = start
          while (cur && cur !== dirname(cur)) {
            const parent = dirname(cur)
            if (existsSync(parent)) {
              defaultDir = parent
              break
            }
            cur = parent
          }
        }
      } catch {
        defaultDir = undefined
      }
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择目录',
      properties: ['openDirectory', 'createDirectory'],
      ...(defaultDir ? { defaultPath: defaultDir } : {})
    })

    if (result.canceled || !result.filePaths.length) {
      return { path: null }
    }
    return { path: result.filePaths[0] }
  })

  ipcMain.handle(IpcChannels.SELECT_IMAGE, async () => {
    if (!mainWindow) return { path: null }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择水印图片',
      properties: ['openFile'],
      filters: [
        {
          name: '图片',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']
        },
        { name: '所有文件', extensions: ['*'] }
      ]
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
    if (typeof part.imagemagickPath === 'string') {
      const magick = setMagickPath(part.imagemagickPath)
      if (!magick.accepted) {
        delete part.imagemagickPath
      }
    }
    const next = saveSettings(part)
    if (typeof part.concurrency === 'number') {
      taskQueue.setConcurrency(next.concurrency)
    }
    if (typeof part.imageEngine === 'string') {
      setImageEngine(next.imageEngine)
    }
    return next
  })

  // 重置全部设置为默认（删除设置文件、清除 ffmpeg / magick 覆盖）
  ipcMain.handle(IpcChannels.SETTINGS_RESET, async () => {
    const next = resetSettings()
    setBinaryOverride('')
    setMagickPath('')
    setImageEngine(next.imageEngine)
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

  ipcMain.handle(IpcChannels.IMAGE_STATUS, async () => {
    return getImageEngineStatus()
  })

  ipcMain.handle(
    IpcChannels.IMAGE_PROCESS,
    async (_e, options: ImageProcessOptions) => {
      return processImage(options || ({} as ImageProcessOptions))
    }
  )

  ipcMain.handle(IpcChannels.IMAGE_SET_MAGICK_PATH, async (_e, p: string) => {
    const value = typeof p === 'string' ? p.trim() : ''
    const result = setMagickPath(value)
    if (!result.accepted) {
      return { ok: false, error: result.error }
    }
    saveSettings({ imagemagickPath: value })
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

  ipcMain.handle(IpcChannels.WINDOW_MINIMIZE, async () => {
    mainWindow?.minimize()
  })

  ipcMain.handle(IpcChannels.WINDOW_MAXIMIZE, async () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return false
    }
    mainWindow.maximize()
    return true
  })

  ipcMain.handle(IpcChannels.WINDOW_CLOSE, async () => {
    handleCloseRequest()
  })

  ipcMain.handle(IpcChannels.WINDOW_IS_MAXIMIZED, async () => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle(
    IpcChannels.WINDOW_CLOSE_DECISION,
    async (_e, action: 'tray' | 'quit', remember: boolean) => {
      const next: CloseAction = action === 'tray' ? 'tray' : 'quit'
      if (remember) {
        saveSettings({ closeAction: next })
      }
      if (next === 'tray') {
        hideToTray()
      } else {
        quitApp()
      }
    }
  )

  ipcMain.handle(IpcChannels.WINDOW_CLOSE_CANCEL, async () => {
    closeAskPending = false
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
  app.setAppUserModelId(APP_ID)
  const settings = loadSettings()
  // 启动即应用用户自定义 ffmpeg bin 目录（无效时回退自动探测）
  setBinaryOverride(settings.ffmpegBinDir)
  setMagickPath(settings.imagemagickPath || '')
  setImageEngine(settings.imageEngine || 'sharp')
  taskQueue.setConcurrency(settings.concurrency)
  registerIpc()
  registerUpdaterIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      showMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 托盘常驻时窗口可能被 hide 而非销毁；仅在真正退出时清理
  if (allowQuit && process.platform !== 'darwin') {
    taskQueue.cancelAll()
    app.quit()
  }
})

app.on('before-quit', () => {
  allowQuit = true
  closeAskPending = false
})
