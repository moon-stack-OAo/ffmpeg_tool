import path from 'path'
import type {
  CompressOptions,
  EncoderDetectResult,
  EncoderId,
  OutputFormat,
  ProgressPayload,
  ResolvedEncoder
} from './types'
import {
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_AUDIO_NAME_TEMPLATE,
  DEFAULT_NAME_TEMPLATE
} from './types'

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
 * webm 强制 libvpx-vp9；H.264 容器按 encoder 选项选择
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

  if (enc === 'software') {
    return { encoder: 'libx264' }
  }

  if (enc === 'nvenc') {
    if (detect && !detect.nvenc) {
      throw new Error('本机未检测到可用的 NVIDIA NVENC 编码器，请改用「自动」或「软件 x264」')
    }
    return { encoder: 'h264_nvenc' }
  }

  if (enc === 'qsv') {
    if (detect && !detect.qsv) {
      throw new Error('本机未检测到可用的 Intel QSV 编码器，请改用「自动」或「软件 x264」')
    }
    return { encoder: 'h264_qsv' }
  }

  if (enc === 'amf') {
    if (detect && !detect.amf) {
      throw new Error('本机未检测到可用的 AMD AMF 编码器，请改用「自动」或「软件 x264」')
    }
    return { encoder: 'h264_amf' }
  }

  if (enc === 'videotoolbox') {
    if (detect && !detect.videotoolbox) {
      throw new Error(
        '本机未检测到可用的 Apple VideoToolbox 编码器，请改用「自动」或「软件 x264」'
      )
    }
    return { encoder: 'h264_videotoolbox' }
  }

  // auto：按平台优先硬件
  if (detect) {
    const isDarwin = platform === 'darwin'
    if (isDarwin) {
      if (detect.videotoolbox) return { encoder: 'h264_videotoolbox' }
      if (detect.nvenc) return { encoder: 'h264_nvenc' }
      if (detect.qsv) return { encoder: 'h264_qsv' }
      if (detect.amf) return { encoder: 'h264_amf' }
    } else {
      // win / linux：nvenc > qsv > amf > videotoolbox（极少）
      if (detect.nvenc) return { encoder: 'h264_nvenc' }
      if (detect.qsv) return { encoder: 'h264_qsv' }
      if (detect.amf) return { encoder: 'h264_amf' }
      if (detect.videotoolbox) return { encoder: 'h264_videotoolbox' }
    }
  }
  return { encoder: 'libx264' }
}

/** 构建缩放滤镜参数 */
export function buildScaleFilter(maxEdge: number): string | null {
  if (!maxEdge || maxEdge <= 0) return null
  const n = maxEdge
  // 保持宽高比，且不放大
  return `scale='min(${n},iw)':'min(${n},ih)':force_original_aspect_ratio=decrease`
}

/**
 * 构建旋转滤镜（画面转 90°，竖屏→横屏）
 * transpose=1 顺时针；transpose=2 逆时针
 */
export function buildRotateFilter(
  rotate90: CompressOptions['rotate90']
): string | null {
  if (rotate90 === 'cw') return 'transpose=1'
  if (rotate90 === 'ccw') return 'transpose=2'
  return null
}

/**
 * 组合视频滤镜：先旋转再缩放（最长边限制作用于最终画面）
 */
export function buildVideoFilter(options: CompressOptions): string | null {
  const parts: string[] = []
  const rotate = buildRotateFilter(options.rotate90)
  if (rotate) parts.push(rotate)
  const scale = buildScaleFilter(options.maxEdge)
  if (scale) parts.push(scale)
  if (parts.length === 0) return null
  return parts.join(',')
}

/** 是否支持经典 -pass 1/2 两遍编码（仅软件 x264 / VP9） */
export function supportsTwoPass(resolved: ResolvedEncoder): boolean {
  return resolved === 'libx264' || resolved === 'libvpx-vp9'
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
}

