import { app, BrowserWindow, ipcMain } from 'electron'
import {
  autoUpdater,
  CancellationToken,
  type ProgressInfo,
  type UpdateInfo
} from 'electron-updater'
import { IpcChannels, type UpdateStatusPayload } from '../../shared/types'

let mainWindow: BrowserWindow | null = null
let initialized = false
/** 是否已有下载完成的更新等待安装 */
let updateDownloaded = false
/** 防止重复 check */
let checking = false
/** 当前下载取消令牌 */
let downloadToken: CancellationToken | null = null
/** 最近一次可用更新版本（取消/失败后仍可再下） */
let lastAvailableVersion = ''
let lastReleaseNotes: string | undefined

function send(payload: UpdateStatusPayload): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannels.UPDATE_STATUS, payload)
  }
}

function isPackaged(): boolean {
  return app.isPackaged
}

function isCancelError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'object' && err !== null) {
    const name = (err as { name?: string }).name || ''
    const message = (err as { message?: string }).message || ''
    if (name === 'CancellationError') return true
    if (/cancel|cancell?ed|aborted/i.test(`${name} ${message}`)) return true
  }
  if (typeof err === 'string' && /cancel|cancell?ed|aborted/i.test(err)) return true
  return false
}

/** 将 electron-updater / 网络错误转为中文提示 */
export function mapUpdateError(err: unknown): string {
  if (isCancelError(err)) {
    return '已取消下载'
  }
  const raw =
    err instanceof Error
      ? err.message || err.name
      : typeof err === 'string'
        ? err
        : String(err || '未知错误')
  const msg = raw.trim()
  const lower = msg.toLowerCase()

  if (!msg) return '更新失败，请稍后重试'
  if (/cancel|cancell?ed|aborted/i.test(msg)) return '已取消下载'
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(msg)) {
    return '无法解析更新服务器，请检查网络或 DNS'
  }
  if (/ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|ESOCKETTIMEDOUT|timeout/i.test(msg)) {
    return '连接更新服务器超时或中断，请检查网络后重试'
  }
  if (/certificate|SSL|TLS|CERT_/i.test(msg)) {
    return '安全连接失败（证书错误），请检查系统时间或网络环境'
  }
  if (/404|not found|no published versions|latest\.yml|Cannot find/i.test(msg)) {
    return '未找到可用更新包，请确认 GitHub Release 已发布完整安装包'
  }
  if (/403|401|Unauthorized|rate limit/i.test(msg)) {
    return '更新源访问被拒绝，请稍后重试或检查仓库权限'
  }
  if (/ENOSPC|no space|disk/i.test(msg)) {
    return '磁盘空间不足，无法下载更新'
  }
  if (/EPERM|EACCES|access is denied|operation not permitted/i.test(msg)) {
    return '没有权限写入更新缓存目录，请检查杀软或目录权限'
  }
  if (/sha512|checksum|blockmap|hash/i.test(msg)) {
    return '更新包校验失败，请重新下载或重新发布 Release'
  }
  if (/net::|ERR_/i.test(msg) || lower.includes('network')) {
    return `网络错误：${msg}`
  }
  // 过长英文堆栈截断
  if (msg.length > 220) {
    return `更新失败：${msg.slice(0, 200)}…`
  }
  return msg.startsWith('更新') || msg.startsWith('下载') || msg.startsWith('检查')
    ? msg
    : `更新失败：${msg}`
}

/**
 * 初始化自动更新
 * - 仅在打包后启用（开发态会提示跳过）
 * - 更新源：GitHub Releases（见 electron-builder.yml publish）
 */
