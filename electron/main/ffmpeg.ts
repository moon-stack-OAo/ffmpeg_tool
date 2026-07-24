import {type ChildProcess, spawn} from 'child_process'
import fs from 'fs'
import path from 'path'
import {app} from 'electron'
import type {
    CompressOptions,
    EncoderDetectResult,
    EncoderId,
    OutputFormat,
    ProgressPayload,
    ResolvedEncoder
} from '../../shared/types'

/** 解析 ffmpeg-static / ffprobe-static 在开发与打包后的路径 */
function resolveBinaryPath(moduleName: 'ffmpeg-static' | 'ffprobe-static'): string {
  // 开发环境：直接 require
  // 打包后：asarUnpack 会把二进制放到 app.asar.unpacked
  let binPath = ''

  try {
    if (moduleName === 'ffmpeg-static') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      binPath = require('ffmpeg-static') as string
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('ffprobe-static') as { path: string }
      binPath = mod.path
    }
  } catch {
    binPath = ''
  }

  if (!binPath) {
    return ''
  }

  // 打包后 asar 内路径需替换为 unpacked
  if (binPath.includes('app.asar') && !binPath.includes('app.asar.unpacked')) {
    binPath = binPath.replace('app.asar', 'app.asar.unpacked')
  }

  // 某些环境下路径可能带 file:// 前缀
  if (binPath.startsWith('file://')) {
    binPath = binPath.replace(/^file:\/\//, '')
    if (process.platform === 'win32' && binPath.startsWith('/')) {
      binPath = binPath.slice(1)
    }
  }

  return binPath
}

export function getFfmpegPath(): string {
  return resolveBinaryPath('ffmpeg-static')
}

export function getFfprobePath(): string {
  return resolveBinaryPath('ffprobe-static')
}

export function checkFfmpegAvailable(): {
  ready: boolean
  ffmpegPath?: string
  ffprobePath?: string
  error?: string
} {
  const ffmpegPath = getFfmpegPath()
  const ffprobePath = getFfprobePath()

  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    return {
      ready: false,
      ffmpegPath,
      ffprobePath,
      error: '未找到 ffmpeg 二进制，请确认已安装 ffmpeg-static'
    }
  }

  if (!ffprobePath || !fs.existsSync(ffprobePath)) {
    return {
      ready: false,
      ffmpegPath,
      ffprobePath,
      error: '未找到 ffprobe 二进制，请确认已安装 ffprobe-static'
    }
  }

  return { ready: true, ffmpegPath, ffprobePath }
}

/** 根据输入路径与选项生成输出路径 */
export function buildOutputPath(inputPath: string, options: CompressOptions): string {
  const base = path.basename(inputPath, path.extname(inputPath))
  const ext = options.format || 'mp4'
  const outName = `${base}_compressed.${ext}`
  const dir = options.outputDir || path.dirname(inputPath)
  return path.join(dir, outName)
}

/** 若输出文件已存在则追加序号 */
export function uniqueOutputPath(outputPath: string): string {
  if (!fs.existsSync(outputPath)) {
    return outputPath
  }
  const dir = path.dirname(outputPath)
  const ext = path.extname(outputPath)
  const name = path.basename(outputPath, ext)
  let i = 1
  let candidate = path.join(dir, `${name}_${i}${ext}`)
  while (fs.existsSync(candidate)) {
    i += 1
    candidate = path.join(dir, `${name}_${i}${ext}`)
  }
  return candidate
}

/** 获取文件大小（字节），失败返回 undefined */
export function getFileSize(filePath: string): number | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined
    return fs.statSync(filePath).size
  } catch {
    return undefined
  }
}

/**
 * CRF(软件) → 硬件质量参数映射说明：
 * - NVENC: 使用 -cq（Constant Quality），数值大致接近 CRF，范围约 0-51
 * - QSV: 使用 -global_quality，数值大致对应 CRF
 * - AMF: 使用 -qp_i/qp_p 或 -rc cqp -qp，这里用 -qp
 * 不同驱动/卡差异较大，映射仅为实用近似，非严格等价。
 */
