/** 压缩预设类型 */
export type PresetId = 'archive' | 'standard' | 'social' | 'custom'

/** 输出格式（视频容器） */
export type OutputFormat = 'mp4' | 'webm' | 'mkv' | 'mov'

/** 任务模式：视频压缩 / 仅抽音频 */
export type TaskMode = 'compress' | 'audio'

/** 音频抽取输出格式 */
export type AudioFormat = 'm4a' | 'mp3' | 'opus'

/** 视频编码器 / 硬件加速 */
export type EncoderId =
  | 'auto'
  | 'software'
  | 'nvenc'
  | 'qsv'
  | 'amf'
  | 'videotoolbox'

/** 实际选用的视频编码器（探测/解析后） */
export type ResolvedEncoder =
  | 'libx264'
  | 'h264_nvenc'
  | 'h264_qsv'
  | 'h264_amf'
  | 'h264_videotoolbox'
  | 'libvpx-vp9'

/** 输出目录模式 */
export type OutputDirMode = 'fixed' | 'sidecar' | 'dated'

/** 输出文件名模板预设 ID（UI 下拉） */
export type OutputNameTemplateId =
  | 'compressed'
  | 'preset'
  | 'date'
  | 'audio'
  | 'custom'

/** 任务状态 */
export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** 压缩 / 任务参数 */
export interface CompressOptions {
  /** 预设 ID */
  presetId: PresetId
  /** CRF 值，越小质量越高，通常 18-28（软件 x264） */
  crf: number
  /** 最长边限制，0 表示不缩放 */
  maxEdge: number
  /** 输出格式（视频模式） */
  format: OutputFormat
  /** 输出目录 */
  outputDir: string
  /**
   * 编码器 / 加速
   * - auto: 自动探测硬件，失败回退 libx264
   * - software: 强制 libx264
   * - nvenc / qsv / amf / videotoolbox: 指定硬件（webm 仍强制软件 VP9）
   */
  encoder: EncoderId
  /**
   * 输出文件名模板，支持 {name} {preset} {date} {time}
   * 默认 `{name}_compressed`；音频模式常用 `{name}_audio`
   */
  nameTemplate?: string
  /**
   * 输出目录模式：fixed=使用 outputDir；sidecar=源文件同目录；dated=outputDir/YYYYMMDD
   */
  outputDirMode?: OutputDirMode
  /**
   * 目标输出体积（MB），>0 时按目标估算视频码率；0/undefined 表示用 CRF
   * 无两遍或硬件编码器时为单遍 ABR 估算
   */
  targetSizeMb?: number
  /**
   * 目标体积时是否使用两遍编码，默认 true
   * 仅 libx264 / libvpx-vp9 支持；硬件编码器回退单遍 ABR
   */
  twoPass?: boolean
  /**
   * 硬件编码失败时是否回退软件 x264，默认 true
   */
  fallbackToSoftware?: boolean
  /** 任务模式，默认 compress */
  mode?: TaskMode
  /** 音频格式（mode=audio 时使用），默认 m4a */
  audioFormat?: AudioFormat
  /** 音频码率，如 128k/192k，默认 192k */
  audioBitrate?: string
  /** 裁剪开始秒，可选；0/undefined 表示从头 */
  trimStart?: number
  /** 裁剪结束秒，可选；0/undefined 表示到结尾 */
  trimEnd?: number
  /**
   * 画面旋转 90°（竖屏转横屏）
   * - none / undefined：不旋转
   * - cw：顺时针 90°
   * - ccw：逆时针 90°
   */
  rotate90?: Rotate90
}

/** 画面旋转 90° 方向 */
export type Rotate90 = 'none' | 'cw' | 'ccw'

/** 旋转选项（任务选项 UI） */
export const ROTATE90_OPTIONS: ReadonlyArray<{
  value: Rotate90
  label: string
}> = [
  { value: 'none', label: '不旋转' },
  { value: 'cw', label: '顺时针 90°（竖→横）' },
  { value: 'ccw', label: '逆时针 90°（竖→横）' }
]

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
  /** 预计剩余秒数（运行中） */
  etaSec?: number
  /** 完整 ffmpeg 命令行（结束时回填） */
  commandLine?: string
}