export function initAutoUpdater(win: BrowserWindow): void {
  mainWindow = win

  if (!isPackaged()) {
    return
  }

  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = false
  // 仅用户点击「重启并安装」时安装，普通退出不装
  autoUpdater.autoInstallOnAppQuit = false
  // 始终全量下载，避免差分失败后出现「先几 MB 再重下」双段进度
  autoUpdater.disableDifferentialDownload = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    checking = true
    send({ state: 'checking', message: '正在检查更新…' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    checking = false
    lastAvailableVersion = info.version
    lastReleaseNotes = normalizeReleaseNotes(info.releaseNotes)
    send({
      state: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: lastReleaseNotes,
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
      version: lastAvailableVersion || undefined,
      percent: Math.round(p.percent * 10) / 10,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    downloadToken = null
    updateDownloaded = true
    lastAvailableVersion = info.version
    send({
      state: 'downloaded',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes) ?? lastReleaseNotes,
      message: `新版本 v${info.version} 已下载，请点击「重启并安装」；普通退出不会安装`
    })
  })

  autoUpdater.on('update-cancelled', (info: UpdateInfo) => {
    downloadToken = null
    send({
      state: 'available',
      version: info.version || lastAvailableVersion || undefined,
      releaseNotes: lastReleaseNotes,
      message: '已取消下载，可重新下载'
    })
  })

  autoUpdater.on('error', (err: Error) => {
    checking = false
    if (isCancelError(err)) {
      downloadToken = null
      send({
        state: 'available',
        version: lastAvailableVersion || undefined,
        releaseNotes: lastReleaseNotes,
        message: '已取消下载，可重新下载'
      })
      return
    }
    downloadToken = null
    send({
      state: 'error',
      version: lastAvailableVersion || undefined,
      releaseNotes: lastReleaseNotes,
      message: mapUpdateError(err)
    })
  })

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
    return notes.map((n) => `## ${n.version}\n${n.note || ''}`).join('\n\n')
  }
  return undefined
}

/** 检查更新 */
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

  if (downloadToken && !downloadToken.cancelled) {
    return {
      state: 'downloading',
      message: '正在下载更新，请先取消下载后再检查',
      currentVersion: app.getVersion(),
      version: lastAvailableVersion || undefined
    }
  }

  if (checking) {
    return {
      state: 'checking',
      message: '正在检查更新…',
      currentVersion: app.getVersion()
    }
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version
    return {
      state: 'checking',
      version,
      currentVersion: app.getVersion(),
      message: '已发起检查'
    }
  } catch (err) {
    const message = mapUpdateError(err)
    const payload: UpdateStatusPayload = {
      state: 'error',
      message,
      currentVersion: app.getVersion(),
      version: lastAvailableVersion || undefined
    }
    send(payload)
    return payload
  }
}

export async function downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
  if (!isPackaged()) {
    return { ok: false, error: '开发模式无法下载更新' }
  }
  if (downloadToken && !downloadToken.cancelled) {
    return { ok: false, error: '已有下载任务进行中' }
  }
  if (updateDownloaded) {
    return { ok: false, error: '更新已下载完成，请点击「重启并安装」' }
  }

  const token = new CancellationToken()
  downloadToken = token
  updateDownloaded = false

  send({
    state: 'downloading',
    version: lastAvailableVersion || undefined,
    releaseNotes: lastReleaseNotes,
    percent: 0,
    message: '开始下载…'
  })

  try {
    await autoUpdater.downloadUpdate(token)
    return { ok: true }
  } catch (err) {
    if (isCancelError(err) || token.cancelled) {
      downloadToken = null
      send({
        state: 'available',
        version: lastAvailableVersion || undefined,
        releaseNotes: lastReleaseNotes,
        message: '已取消下载，可重新下载'
      })
      return { ok: false, error: '已取消下载' }
    }
    downloadToken = null
    const message = mapUpdateError(err)
    send({
      state: 'error',
      version: lastAvailableVersion || undefined,
      releaseNotes: lastReleaseNotes,
      message
    })
    return { ok: false, error: message }
  }
}

/** 取消正在进行的更新下载 */
export function cancelUpdateDownload(): { ok: boolean; error?: string } {
  if (!isPackaged()) {
    return { ok: false, error: '开发模式无下载任务' }
  }
  if (!downloadToken || downloadToken.cancelled) {
    return { ok: false, error: '当前没有进行中的下载' }
  }
  try {
    downloadToken.cancel()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapUpdateError(err) }
  }
}

/** 退出并安装已下载的更新 */
export function quitAndInstall(): { ok: boolean; error?: string } {
  if (!updateDownloaded) {
    return { ok: false, error: '尚未下载完成，无法安装' }
  }
  // isSilent=true 静默安装；isForceRunAfter=true 装完自动启动
  autoUpdater.quitAndInstall(true, true)
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

  ipcMain.handle(IpcChannels.UPDATE_CANCEL_DOWNLOAD, async () => {
    return cancelUpdateDownload()
  })

  ipcMain.handle(IpcChannels.UPDATE_INSTALL, async () => {
    return quitAndInstall()
  })
}