function mapCrfToHardwareQuality(crf: number): number {
  return Math.max(0, Math.min(51, Math.round(crf)))
}

/** 是否为 H.264 容器（可走硬件加速） */
function isH264Container(format: OutputFormat): boolean {
  return format === 'mp4' || format === 'mkv' || format === 'mov'
}

/**
 * 解析最终视频编码器
 * webm 强制 libvpx-vp9；H.264 容器按 encoder 选项选择
 */
export function resolveVideoEncoder(
  options: CompressOptions,
  detect?: EncoderDetectResult | null
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

  // auto：优先硬件
  if (detect) {
    if (detect.nvenc) return { encoder: 'h264_nvenc' }
    if (detect.qsv) return { encoder: 'h264_qsv' }
    if (detect.amf) return { encoder: 'h264_amf' }
  }
  return { encoder: 'libx264' }
}

/** 构建缩放滤镜参数 */
function buildScaleFilter(maxEdge: number): string | null {
  if (!maxEdge || maxEdge <= 0) return null
  const n = maxEdge
  // 保持宽高比，且不放大
  return `scale='min(${n},iw)':'min(${n},ih)':force_original_aspect_ratio=decrease`
}

/**
 * 构建压缩参数（不含 -i / 输出路径）
 * 按输出格式与编码器生成合理 ffmpeg 参数
 */
export function buildCompressArgs(
  options: CompressOptions,
  resolved: ResolvedEncoder
): string[] {
  const args: string[] = []
  const format = options.format || 'mp4'
  const scale = buildScaleFilter(options.maxEdge)
  const quality = mapCrfToHardwareQuality(options.crf)

  if (resolved === 'libvpx-vp9') {
    // WebM: VP9 + Opus
    // -deadline good -cpu-used 4：实用速度，避免默认极慢
    // CRF 语义：libvpx-vp9 的 -crf 约 15-35 常用
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
      '1',
      '-c:a',
      'libopus',
      '-b:a',
      '128k'
    )
    if (scale) {
      args.push('-vf', scale)
    }
    // 明确容器
    args.push('-f', 'webm')
    return args
  }

  // H.264 系列
  if (resolved === 'libx264') {
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(options.crf))
  } else if (resolved === 'h264_nvenc') {
    // NVENC: p4 平衡速度/质量；-cq 近似 CRF
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
  } else if (resolved === 'h264_qsv') {
    // QSV: global_quality 近似 CRF
    args.push(
      '-c:v',
      'h264_qsv',
      '-global_quality',
      String(quality),
      '-look_ahead',
      '1'
    )
  } else if (resolved === 'h264_amf') {
    // AMF: CQP 模式，qp 近似 CRF
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

  // 音频 AAC
  args.push('-c:a', 'aac', '-b:a', '128k')

  if (scale) {
    args.push('-vf', scale)
  }

  // 容器相关
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

  return args
}

/** 兼容旧调用：仅软件 x264 */
export function buildCompressArgsLegacy(options: CompressOptions): string[] {
  return buildCompressArgs(options, 'libx264')
}

let encoderCache: EncoderDetectResult | null = null
let encoderCacheAt = 0
const ENCODER_CACHE_MS = 60_000

/**
 * 探测本机可用硬件编码器
 * 通过 `ffmpeg -hide_banner -encoders` 列表匹配
 */
