import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { UpdateStatusPayload } from '@shared/types'

/** 应用版本与自动更新 */
export function useUpdater() {
  const appVersion = ref('—')
  const isPackaged = ref(false)
  const updateDialogVisible = ref(false)
  const updateChecking = ref(false)
  const updateDownloading = ref(false)
  const updateInfo = ref<UpdateStatusPayload>({ state: 'idle' })

  function applyUpdateStatus(payload: UpdateStatusPayload): void {
    const prev = updateInfo.value
    updateInfo.value = {
      ...prev,
      ...payload,
      version: payload.version ?? prev.version,
      releaseNotes: payload.releaseNotes ?? prev.releaseNotes,
      currentVersion: payload.currentVersion || prev.currentVersion || appVersion.value
    }
    updateChecking.value = payload.state === 'checking'
    updateDownloading.value = payload.state === 'downloading'

    if (payload.state === 'available') {
      // 取消下载回到 available 时保持弹窗打开
      if (payload.message?.includes('取消') && updateDialogVisible.value) {
        ElMessage.info(payload.message)
      } else {
        updateDialogVisible.value = true
      }
    } else if (payload.state === 'downloaded') {
      updateDialogVisible.value = true
      ElMessage.success(payload.message || '更新已下载')
    } else if (payload.state === 'error') {
      updateDialogVisible.value = true
      ElMessage.error(payload.message || '更新失败')
    } else if (payload.state === 'not-available' && updateDialogVisible.value) {
      ElMessage.success(payload.message || '已是最新版本')
    }
  }

  async function loadVersion(): Promise<void> {
    try {
      const ver = await window.electronAPI.getAppVersion()
      appVersion.value = ver.version
      isPackaged.value = ver.packaged
    } catch {
      appVersion.value = '—'
    }
  }

  async function onCheckUpdate(): Promise<void> {
    updateDialogVisible.value = true
    updateChecking.value = true
    try {
      const res = await window.electronAPI.checkForUpdates()
      if (res?.state && res.state !== 'checking') {
        applyUpdateStatus(res)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      applyUpdateStatus({ state: 'error', message, currentVersion: appVersion.value })
    } finally {
      updateChecking.value = false
    }
  }

  async function onDownloadUpdate(): Promise<void> {
    updateDownloading.value = true
    try {
      const res = await window.electronAPI.downloadUpdate()
      if (!res.ok) {
        updateDownloading.value = false
        // 取消不弹 error（主进程已推 available + message）
        if (res.error && !res.error.includes('取消')) {
          ElMessage.error(res.error)
          if (updateInfo.value.state !== 'error') {
            applyUpdateStatus({
              state: 'error',
              message: res.error,
              version: updateInfo.value.version,
              currentVersion: appVersion.value
            })
          }
        }
      }
    } catch (err) {
      updateDownloading.value = false
      const message = err instanceof Error ? err.message : String(err)
      ElMessage.error(message || '下载失败')
      applyUpdateStatus({
        state: 'error',
        message: message || '下载失败',
        version: updateInfo.value.version,
        currentVersion: appVersion.value
      })
    }
  }

  async function onCancelDownload(): Promise<void> {
    try {
      const res = await window.electronAPI.cancelUpdateDownload()
      if (!res.ok) {
        ElMessage.warning(res.error || '无法取消下载')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ElMessage.error(message || '取消下载失败')
    }
  }

  async function onInstallUpdate(): Promise<void> {
    const res = await window.electronAPI.installUpdate()
    if (!res.ok) {
      ElMessage.error(res.error || '安装失败')
    }
  }

  /** 订阅更新状态，返回清理函数 */
  function subscribe(): () => void {
    return window.electronAPI.onUpdateStatus((p) => {
      applyUpdateStatus(p)
    })
  }

  return {
    appVersion,
    isPackaged,
    updateDialogVisible,
    updateChecking,
    updateDownloading,
    updateInfo,
    applyUpdateStatus,
    loadVersion,
    onCheckUpdate,
    onDownloadUpdate,
    onCancelDownload,
    onInstallUpdate,
    subscribe
  }
}
