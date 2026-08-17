import path from 'path'
import type {
  AspectRatioId,
  CompressOptions,
  EncodePreset,
  EncoderDetectResult,
  EncoderId,
  OutputFormat,
  ProgressPayload,
  ResolvedEncoder,
  ScaleMode,
  ScalePadMode,
  WatermarkOptions,
  WatermarkPosition
} from './types'
import {
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_AUDIO_NAME_TEMPLATE,
  DEFAULT_COMPOSE_NAME_TEMPLATE,
  DEFAULT_CONCAT_NAME_TEMPLATE,
  DEFAULT_IMAGE_NAME_TEMPLATE,
  DEFAULT_NAME_TEMPLATE,
  DEFAULT_VIDEO_AUDIO_BITRATE
} from './types'

/** H.264 系列编码器（可加 profile/level） */
const H264_ENCODERS: ReadonlyArray<ResolvedEncoder> = [
  'libx264',
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'h264_videotoolbox',
  'h264_mf'
]

/** HEVC 系列（mp4 可加 hvc1 tag） */
const HEVC_ENCODERS: ReadonlyArray<ResolvedEncoder> = [
  'libx265',
  'hevc_nvenc',
  'hevc_qsv',
  'hevc_amf',
  'hevc_videotoolbox',
  'hevc_mf'
]

/** 硬件编码器列表 */
export const HARDWARE_ENCODERS: ReadonlyArray<ResolvedEncoder> = [
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'h264_videotoolbox',
  'h264_mf',
  'hevc_nvenc',
  'hevc_qsv',
  'hevc_amf',
  'hevc_videotoolbox',
  'hevc_mf'
]

/** 是否为硬件编码器 */
export function isHardwareEncoder(enc: string): boolean {
  return (HARDWARE_ENCODERS as readonly string[]).includes(enc)
}

/** 旧 EncoderId 别名 → 显式 codec */
const LEGACY_ENCODER_ALIAS: Partial<Record<EncoderId, ResolvedEncoder>> = {
  nvenc: 'h264_nvenc',
  qsv: 'h264_qsv',
  amf: 'h264_amf',
  videotoolbox: 'h264_videotoolbox',
  software: 'libx264'
}

/** 从 detect 判断某 ResolvedEncoder 是否可用 */
export function isEncoderAvailable(
  detect: EncoderDetectResult | null | undefined,
  codec: ResolvedEncoder
): boolean | undefined {
  if (!detect) return undefined
  if (detect.codecs && codec in detect.codecs) {
    return !!detect.codecs[codec]
  }
  // 兼容仅旧布尔字段
  if (codec === 'h264_nvenc') return detect.nvenc
  if (codec === 'h264_qsv') return detect.qsv
  if (codec === 'h264_amf') return detect.amf
  if (codec === 'h264_videotoolbox') return !!detect.videotoolbox
  if (codec === 'libx264') return true
  return undefined
}

function throwEncoderUnavailable(label: string): never {
  throw new Error(
    `本机未检测到可用的 ${label} 编码器，请改用「自动」或「关闭（仅 CPU）」`
  )
}

/** 从 `128k` 解析 kbps；无效时回退 128 */
export function parseAudioBitrateKbps(bitrate?: string): number {
  if (!bitrate || typeof bitrate !== 'string') return 128
  const m = bitrate.trim().match(/^(\d+)\s*k$/i)
  if (!m) return 128
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return 128
  return n
}

/** 视频模式音轨码率；未设时保持 128k */
export function resolveVideoAudioBitrate(options: CompressOptions): string {
  const raw = options.videoAudioBitrate
  if (raw && typeof raw === 'string' && raw.trim()) {
    return raw.trim()
  }
  return DEFAULT_VIDEO_AUDIO_BITRATE
}

/** x264 preset；默认 medium */
export function resolveEncodePreset(options: CompressOptions): EncodePreset {
  const p = options.encodePreset
  if (p === 'fast' || p === 'medium' || p === 'slow') return p
  return 'medium'
}

/**
 * 追加 H.264 兼容档参数（WebM/VP9 跳过）
 * - main-l4：Main@L4 + yuv420p
 * - high：High + yuv420p
 * - auto / undefined：不加
 */
export function appendH264CompatArgs(
  args: string[],
  options: CompressOptions,
  resolved: ResolvedEncoder
): void {
  if (!H264_ENCODERS.includes(resolved)) return
  const profile = options.compatProfile
  if (profile === 'main-l4') {
    args.push('-profile:v', 'main', '-level', '4.0', '-pix_fmt', 'yuv420p')
  } else if (profile === 'high') {
    args.push('-profile:v', 'high', '-pix_fmt', 'yuv420p')
  }
}

/**
 * CRF(软件) → 硬件质量参数映射说明：
 * - NVENC: 使用 -cq（Constant Quality），数值大致接近 CRF，范围约 0-51
 * - QSV: 使用 -global_quality，数值大致对应 CRF
 * - AMF: 使用 -qp_i/qp_p 或 -rc cqp -qp，这里用 -qp
 * - VideoToolbox: -q:v 约 20-65（数值越大质量越低）
 * 不同驱动/卡差异较大，映射仅为实用近似，非严格等价。
 */
export function mapCrfToHardwareQuality(crf: number): number {
  return Math.max(0, Math.min(51, Math.round(crf)))
}

/**
 * CRF → VideoToolbox -q:v（约 20–65，数值越大质量越低）
 * crf 18 → ~28，crf 28 → ~45，crf 51 → ~65
 */
export function mapCrfToVideotoolboxQ(crf: number): number {
  const c = Math.max(0, Math.min(51, Math.round(crf)))
  // 线性映射到 20–65
  const q = Math.round(20 + (c / 51) * 45)
  return Math.max(20, Math.min(65, q))
}