/** 进度事件 */
export interface ProgressPayload {
  taskId: string
  percent: number
  time?: string
  speed?: string
  fps?: string
  /** 预计剩余秒数 */
  etaSec?: number
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
  /** 硬件失败回退软件时的提示文案 */
  fallbackNote?: string
  /** 完整 ffmpeg 命令行 */
  commandLine?: string
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
  /** Apple VideoToolbox（通常仅 darwin） */
  videotoolbox?: boolean
  /** 推荐：auto 时会选用的编码器 */
  preferred: ResolvedEncoder
  error?: string
  /** 是否对列表中的硬件做了试编验证 */
  probed?: boolean
  /** 试编验证结果（与 nvenc/qsv/amf/videotoolbox 一致时表示已验证） */
  verified?: {
    nvenc: boolean
    qsv: boolean
    amf: boolean
    videotoolbox?: boolean
  }
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

/** 主题：浅色 / 深色 / 跟随系统 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 点击关闭时的行为 */
export type CloseAction = 'ask' | 'tray' | 'quit'

/** 关闭行为选项（设置 / 关闭确认） */
export const CLOSE_ACTION_OPTIONS: ReadonlyArray<{
  value: CloseAction
  label: string
}> = [
  { value: 'ask', label: '每次询问' },
  { value: 'tray', label: '最小化到托盘' },
  { value: 'quit', label: '直接退出' }
]

/** 应用持久化设置 */
export interface AppSettings {
  outputDir: string
  presetId: PresetId
  encoder: EncoderId
  concurrency: number
  customCrf: number
  customMaxEdge: number
  customFormat: OutputFormat
  /** 输出文件名模板，默认 `{name}_compressed` */
  nameTemplate: string
  /** 输出目录模式，默认 fixed */
  outputDirMode: OutputDirMode
  /** 目标体积 MB，0=不限制（用 CRF） */
  targetSizeMb: number
  /**
   * 目标体积时是否两遍编码，默认 true
   * 仅软件 x264/VP9 生效；硬件自动单遍
   */
  twoPass: boolean
  /** 任务模式，默认 compress */
  taskMode: TaskMode
  /** 音频格式，默认 m4a */
  audioFormat: AudioFormat
  /** 音频码率，默认 192k */
  audioBitrate: string
  /** 全部任务结束后是否通知，默认 true */
  notifyOnComplete: boolean
  /** 是否持久化任务列表，默认 true */
  persistTasks: boolean
  /** 主题：light | dark | system（跟随系统），默认 system */
  theme: ThemeMode
  /** 自定义 ffmpeg bin 目录（含 ffmpeg 与 ffprobe），空串=自动探测 */
  ffmpegBinDir: string
  /**
   * 点击关闭按钮时的行为
   * - ask：弹窗询问（默认）
   * - tray：最小化到系统托盘
   * - quit：直接退出应用
   */
  closeAction: CloseAction
}

/** 应用信息（设置抽屉「关于」展示） */
export interface AppInfo {
  version: string
  packaged: boolean
  electron: string
  chrome: string
  node: string
  userDataPath: string
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
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',
  /** 设置自定义 ffmpeg bin 目录（空串=清除覆盖） */
  FFMPEG_SET_BIN_DIR: 'ffmpeg:set-bin-dir',
  /** 清空已持久化任务 */
  TASKS_CLEAR: 'tasks:clear',
  /** 应用信息（设置抽屉「关于」） */
  APP_INFO: 'app:info',
  /** 加载持久化任务列表 */
  TASKS_GET: 'tasks:get',
  /** 保存任务列表 */
  TASKS_SAVE: 'tasks:save',
  UPDATE_GET_VERSION: 'update:get-version',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  /** 打开文件或目录 */
  OPEN_PATH: 'shell:open-path',
  /** 在资源管理器中显示 */
  SHOW_ITEM_IN_FOLDER: 'shell:show-item',
  /** 修改用户数据目录（需重启生效） */
  SET_DATA_DIR: 'app:set-data-dir',
  /** 重启应用 */
  RELAUNCH_APP: 'app:relaunch',
  /** 窗口控制：最小化 / 最大化切换 / 关闭 / 查询最大化 */
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  /** 渲染进程对关闭询问的应答：托盘 / 退出 */
  WINDOW_CLOSE_DECISION: 'window:close-decision',
  /** 渲染进程取消关闭询问 */
  WINDOW_CLOSE_CANCEL: 'window:close-cancel',
  /** preload → 主进程：拖拽解析后的文件列表 */
  FILES_DROPPED_FROM_PRELOAD: 'files:dropped-from-preload',
  // 主 → 渲染
  TASK_PROGRESS: 'task:progress',
  TASK_END: 'task:end',
  TASK_QUEUED: 'task:queued',
  UPDATE_STATUS: 'update:status',
  /** 主 → 渲染：转发拖拽文件 */
  FILES_DROPPED: 'files:dropped',
  /** 主 → 渲染：窗口最大化状态变化 */
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed',
  /** 主 → 渲染：需要用户选择关闭方式 */
  WINDOW_CLOSE_ASK: 'window:close-ask',
  /** 主 → 渲染：托盘菜单指令 */
  TRAY_COMMAND: 'tray:command'
} as const

/** 托盘菜单发给渲染进程的指令 */
export type TrayCommand = 'check-update' | 'open-settings'

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
  { value: 'amf', label: 'AMD AMF' },
  { value: 'videotoolbox', label: 'Apple VideoToolbox' }
]

