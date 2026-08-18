/** 压缩预设类型 */
export type PresetId = 'archive' | 'standard' | 'social' | 'custom'

/** 输出格式（视频容器） */
export type OutputFormat = 'mp4' | 'webm' | 'mkv' | 'mov'

/** 任务模式：视频压缩 / 仅抽音频 / 图片 / 视频拼接 / 图+视频混剪 */
export type TaskMode =
  | 'compress'
  | 'audio'
  | 'image'
  | 'image-crop'
  | 'image-stitch'
  | 'video-concat'
  | 'media-compose'

/** 音频抽取输出格式 */
export type AudioFormat = 'm4a' | 'mp3' | 'opus'

/** 视频编码器 / 硬件加速（含旧别名兼容） */
export type EncoderId =
  | 'auto'
  | 'software'
  // 旧别名（兼容）
  | 'nvenc'
  | 'qsv'
  | 'amf'
  | 'videotoolbox'
  // 显式 codec
  | 'h264_nvenc'
  | 'h264_qsv'
  | 'h264_amf'
  | 'h264_videotoolbox'
  | 'h264_mf'
  | 'hevc_nvenc'
  | 'hevc_qsv'
  | 'hevc_amf'
  | 'hevc_videotoolbox'
  | 'hevc_mf'
  | 'libx264'
  | 'libx265'

/** 实际选用的视频编码器（探测/解析后） */
export type ResolvedEncoder =
  | 'libx264'
  | 'libx265'
  | 'libvpx-vp9'
  | 'h264_nvenc'
  | 'h264_qsv'
  | 'h264_amf'
  | 'h264_videotoolbox'
  | 'h264_mf'
  | 'hevc_nvenc'
  | 'hevc_qsv'
  | 'hevc_amf'
  | 'hevc_videotoolbox'
  | 'hevc_mf'

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
  /**
   * 分辨率缩放模式
   * - 缺省：maxEdge>0 时按 maxEdge；否则 none
   */
  scaleMode?: ScaleMode
  /** fixed / aspect 目标宽（像素） */
  outWidth?: number
  /** fixed 目标高（像素） */
  outHeight?: number
  /** aspect 模式目标比例 */
  aspectRatio?: AspectRatioId
  /**
   * fixed/aspect 时：black=缩入后黑边 pad 到精确画布；none=仅等比缩入（可能小于目标）
   * 默认建议 black
   */
  scalePad?: ScalePadMode
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
   * 画面旋转
   * - none / undefined：不旋转
   * - cw：顺时针 90°（竖→横）
   * - ccw：逆时针 90°（竖→横）
   * - 180：旋转 180°
   */
  rotate90?: Rotate90
  /** 去掉音轨；true 时输出 -an */
  muteAudio?: boolean
  /**
   * H.264 兼容档
   * - auto / undefined：不强制 profile/level
   * - main-l4：Main@L4 + yuv420p
   * - high：High + yuv420p
   */
  compatProfile?: CompatProfile
  /** 视频压缩时的音轨码率，如 128k；未设时按 128k */
  videoAudioBitrate?: string
  /** 输出帧率；source / undefined = 不改 */
  fps?: FpsMode
  /** x264 编码速度；仅 libx264 生效，默认 medium */
  encodePreset?: EncodePreset
  /** 水印（仅视频压缩；mode=audio 时忽略） */
  watermark?: WatermarkOptions
  /** 画面裁切（原图像素，旋转后坐标系） */
  crop?: { x: number; y: number; w: number; h: number }
  /** 视频局部打码（原图像素，旋转/裁切后的坐标系） */
  mosaics?: MosaicRegion[]
  /**
   * 图片处理参数（mode 为 image / image-crop / image-stitch 时用）
   */
  image?: {
    format?: 'jpeg' | 'png' | 'webp' | 'keep'
    quality?: number
    maxEdge?: number
    strip?: boolean
    crop?: { x: number; y: number; w: number; h: number }
    /** 拼接布局 */
    layout?: 'horizontal' | 'vertical' | 'grid'
    /** 网格列数，layout=grid 时，默认 2 */
    gridCols?: number
    /** 间距像素 */
    gap?: number
    /** 背景色 #RRGGBB 或 transparent */
    background?: string
  }
  /** 视频拼接：优先尝试流复制 */
  concatPreferCopy?: boolean
  /** 图+视频混剪（mode=media-compose） */
  compose?: MediaComposeOptions
}