/** 是否为 H.264 容器（可走硬件加速） */
export function isH264Container(format: OutputFormat): boolean {
  return format === 'mp4' || format === 'mkv' || format === 'mov'
}

/**
 * 估算视频码率（kbps）
 * targetBytes = targetSizeMb * 1024 * 1024
 * audioKbps 默认 128
 * videoKbps = max(200, floor((targetBytes * 8 / durationSec)/1000 - audioKbps))
 */
export function estimateVideoBitrateKbps(
  targetSizeMb: number,
  durationSec: number,
  audioKbps = 128
): number {
  if (
    !Number.isFinite(targetSizeMb) ||
    targetSizeMb <= 0 ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  ) {
    return 200
  }
  const targetBytes = targetSizeMb * 1024 * 1024
  const totalKbps = (targetBytes * 8) / durationSec / 1000
  const videoKbps = Math.floor(totalKbps - audioKbps)
  return Math.max(200, videoKbps)
}

/**
 * 解析 speed 字符串为倍率，如 "1.5x" / "1.50" → 1.5；无效返回 null
 */
export function parseSpeedMultiplier(speed?: string): number | null {
  if (!speed || typeof speed !== 'string') return null
  const m = speed.trim().match(/^([0-9.]+)\s*x?$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * 估算剩余秒数
 * 优先：speed 倍率 + 剩余媒体时长；否则 percent 墙钟外推
 */
export function estimateEtaSec(params: {
  percent: number
  elapsedSec: number
  speed?: string
  /** 媒体有效总时长（秒） */
  durationSec?: number
  /** 已处理媒体时间（秒） */
  currentMediaSec?: number
}): number | undefined {
  const { percent, elapsedSec, speed, durationSec, currentMediaSec } = params
  const mult = parseSpeedMultiplier(speed)
  if (
    mult != null &&
    durationSec != null &&
    durationSec > 0 &&
    currentMediaSec != null &&
    currentMediaSec >= 0
  ) {
    const remain = durationSec - currentMediaSec
    if (remain > 0) {
      return Math.max(0, Math.round(remain / mult))
    }
    return 0
  }
  if (percent > 1 && elapsedSec > 0 && percent < 100) {
    return Math.max(0, Math.round((elapsedSec * (100 - percent)) / percent))
  }
  return undefined
}

/**
 * 规范化裁剪秒数：非有限 / 负数 → undefined；0 表示不裁剪（返回 undefined）
 */
export function normalizeTrimSec(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

/**
 * 构建时间段裁剪参数
 * - beforeInput：优先 input seek（-ss 在 -i 前）加速
 * - afterInput：有 start+end 时用 -t 时长（与 input -ss 更可靠）；仅 end 时用 -to
 * 约定：trimStart/trimEnd 为秒；0/undefined 表示不裁剪对应端点
 */
export function buildSeekArgs(options: CompressOptions): {
  beforeInput: string[]
  afterInput: string[]
} {
  const start = normalizeTrimSec(options.trimStart)
  const end = normalizeTrimSec(options.trimEnd)

  const beforeInput: string[] = []
  const afterInput: string[] = []

  if (start != null) {
    beforeInput.push('-ss', String(start))
  }

  if (end != null && (start == null || end > start)) {
    if (start != null) {
      // input -ss 后输出时间轴通常从 0 起，用时长 -t 更稳
      const dur = end - start
      afterInput.push('-t', String(dur))
    } else {
      // 无 start：-to 为从文件头起的绝对结束时刻
      afterInput.push('-to', String(end))
    }
  }

  return { beforeInput, afterInput }
}

/**
 * 计算裁剪后的有效时长（用于进度百分比）
 * @param sourceDuration 源文件总时长（秒），0 表示未知
 */
export function effectiveDuration(
  options: CompressOptions,
  sourceDuration: number
): number {
  const start = normalizeTrimSec(options.trimStart) ?? 0
  const endRaw = normalizeTrimSec(options.trimEnd)
  const src =
    Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : 0

  let end = endRaw
  if (end == null || end <= start) {
    end = src > 0 ? src : undefined
  } else if (src > 0 && end > src) {
    end = src
  }

  if (end != null && end > start) {
    return end - start
  }
  // 未知结尾时：若仅有 start 且已知源时长，用剩余长度
  if (src > 0 && start > 0 && start < src) {
    return src - start
  }
  return src
}

/**
 * 解析最终视频编码器
 * webm 强制 libvpx-vp9；其余按 encoder 选项选择
 * @param platform 可选 process.platform，影响 auto 优先级（darwin 优先 videotoolbox）
 */
export function resolveVideoEncoder(
  options: CompressOptions,
  detect?: EncoderDetectResult | null,
  platform?: string
): { encoder: ResolvedEncoder; note?: string } {
  const format = options.format || 'mp4'

  if (format === 'webm') {
    return {
      encoder: 'libvpx-vp9',
      note: 'WebM 使用软件 VP9，硬件加速不适用'
    }
  }

  const enc: EncoderId = options.encoder || 'auto'

  // 软件 / 显式 CPU
  if (enc === 'software' || enc === 'libx264') {
    return { encoder: 'libx264' }
  }
  if (enc === 'libx265') {
    if (detect && isEncoderAvailable(detect, 'libx265') === false) {
      throwEncoderUnavailable('libx265')
    }
    return { encoder: 'libx265' }
  }

  // 旧别名 → h264_*
  const legacy = LEGACY_ENCODER_ALIAS[enc]
  if (legacy && legacy !== 'libx264') {
    if (detect && isEncoderAvailable(detect, legacy) === false) {
      const labels: Record<string, string> = {
        h264_nvenc: 'NVIDIA NVENC',
        h264_qsv: 'Intel QSV',
        h264_amf: 'AMD AMF',
        h264_videotoolbox: 'Apple VideoToolbox'
      }
      throwEncoderUnavailable(labels[legacy] || legacy)
    }
    return { encoder: legacy }
  }

  // 显式 h264_* / hevc_*
  const explicitHw: ResolvedEncoder[] = [
    'h264_nvenc',
    'h264_qsv',
    'h264_amf',
    'h264_videotoolbox',
    'h264_mf',
    'hevc_nvenc',
    'hevc_qsv',
    'hevc_amf',
    'hevc_videotoolbox',
    'hevc_mf'
  ]
  if ((explicitHw as string[]).includes(enc)) {
    const codec = enc as ResolvedEncoder
    if (detect && isEncoderAvailable(detect, codec) === false) {
      throwEncoderUnavailable(codec)
    }
    return { encoder: codec }
  }

  // auto：优先 H.264 硬件（不默认 HEVC），再 libx264
  // win/linux: nvenc > qsv > amf > mf > vt；darwin: vt > nvenc > qsv > amf > mf
  if (detect) {
    const pick = (list: ResolvedEncoder[]): ResolvedEncoder | null => {
      for (const c of list) {
        if (isEncoderAvailable(detect, c)) return c
      }
      return null
    }
    const isDarwin = platform === 'darwin'
    const order: ResolvedEncoder[] = isDarwin
      ? [
          'h264_videotoolbox',
          'h264_nvenc',
          'h264_qsv',
          'h264_amf',
          'h264_mf'
        ]
      : [
          'h264_nvenc',
          'h264_qsv',
          'h264_amf',
          'h264_mf',
          'h264_videotoolbox'
        ]
    const hw = pick(order)
    if (hw) return { encoder: hw }
  }
  return { encoder: 'libx264' }
}

/** 构建缩放滤镜参数（最长边限制，保持兼容） */
export function buildScaleFilter(maxEdge: number): string | null {
  if (!maxEdge || maxEdge <= 0) return null
  const n = maxEdge
  // 保持宽高比，且不放大
  return `scale='min(${n},iw)':'min(${n},ih)':force_original_aspect_ratio=decrease`
}

/** 解析有效缩放模式（兼容仅写 maxEdge 的旧任务） */
export function resolveScaleMode(options: CompressOptions): ScaleMode {
  if (
    options.scaleMode === 'none' ||
    options.scaleMode === 'maxEdge' ||
    options.scaleMode === 'fixed' ||
    options.scaleMode === 'aspect'
  ) {
    return options.scaleMode
  }
  if (typeof options.maxEdge === 'number' && options.maxEdge > 0) {
    return 'maxEdge'
  }
  return 'none'
}

/** 解析宽高比数值；无效返回 null */
export function parseAspectRatioId(
  id?: AspectRatioId | string | null
): { rw: number; rh: number } | null {
  if (id === '16:9') return { rw: 16, rh: 9 }
  if (id === '9:16') return { rw: 9, rh: 16 }
  if (id === '1:1') return { rw: 1, rh: 1 }
  if (id === '4:3') return { rw: 4, rh: 3 }
  return null
}

/**
 * 解析目标输出宽高；无法解析返回 null
 * - fixed：outWidth × outHeight
 * - aspect：按 aspectRatio + outWidth（优先）或 maxEdge 作长边
 */
export function resolveOutputSize(
  options: CompressOptions
): { w: number; h: number } | null {
  const mode = resolveScaleMode(options)
  if (mode === 'fixed') {
    const w = Number(options.outWidth)
    const h = Number(options.outHeight)
    if (
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return null
    }
    return { w: Math.round(w), h: Math.round(h) }
  }
  if (mode === 'aspect') {
    const ratio = parseAspectRatioId(options.aspectRatio)
    if (!ratio) return null
    const { rw, rh } = ratio
    const outW = Number(options.outWidth)
    if (Number.isFinite(outW) && outW > 0) {
      const w = Math.round(outW)
      const h = Math.max(1, Math.round((w * rh) / rw))
      return { w, h }
    }
    const edge = Number(options.maxEdge)
    if (Number.isFinite(edge) && edge > 0) {
      const long = Math.round(edge)
      // 长边 = max(w,h) = long
      if (rw >= rh) {
        const w = long
        const h = Math.max(1, Math.round((w * rh) / rw))
        return { w, h }
      }
      const h = long
      const w = Math.max(1, Math.round((h * rw) / rh))
      return { w, h }
    }
    return null
  }
  return null
}

/**
 * 构建缩放(+可选 pad) 滤镜片段
 * - maxEdge: 现有 scale min
 * - fixed / aspect: scale=w:h:force_original_aspect_ratio=decrease，
 *   scalePad=black 时再 pad 到精确画布
 */
export function buildScalePadFilter(options: CompressOptions): string | null {
  const mode = resolveScaleMode(options)
  if (mode === 'none') return null
  if (mode === 'maxEdge') {
    return buildScaleFilter(options.maxEdge)
  }
  const size = resolveOutputSize(options)
  if (!size) return null
  const { w, h } = size
  const scale = `scale=${w}:${h}:force_original_aspect_ratio=decrease`
  const padMode: ScalePadMode =
    options.scalePad === 'none' ? 'none' : 'black'
  if (padMode === 'none') return scale
  // 居中黑边 pad 到精确目标画布
  return `${scale},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`
}

/**
 * 构建旋转滤镜
 * - cw：transpose=1 顺时针 90°
 * - ccw：transpose=2 逆时针 90°
 * - 180：hflip,vflip（等价 180°）
 */
export function buildRotateFilter(
  rotate90: CompressOptions['rotate90']
): string | null {
  if (rotate90 === 'cw') return 'transpose=1'
  if (rotate90 === 'ccw') return 'transpose=2'
  if (rotate90 === '180') return 'hflip,vflip'
  return null
}

/**
 * 构建裁切滤镜 crop=w:h:x:y；无效返回 null
 */
export function buildCropFilter(
  crop?: { x: number; y: number; w: number; h: number } | null
): string | null {
  if (crop == null || typeof crop !== 'object') return null
  const x = Number(crop.x)
  const y = Number(crop.y)
  const w = Number(crop.w)
  const h = Number(crop.h)
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h)
  ) {
    return null
  }
  if (w <= 0 || h <= 0 || x < 0 || y < 0) return null
  return `crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x)}:${Math.round(y)}`
}

/**
 * 组合基础视频滤镜：旋转 → 裁切 → 缩放/pad → 帧率（不含水印）
 */
export function buildVideoFilter(options: CompressOptions): string | null {
  const parts: string[] = []
  const rotate = buildRotateFilter(options.rotate90)
  if (rotate) parts.push(rotate)
  const crop = buildCropFilter(options.crop)
  if (crop) parts.push(crop)
  const scale = buildScalePadFilter(options)
  if (scale) parts.push(scale)
  const fps = options.fps
  if (fps === '24' || fps === '30' || fps === '60') {
    parts.push(`fps=${fps}`)
  }
  if (parts.length === 0) return null
  return parts.join(',')
}

/**
 * 生成 concat demuxer list 文件内容
 * 每行 file 'path'，路径内单引号转义为 '\''
 */
export function buildConcatDemuxerList(paths: string[]): string {
  return paths
    .map((p) => {
      const escaped = String(p ?? '').replace(/'/g, "'\\''")
      return `file '${escaped}'`
    })
    .join('\n')
}

/**
 * 构建 filter_complex concat（重编码路径）的 filter 字符串
 * 例 n=2 hasAudio: [0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]
 * 无音频: [0:v][1:v]concat=n=2:v=1:a=0[outv]
 */
export function buildConcatFilterComplex(
  count: number,
  hasAudio: boolean
): string {
  const n = Math.max(0, Math.floor(count))
  if (n <= 0) return ''
  const labels: string[] = []
  for (let i = 0; i < n; i++) {
    labels.push(`[${i}:v]`)
    if (hasAudio) labels.push(`[${i}:a]`)
  }
  if (hasAudio) {
    return `${labels.join('')}concat=n=${n}:v=1:a=1[outv][outa]`
  }
  return `${labels.join('')}concat=n=${n}:v=1:a=0[outv]`
}

/** 是否为图片相关任务模式 */
export function isImageMode(mode?: string | null): boolean {
  return mode === 'image' || mode === 'image-crop' || mode === 'image-stitch'
}

/** drawtext 文本转义：\ : ' % */
export function escapeDrawtext(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
}

/** filter 路径转义：反斜杠改正斜杠，并转义 : ' */
export function escapeFilterPath(p: string): string {
  return String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
}

/** 规范化透明度 0–1 */
export function normalizeOpacity(v: unknown, fallback = 0.8): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

/** 规范化边距等非负整数 */
function normalizeNonNegInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n)
}

