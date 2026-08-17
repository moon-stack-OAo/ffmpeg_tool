import { type ChildProcess, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type {
  CompressOptions,
  EncoderDetectResult,
  ProgressPayload,
  ResolvedEncoder
} from '../../../shared/types'
import {
  buildAudioExtractArgs,
  buildCompressArgs,
  buildCompressArgsPass,
  buildSeekArgs,
  effectiveDuration,
  estimateEtaSec,
  formatSec,
  isH264Container,
  isWatermarkActive,
  nullOutputPath,
  parseProgressLine,
  resolveAudioEncoder,
  resolveVideoEncoder,
  shouldUseTwoPass,
  type VideoFilterPlan
} from '../../../shared/ffmpegLogic'
import { isHardwareEncoderFailure, mapFfmpegError } from '../../../shared/errorMap'
import { getFfmpegPath } from './bin'
import { detectHardwareEncoders, probeDuration, probeHasAudioStream } from './probe'
import { getFileSize } from './paths'

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
  resolvedEncoder?: string
  inputSize?: number
  outputSize?: number
  /** 硬件失败回退软件时的提示 */
  fallbackNote?: string
  /** 是否发生了软件回退 */
  usedFallback?: boolean
  /** 完整 ffmpeg 命令行（末次尝试） */
  commandLine?: string
}

const HW_ENCODERS: ResolvedEncoder[] = [
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

function isHardwareResolved(enc: string): boolean {
  return (HW_ENCODERS as string[]).includes(enc)
}

/** 是否需要探测硬件（auto 或任意硬件/显式 codec） */
function needsEncoderDetect(encoder: string | undefined): boolean {
  if (!encoder || encoder === 'auto') return true
  if (encoder === 'software' || encoder === 'libx264' || encoder === 'libx265') {
    return encoder === 'libx265' // libx265 需确认列表存在
  }
  return true
}

/** 是否为 null 设备路径（两遍 pass1 输出） */
function isNullDevicePath(p: string): boolean {
  const n = (p || '').trim().toUpperCase()
  return n === 'NUL' || n === '/DEV/NULL' || n === 'NULL'
}

/** 删除可能不完整的输出文件 */
function removeIncompleteOutput(outputPath: string): void {
  if (isNullDevicePath(outputPath)) return
  try {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath)
    }
  } catch {
    // ignore
  }
}

/** 清理 x264/vpx 两遍编码产生的 passlog 文件 */
function cleanupPassLogs(passLogFile: string): void {
  const candidates = [
    passLogFile,
    `${passLogFile}.log`,
    `${passLogFile}-0.log`,
    `${passLogFile}-0.log.mbtree`,
    `${passLogFile}.log.mbtree`
  ]
  // 扫描同前缀文件（不同 ffmpeg 版本后缀略有差异）
  try {
    const dir = path.dirname(passLogFile)
    const base = path.basename(passLogFile)
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        if (name === base || name.startsWith(`${base}.`) || name.startsWith(`${base}-`)) {
          candidates.push(path.join(dir, name))
        }
      }
    }
  } catch {
    // ignore
  }
  const seen = new Set<string>()
  for (const p of candidates) {
    if (seen.has(p)) continue
    seen.add(p)
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      // ignore
    }
  }
}

/** 将进度映射到区间 [base, base+span]（percent 0–100） */
function mapProgressRange(
  payload: ProgressPayload,
  base: number,
  span: number
): ProgressPayload {
  const p = typeof payload.percent === 'number' ? payload.percent : 0
  const mapped = Math.min(100, Math.max(0, base + (p / 100) * span))
  return {
    ...payload,
    percent: Math.round(mapped * 10) / 10
  }
}

/** 将参数数组格式化为可读命令行（含空格时加引号） */
function formatCommandLine(ffmpeg: string, args: string[]): string {
  const quote = (s: string): string => {
    if (!s) return '""'
    if (/[\s"]/.test(s)) {
      return `"${s.replace(/"/g, '\\"')}"`
    }
    return s
  }
  return [quote(ffmpeg), ...args.map(quote)].join(' ')
}

/** 探测系统可用中文字体（shared 不依赖 fs） */
function resolveDefaultFontFile(): string | undefined {
  const candidates: string[] =
    process.platform === 'win32'
      ? [
          'C:\\Windows\\Fonts\\msyh.ttc',
          'C:\\Windows\\Fonts\\msyh.ttf',
          'C:\\Windows\\Fonts\\simhei.ttf',
          'C:\\Windows\\Fonts\\arial.ttf'
        ]
      : process.platform === 'darwin'
        ? [
            '/System/Library/Fonts/PingFang.ttc',
            '/System/Library/Fonts/STHeiti Light.ttc',
            '/Library/Fonts/Arial.ttf',
            '/System/Library/Fonts/Supplemental/Arial.ttf'
          ]
        : [
            '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
          ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      // ignore
    }
  }
  return undefined
}

