/** 压缩预设类型 */
export type PresetId = 'archive' | 'standard' | 'social' | 'custom'

/** 输出格式 */
export type OutputFormat = 'mp4' | 'webm' | 'mkv' | 'mov'

/** 视频编码器 / 硬件加速 */
export type EncoderId = 'auto' | 'software' | 'nvenc' | 'qsv' | 'amf'

/** 实际选用的编码器（探测/解析后） */
export type ResolvedEncoder = 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libvpx-vp9'

/** 任务状态 */
export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** 压缩参数 */
export interface CompressOptions {
  /** 预设 ID */
  presetId: PresetId
  /** CRF 值，越小质量越高，通常 18-28（软件 x264） */
  crf: number
  /** 最长边限制，0 表示不缩放 */
  maxEdge: number
  /** 输出格式 */
  format: OutputFormat
  /** 输出目录 */
  outputDir: string
  /**
   * 编码器 / 加速
   * - auto: 自动探测硬件，失败回退 libx264
   * - software: 强制 libx264
   * - nvenc / qsv / amf: 指定硬件（webm 仍强制软件 VP9）
   */
  encoder: EncoderId
}

/** 预设定义 */
export interface CompressPreset {
  id: PresetId
  name: string
  description: string
  crf: number
  maxEdge: number
  format: OutputFormat
}

/** 压缩任务 */
export interface CompressTask {
  id: string
  inputPath: string
  fileName: string
  outputPath: string
  status: TaskStatus
  progress: number
  /** 已处理时间（ffmpeg time） */
  time?: string
  /** 编码速度 */
  speed?: string
  /** 错误信息 */
  error?: string
  options: CompressOptions
  /** 输入文件大小（字节），开始前记录 */
  inputSize?: number
  /** 输出文件大小（字节），完成后记录 */
  outputSize?: number
  /** 实际使用的编码器名称 */
  resolvedEncoder?: string
}

/** 进度事件 */
export interface ProgressPayload {
  taskId: string
  percent: number
  time?: string
  speed?: string
  fps?: string
}

/** 任务结束事件 */
export interface TaskEndPayload {
  taskId: string
  status: 'completed' | 'failed' | 'cancelled'
  error?: string
  outputPath?: string
  inputSize?: number
  outputSize?: number
  resolvedEncoder?: string
}

/** FFmpeg 就绪状态 */
export interface FfmpegStatus {
  ready: boolean
  ffmpegPath?: string
  ffprobePath?: string
  error?: string
}

/** 硬件编码器探测结果 */
export interface EncoderDetectResult {
  nvenc: boolean
  qsv: boolean
  amf: boolean
  /** 推荐：auto 时会选用的编码器 */
  preferred: ResolvedEncoder
  error?: string
}

/** 添加文件结果 */
export interface AddFilesResult {
  files: Array<{
    path: string
    name: string
  }>
}

/** 选择目录结果 */
export interface SelectDirResult {
  path: string | null
}

/** 并发数设置结果 */
export interface ConcurrencyResult {
  concurrency: number
}

/** 自动更新状态 */
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

/** 自动更新事件载荷 */
export interface UpdateStatusPayload {
  state: UpdateState
  /** 远端或当前相关版本号 */
  version?: string
  /** 本机当前版本 */
  currentVersion?: string
  message?: string
  releaseNotes?: string
  releaseDate?: string
  /** 下载进度 0-100 */
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
}

/** 版本信息 */
export interface AppVersionInfo {
  version: string
  packaged: boolean
}