/** 水印时间段 enable 表达式；无有效区间时返回 null */
export function buildWatermarkEnableExpr(
  startSec?: number,
  endSec?: number
): string | null {
  const start = normalizeTrimSec(startSec)
  const end = normalizeTrimSec(endSec)
  if (start == null && end == null) return null
  if (start != null && end != null) {
    if (end <= start) return null
    return `between(t\\,${start}\\,${end})`
  }
  if (start != null) return `gte(t\\,${start})`
  return `lte(t\\,${end})`
}

/**
 * 九宫格 overlay/drawtext 坐标
 * margin 为像素边距
 */
export function buildWatermarkOverlayExpr(
  pos: WatermarkPosition | undefined,
  marginX?: number,
  marginY?: number
): { x: string; y: string } {
  const mx = normalizeNonNegInt(marginX, 16)
  const my = normalizeNonNegInt(marginY, 16)
  const p = pos || 'br'
  let x: string
  let y: string
  switch (p) {
    case 'tl':
      x = String(mx)
      y = String(my)
      break
    case 'tc':
      x = `(W-w)/2`
      y = String(my)
      break
    case 'tr':
      x = `W-w-${mx}`
      y = String(my)
      break
    case 'ml':
      x = String(mx)
      y = `(H-h)/2`
      break
    case 'mc':
      x = `(W-w)/2`
      y = `(H-h)/2`
      break
    case 'mr':
      x = `W-w-${mx}`
      y = `(H-h)/2`
      break
    case 'bl':
      x = String(mx)
      y = `H-h-${my}`
      break
    case 'bc':
      x = `(W-w)/2`
      y = `H-h-${my}`
      break
    case 'br':
    default:
      x = `W-w-${mx}`
      y = `H-h-${my}`
      break
  }
  return { x, y }
}