/** 校验图片水印路径；无效时返回错误文案 */
function validateWatermarkImage(options: CompressOptions): string | null {
  if (options.mode === 'audio') return null
  const wm = options.watermark
  if (!wm || wm.mode !== 'image') return null
  const p = typeof wm.imagePath === 'string' ? wm.imagePath.trim() : ''
  if (!p) return '图片水印路径为空'
  if (!fs.existsSync(p)) return `水印图片不存在: ${p}`
  return null
}

interface RunOnceParams {
  ffmpeg: string
  taskId: string
  inputPath: string
  outputPath: string
  options: CompressOptions
  /** 展示用编码器名 */
  resolved: string
  /** 编码参数（已按模式构建） */
  encodeArgs: string[]
  /** 额外输入（如图片水印），在主视频 -i 之后插入 */
  extraInputs?: string[]
  duration: number
  onProgress: (payload: ProgressPayload) => void
  signal?: { cancelled: boolean }
}

/** 单次 spawn 执行（不含硬件回退逻辑） */
function runOnce(params: RunOnceParams): Promise<RunCompressResult> {
  const {
    ffmpeg,
    taskId,
    inputPath,
    outputPath,
    resolved,
    encodeArgs,
    extraInputs,
    duration,
    onProgress,
    signal
  } = params

  // 裁剪：-ss 优先放在 -i 前加速 seek；-to 放在 -i 后
  const seek = buildSeekArgs(params.options)
  // 图片水印：-loop 1 使静态图持续到主视频结束
  const extraInputArgs: string[] = []
  if (extraInputs?.length) {
    for (const p of extraInputs) {
      extraInputArgs.push('-loop', '1', '-i', p)
    }
  }
  // 注意 Windows 路径含空格时 spawn 参数数组形式最安全，无需额外引号
  const args = [
    '-y',
    '-hide_banner',
    ...seek.beforeInput,
    '-i',
    inputPath,
    ...extraInputArgs,
    ...seek.afterInput,
    ...encodeArgs,
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath
  ]
  const commandLine = formatCommandLine(ffmpeg, args)

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
        error: mapFfmpegError(`启动 ffmpeg 失败: ${msg}`, {
          resolvedEncoder: resolved,
          inputPath,
          outputPath
        }),
        resolvedEncoder: resolved,
        commandLine
      })
      return
    }

    let stderrBuf = ''
    let lastPercent = 0
    const startedAt = Date.now()

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
            time: formatSec(duration),
            etaSec: 0
          })
        }
      }

      if (outTimeMs > 0 && duration > 0) {
        const currentSec = outTimeMs / 1_000_000
        const percent = Math.min(99.9, Math.max(0, (currentSec / duration) * 100))
        if (percent - lastPercent >= 0.3 || percent >= 99) {
          lastPercent = percent
          const elapsedSec = (Date.now() - startedAt) / 1000
          const etaSec = estimateEtaSec({
            percent,
            elapsedSec,
            speed,
            durationSec: duration,
            currentMediaSec: currentSec
          })
          onProgress({
            taskId,
            percent: Math.round(percent * 10) / 10,
            time: formatSec(currentSec),
            speed,
            etaSec
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
            const elapsedSec = (Date.now() - startedAt) / 1000
            // 从 time 字符串反推当前媒体秒（若有）
            let currentMediaSec: number | undefined
            if (p.time) {
              const tm = p.time.match(/(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
              if (tm) {
                currentMediaSec =
                  parseInt(tm[1], 10) * 3600 +
                  parseInt(tm[2], 10) * 60 +
                  parseFloat(tm[3])
              }
            }
            const etaSec = estimateEtaSec({
              percent: p.percent,
              elapsedSec,
              speed: p.speed,
              durationSec: duration > 0 ? duration : undefined,
              currentMediaSec
            })
            onProgress({
              taskId,
              percent: p.percent,
              time: p.time,
              speed: p.speed,
              fps: p.fps,
              etaSec
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
        error: mapFfmpegError(err.message, {
          resolvedEncoder: resolved,
          inputPath,
          outputPath
        }),
        process: proc,
        resolvedEncoder: resolved,
        commandLine
      })
    })

    proc.on('close', (code) => {
      clearInterval(cancelChecker)
      if (signal?.cancelled) {
        removeIncompleteOutput(outputPath)
        resolve({
          code: -1,
          error: '已取消',
          process: proc,
          resolvedEncoder: resolved,
          commandLine
        })
        return
      }

      if (code === 0) {
        onProgress({ taskId, percent: 100, etaSec: 0 })
        const outputSize = getFileSize(outputPath)
        resolve({
          code: 0,
          process: proc,
          resolvedEncoder: resolved,
          outputSize,
          commandLine
        })
      } else {
        const tail = stderrBuf.slice(-800).trim()
        const raw = tail || `ffmpeg 退出码 ${code}`
        resolve({
          code: code ?? 1,
          error: mapFfmpegError(raw, {
            resolvedEncoder: resolved,
            inputPath,
            outputPath
          }),
          process: proc,
          resolvedEncoder: resolved,
          commandLine
        })
      }
    })
  })
}

/**
 * 执行压缩或抽音频；硬件编码失败时默认自动回退 libx264 再跑一遍（仅视频模式）
 * @returns 退出码；取消时返回 -1
 */
export async function runCompress(params: RunCompressParams): Promise<RunCompressResult> {
  const { taskId, inputPath, outputPath, options, onProgress, signal } = params
  const ffmpeg = getFfmpegPath()
  const isAudio = options.mode === 'audio'

  if (!ffmpeg) {
    return { code: 1, error: 'ffmpeg 不可用' }
  }

  if (!fs.existsSync(inputPath)) {
    return {
      code: 1,
      error: mapFfmpegError(`输入文件不存在: ${inputPath}`, { inputPath, outputPath })
    }
  }

  const wmErr = validateWatermarkImage(options)
  if (wmErr) {
    return {
      code: 1,
      error: mapFfmpegError(wmErr, { inputPath, outputPath })
    }
  }

  // 确保输出目录存在
  const outDir = path.dirname(outputPath)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const inputSize = getFileSize(inputPath)
  const sourceDuration = await probeDuration(inputPath)
  // 进度用裁剪后的有效时长
  const duration = effectiveDuration(options, sourceDuration)
  const fontfile =
    !isAudio &&
    isWatermarkActive(options) &&
    options.watermark?.mode === 'text'
      ? resolveDefaultFontFile()
      : undefined
  const compressCtx = { durationSec: duration, fontfile }

  // —— 仅抽取音频：不探测硬件、不回退 x264 ——
  if (isAudio) {
    // 无音轨预检：直接友好失败，避免 ffmpeg 晦涩报错
    const hasAudio = await probeHasAudioStream(inputPath)
    if (!hasAudio) {
      return {
        code: 1,
        error: mapFfmpegError('no audio streams', { inputPath, outputPath }),
        inputSize
      }
    }

    const resolved = resolveAudioEncoder(options)
    const encodeArgs = buildAudioExtractArgs(options)
    const result = await runOnce({
      ffmpeg,
      taskId,
      inputPath,
      outputPath,
      options,
      resolved,
      encodeArgs,
      duration,
      onProgress,
      signal
    })
    return { ...result, inputSize }
  }

  // —— 视频压缩路径 ——
  let detect = params.detect ?? null
  const needDetect =
    isH264Container(options.format || 'mp4') &&
    needsEncoderDetect(options.encoder)

  if (needDetect && !detect) {
    try {
      detect = await detectHardwareEncoders()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 探测失败时 auto 可回退软件；指定硬件则报错
      if (
        options.encoder &&
        options.encoder !== 'auto' &&
        options.encoder !== 'software' &&
        options.encoder !== 'libx264'
      ) {
        return {
          code: 1,
          error: mapFfmpegError(`硬件编码器探测失败: ${msg}`, { inputPath, outputPath }),
          inputSize
        }
      }
      detect = {
        nvenc: false,
        qsv: false,
        amf: false,
        videotoolbox: false,
        preferred: 'libx264',
        error: msg
      }
    }
  }

  let resolved: ResolvedEncoder
  try {
    resolved = resolveVideoEncoder(options, detect, process.platform).encoder
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { code: 1, error: msg, inputSize }
  }

  /** 单遍或两遍执行（按编码器与 twoPass 设置） */
  async function runWithEncoder(
    enc: ResolvedEncoder,
    progressMap?: (p: ProgressPayload) => ProgressPayload
  ): Promise<RunCompressResult> {
    const report = (p: ProgressPayload) => {
      onProgress(progressMap ? progressMap(p) : p)
    }

    const wantTwoPass = shouldUseTwoPass(options, enc)
    if (!wantTwoPass) {
      // 硬件 + 目标体积：单遍 ABR，可在 commandLine 侧说明
      const notes: string[] = []
      const filterPlanOut: VideoFilterPlan = {}
      const encodeArgs = buildCompressArgs(options, enc, {
        ...compressCtx,
        notes,
        filterPlanOut
      })
      if (
        typeof options.targetSizeMb === 'number' &&
        options.targetSizeMb > 0 &&
        isHardwareResolved(enc)
      ) {
        notes.push('硬件编码使用单遍估算')
      }
      const result = await runOnce({
        ffmpeg,
        taskId,
        inputPath,
        outputPath,
        options,
        resolved: enc,
        encodeArgs,
        extraInputs: filterPlanOut.extraInputs,
        duration,
        onProgress: report,
        signal
      })
      if (notes.length && result.commandLine) {
        return {
          ...result,
          commandLine: `${result.commandLine}\n# ${notes.join('；')}`
        }
      }
      return result
    }

    // —— 真·两遍编码 ——
    const passLogFile = path.join(os.tmpdir(), `ffmpeg-pass-${taskId}`)
    const nullOut = nullOutputPath(process.platform)
    const notes: string[] = []
    const passCtx = {
      durationSec: duration,
      passLogFile,
      notes,
      fontfile: compressCtx.fontfile
    }

    try {
      // pass1：0–45%
      const pass1Plan: VideoFilterPlan = {}
      const pass1Args = buildCompressArgsPass(options, enc, 1, {
        ...passCtx,
        filterPlanOut: pass1Plan
      })
      const pass1 = await runOnce({
        ffmpeg,
        taskId,
        inputPath,
        outputPath: nullOut,
        options,
        resolved: enc,
        encodeArgs: pass1Args,
        extraInputs: pass1Plan.extraInputs,
        duration,
        onProgress: (p) => report(mapProgressRange(p, 0, 45)),
        signal
      })

      if (pass1.code !== 0 || signal?.cancelled) {
        return {
          ...pass1,
          // 取消/失败时不要把 null 当输出
          outputSize: undefined
        }
      }

      // pass2：45–100%
      const pass2Plan: VideoFilterPlan = {}
      const pass2Args = buildCompressArgsPass(options, enc, 2, {
        ...passCtx,
        filterPlanOut: pass2Plan
      })
      const pass2 = await runOnce({
        ffmpeg,
        taskId,
        inputPath,
        outputPath,
        options,
        resolved: enc,
        encodeArgs: pass2Args,
        extraInputs: pass2Plan.extraInputs,
        duration,
        onProgress: (p) => report(mapProgressRange(p, 45, 55)),
        signal
      })

      // 合并命令行说明
      const cmd =
        pass2.commandLine || pass1.commandLine
          ? [
              pass1.commandLine ? `# pass1\n${pass1.commandLine}` : '',
              pass2.commandLine ? `# pass2\n${pass2.commandLine}` : ''
            ]
              .filter(Boolean)
              .join('\n')
          : pass2.commandLine

      return {
        ...pass2,
        commandLine: cmd,
        resolvedEncoder: enc
      }
    } finally {
      cleanupPassLogs(passLogFile)
    }
  }

  // 首次执行
  const first = await runWithEncoder(resolved)

  if (first.code === 0 || first.code === -1 || signal?.cancelled) {
    return { ...first, inputSize }
  }

  // 是否允许回退软件（默认 true）
  const allowFallback = options.fallbackToSoftware !== false
  const canFallback =
    allowFallback &&
    isHardwareResolved(resolved) &&
    isHardwareEncoderFailure(first.error || '', resolved)

  if (!canFallback) {
    return { ...first, inputSize }
  }

  // 删除不完整输出后用 libx264 再跑（若 twoPass 可用则走两遍）
  removeIncompleteOutput(outputPath)

  // 回退时重置进度提示
  onProgress({ taskId, percent: 0 })

  const second = await runWithEncoder('libx264')

  if (second.code === 0) {
    const note = '硬件编码失败，已回退软件 x264'
    return {
      ...second,
      inputSize,
      resolvedEncoder: 'libx264',
      usedFallback: true,
      fallbackNote: note
    }
  }

  // 回退也失败：返回软件侧映射错误，并说明曾尝试回退
  return {
    ...second,
    inputSize,
    resolvedEncoder: 'libx264',
    usedFallback: true,
    fallbackNote: '硬件编码失败且软件回退亦失败',
    error: second.error || first.error
  }
}
