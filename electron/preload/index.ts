import {contextBridge, ipcRenderer, type IpcRendererEvent, webUtils} from 'electron'
import type {CompressTask, ElectronAPI, ProgressPayload, TaskEndPayload, UpdateStatusPayload} from '../../shared/types'
import {IpcChannels} from '../../shared/types'

const api: ElectronAPI = {
  selectFiles: () => ipcRenderer.invoke(IpcChannels.SELECT_FILES),
  selectDirectory: () => ipcRenderer.invoke(IpcChannels.SELECT_DIR),
  getFfmpegStatus: () => ipcRenderer.invoke(IpcChannels.GET_FFMPEG_STATUS),
  detectEncoders: () => ipcRenderer.invoke(IpcChannels.DETECT_ENCODERS),
  /**
   * Electron 新 API：从渲染进程 File 对象解析真实本地路径
   * 用于拖拽添加视频
   */
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  startTask: (task: CompressTask) => ipcRenderer.invoke(IpcChannels.START_TASK, task),
  startTasks: (tasks: CompressTask[]) =>
    ipcRenderer.invoke(IpcChannels.START_TASKS, tasks),
  cancelTask: (taskId: string) => ipcRenderer.invoke(IpcChannels.CANCEL_TASK, taskId),
  cancelAll: () => ipcRenderer.invoke(IpcChannels.CANCEL_ALL),
  setConcurrency: (n: number) => ipcRenderer.invoke(IpcChannels.SET_CONCURRENCY, n),
  getConcurrency: () => ipcRenderer.invoke(IpcChannels.GET_CONCURRENCY),
  getAppVersion: () => ipcRenderer.invoke(IpcChannels.UPDATE_GET_VERSION),
  checkForUpdates: () => ipcRenderer.invoke(IpcChannels.UPDATE_CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_INSTALL),

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

  onUpdateStatus: (callback) => {
    const handler = (_event: IpcRendererEvent, payload: UpdateStatusPayload): void => {
      callback(payload)
    }
    ipcRenderer.on(IpcChannels.UPDATE_STATUS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.UPDATE_STATUS, handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