/**
 * 构建压缩参数（不含 -i / 输出路径）
 * 按输出格式与编码器生成合理 ffmpeg 参数
 * targetSizeMb>0 且 durationSec>0 时改用 ABR（-b:v），否则 CRF/质量模式
 * pass=1：仅视频 + -pass 1 -an，输出由 runner 写到 null
 * pass=2：完整音视频 + -pass 2
 */
export function buildCompressArgs(
  options: CompressOptions,
  resolved: ResolvedEncoder,
  ctx?: BuildCompressArgsCtx
): string[] {
  const args: string[] = []
  const format = options.format || 'mp4'
  const vf = buildVideoFilter(options)
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
  const videoKbps = useAbr
    ? estimateVideoBitrateKbps(targetMb, durationSec, 128)
    : 0
  const bv = `${videoKbps}k`
  const maxrate = bv
  const bufsize = `${videoKbps * 2}k`

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

  if (resolved === 'libvpx-vp9') {
    // WebM: VP9 + Opus
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
    if (useTwoPass && pass != null && passLog) {
      args.push('-pass', String(pass), '-passlogfile', passLog)
    }
    if (pass === 1) {
      args.push('-an')
    } else {
      args.push('-c:a', 'libopus', '-b:a', '128k')
    }
    if (vf) {
      args.push('-vf', vf)
    }
    // pass1 用 null 容器；pass2 / 单遍用 webm
    if (pass === 1) {
      args.push('-f', 'null')
    } else {
      args.push('-f', 'webm')
    }
    return args
  }

  // H.264 系列
  if (resolved === 'libx264') {
    if (useAbr) {
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-b:v',
        bv,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize
      )
    } else {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(options.crf))
    }
  } else if (resolved === 'h264_nvenc') {
    if (useAbr) {
      args.push(
        '-c:v',
        'h264_nvenc',
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
        'h264_nvenc',
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
  } else if (resolved === 'h264_qsv') {
    if (useAbr) {
      args.push(
        '-c:v',
        'h264_qsv',
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
        'h264_qsv',
        '-global_quality',
        String(quality),
        '-look_ahead',
        '1'
      )
    }
  } else if (resolved === 'h264_amf') {
    if (useAbr) {
      args.push(
        '-c:v',
        'h264_amf',
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
        'h264_amf',
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
  } else if (resolved === 'h264_videotoolbox') {
    // VideoToolbox：质量模式用 -b:v 0 -q:v；码率模式用 -b:v
    if (useAbr) {
      args.push(
        '-c:v',
        'h264_videotoolbox',
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
        'h264_videotoolbox',
        '-b:v',
        '0',
        '-q:v',
        String(qv),
        '-allow_sw',
        '1'
      )
    }
  }

  if (useTwoPass && pass != null && passLog) {
    args.push('-pass', String(pass), '-passlogfile', passLog)
  }

  // 音频：pass1 无音轨；其余 AAC
  if (pass === 1) {
    args.push('-an')
  } else {
    args.push('-c:a', 'aac', '-b:a', '128k')
  }

  if (vf) {
    args.push('-vf', vf)
  }

  // 容器相关
  if (pass === 1) {
    args.push('-f', 'null')
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
  ctx: { durationSec?: number; passLogFile: string; notes?: string[] }
): string[] {
  return buildCompressArgs(options, resolved, {
    durationSec: ctx.durationSec,
    notes: ctx.notes,
    pass,
    passLogFile: ctx.passLogFile
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
 * 根据输入路径与选项生成输出路径（不检查文件是否存在）
 * mode=audio 时扩展名用 audioFormat，默认模板 {name}_audio
 * @param now 可选时钟注入，便于单测 date/time 占位符
 */
export function buildOutputPath(
  inputPath: string,
  options: CompressOptions,
  now?: Date
): string {
  const base = path.basename(inputPath, path.extname(inputPath))
  const isAudio = options.mode === 'audio'
  const ext = isAudio ? options.audioFormat || 'm4a' : options.format || 'mp4'
  const defaultTpl = isAudio ? DEFAULT_AUDIO_NAME_TEMPLATE : DEFAULT_NAME_TEMPLATE
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