/** 输出目录模式选项（UI） */
export const OUTPUT_DIR_MODE_OPTIONS: Array<{
  value: OutputDirMode
  label: string
}> = [
  { value: 'fixed', label: '固定输出目录' },
  { value: 'sidecar', label: '源文件同目录' },
  { value: 'dated', label: '输出目录/日期' }
]

/** 任务模式选项（UI） */
export const TASK_MODE_OPTIONS: Array<{ value: TaskMode; label: string }> = [
  { value: 'compress', label: '视频压缩' },
  { value: 'audio', label: '仅抽取音频' }
]

/** 音频格式选项（UI） */
export const AUDIO_FORMAT_OPTIONS: Array<{ value: AudioFormat; label: string }> = [
  { value: 'm4a', label: 'M4A (AAC)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'opus', label: 'Opus' }
]

/** 音频码率选项 */
export const AUDIO_BITRATE_OPTIONS = ['128k', '192k', '256k', '320k'] as const

/** 默认音频码率 */
export const DEFAULT_AUDIO_BITRATE = '192k'

/** 默认音频输出命名模板 */
export const DEFAULT_AUDIO_NAME_TEMPLATE = '{name}_audio'

/** 并发数可选值 */
export const CONCURRENCY_OPTIONS = [1, 2, 3, 4] as const
export type ConcurrencyValue = (typeof CONCURRENCY_OPTIONS)[number]

/** 并发策略提示（硬件编码建议低并发） */
export const CONCURRENCY_HINT =
  '并发越高越占 CPU/GPU，硬件编码建议 1–2'

/** 主题选项（UI） */
export const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' }
]

/** 默认输出文件名模板 */
export const DEFAULT_NAME_TEMPLATE = '{name}_compressed'