export function detectHardwareEncoders(force = false): Promise<EncoderDetectResult> {
  const now = Date.now()
  if (!force && encoderCache && now - encoderCacheAt < ENCODER_CACHE_MS) {
    return Promise.resolve(encoderCache)
  }

  return new Promise((resolve) => {
    const ffmpeg = getFfmpegPath()
    if (!ffmpeg) {
      const empty: EncoderDetectResult = {
        nvenc: false,
        qsv: false,
        amf: false,
        preferred: 'libx264',
        error: 'ffmpeg 不可用'
      }
      resolve(empty)
      return
    }

    const proc = spawn(ffmpeg, ['-hide_banner', '-encoders'], {
      windowsHide: true
    })

    let out = ''
    let err = ''
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.stderr?.on('data', (d: Buffer) => {
      err += d.toString()
    })

    proc.on('error', (e) => {
      resolve({
        nvenc: false,
        qsv: false,
        amf: false,
        preferred: 'libx264',
        error: e.message
      })
    })

    proc.on('close', () => {
      const text = `${out}\n${err}`
      // 匹配编码器行中的名称（避免误匹配描述文字）
      const has = (name: string): boolean => {
        // 典型行: " V..... h264_nvenc           NVIDIA NVENC H.264 encoder"
        const re = new RegExp(`\\b${name}\\b`, 'i')
        return re.test(text)
      }

      const nvenc = has('h264_nvenc')
      const qsv = has('h264_qsv')
      const amf = has('h264_amf')

      let preferred: ResolvedEncoder = 'libx264'
      if (nvenc) preferred = 'h264_nvenc'
      else if (qsv) preferred = 'h264_qsv'
      else if (amf) preferred = 'h264_amf'

      const result: EncoderDetectResult = {
        nvenc,
        qsv,
        amf,
        preferred
      }
      encoderCache = result
      encoderCacheAt = Date.now()
      resolve(result)
    })
  })
}

/** 使用 ffprobe 获取时长（秒） */
export function probeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobe = getFfprobePath()
    if (!ffprobe) {
      resolve(0)
      return
    }

    const proc = spawn(
      ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath
      ],
      { windowsHide: true }
    )

    let out = ''
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('close', () => {
      const n = parseFloat(out.trim())
      resolve(Number.isFinite(n) && n > 0 ? n : 0)
    })
    proc.on('error', () => resolve(0))
  })
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

export interface RunCompressParams {
  taskId: string
  inputPath: string
  outputPath: string
  options: CompressOptions
  onProgress: (payload: ProgressPayload) => void
  signal?: { cancelled: boolean }
  /** 可选：外部传入探测结果，避免重复探测 */
  detect?: EncoderDetectResult | null
}

export interface RunCompressResult {
  code: number
  error?: string
  process?: ChildProcess
  resolvedEncoder?: ResolvedEncoder
  inputSize?: number
  outputSize?: number
}

/**
 * 执行单次压缩
 * @returns 退出码；取消时返回 -1
 */
