import {app, BrowserWindow, ipcMain} from 'electron'
import {autoUpdater, type ProgressInfo, type UpdateInfo} from 'electron-updater'
import {IpcChannels, type UpdateStatusPayload} from '../../shared/types'

let mainWindow: BrowserWindow | null = null
let initialized = false
/** 是否已有下载完成的更新等待安装 */
let updateDownloaded = false
/** 防止重复 check */
let checking = false

function send(payload: UpdateStatusPayload): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannels.UPDATE_STATUS, payload)
  }
}

function isPackaged(): boolean {
  return app.isPackaged
}

/**
 * 初始化自动更新
 * - 仅在打包后启用（开发态会提示跳过）
 * - 更新源：GitHub Releases（见 electron-builder.yml publish）
 */
export function initAutoUpdater(win: BrowserWindow): void {
  mainWindow = win

  if (!isPackaged()) {
    // 开发态不跑更新，避免误请求
    return
  }

  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  // 允许未签名包检查更新（正式分发建议配置代码签名）
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    checking = true
    send({ state: 'checking', message: '正在检查更新…' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    checking = false
    send({
      state: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      message: `发现新版本 v${info.version}`
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    checking = false
    send({
      state: 'not-available',
      version: info.version,
      message: `当前已是最新版本 v${info.version}`
    })
  })

  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    send({
      state: 'downloading',
      percent: Math.round(p.percent * 10) / 10,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
      message: `下载中 ${Math.round(p.percent)}%`
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    updateDownloaded = true
    send({
      state: 'downloaded',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      message: `新版本 v${info.version} 已下载，重启后安装`
    })
  })

  autoUpdater.on('error', (err: Error) => {
    checking = false
    send({
      state: 'error',
      message: err?.message || String(err)
    })
  })

  // 启动后延迟检查，避免拖慢首屏
  setTimeout(() => {
    void checkForUpdates(false)
  }, 4000)
}

function normalizeReleaseNotes(
  notes: string | Array<{ version: string; note: string | null }> | null | undefined
): string | undefined {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((n) => `## ${n.version}\n${n.note || ''}`)
      .join('\n\n')
  }
  return undefined
}

/** 检查更新；silent 为 true 时「已是最新」不刷强提示（仍推送事件） */
export async function checkForUpdates(manual = true): Promise<UpdateStatusPayload> {
  if (!isPackaged()) {
    const payload: UpdateStatusPayload = {
      state: 'idle',
      message: '开发模式不检查更新，请使用打包后的安装包验证',
      currentVersion: app.getVersion()
    }
    if (manual) send(payload)
    return payload
  }

  if (checking) {
    return { state: 'checking', message: '正在检查更新…', currentVersion: app.getVersion() }
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version
    // 具体 available / not-available 由事件推送；此处返回 checking 结束态由事件覆盖
    return {
      state: 'checking',
      version,
      currentVersion: app.getVersion(),
      message: '已发起检查'
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const payload: UpdateStatusPayload = {
      state: 'error',
      message,
      currentVersion: app.getVersion()
    }
    send(payload)
    return payload
  }
}

export async function downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
  if (!isPackaged()) {
    return { ok: false, error: '开发模式无法下载更新' }
  }
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    send({ state: 'error', message })
    return { ok: false, error: message }
  }
}

/** 退出并安装已下载的更新 */
export function quitAndInstall(): { ok: boolean; error?: string } {
  if (!updateDownloaded) {
    return { ok: false, error: '尚未下载完成，无法安装' }
  }
  // isSilent=false, isForceRunAfter=true
  autoUpdater.quitAndInstall(false, true)
  return { ok: true }
}

export function getCurrentVersion(): string {
  return app.getVersion()
}

/** 注册更新相关 IPC */
export function registerUpdaterIpc(): void {
  ipcMain.handle(IpcChannels.UPDATE_GET_VERSION, async () => {
    return { version: app.getVersion(), packaged: app.isPackaged }
  })

  ipcMain.handle(IpcChannels.UPDATE_CHECK, async () => {
    return checkForUpdates(true)
  })

  ipcMain.handle(IpcChannels.UPDATE_DOWNLOAD, async () => {
    return downloadUpdate()
  })

  ipcMain.handle(IpcChannels.UPDATE_INSTALL, async () => {
    return quitAndInstall()
  })
}