/** 是否有效启用水印（音频模式忽略） */
export function isWatermarkActive(options: CompressOptions): boolean {
  if (options.mode === 'audio') return false
  const wm = options.watermark
  if (!wm || wm.mode === 'none') return false
  if (wm.mode === 'image') {
    return typeof wm.imagePath === 'string' && wm.imagePath.trim().length > 0
  }
  if (wm.mode === 'text') {
    return typeof wm.text === 'string' && wm.text.length > 0
  }
  return false
}

/** 视频滤镜规划（含可选第二输入与 filter_complex） */
export interface VideoFilterPlan {
  /** 无第二输入时用 -vf */
  vf?: string
  /** 有图片水印时用 filter_complex */
  filterComplex?: string
  /** 额外 -i 路径（图片水印） */
  extraInputs?: string[]
  /** complex 输出视频标签，如 [vout] */
  mapVideoLabel?: string
}

/**
 * 规划视频滤镜：rotate → scale → fps → watermark
 * @param fontfile 可选 drawtext 字体路径（由 runner 探测后传入）
 */
export function planVideoFilters(
  options: CompressOptions,
  opts?: { fontfile?: string }
): VideoFilterPlan {
  const base = buildVideoFilter(options)
  if (!isWatermarkActive(options)) {
    return base ? { vf: base } : {}
  }

  const wm = options.watermark as WatermarkOptions
  const opacity = normalizeOpacity(wm.opacity, 0.8)
  const { x, y } = buildWatermarkOverlayExpr(wm.position, wm.marginX, wm.marginY)
  const enable = buildWatermarkEnableExpr(wm.startSec, wm.endSec)

  if (wm.mode === 'text') {
    const fontSize = normalizeNonNegInt(wm.fontSize, 24) || 24
    const rawColor = (wm.fontColor || 'white').trim() || 'white'
    // 去掉可能已带的 @alpha，统一用 opacity
    const colorBase = rawColor.replace(/@[\d.]+$/i, '')
    const fontcolor = `${colorBase}@${opacity}`
    const text = escapeDrawtext(wm.text || '')
    const parts: string[] = [
      `text='${text}'`,
      `x=${x}`,
      `y=${y}`,
      `fontsize=${fontSize}`,
      `fontcolor=${fontcolor}`,
      'borderw=1',
      'bordercolor=black@0.4'
    ]
    if (opts?.fontfile) {
      parts.push(`fontfile='${escapeFilterPath(opts.fontfile)}'`)
    }
    if (enable) {
      parts.push(`enable='${enable}'`)
    }
    const draw = `drawtext=${parts.join(':')}`
    const vf = base ? `${base},${draw}` : draw
    return { vf }
  }

  // 图片水印：第二输入 + filter_complex
  const imagePath = (wm.imagePath || '').trim()
  const pctRaw =
    typeof wm.scalePercent === 'number' && Number.isFinite(wm.scalePercent)
      ? wm.scalePercent
      : 15
  const pct = Math.max(1, Math.min(100, pctRaw))
  // 目标宽 ≈ 短边 * pct/100，且不超过原图宽
  const wmScale = `scale='min(iw,min(iw\\,ih)*${pct}/100)':-1`
  const enablePart = enable ? `:enable='${enable}'` : ''
  // shortest=1：以主视频时长为准（配合 -loop 1 的 logo 输入）
  const wmChain = `[1:v]${wmScale},format=rgba,colorchannelmixer=aa=${opacity}[wm]`
  const overlay = base
    ? `[0:v]${base}[base];${wmChain};[base][wm]overlay=x=${x}:y=${y}:shortest=1${enablePart}[vout]`
    : `${wmChain};[0:v][wm]overlay=x=${x}:y=${y}:shortest=1${enablePart}[vout]`

  return {
    filterComplex: overlay,
    extraInputs: [imagePath],
    mapVideoLabel: '[vout]'
  }
}