export async function runCompress(params: RunCompressParams): Promise<RunCompressResult> {
  const { taskId, inputPath, outputPath, options, onProgress, signal } = params
  const ffmpeg = getFfmpegPath()

  if (!ffmpeg) {
    return { code: 1, error: 'ffmpeg 不可用' }
  }

  if (!fs.existsSync(inputPath)) {
    return { code: 1, error: `输入文件不存在: ${inputPath}` }
  }

  // 确保输出目录存在
  const outDir = path.dirname(outputPath)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const inputSize = getFileSize(inputPath)

  // 探测硬件（auto 或指定硬件时）
  let detect = params.detect ?? null
  const needDetect =
    isH264Container(options.format || 'mp4') &&
    (options.encoder === 'auto' ||
      options.encoder === 'nvenc' ||
      options.encoder === 'qsv' ||
      options.encoder === 'amf')

  if (needDetect && !detect) {
    try {
      detect = await detectHardwareEncoders()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 探测失败时 auto 可回退软件；指定硬件则报错
      if (options.encoder && options.encoder !== 'auto' && options.encoder !== 'software') {
        return { code: 1, error: `硬件编码器探测失败: ${msg}`, inputSize }
      }
      detect = {
        nvenc: false,
        qsv: false,
        amf: false,
        preferred: 'libx264',
        error: msg
      }
    }
  }

  let resolved: ResolvedEncoder
  try {
    resolved = resolveVideoEncoder(options, detect).encoder
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { code: 1, error: msg, inputSize }
  }

  const duration = await probeDuration(inputPath)
  const encodeArgs = buildCompressArgs(options, resolved)

  // 注意 Windows 路径含空格时 spawn 参数数组形式最安全，无需额外引号
  const args = [
    '-y',
    '-hide_banner',
    '-i',
    inputPath,
    ...encodeArgs,
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath
  ]

  return new Promise((resolve) => {
    let proc: ChildProcess
    try {
      proc = spawn(ffmpeg, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      resolve({
        code: 1,
        error: `启动 ffmpeg 失败: ${msg}`,
        resolvedEncoder: resolved,
        inputSize
      })
      return
    }

    let stderrBuf = ''
    let lastPercent = 0

    // -progress pipe:1 输出 key=value 到 stdout
    let progressLines = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      if (signal?.cancelled) {
        return
      }
      progressLines += chunk.toString()
      const parts = progressLines.split(/\r?\n/)
      progressLines = parts.pop() || ''

      let outTimeMs = 0
      let speed = ''
      for (const line of parts) {
        if (line.startsWith('out_time_ms=')) {
          outTimeMs = parseInt(line.split('=')[1], 10) || 0
        } else if (line.startsWith('speed=')) {
          speed = line.split('=')[1]?.trim() || ''
        } else if (line.startsWith('progress=end')) {
          onProgress({
            taskId,
            percent: 100,
            speed,
            time: formatSec(duration)
          })
        }
      }

      if (outTimeMs > 0 && duration > 0) {
        const currentSec = outTimeMs / 1_000_000
        const percent = Math.min(99.9, Math.max(0, (currentSec / duration) * 100))
        if (percent - lastPercent >= 0.3 || percent >= 99) {
          lastPercent = percent
          onProgress({
            taskId,
            percent: Math.round(percent * 10) / 10,
            time: formatSec(currentSec),
            speed
          })
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrBuf += text
      // 兜底：部分版本仍把 time= 打在 stderr
      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        const p = parseProgressLine(line, duration)
        if (p && typeof p.percent === 'number') {
          if (p.percent - lastPercent >= 0.5) {
            lastPercent = p.percent
            onProgress({
              taskId,
              percent: p.percent,
              time: p.time,
              speed: p.speed,
              fps: p.fps
            })
          }
        }
      }
    })

    const cancelChecker = setInterval(() => {
      if (signal?.cancelled && proc && !proc.killed) {
        try {
          // Windows 下 kill 子进程
          proc.kill('SIGTERM')
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
              windowsHide: true,
              stdio: 'ignore'
            })
          }
        } catch {
          // ignore
        }
      }
    }, 300)

    proc.on('error', (err) => {
      clearInterval(cancelChecker)
      resolve({
        code: 1,
        error: err.message,
        process: proc,
        resolvedEncoder: resolved,
        inputSize
      })
    })

    proc.on('close', (code) => {
      clearInterval(cancelChecker)
      if (signal?.cancelled) {
        // 取消时清理不完整输出
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath)
          }
        } catch {
          // ignore
        }
        resolve({
          code: -1,
          error: '已取消',
          process: proc,
          resolvedEncoder: resolved,
          inputSize
        })
        return
      }

      if (code === 0) {
        onProgress({ taskId, percent: 100 })
        const outputSize = getFileSize(outputPath)
        resolve({
          code: 0,
          process: proc,
          resolvedEncoder: resolved,
          inputSize,
          outputSize
        })
      } else {
        const tail = stderrBuf.slice(-800).trim()
        // 硬件编码失败时给出更明确提示
        let errMsg = tail || `ffmpeg 退出码 ${code}`
        if (
          resolved !== 'libx264' &&
          resolved !== 'libvpx-vp9' &&
          /nvenc|qsv|amf|cuda|opencl|device|encoder/i.test(errMsg)
        ) {
          errMsg = `硬件编码失败（${resolved}）：${errMsg}\n可尝试改用「软件 x264」或检查显卡驱动`
        }
        resolve({
          code: code ?? 1,
          error: errMsg,
          process: proc,
          resolvedEncoder: resolved,
          inputSize
        })
      }
    })
  })
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number, len = 2) => String(Math.floor(n)).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${s.toFixed(2).padStart(5, '0')}`
}

/** 用户数据目录（预留） */
export function getAppDataPath(): string {
  return app.getPath('userData')
}