/** 单个视频局部打码规则 */
export interface MosaicRegion {
  /** 编辑器内的稳定标识 */
  id: string
  /** 起始时间（秒），0 表示从开头 */
  startSec: number
  /** 结束时间（秒），缺省或 0 表示到结尾 */
  endSec?: number
  /** 原视频像素坐标 */
  x: number
  y: number
  w: number
  h: number
  /** pixelate=像素化；blur=高斯模糊 */
  mode: 'pixelate' | 'blur'
  /** 像素块边长或模糊强度，范围 2–128 */
  strength: number
}

/** 图+视频混剪选项 */
export interface MediaComposeOptions {
  /** 片头静图 */
  intro?: { imagePath: string; durationSec: number }
  /** 片尾静图 */
  outro?: { imagePath: string; durationSec: number }
  /** 图叠主视频（单层 P0） */
  overlay?: {
    imagePath: string
    position?: WatermarkPosition
    opacity?: number
    scalePercent?: number
    marginX?: number
    marginY?: number
    startSec?: number
    endSec?: number
  }
  /** 片头尾静图是否缩放匹配主视频（cover+pad 黑边），默认 true */
  fitIntroOutro?: boolean
}

/** 水印模式 */
export type WatermarkMode = 'none' | 'image' | 'text'

/** 水印九宫格位置 */
export type WatermarkPosition =
  | 'tl'
  | 'tc'
  | 'tr'
  | 'ml'
  | 'mc'
  | 'mr'
  | 'bl'
  | 'bc'
  | 'br'

/** 水印选项 */
export interface WatermarkOptions {
  mode: WatermarkMode
  /** 图片水印本地路径 */
  imagePath?: string
  /** 文字内容 */
  text?: string
  /** 字号，默认 24 */
  fontSize?: number
  /** 颜色，默认 white */
  fontColor?: string
  /** 位置，默认 br */
  position?: WatermarkPosition
  /** 水平边距，默认 16 */
  marginX?: number
  /** 垂直边距，默认 16 */
  marginY?: number
  /** 透明度 0–1，默认 0.8 */
  opacity?: number
  /** 相对视频短边的宽度百分比（图片），默认 15 */
  scalePercent?: number
  /** 水印出现起始秒 */
  startSec?: number
  /** 水印出现结束秒 */
  endSec?: number
}

/** 水印模式选项（UI） */
export const WATERMARK_MODE_OPTIONS: ReadonlyArray<{
  value: WatermarkMode
  label: string
}> = [
  { value: 'none', label: '无' },
  { value: 'image', label: '图片' },
  { value: 'text', label: '文字' }
]

/** 水印位置选项（UI） */
export const WATERMARK_POSITION_OPTIONS: ReadonlyArray<{
  value: WatermarkPosition
  label: string
}> = [
  { value: 'tl', label: '左上' },
  { value: 'tc', label: '中上' },
  { value: 'tr', label: '右上' },
  { value: 'ml', label: '左中' },
  { value: 'mc', label: '正中' },
  { value: 'mr', label: '右中' },
  { value: 'bl', label: '左下' },
  { value: 'bc', label: '中下' },
  { value: 'br', label: '右下' }
]

/** 画面旋转方向 */
export type Rotate90 = 'none' | 'cw' | 'ccw' | '180'

/** 旋转选项（任务选项 UI） */
export const ROTATE90_OPTIONS: ReadonlyArray<{
  value: Rotate90
  label: string
}> = [
  { value: 'none', label: '不旋转' },
  { value: 'cw', label: '顺时针 90°（竖→横）' },
  { value: 'ccw', label: '逆时针 90°（竖→横）' },
  { value: '180', label: '旋转 180°' }
]

/** H.264 兼容档 */
export type CompatProfile = 'auto' | 'main-l4' | 'high'

/** 兼容档选项（任务选项 UI） */
export const COMPAT_PROFILE_OPTIONS: ReadonlyArray<{
  value: CompatProfile
  label: string
}> = [
  { value: 'auto', label: '自动' },
  { value: 'main-l4', label: '兼容 Main@L4' },
  { value: 'high', label: '高质量 High' }
]

/** 输出帧率 */
export type FpsMode = 'source' | '24' | '30' | '60'

/** 帧率选项（任务选项 UI） */
export const FPS_OPTIONS: ReadonlyArray<{
  value: FpsMode
  label: string
}> = [
  { value: 'source', label: '原帧率' },
  { value: '24', label: '24 fps' },
  { value: '30', label: '30 fps' },
  { value: '60', label: '60 fps' }
]