/** IPC 通道名（主进程 ↔ 渲染进程） */
export const IpcChannels = {
  // 渲染 → 主
  SELECT_FILES: 'dialog:select-files',
  SELECT_DIR: 'dialog:select-dir',
  GET_FFMPEG_STATUS: 'ffmpeg:status',
  DETECT_ENCODERS: 'ffmpeg:detect-encoders',
  START_TASK: 'task:start',
  START_TASKS: 'task:start-batch',
  CANCEL_TASK: 'task:cancel',
  CANCEL_ALL: 'task:cancel-all',
  SET_CONCURRENCY: 'task:set-concurrency',
  GET_CONCURRENCY: 'task:get-concurrency',
  UPDATE_GET_VERSION: 'update:get-version',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  // 主 → 渲染
  TASK_PROGRESS: 'task:progress',
  TASK_END: 'task:end',
  TASK_QUEUED: 'task:queued',
  UPDATE_STATUS: 'update:status'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

/** 默认预设列表 */
export const DEFAULT_PRESETS: CompressPreset[] = [
  {
    id: 'archive',
    name: '高清存档',
    description: 'CRF 18，原分辨率，画质优先',
    crf: 18,
    maxEdge: 0,
    format: 'mp4'
  },
  {
    id: 'standard',
    name: '标准压缩',
    description: 'CRF 23，原分辨率，平衡体积与画质',
    crf: 23,
    maxEdge: 0,
    format: 'mp4'
  },
  {
    id: 'social',
    name: '微信/社交',
    description: 'CRF 28，最长边 1280，体积更小',
    crf: 28,
    maxEdge: 1280,
    format: 'mp4'
  },
  {
    id: 'custom',
    name: '自定义',
    description: '手动设置 CRF、分辨率上限与格式',
    crf: 23,
    maxEdge: 0,
    format: 'mp4'
  }
]

/** 支持的视频扩展名 */
export const VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.mov',
  '.avi',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
  '.ts',
  '.mts',
  '.m2ts',
  '.3gp'
]

/** 输出格式选项（UI） */
export const OUTPUT_FORMAT_OPTIONS: Array<{
  value: OutputFormat
  label: string
  note?: string
}> = [
  { value: 'mp4', label: 'MP4 (H.264 + AAC)' },
  { value: 'mkv', label: 'MKV (H.264 + AAC)' },
  { value: 'mov', label: 'MOV (H.264 + AAC)' },
  { value: 'webm', label: 'WebM (VP9 + Opus)', note: '仅软件编码' }
]

/** 编码器选项（UI） */
export const ENCODER_OPTIONS: Array<{
  value: EncoderId
  label: string
}> = [
  { value: 'auto', label: '自动（优先硬件）' },
  { value: 'software', label: '软件 x264' },
  { value: 'nvenc', label: 'NVIDIA NVENC' },
  { value: 'qsv', label: 'Intel QSV' },
  { value: 'amf', label: 'AMD AMF' }
]

/** 并发数可选值 */
export const CONCURRENCY_OPTIONS = [1, 2, 3, 4] as const
export type ConcurrencyValue = (typeof CONCURRENCY_OPTIONS)[number]

/** 格式化字节大小 */
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * 计算节省比例文案
 * @returns 如 "-65.2%"（负表示体积变小），失败时 null
 */
export function formatSaveRatio(
  inputSize?: number | null,
  outputSize?: number | null
): string | null {
  if (
    inputSize == null ||
    outputSize == null ||
    !Number.isFinite(inputSize) ||
    !Number.isFinite(outputSize) ||
    inputSize <= 0
  ) {
    return null
  }
  const ratio = ((outputSize - inputSize) / inputSize) * 100
  const sign = ratio > 0 ? '+' : ''
  return `${sign}${ratio.toFixed(1)}%`
}

/** Preload 暴露给渲染进程的 API */
export interface ElectronAPI {
  selectFiles: () => Promise<AddFilesResult>
  selectDirectory: () => Promise<SelectDirResult>
  getFfmpegStatus: () => Promise<FfmpegStatus>
  detectEncoders: () => Promise<EncoderDetectResult>
  /** 从拖拽 File 对象获取真实本地路径（Electron webUtils） */
  getPathForFile: (file: File) => string
  startTask: (task: CompressTask) => Promise<{ ok: boolean; error?: string }>
  startTasks: (tasks: CompressTask[]) => Promise<{ ok: boolean; error?: string }>
  cancelTask: (taskId: string) => Promise<{ ok: boolean }>
  cancelAll: () => Promise<{ ok: boolean }>
  setConcurrency: (n: number) => Promise<ConcurrencyResult>
  getConcurrency: () => Promise<ConcurrencyResult>
  getAppVersion: () => Promise<AppVersionInfo>
  checkForUpdates: () => Promise<UpdateStatusPayload>
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>
  installUpdate: () => Promise<{ ok: boolean; error?: string }>
  onTaskProgress: (callback: (payload: ProgressPayload) => void) => () => void
  onTaskEnd: (callback: (payload: TaskEndPayload) => void) => () => void
  onTaskQueued: (callback: (taskId: string) => void) => () => void
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
