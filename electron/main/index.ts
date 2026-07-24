import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron'
import {basename, extname, join} from 'path'
import {existsSync} from 'fs'
import type {CompressTask} from '../../shared/types'
import {IpcChannels, VIDEO_EXTENSIONS} from '../../shared/types'
import {buildOutputPath, checkFfmpegAvailable, detectHardwareEncoders} from './ffmpeg'
import {taskQueue} from './taskQueue'
import {initAutoUpdater, registerUpdaterIpc} from './updater'

function isDev(): boolean {
  return !app.isPackaged
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'FFmpeg 视频压缩工具',
    autoHideMenuBar: true,
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
        preferred: 'libx264' as const,
        error: msg
      }
    }
  })

  ipcMain.handle(IpcChannels.SET_CONCURRENCY, async (_e, n: number) => {
    const concurrency = taskQueue.setConcurrency(Number(n))
    return { concurrency }
  })

  ipcMain.handle(IpcChannels.GET_CONCURRENCY, async () => {
    return { concurrency: taskQueue.getConcurrency() }
  })

  ipcMain.handle(IpcChannels.START_TASK, async (_e, task: CompressTask) => {
    try {
      if (!task?.inputPath || !existsSync(task.inputPath)) {
        return { ok: false, error: '输入文件不存在' }
      }
      if (!task.options?.outputDir) {
        return { ok: false, error: '请先选择输出目录' }
      }
      const status = checkFfmpegAvailable()
      if (!status.ready) {
        return { ok: false, error: status.error || 'ffmpeg 未就绪' }
      }

      // 补齐默认 encoder
      const options = {
        ...task.options,
        encoder: task.options.encoder || ('auto' as const)
      }

      const outputPath =
        task.outputPath || buildOutputPath(task.inputPath, options)

      taskQueue.enqueue({
        ...task,
        options,
        outputPath,
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
        if (!task.options?.outputDir) {
          return { ok: false, error: '请先选择输出目录' }
        }
        const options = {
          ...task.options,
          encoder: task.options.encoder || ('auto' as const)
        }
        prepared.push({
          ...task,
          options,
          outputPath:
            task.outputPath || buildOutputPath(task.inputPath, options),
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
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.ffmpeg.tool')
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