/** x264 编码速度 preset */
export type EncodePreset = 'fast' | 'medium' | 'slow'

/** 编码速度选项（任务选项 UI） */
export const ENCODE_PRESET_OPTIONS: ReadonlyArray<{
  value: EncodePreset
  label: string
}> = [
  { value: 'fast', label: '快速' },
  { value: 'medium', label: '均衡' },
  { value: 'slow', label: '高质量' }
]

/** 视频模式默认音轨码率（保持旧任务体积） */
export const DEFAULT_VIDEO_AUDIO_BITRATE = '128k'

/** 视频分辨率缩放模式 */
export type ScaleMode = 'none' | 'maxEdge' | 'fixed' | 'aspect'

/** 按比例输出时的宽高比 ID */
export type AspectRatioId = '16:9' | '9:16' | '1:1' | '4:3'

/** fixed/aspect 填充：黑边 pad 或仅缩入 */
export type ScalePadMode = 'none' | 'black'

/** 缩放模式选项（UI） */
export const SCALE_MODE_OPTIONS: ReadonlyArray<{
  value: ScaleMode
  label: string
}> = [
  { value: 'none', label: '不缩放' },
  { value: 'maxEdge', label: '最长边' },
  { value: 'fixed', label: '固定宽高' },
  { value: 'aspect', label: '按比例' }
]