/** 是否支持经典 -pass 1/2 两遍编码（软件 x264 / x265 / VP9） */
export function supportsTwoPass(resolved: ResolvedEncoder): boolean {
  return (
    resolved === 'libx264' ||
    resolved === 'libx265' ||
    resolved === 'libvpx-vp9'
  )
}

/**
 * 是否应启用两遍编码
 * 条件：目标体积>0、twoPass 未显式关闭、编码器支持
 */
export function shouldUseTwoPass(
  options: CompressOptions,
  resolved: ResolvedEncoder
): boolean {
  const targetMb =
    typeof options.targetSizeMb === 'number' &&
    Number.isFinite(options.targetSizeMb) &&
    options.targetSizeMb > 0
  if (!targetMb) return false
  if (options.twoPass === false) return false
  if (options.mode === 'audio') return false
  return supportsTwoPass(resolved)
}

/** 两遍编码时 pass1 输出的 null 设备路径 */
export function nullOutputPath(platform?: string): string {
  const p = platform ?? (typeof process !== 'undefined' ? process.platform : 'win32')
  return p === 'win32' ? 'NUL' : '/dev/null'
}

/** buildCompressArgs 可选上下文 */
export interface BuildCompressArgsCtx {
  /** 有效时长（秒），用于目标体积码率估算 */
  durationSec?: number
  /** 目标体积无法估算时的备注（由调用方收集） */
  notes?: string[]
  /**
   * 两遍编码的 pass：1 或 2
   * 仅当 shouldUseTwoPass 且 ABR 时有效
   */
  pass?: 1 | 2
  /** passlog 文件路径前缀（不含扩展名），两遍时必填 */
  passLogFile?: string
  /** drawtext 字体文件（由 runner 探测） */
  fontfile?: string
  /**
   * 写出滤镜规划（extraInputs / map 等），供 runner 拼 -i
   * 调用方传入空对象，函数内写入字段
   */
  filterPlanOut?: VideoFilterPlan
}

/**
 * 仅构建视频编码器参数（-c:v 及质量/码率相关）
 * 供 concat / compose 重编码复用，不含音频、滤镜、容器
 */
