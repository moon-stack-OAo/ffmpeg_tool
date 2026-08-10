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
    updateInfo.value = {
      ...payload,
      currentVersion: payload.currentVersion || appVersion.value
    }
    updateChecking.value = payload.state === 'checking'
    updateDownloading.value = payload.state === 'downloading'

    if (payload.state === 'available') {
      updateDialogVisible.value = true
    } else if (payload.state === 'downloaded') {
      updateDialogVisible.value = true
      ElMessage.success(payload.message || '更新已下载')
    } else if (payload.state === 'error') {
      // 手动检查时弹出；启动静默检查只记状态
      if (updateDialogVisible.value) {
        ElMessage.error(payload.message || '检查更新失败')
      }
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
      // 事件会覆盖最终状态；此处兜底
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
    const res = await window.electronAPI.downloadUpdate()
    if (!res.ok) {
      updateDownloading.value = false
      ElMessage.error(res.error || '下载失败')
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
    onInstallUpdate,
    subscribe
  }
}