/** 宽高比选项（UI） */
export const ASPECT_RATIO_OPTIONS: ReadonlyArray<{
  value: AspectRatioId
  label: string
}> = [
  { value: '16:9', label: '16:9 横屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '1:1', label: '1:1 方形' },
  { value: '4:3', label: '4:3' }
]

/** 缩放填充选项（UI） */
export const SCALE_PAD_OPTIONS: ReadonlyArray<{
  value: ScalePadMode
  label: string
}> = [
  { value: 'black', label: '黑边填充' },
  { value: 'none', label: '无（仅缩入）' }
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
  /** 多输入（拼接）；缺省时用 [inputPath] */
  inputPaths?: string[]
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
  /** = h264_nvenc 可用（兼容旧字段） */
  nvenc: boolean
  /** = h264_qsv 可用 */
  qsv: boolean
  /** = h264_amf 可用 */
  amf: boolean
  /** = h264_videotoolbox 可用（通常仅 darwin） */
  videotoolbox?: boolean
  /** 细粒度 codec 可用性（列表 + 硬件试编） */
  codecs?: Partial<Record<ResolvedEncoder, boolean>>
  /** 推荐：auto 时会选用的编码器 */
  preferred: ResolvedEncoder
  error?: string
  /** 是否对列表中的硬件做了试编验证 */
  probed?: boolean
  /** 试编验证结果（key 为 codec 名或旧别名） */
  verified?: Partial<Record<string, boolean>>
  /** UI：每个 EncoderId 选项是否可用 */
  availability?: Array<{ id: EncoderId; available: boolean; codec?: string }>
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
  /**
   * 静默检查（如定时轮询）：更新状态但不自动弹窗 / 不弹 Toast
   * 启动检查与手动检查为 false/缺省
   */
  silent?: boolean
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
  /** 自定义分辨率缩放模式（仅 custom 预设相关） */
  scaleMode?: ScaleMode
  /** 自定义目标宽 */
  outWidth?: number
  /** 自定义目标高 */
  outHeight?: number
  /** 自定义目标比例 */
  aspectRatio?: AspectRatioId
  /** 自定义缩放填充 */
  scalePad?: ScalePadMode
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
  /** 开机时启动，默认 false（仅 Windows / macOS 安装版可靠） */
  openAtLogin: boolean
  /** 开机启动后最小化到托盘，默认 false（需同时开启 openAtLogin） */
  startMinimizedToTray: boolean
  /** 图片处理引擎，默认 sharp */
  imageEngine: ImageEngineId
  /**
   * ImageMagick 路径：空=自动探测 PATH；
   * 可为 magick(.exe) 全路径，或含 magick 的目录
   */
  imagemagickPath: string
  /** 图片输出格式，默认 jpeg */
  imageFormat: 'jpeg' | 'png' | 'webp' | 'keep'
  /** 图片质量 1–100，默认 80 */
  imageQuality: number
  /** 图片最长边，0=不限制，默认 1920 */
  imageMaxEdge: number
  /** 去掉图片元数据，默认 true */
  imageStrip: boolean
  /** 图片拼接布局，默认 horizontal */
  imageLayout: 'horizontal' | 'vertical' | 'grid'
  /** 网格列数，默认 2 */
  imageGridCols: number
  /** 拼接间距像素，默认 0 */
  imageGap: number
  /** 拼接背景色，默认 #000000 */
  imageBackground: string
  /** 视频拼接优先流复制，默认 true */
  concatPreferCopy: boolean
  /** 是否允许局域网远程访问，默认 false */
  lanRemoteEnabled: boolean
  /** 局域网 HTTP 服务端口，默认 17890 */
  lanPort: number
  /** 远程访问用户名，默认 admin */
  lanUsername: string
  /** 远程访问密码 scrypt 哈希（含 salt），勿存明文 */
  lanPasswordHash: string
}

/** 局域网远程访问运行状态（设置 UI / IPC） */
export interface LanStatus {
  /** 设置中是否开启 */
  enabled: boolean
  /** HTTP 服务是否正在监听 */
  running: boolean
  port: number
  username: string
  /** 是否已设置密码 */
  hasPassword: boolean
  /** 本机可访问地址列表，如 http://192.168.1.2:17890 */
  urls: string[]
  /** 启动失败等原因 */
  error?: string
}

/** 局域网远程任务列表项（脱敏，不含本机绝对路径） */
export interface LanTaskView {
  id: string
  fileName: string
  status: TaskStatus
  progress: number
  inputSize?: number
  outputSize?: number
  error?: string
  time?: string
  speed?: string
  etaSec?: number
  mode?: TaskMode
  /** 是否可下载 */
  downloadable: boolean
  /** 是否可请求缩略图（视频/图片；音频为 false） */
  hasThumbnail?: boolean
}

/** 设置/更新局域网远程配置（密码仅在修改时传明文，主进程哈希后存储） */
export interface LanRemoteConfigInput {
  enabled?: boolean
  port?: number
  username?: string
  /** 新密码明文；空串表示不修改；仅在此字段出现时更新哈希 */
  password?: string
}

/** 图片处理引擎 */
export type ImageEngineId = 'sharp' | 'imagemagick'

/** 图片引擎就绪状态 */
export interface ImageEngineStatus {
  engine: ImageEngineId
  sharpReady: boolean
  magickReady: boolean
  magickPath?: string
  error?: string
}

/** 图片处理选项 */
export interface ImageProcessOptions {
  inputPath: string
  outputPath: string
  /** 最长边，0=不缩放 */
  maxEdge?: number
  format?: 'jpeg' | 'png' | 'webp' | 'keep'
  /** 1–100，jpeg/webp */
  quality?: number
  /** 去掉元数据，默认 true */
  strip?: boolean
  /** 裁切区域（像素） */
  crop?: { x: number; y: number; w: number; h: number }
  /** 多图拼接输入（stitch 时优先用 inputs） */
  inputs?: string[]
  layout?: 'horizontal' | 'vertical' | 'grid'
  gridCols?: number
  gap?: number
  background?: string
}

/** 图片处理结果 */
export interface ImageProcessResult {
  ok: boolean
  outputPath?: string
  width?: number
  height?: number
  size?: number
  engine?: ImageEngineId
  error?: string
  /** magick 时可选完整命令行 */
  commandLine?: string
}

/** 图片引擎选项（UI） */
export const IMAGE_ENGINE_OPTIONS: ReadonlyArray<{
  value: ImageEngineId
  label: string
}> = [
  { value: 'sharp', label: 'Sharp（内置，推荐）' },
  { value: 'imagemagick', label: 'ImageMagick' }
]

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
  /** 选择单张水印图片 */
  SELECT_IMAGE: 'dialog:select-image',
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
  /** 图片引擎状态 */
  IMAGE_STATUS: 'image:status',
  /** 图片处理（resize/转码） */
  IMAGE_PROCESS: 'image:process',
  /** 设置 ImageMagick 路径（空串=自动探测） */
  IMAGE_SET_MAGICK_PATH: 'image:set-magick-path',
  /** 读取图片尺寸（sharp metadata，EXIF orient 后） */
  IMAGE_GET_INFO: 'image:get-info',
  /** 生成图片预览 data URL（缩略 jpeg） */
  IMAGE_GET_DATA_URL: 'image:get-data-url',
  /** 从视频抽取一帧预览（jpeg data URL） */
  VIDEO_EXTRACT_FRAME: 'video:extract-frame',
  /** 获取局域网远程访问状态 */
  LAN_GET_STATUS: 'lan:get-status',
  /** 设置局域网远程访问配置（开关/端口/账号/密码） */
  LAN_SET_CONFIG: 'lan:set-config',
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
  /** 取消正在下载的更新 */
  UPDATE_CANCEL_DOWNLOAD: 'update:cancel-download',
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
  /** 主 → 渲染：外部入队的完整任务（如局域网上传） */
  TASK_ADDED: 'task:added',
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

/** 支持的图片扩展名 */
export const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.gif',
  '.tif',
  '.tiff'
]