export function buildVideoEncoderArgs(
  options: CompressOptions,
  resolved: ResolvedEncoder,
  ctx?: { durationSec?: number; notes?: string[] }
): string[] {
  const args: string[] = []
  const format = options.format || 'mp4'
  const quality = mapCrfToHardwareQuality(options.crf)
  const durationSec =
    ctx?.durationSec != null &&
    Number.isFinite(ctx.durationSec) &&
    ctx.durationSec > 0
      ? ctx.durationSec
      : 0
  const targetMb =
    typeof options.targetSizeMb === 'number' &&
    Number.isFinite(options.targetSizeMb) &&
    options.targetSizeMb > 0
      ? options.targetSizeMb
      : 0
  const useAbr = targetMb > 0 && durationSec > 0
  if (targetMb > 0 && durationSec <= 0) {
    ctx?.notes?.push('目标体积已设但时长未知，已回退 CRF/质量模式')
  }
  const audioKbps =
    options.muteAudio === true
      ? 0
      : parseAudioBitrateKbps(options.videoAudioBitrate)
  const videoKbps = useAbr
    ? estimateVideoBitrateKbps(targetMb, durationSec, audioKbps)
    : 0
  const bv = `${videoKbps}k`
  const maxrate = bv
  const bufsize = `${videoKbps * 2}k`

  if (resolved === 'libvpx-vp9') {
    if (useAbr) {
      args.push(
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        bv,
        '-deadline',
        'good',
        '-cpu-used',
        '4',
        '-row-mt',
        '1'
      )
    } else {
      args.push(
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '0',
        '-crf',
        String(quality),
        '-deadline',
        'good',
        '-cpu-used',
        '4',
        '-row-mt',
        '1'
      )
    }
    return args
  }

  if (resolved === 'libx264') {
    const x264Preset = resolveEncodePreset(options)
    if (useAbr) {
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        x264Preset,
        '-b:v',
        bv,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize
      )
    } else {
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        x264Preset,
        '-crf',
        String(options.crf)
      )
    }
  } else if (resolved === 'libx265') {
    const x265Preset = resolveEncodePreset(options)
    if (useAbr) {
      args.push(
        '-c:v',
        'libx265',
        '-preset',
        x265Preset,
        '-b:v',
        bv,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize,
        '-pix_fmt',
        'yuv420p'
      )
    } else {
      args.push(
        '-c:v',
        'libx265',
        '-preset',
        x265Preset,
        '-crf',
        String(options.crf),
        '-pix_fmt',
        'yuv420p'
      )
    }
  } else if (resolved === 'h264_nvenc' || resolved === 'hevc_nvenc') {
    if (useAbr) {
      args.push(
        '-c:v',
        resolved,
        '-preset',
        'p4',
        '-rc',
        'vbr',
        '-b:v',
        bv,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize
      )
    } else {
      args.push(
        '-c:v',
        resolved,
        '-preset',
        'p4',
        '-rc',
        'vbr',
        '-cq',
        String(quality),
        '-b:v',
        '0'
      )
    }
  } else if (resolved === 'h264_qsv' || resolved === 'hevc_qsv') {
    if (useAbr) {
      args.push(
        '-c:v',
        resolved,
        '-b:v',
        bv,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize,
        '-look_ahead',
        '1'
      )
    } else {
      args.push(
        '-c:v',
        resolved,
        '-global_quality',
        String(quality),
        '-look_ahead',
        '1'
      )
    }
  } else if (resolved === 'h264_amf' || resolved === 'hevc_amf') {
    if (useAbr) {
      args.push(
        '-c:v',
        resolved,
        '-rc',
        'vbr_peak',
        '-b:v',
        bv,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize,
        '-quality',
        'balanced'
      )
    } else {
      args.push(
        '-c:v',
        resolved,
        '-rc',
        'cqp',
        '-qp_i',
        String(quality),
        '-qp_p',
        String(quality),
        '-quality',
        'balanced'
      )
    }
  } else if (
    resolved === 'h264_videotoolbox' ||
    resolved === 'hevc_videotoolbox'
  ) {
    if (useAbr) {
      args.push(
        '-c:v',
        resolved,
        '-b:v',
        bv,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize,
        '-allow_sw',
        '1'
      )
    } else {
      const qv = mapCrfToVideotoolboxQ(options.crf)
      args.push(
        '-c:v',
        resolved,
        '-b:v',
        '0',
        '-q:v',
        String(qv),
        '-allow_sw',
        '1'
      )
    }
  } else if (resolved === 'h264_mf' || resolved === 'hevc_mf') {
    if (useAbr) {
      args.push(
        '-c:v',
        resolved,
        '-rate_control',
        'cbr',
        '-b:v',
        bv,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize
      )
    } else {
      args.push(
        '-c:v',
        resolved,
        '-rate_control',
        'quality',
        '-quality',
        String(quality)
      )
    }
  } else {
    // 未知：回退 libx264
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      String(options.crf ?? 23)
    )
  }

  appendH264CompatArgs(args, options, resolved)

  if (
    (HEVC_ENCODERS as readonly string[]).includes(resolved) &&
    (format === 'mp4' || format === 'mov')
  ) {
    args.push('-tag:v', 'hvc1')
  }

  // 硬件编码器默认 yuv420p（软件 libx264 仅在 compat profile 时由 appendH264CompatArgs 添加）
  if (
    !args.includes('-pix_fmt') &&
    isHardwareEncoder(resolved)
  ) {
    args.push('-pix_fmt', 'yuv420p')
  }

  return args
}

/**
 * 构建压缩参数（不含 -i / 输出路径）
 * 按输出格式与编码器生成合理 ffmpeg 参数
 * targetSizeMb>0 且 durationSec>0 时改用 ABR（-b:v），否则 CRF/质量模式
 * pass=1：仅视频 + -pass 1 -an，输出由 runner 写到 null
 * pass=2：完整音视频 + -pass 2
 */