/** 输出命名模板选项（UI） */
export const NAME_TEMPLATE_OPTIONS: Array<{
  value: string
  label: string
  id: OutputNameTemplateId
}> = [
  { id: 'compressed', value: '{name}_compressed', label: '原名_compressed' },
  { id: 'audio', value: '{name}_audio', label: '原名_audio' },
  { id: 'preset', value: '{name}_{preset}', label: '原名_预设' },
  { id: 'date', value: '{name}_{date}', label: '原名_日期' },
  { id: 'custom', value: '__custom__', label: '自定义' }
]

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
  /** 从 File 取本地路径（Electron 对经 bridge 的 File 有特殊处理） */
  getPathForFile: (file: File) => string
  startTask: (task: CompressTask) => Promise<{ ok: boolean; error?: string }>
  startTasks: (tasks: CompressTask[]) => Promise<{ ok: boolean; error?: string }>
  cancelTask: (taskId: string) => Promise<{ ok: boolean }>
  cancelAll: () => Promise<{ ok: boolean }>
  setConcurrency: (n: number) => Promise<ConcurrencyResult>
  getConcurrency: () => Promise<ConcurrencyResult>
  getSettings: () => Promise<AppSettings>
  setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  /**
   * 设置自定义 ffmpeg bin 目录（须同时含 ffmpeg 与 ffprobe）
   * 空串 dir = 清除覆盖，回退自动探测（ffmpeg-static）
   */
  setFfmpegBinDir: (dir: string) => Promise<{ ok: boolean; error?: string }>
  /** 清空已持久化的任务列表 */
  clearStoredTasks: () => Promise<{ ok: boolean; error?: string }>
  /** 重置全部设置为默认值，返回重置后的设置 */
  resetSettings: () => Promise<AppSettings>
  /** 获取应用信息（版本 / 运行时 / userData 路径） */
  getAppInfo: () => Promise<AppInfo>
  /** 加载可恢复的任务列表 */
  loadTasks: () => Promise<CompressTask[]>
  /** 持久化任务列表（防抖由渲染侧负责） */
  saveTasks: (tasks: CompressTask[]) => Promise<{ ok: boolean; error?: string }>
  getAppVersion: () => Promise<AppVersionInfo>
  checkForUpdates: () => Promise<UpdateStatusPayload>
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>
  installUpdate: () => Promise<{ ok: boolean; error?: string }>
  /** 用系统默认程序打开文件或目录 */
  openPath: (p: string) => Promise<{ ok: boolean; error?: string }>
  /** 在资源管理器中显示并选中 */
  showItemInFolder: (p: string) => Promise<{ ok: boolean }>
  /** 修改用户数据目录；restart=true 表示需重启生效 */
  setDataDir: (dir: string) => Promise<{ ok: boolean; error?: string; restart?: boolean }>
  /** 重启应用（用于数据目录等更改生效） */
  relaunchApp: () => Promise<void>
  /** 窗口最小化 */
  windowMinimize: () => Promise<void>
  /** 最大化 / 还原切换 */
  windowMaximizeToggle: () => Promise<boolean>
  /** 关闭窗口 */
  windowClose: () => Promise<void>
  /** 当前是否最大化 */
  windowIsMaximized: () => Promise<boolean>
  /**
   * 关闭询问结果
   * @param action tray=托盘 / quit=退出
   * @param remember 是否写入 closeAction 并不再询问
   */
  windowCloseDecision: (
    action: 'tray' | 'quit',
    remember: boolean
  ) => Promise<void>
  /** 取消关闭询问（重置主进程 pending 状态） */
  windowCloseCancel: () => Promise<void>
  /**
   * 订阅拖拽文件（preload 解析路径 → 主进程 → 渲染进程）
   */
  onFilesDropped: (
    callback: (files: Array<{ path: string; name: string }>) => void
  ) => () => void
  onTaskProgress: (callback: (payload: ProgressPayload) => void) => () => void
  onTaskEnd: (callback: (payload: TaskEndPayload) => void) => () => void
  onTaskQueued: (callback: (taskId: string) => void) => () => void
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void
  /** 订阅窗口最大化状态 */
  onWindowMaximizedChanged: (callback: (maximized: boolean) => void) => () => void
  /** 订阅关闭询问（需弹窗） */
  onWindowCloseAsk: (callback: () => void) => () => void
  /** 订阅托盘菜单指令 */
  onTrayCommand: (callback: (cmd: TrayCommand) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