/** 图片预设 ID */
export type ImagePresetId =
  | 'optimize'
  | 'standard'
  | 'social'
  | 'thumb'
  | 'custom'

/** 图片预设选项（UI） */
export const IMAGE_PRESET_OPTIONS: ReadonlyArray<{
  value: ImagePresetId
  label: string
}> = [
  { value: 'optimize', label: '优化压缩' },
  { value: 'standard', label: '标准' },
  { value: 'social', label: '社交分享' },
  { value: 'thumb', label: '缩略图' },
  { value: 'custom', label: '自定义' }
]

/** 默认图片预设参数 */
export const DEFAULT_IMAGE_PRESETS: Record<
  Exclude<ImagePresetId, 'custom'>,
  { maxEdge: number; quality: number; format: 'jpeg' | 'png' | 'webp' | 'keep' }
> = {
  optimize: { maxEdge: 0, quality: 85, format: 'keep' },
  standard: { maxEdge: 1920, quality: 80, format: 'jpeg' },
  social: { maxEdge: 1280, quality: 75, format: 'jpeg' },
  thumb: { maxEdge: 400, quality: 70, format: 'jpeg' }
}

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

/** 编码器选项（UI）；不可用项由前端根据 encoderInfo 加 disabled */
export const ENCODER_OPTIONS: Array<{
  value: EncoderId
  label: string
}> = [
  { value: 'auto', label: '自动（优先硬件）' },
  { value: 'software', label: '关闭（仅 CPU）' },
  { value: 'h264_nvenc', label: 'h264_nvenc (NVIDIA NVENC)' },
  { value: 'h264_qsv', label: 'h264_qsv (Intel QSV)' },
  { value: 'h264_amf', label: 'h264_amf (AMD AMF)' },
  { value: 'h264_videotoolbox', label: 'h264_videotoolbox (VideoToolbox)' },
  { value: 'h264_mf', label: 'h264_mf (MediaFoundation)' },
  { value: 'hevc_nvenc', label: 'hevc_nvenc (NVIDIA NVENC)' },
  { value: 'hevc_qsv', label: 'hevc_qsv (Intel QSV)' },
  { value: 'hevc_amf', label: 'hevc_amf (AMD AMF)' },
  { value: 'hevc_videotoolbox', label: 'hevc_videotoolbox (VideoToolbox)' },
  { value: 'hevc_mf', label: 'hevc_mf (MediaFoundation)' },
  { value: 'libx264', label: 'libx264 (CPU)' },
  { value: 'libx265', label: 'libx265 (CPU)' }
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
  { value: 'audio', label: '仅抽取音频' },
  { value: 'image', label: '图片压缩' },
  { value: 'image-crop', label: '图片裁切' },
  { value: 'image-stitch', label: '图片拼接' },
  { value: 'video-concat', label: '视频拼接' },
  { value: 'media-compose', label: '图+视频' }
]

/** 工具分组（首页模式信息架构） */
export type ToolGroup = 'video' | 'image' | 'compose'

export const TOOL_GROUP_OPTIONS: Array<{ value: ToolGroup; label: string }> = [
  { value: 'video', label: '视频工具' },
  { value: 'image', label: '图片工具' },
  { value: 'compose', label: '合成' }
]

/** 各工具组下的二级任务模式 */
export const TOOL_GROUP_MODES: Record<ToolGroup, TaskMode[]> = {
  video: ['compress', 'audio', 'video-concat'],
  image: ['image', 'image-crop', 'image-stitch'],
  compose: ['media-compose']
}

export function toolGroupOfMode(mode: TaskMode): ToolGroup {
  if (mode === 'image' || mode === 'image-crop' || mode === 'image-stitch') {
    return 'image'
  }
  if (mode === 'media-compose') return 'compose'
  return 'video'
}

/** 选择文件对话框：按媒体类型过滤 */
export type SelectFilesMediaKind = 'video' | 'image' | 'all'