/** 将滤镜计划写入编码参数（-vf 或 -filter_complex + -map） */
function appendVideoFilterArgs(
  args: string[],
  plan: VideoFilterPlan,
  options: CompressOptions,
  pass: 1 | 2 | undefined
): void {
  if (plan.filterComplex) {
    args.push('-filter_complex', plan.filterComplex)
    if (plan.mapVideoLabel) {
      args.push('-map', plan.mapVideoLabel)
    }
    // 有 complex 映射时需显式 map 音频；pass1 / 静音不 map
    if (pass !== 1 && options.muteAudio !== true) {
      args.push('-map', '0:a?')
    }
    return
  }
  if (plan.vf) {
    args.push('-vf', plan.vf)
  }
}

export function buildCompressArgs(
  options: CompressOptions,
  resolved: ResolvedEncoder,
  ctx?: BuildCompressArgsCtx
): string[] {
  const format = options.format || 'mp4'
  const filterPlan = planVideoFilters(options, { fontfile: ctx?.fontfile })
  if (ctx?.filterPlanOut) {
    Object.assign(ctx.filterPlanOut, filterPlan)
  }
  const durationSec =
    ctx?.durationSec != null &&
    Number.isFinite(ctx.durationSec) &&
    ctx.durationSec > 0
      ? ctx.durationSec
      : 0
  const targetMb =
    typeof options.targetSizeMb === 'number' &&
    Number.isFinite(options.targetSizeMb) &&
    options.targetSizeMb > 0
      ? options.targetSizeMb
      : 0
  const useAbr = targetMb > 0 && durationSec > 0

  // 两遍：仅 ABR + 支持的软件编码器
  const pass =
    useAbr &&
    ctx?.pass != null &&
    (ctx.pass === 1 || ctx.pass === 2) &&
    supportsTwoPass(resolved)
      ? ctx.pass
      : undefined
  const passLog = pass != null && ctx?.passLogFile ? ctx.passLogFile : undefined
  if (pass != null && !passLog) {
    ctx?.notes?.push('两遍编码缺少 passLogFile，已回退单遍 ABR')
  }
  const useTwoPass = pass != null && !!passLog

  const args = buildVideoEncoderArgs(options, resolved, {
    durationSec: ctx?.durationSec,
    notes: ctx?.notes
  })

  // pass1 时去掉 hvc1（null 输出无需 tag）
  if (pass === 1) {
    const tagIdx = args.indexOf('-tag:v')
    if (tagIdx >= 0) {
      args.splice(tagIdx, 2)
    }
  }

  if (useTwoPass && pass != null && passLog) {
    args.push('-pass', String(pass), '-passlogfile', passLog)
  }

  // 音频
  if (pass === 1 || options.muteAudio === true) {
    args.push('-an')
  } else if (resolved === 'libvpx-vp9') {
    args.push('-c:a', 'libopus', '-b:a', resolveVideoAudioBitrate(options))
  } else {
    args.push('-c:a', 'aac', '-b:a', resolveVideoAudioBitrate(options))
  }

  appendVideoFilterArgs(args, filterPlan, options, pass)

  // 容器相关
  if (pass === 1) {
    args.push('-f', 'null')
  } else if (resolved === 'libvpx-vp9') {
    args.push('-f', 'webm')
  } else {
    if (format === 'mp4' || format === 'mov') {
      args.push('-movflags', '+faststart')
    }
    if (format === 'mp4') {
      args.push('-f', 'mp4')
    } else if (format === 'mov') {
      args.push('-f', 'mov')
    } else if (format === 'mkv') {
      args.push('-f', 'matroska')
    }
  }

  return args
}

/**
 * 构建指定 pass 的压缩参数（两遍编码辅助）
 * pass1 需配合 null 输出；pass2 用正常输出路径
 */
export function buildCompressArgsPass(
  options: CompressOptions,
  resolved: ResolvedEncoder,
  pass: 1 | 2,
  ctx: {
    durationSec?: number
    passLogFile: string
    notes?: string[]
    fontfile?: string
    filterPlanOut?: VideoFilterPlan
  }
): string[] {
  return buildCompressArgs(options, resolved, {
    durationSec: ctx.durationSec,
    notes: ctx.notes,
    pass,
    passLogFile: ctx.passLogFile,
    fontfile: ctx.fontfile,
    filterPlanOut: ctx.filterPlanOut
  })
}

/**
 * 构建仅抽取音频参数（不含 -i / 输出路径）
 * -vn 去视频，按 audioFormat 选择编码器与容器
 */
export function buildAudioExtractArgs(options: CompressOptions): string[] {
  const format = options.audioFormat || 'm4a'
  const bitrate = (options.audioBitrate || DEFAULT_AUDIO_BITRATE).trim() || DEFAULT_AUDIO_BITRATE
  const args: string[] = ['-vn']

  if (format === 'mp3') {
    args.push('-c:a', 'libmp3lame', '-b:a', bitrate, '-f', 'mp3')
  } else if (format === 'opus') {
    args.push('-c:a', 'libopus', '-b:a', bitrate, '-f', 'opus')
  } else {
    // m4a：AAC + ipod/mp4 容器
    args.push('-c:a', 'aac', '-b:a', bitrate, '-f', 'ipod')
  }

  return args
}

/** 音频模式实际编码器名（用于任务展示） */
export function resolveAudioEncoder(options: CompressOptions): string {
  const format = options.audioFormat || 'm4a'
  if (format === 'mp3') return 'libmp3lame'
  if (format === 'opus') return 'libopus'
  return 'aac'
}

/** 兼容旧调用：仅软件 x264 */
export function buildCompressArgsLegacy(options: CompressOptions): string[] {
  return buildCompressArgs(options, 'libx264')
}

/** 解析 ffmpeg stderr 中的 time= 进度 */
export function parseProgressLine(
  line: string,
  durationSec: number
): Partial<ProgressPayload> | null {
  // frame=  123 fps= 30 q=28.0 size=    1024kB time=00:01:23.45 bitrate= 100.0kbits/s speed=1.2x
  if (!line.includes('time=')) {
    return null
  }

  const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/)
  const speedMatch = line.match(/speed=\s*([0-9.]+x?)/)
  const fpsMatch = line.match(/fps=\s*([0-9.]+)/)

  let percent = 0
  let timeStr: string | undefined

  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10)
    const m = parseInt(timeMatch[2], 10)
    const s = parseFloat(timeMatch[3])
    const current = h * 3600 + m * 60 + s
    timeStr = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`
    if (durationSec > 0) {
      percent = Math.min(99.9, Math.max(0, (current / durationSec) * 100))
    }
  }

  return {
    percent: Math.round(percent * 10) / 10,
    time: timeStr,
    speed: speedMatch?.[1],
    fps: fpsMatch?.[1]
  }
}

/** 秒 → HH:MM:SS.ss */
export function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number, len = 2) => String(Math.floor(n)).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${s.toFixed(2).padStart(5, '0')}`
}

/** 非法文件名字符替换为 `_`（跨平台保守集合） */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '_') || 'output'
}

/** 格式化为 YYYYMMDD */
export function formatDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** 格式化为 HHmmss */
export function formatTimeHms(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}${m}${s}`
}

/**
 * 根据模板生成输出文件名（不含扩展名）
 * 占位符：{name} {preset} {date} {time}
 */
export function applyNameTemplate(
  template: string,
  vars: { name: string; preset: string; date: string; time: string }
): string {
  const raw = (template || DEFAULT_NAME_TEMPLATE).replace(
    /\{(name|preset|date|time)\}/g,
    (_, key: keyof typeof vars) => vars[key] ?? ''
  )
  return sanitizeFileName(raw)
}

/**
 * 解析输出目录
 * - sidecar: 源文件同目录
 * - dated: outputDir/YYYYMMDD
 * - fixed: outputDir（或源目录）
 */
export function resolveOutputDir(
  inputPath: string,
  options: CompressOptions,
  now?: Date
): string {
  const mode = options.outputDirMode || 'fixed'
  if (mode === 'sidecar') {
    return path.dirname(inputPath)
  }
  const base = options.outputDir || path.dirname(inputPath)
  if (mode === 'dated') {
    const clock = now ?? new Date()
    return path.join(base, formatDateYmd(clock))
  }
  return base
}

/**
 * 解析图片输出扩展名
 * - keep / 未设：用输入扩展名（去点），jpeg→jpg
 * - jpeg → jpg
 */
function resolveImageOutputExt(
  inputPath: string,
  format?: 'jpeg' | 'png' | 'webp' | 'keep'
): string {
  if (!format || format === 'keep') {
    const raw = path.extname(inputPath).replace(/^\./, '').toLowerCase()
    if (!raw) return 'jpg'
    if (raw === 'jpeg') return 'jpg'
    return raw
  }
  if (format === 'jpeg') return 'jpg'
  return format
}

/**
 * 根据输入路径与选项生成输出路径（不检查文件是否存在）
 * - mode=audio：扩展名用 audioFormat，默认模板 {name}_audio
 * - mode=image|image-crop|image-stitch：扩展名来自 options.image?.format，默认模板 {name}_img
 * - mode=video-concat：与 compress 类似，默认模板 {name}_concat
 * - mode=media-compose：默认模板 {name}_compose
 * @param now 可选时钟注入，便于单测 date/time 占位符
 */
export function buildOutputPath(
  inputPath: string,
  options: CompressOptions,
  now?: Date
): string {
  const base = path.basename(inputPath, path.extname(inputPath))
  const mode = options.mode
  const isAudio = mode === 'audio'
  const isImage = isImageMode(mode)
  const isConcat = mode === 'video-concat'
  const isCompose = mode === 'media-compose'

  let ext: string
  let defaultTpl: string
  if (isAudio) {
    ext = options.audioFormat || 'm4a'
    defaultTpl = DEFAULT_AUDIO_NAME_TEMPLATE
  } else if (isImage) {
    ext = resolveImageOutputExt(inputPath, options.image?.format)
    defaultTpl = DEFAULT_IMAGE_NAME_TEMPLATE
  } else if (isConcat) {
    ext = options.format || 'mp4'
    defaultTpl = DEFAULT_CONCAT_NAME_TEMPLATE
  } else if (isCompose) {
    ext = options.format || 'mp4'
    defaultTpl = DEFAULT_COMPOSE_NAME_TEMPLATE
  } else {
    ext = options.format || 'mp4'
    defaultTpl = DEFAULT_NAME_TEMPLATE
  }

  const clock = now ?? new Date()
  // 自定义模板 UI 哨兵值不应直接当文件名
  let tpl = options.nameTemplate || defaultTpl
  if (tpl === '__custom__') {
    tpl = defaultTpl
  }
  const stem = applyNameTemplate(tpl, {
    name: base,
    preset: options.presetId || 'standard',
    date: formatDateYmd(clock),
    time: formatTimeHms(clock)
  })
  const outName = `${stem}.${ext}`
  const dir = resolveOutputDir(inputPath, options, clock)
  return path.join(dir, outName)
}

/**
 * 纯函数版本：若输出已存在则追加序号
 * @param existsFn 注入存在性检查，便于单测
 */
export function suggestUniqueOutputPath(
  outputPath: string,
  existsFn: (p: string) => boolean
): string {
  if (!existsFn(outputPath)) {
    return outputPath
  }
  const dir = path.dirname(outputPath)
  const ext = path.extname(outputPath)
  const name = path.basename(outputPath, ext)
  let i = 1
  let candidate = path.join(dir, `${name}_${i}${ext}`)
  while (existsFn(candidate)) {
    i += 1
    candidate = path.join(dir, `${name}_${i}${ext}`)
  }
  return candidate
}