export interface SelectFilesOptions {
  /** 任务模式（优先于 mediaKind 推导过滤） */
  mode?: TaskMode
  /** 媒体类型；mode 未传时使用 */
  mediaKind?: SelectFilesMediaKind
}

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

/** 默认图片输出命名模板 */
export const DEFAULT_IMAGE_NAME_TEMPLATE = '{name}_img'

/** 默认视频拼接输出命名模板 */
export const DEFAULT_CONCAT_NAME_TEMPLATE = '{name}_concat'

/** 默认图+视频混剪输出命名模板 */
export const DEFAULT_COMPOSE_NAME_TEMPLATE = '{name}_compose'

/** 图片输出格式选项（UI） */
export const IMAGE_FORMAT_OPTIONS: ReadonlyArray<{
  value: 'jpeg' | 'png' | 'webp' | 'keep'
  label: string
}> = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'keep', label: '保持原格式' }
]

/** 图片拼接布局选项（UI） */
export const IMAGE_LAYOUT_OPTIONS: ReadonlyArray<{
  value: 'horizontal' | 'vertical' | 'grid'
  label: string
}> = [
  { value: 'horizontal', label: '横向' },
  { value: 'vertical', label: '纵向' },
  { value: 'grid', label: '网格' }
]

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
  selectFiles: (opts?: SelectFilesOptions) => Promise<AddFilesResult>
  /** defaultPath：打开对话框时的初始目录（如当前输出目录） */
  selectDirectory: (defaultPath?: string) => Promise<SelectDirResult>
  /** 选择水印图片（单选 png/jpg/webp/bmp） */
  selectImage: () => Promise<{ path: string | null }>
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
  /** 图片引擎状态（sharp / ImageMagick） */
  getImageEngineStatus: () => Promise<ImageEngineStatus>
  /** 图片处理：缩放最长边、转 jpeg/png/webp、quality */
  processImage: (options: ImageProcessOptions) => Promise<ImageProcessResult>
  /**
   * 设置 ImageMagick 路径（magick 全路径或所在目录）
   * 空串 = 清除覆盖，回退 PATH 自动探测
   */
  setMagickPath: (path: string) => Promise<{ ok: boolean; error?: string }>
  /** 读取图片尺寸（EXIF orient 后） */
  getImageInfo: (
    path: string
  ) => Promise<{ ok: boolean; width?: number; height?: number; error?: string }>
  /**
   * 生成预览 data URL（jpeg base64）
   * @param maxEdge 预览最长边，默认 1600
   */
  getImageDataUrl: (
    path: string,
    maxEdge?: number
  ) => Promise<{
    ok: boolean
    dataUrl?: string
    width?: number
    height?: number
    previewWidth?: number
    previewHeight?: number
    error?: string
  }>
  /**
   * 从视频抽取一帧为 jpeg data URL（可视化裁切预览）
   * width/height 为源视频显示尺寸（裁切坐标系）
   */
  extractVideoFrame: (opts: {
    path: string
    timeSec?: number
    maxEdge?: number
  }) => Promise<{
    ok: boolean
    dataUrl?: string
    width?: number
    height?: number
    previewWidth?: number
    previewHeight?: number
    error?: string
  }>
  /** 获取局域网远程访问状态 */
  getLanStatus: () => Promise<LanStatus>
  /**
   * 设置局域网远程访问（开关/端口/账号/密码）
   * password 仅在需要修改时传入明文，主进程 scrypt 哈希后写入
   */
  setLanRemoteConfig: (
    config: LanRemoteConfigInput
  ) => Promise<{ ok: boolean; status: LanStatus; error?: string }>
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
  /** 取消正在下载的更新 */
  cancelUpdateDownload: () => Promise<{ ok: boolean; error?: string }>
  installUpdate: () => Promise<{ ok: boolean; error?: string }>
  /** 用系统默认程序打开文件或目录 */
  openPath: (p: string) => Promise<{ ok: boolean; error?: string }>
  /** 在资源管理器中显示并选中 */
  showItemInFolder: (p: string) => Promise<{ ok: boolean }>
  /** 修改用户数据目录；restart=true 表示需重启生效 */
  setDataDir: (dir: string) => Promise<{
    ok: boolean
    error?: string
    restart?: boolean
    /** 已复制到新目录的相对路径 */
    migrated?: string[]
    migrateSkipped?: string[]
    migrateErrors?: string[]
  }>
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
  /** 订阅外部入队任务（局域网等） */
  onTaskAdded: (callback: (task: CompressTask) => void) => () => void
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
