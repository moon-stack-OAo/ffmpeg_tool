import { type ChildProcess, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type {
  CompressOptions,
  ProgressPayload,
  ResolvedEncoder
} from '../../../shared/types'
import {
  buildConcatFilterComplex,
  buildVideoEncoderArgs,
  buildWatermarkEnableExpr,
  buildWatermarkOverlayExpr,
  estimateEtaSec,
  formatSec,
  isHardwareEncoder,
  normalizeOpacity,
  parseProgressLine,
  planVideoFilters,
  resolveVideoEncoder
} from '../../../shared/ffmpegLogic'
import {
  buildStillImageVf,
  normalizeComposeDurationSec,
  normalizeMediaCompose,
  overlayToWatermarkOptions,
  validateComposeOptions
} from '../../../shared/composeLogic'
import {
  isHardwareEncoderFailure,
  mapFfmpegError
} from '../../../shared/errorMap'
import { getFfmpegPath } from './bin'
import {
  detectHardwareEncoders,
  probeDuration,
  probeHasAudioStream,
  probeVideoSize
} from './probe'
import { getFileSize } from './paths'
import type { RunCompressResult } from './runner'

export interface RunMediaComposeParams {
  taskId: string
  inputPath: string
  outputPath: string
  options: CompressOptions
  onProgress?: (p: ProgressPayload) => void
  signal?: { cancelled: boolean }
}

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

function removeFile(p: string): void {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch {
    // ignore
  }
}

function removeDirRecursive(dir: string): void {
  try {
    if (!fs.existsSync(dir)) return
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

function killProcess(proc: ChildProcess): void {
  try {
    proc.kill('SIGTERM')
    if (process.platform === 'win32' && proc.pid) {
      spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore'
      })
    }
  } catch {
    // ignore
  }
}

function mapProgress(
  taskId: string,
  onProgress: ((p: ProgressPayload) => void) | undefined,
  rangeStart: number,
  rangeEnd: number
): (p: ProgressPayload) => void {
  const span = Math.max(0, rangeEnd - rangeStart)
  return (p: ProgressPayload) => {
    if (!onProgress) return
    const local =
      typeof p.percent === 'number' && Number.isFinite(p.percent)
        ? Math.max(0, Math.min(100, p.percent))
        : 0
    const mapped = rangeStart + (local / 100) * span
    onProgress({
      ...p,
      taskId,
      percent: Math.round(mapped * 10) / 10
    })
  }
}

function spawnFfmpeg(params: {
  ffmpeg: string
  args: string[]
  taskId: string
  outputPath: string
  inputPathHint: string
  duration: number
  resolved: string
  onProgress?: (p: ProgressPayload) => void
  signal?: { cancelled: boolean }
}): Promise<RunCompressResult> {
  const {
    ffmpeg,
    args,
    taskId,
    outputPath,
    inputPathHint,
    duration,
    resolved,
    onProgress,
    signal
  } = params
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
          inputPath: inputPathHint,
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
    let progressLines = ''

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (signal?.cancelled) return
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
          onProgress?.({
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
          onProgress?.({
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
      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        const p = parseProgressLine(line, duration)
        if (p && typeof p.percent === 'number') {
          if (p.percent - lastPercent >= 0.5) {
            lastPercent = p.percent
            const elapsedSec = (Date.now() - startedAt) / 1000
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
            onProgress?.({
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
        killProcess(proc)
      }
    }, 300)

    proc.on('error', (err) => {
      clearInterval(cancelChecker)
      resolve({
        code: 1,
        error: mapFfmpegError(err.message, {
          resolvedEncoder: resolved,
          inputPath: inputPathHint,
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
        removeFile(outputPath)
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
        onProgress?.({ taskId, percent: 100, etaSec: 0 })
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
            inputPath: inputPathHint,
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

function ensureEven(n: number): number {
  const v = Math.max(2, Math.round(n))
  return v % 2 === 0 ? v : v + 1
}

/**
 * 生成片头/片尾静图视频（libx264 + 可选静音轨）
 */
async function makeStillClip(params: {
  ffmpeg: string
  taskId: string
  imagePath: string
  outputPath: string
  durationSec: number
  width: number
  height: number
  fit: boolean
  withAudio: boolean
  onProgress?: (p: ProgressPayload) => void
  signal?: { cancelled: boolean }
}): Promise<RunCompressResult> {
  const {
    ffmpeg,
    taskId,
    imagePath,
    outputPath,
    durationSec,
    width,
    height,
    fit,
    withAudio,
    onProgress,
    signal
  } = params
  const vf = buildStillImageVf(width, height, fit)
  const args: string[] = [
    '-y',
    '-hide_banner',
    '-loop',
    '1',
    '-t',
    String(durationSec),
    '-i',
    imagePath
  ]
  if (withAudio) {
    args.push(
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100'
    )
  }
  args.push(
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-tune',
    'stillimage',
    '-pix_fmt',
    'yuv420p'
  )
  if (withAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k', '-shortest')
  } else {
    args.push('-an')
  }
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', outputPath)

  return spawnFfmpeg({
    ffmpeg,
    args,
    taskId,
    outputPath,
    inputPathHint: imagePath,
    duration: durationSec,
    resolved: 'libx264',
    onProgress,
    signal
  })
}

/**
 * 对主视频叠加图片（复用水印 filter 思路）
 */
async function applyOverlay(params: {
  ffmpeg: string
  taskId: string
  inputPath: string
  imagePath: string
  outputPath: string
  options: CompressOptions
  duration: number
  resolved?: ResolvedEncoder
  onProgress?: (p: ProgressPayload) => void
  signal?: { cancelled: boolean }
}): Promise<RunCompressResult> {
  const {
    ffmpeg,
    taskId,
    inputPath,
    imagePath,
    outputPath,
    options,
    duration,
    onProgress,
    signal
  } = params

  const wm = overlayToWatermarkOptions({
    imagePath,
    position: options.compose?.overlay?.position,
    opacity: options.compose?.overlay?.opacity,
    scalePercent: options.compose?.overlay?.scalePercent,
    marginX: options.compose?.overlay?.marginX,
    marginY: options.compose?.overlay?.marginY,
    startSec: options.compose?.overlay?.startSec,
    endSec: options.compose?.overlay?.endSec
  })

  const tempOpts: CompressOptions = {
    ...options,
    mode: 'compress',
    watermark: wm
  }
  const plan = planVideoFilters(tempOpts)
  const audioBr =
    (options.videoAudioBitrate || options.audioBitrate || '128k').trim() ||
    '128k'

  // planVideoFilters 图片水印默认 [1:v]；静图需 -loop 1
  const args: string[] = [
    '-y',
    '-hide_banner',
    '-i',
    inputPath,
    '-loop',
    '1',
    '-i',
    imagePath
  ]

  if (plan.filterComplex) {
    args.push('-filter_complex', plan.filterComplex)
    if (plan.mapVideoLabel) {
      args.push('-map', plan.mapVideoLabel)
    }
    if (options.muteAudio === true) {
      args.push('-an')
    } else {
      args.push('-map', '0:a?')
    }
  } else {
    // 回退：直接 overlay
    const opacity = normalizeOpacity(wm.opacity, 0.8)
    const { x, y } = buildWatermarkOverlayExpr(
      wm.position,
      wm.marginX,
      wm.marginY
    )
    const enable = buildWatermarkEnableExpr(wm.startSec, wm.endSec)
    const pct =
      typeof wm.scalePercent === 'number' && Number.isFinite(wm.scalePercent)
        ? Math.max(1, Math.min(100, wm.scalePercent))
        : 15
    const wmScale = `scale='min(iw,min(iw\\,ih)*${pct}/100)':-1`
    const enablePart = enable ? `:enable='${enable}'` : ''
    const fc = `[1:v]${wmScale},format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=x=${x}:y=${y}:shortest=1${enablePart}[vout]`
    args.push('-filter_complex', fc, '-map', '[vout]')
    if (options.muteAudio === true) args.push('-an')
    else args.push('-map', '0:a?')
  }

  const resolved: ResolvedEncoder = params.resolved || 'libx264'
  args.push(
    ...buildVideoEncoderArgs(options, resolved, { durationSec: duration })
  )
  if (options.muteAudio === true) {
    // already -an
  } else {
    args.push('-c:a', 'aac', '-b:a', audioBr)
  }
  args.push(
    '-movflags',
    '+faststart',
    '-shortest',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath
  )

  return spawnFfmpeg({
    ffmpeg,
    args,
    taskId,
    outputPath,
    inputPathHint: inputPath,
    duration,
    resolved,
    onProgress,
    signal
  })
}

/**
 * filter_complex 重编码拼接
 */
async function concatClips(params: {
  ffmpeg: string
  taskId: string
  inputPaths: string[]
  outputPath: string
  options: CompressOptions
  hasAudio: boolean
  duration: number
  resolved?: ResolvedEncoder
  onProgress?: (p: ProgressPayload) => void
  signal?: { cancelled: boolean }
}): Promise<RunCompressResult> {
  const {
    ffmpeg,
    taskId,
    inputPaths,
    outputPath,
    options,
    hasAudio,
    duration,
    onProgress,
    signal
  } = params
  const resolved: ResolvedEncoder = params.resolved || 'libx264'
  const filterComplex = buildConcatFilterComplex(inputPaths.length, hasAudio)
  const audioBr =
    (options.videoAudioBitrate || options.audioBitrate || '128k').trim() ||
    '128k'
  const inputArgs: string[] = []
  for (const p of inputPaths) {
    inputArgs.push('-i', p)
  }
  const args: string[] = [
    '-y',
    '-hide_banner',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[outv]'
  ]
  if (hasAudio) {
    args.push('-map', '[outa]', '-c:a', 'aac', '-b:a', audioBr)
  } else {
    args.push('-an')
  }
  args.push(
    ...buildVideoEncoderArgs(options, resolved, { durationSec: duration }),
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath
  )

  return spawnFfmpeg({
    ffmpeg,
    args,
    taskId,
    outputPath,
    inputPathHint: inputPaths[0],
    duration,
    resolved,
    onProgress,
    signal
  })
}

/**
 * 图+视频混剪：片头/片尾静图 + 主视频叠加图，多步临时文件后 concat
 */
export async function runMediaCompose(
  params: RunMediaComposeParams
): Promise<RunCompressResult> {
  const { taskId, inputPath, outputPath, options, onProgress, signal } = params
  const ffmpeg = getFfmpegPath()
  if (!ffmpeg) {
    return { code: 1, error: 'ffmpeg 不可用' }
  }

  if (!fs.existsSync(inputPath)) {
    return {
      code: 1,
      error: mapFfmpegError(`输入文件不存在: ${inputPath}`, {
        inputPath,
        outputPath
      })
    }
  }

  const compose = normalizeMediaCompose(options.compose)
  const validateErr = validateComposeOptions(compose)
  if (validateErr) {
    return { code: 1, error: validateErr }
  }
  const c = compose!

  // 磁盘路径校验
  if (c.intro?.imagePath && !fs.existsSync(c.intro.imagePath)) {
    return { code: 1, error: `片头图片不存在: ${c.intro.imagePath}` }
  }
  if (c.outro?.imagePath && !fs.existsSync(c.outro.imagePath)) {
    return { code: 1, error: `片尾图片不存在: ${c.outro.imagePath}` }
  }
  if (c.overlay?.imagePath && !fs.existsSync(c.overlay.imagePath)) {
    return { code: 1, error: `叠加图不存在: ${c.overlay.imagePath}` }
  }

  const outDir = path.dirname(outputPath)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const inputSize = getFileSize(inputPath)
  const meta = await probeVideoSize(inputPath)
  if (!meta) {
    return {
      code: 1,
      error: '无法探测主视频分辨率',
      inputSize: inputSize || undefined
    }
  }

  const width = ensureEven(meta.width)
  const height = ensureEven(meta.height)
  const mainDuration =
    meta.duration > 0 ? meta.duration : await probeDuration(inputPath)
  const mainHasAudio =
    options.muteAudio === true ? false : await probeHasAudioStream(inputPath)
  const fit = c.fitIntroOutro !== false

  const hasIntro = !!c.intro?.imagePath
  const hasOutro = !!c.outro?.imagePath
  const hasOverlay = !!c.overlay?.imagePath

  // 解析用户选择的编码器（最终主输出 / concat 重编码用）
  let detect = null
  try {
    detect = await detectHardwareEncoders()
  } catch {
    detect = null
  }
  let resolved: ResolvedEncoder = 'libx264'
  try {
    resolved = resolveVideoEncoder(options, detect, process.platform).encoder
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { code: 1, error: msg, inputSize: inputSize || undefined }
  }

  const tryWithFallback = async (
    run: (enc: ResolvedEncoder) => Promise<RunCompressResult>
  ): Promise<RunCompressResult> => {
    const first = await run(resolved)
    const allowFallback = options.fallbackToSoftware !== false
    if (
      first.code !== 0 &&
      allowFallback &&
      isHardwareEncoder(resolved) &&
      isHardwareEncoderFailure(first.error || '', resolved)
    ) {
      const second = await run('libx264')
      return {
        ...second,
        usedFallback: true,
        fallbackNote: '硬件编码失败，已回退 H.264 软件（libx264）'
      }
    }
    return first
  }

  // 仅 overlay：单步输出
  if (hasOverlay && !hasIntro && !hasOutro) {
    onProgress?.({ taskId, percent: 0 })
    const result = await tryWithFallback((enc) =>
      applyOverlay({
        ffmpeg,
        taskId,
        inputPath,
        imagePath: c.overlay!.imagePath,
        outputPath,
        options: { ...options, compose: c },
        duration: mainDuration,
        resolved: enc,
        onProgress,
        signal
      })
    )
    return {
      ...result,
      inputSize: inputSize || undefined,
      resolvedEncoder: result.resolvedEncoder || resolved
    }
  }

  const tempDir = path.join(os.tmpdir(), `ffmpeg-compose-${taskId}`)
  try {
    fs.mkdirSync(tempDir, { recursive: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { code: 1, error: `创建临时目录失败: ${msg}`, inputSize }
  }

  const tempFiles: string[] = []
  const commandLines: string[] = []
  let lastResult: RunCompressResult | null = null

  try {
    onProgress?.({ taskId, percent: 0 })

    // 阶段权重
    const stages: Array<'intro' | 'main' | 'outro' | 'concat'> = []
    if (hasIntro) stages.push('intro')
    stages.push('main')
    if (hasOutro) stages.push('outro')
    if (hasIntro || hasOutro) stages.push('concat')
    const step = 100 / stages.length
    let stageIdx = 0
    const nextRange = (): { start: number; end: number } => {
      const start = stageIdx * step
      const end = Math.min(100, (stageIdx + 1) * step)
      stageIdx += 1
      return { start, end }
    }

    let mainPath = inputPath
    let introPath = ''
    let outroPath = ''

    // 片头
    if (hasIntro) {
      const range = nextRange()
      introPath = path.join(tempDir, 'intro.mp4')
      tempFiles.push(introPath)
      const dur = normalizeComposeDurationSec(c.intro!.durationSec)
      lastResult = await makeStillClip({
        ffmpeg,
        taskId,
        imagePath: c.intro!.imagePath,
        outputPath: introPath,
        durationSec: dur,
        width,
        height,
        fit,
        withAudio: mainHasAudio,
        onProgress: mapProgress(taskId, onProgress, range.start, range.end),
        signal
      })
      if (lastResult.commandLine) commandLines.push(lastResult.commandLine)
      if (lastResult.code !== 0) {
        return {
          ...lastResult,
          inputSize: inputSize || undefined,
          commandLine: commandLines.join(' && ')
        }
      }
      if (signal?.cancelled) {
        return {
          code: -1,
          error: '已取消',
          inputSize: inputSize || undefined,
          commandLine: commandLines.join(' && ')
        }
      }
    }

    // 主视频（可选 overlay）
    {
      const range = nextRange()
      if (hasOverlay) {
        mainPath = path.join(tempDir, 'main_ov.mp4')
        tempFiles.push(mainPath)
        lastResult = await applyOverlay({
          ffmpeg,
          taskId,
          inputPath,
          imagePath: c.overlay!.imagePath,
          outputPath: mainPath,
          options: { ...options, compose: c },
          duration: mainDuration,
          onProgress: mapProgress(taskId, onProgress, range.start, range.end),
          signal
        })
        if (lastResult.commandLine) commandLines.push(lastResult.commandLine)
        if (lastResult.code !== 0) {
          return {
            ...lastResult,
            inputSize: inputSize || undefined,
            commandLine: commandLines.join(' && ')
          }
        }
      } else if (hasIntro || hasOutro) {
        // 统一编码参数以便 concat
        mainPath = path.join(tempDir, 'main_norm.mp4')
        tempFiles.push(mainPath)
        const crf =
          typeof options.crf === 'number' && Number.isFinite(options.crf)
            ? Math.max(0, Math.min(51, Math.round(options.crf)))
            : 23
        const audioBr =
          (options.videoAudioBitrate || options.audioBitrate || '128k').trim() ||
          '128k'
        const normArgs: string[] = [
          '-y',
          '-hide_banner',
          '-i',
          inputPath,
          '-vf',
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`,
          '-c:v',
          'libx264',
          '-crf',
          String(crf),
          '-pix_fmt',
          'yuv420p'
        ]
        if (mainHasAudio) {
          normArgs.push('-c:a', 'aac', '-b:a', audioBr)
        } else {
          normArgs.push('-an')
        }
        normArgs.push(
          '-movflags',
          '+faststart',
          '-progress',
          'pipe:1',
          '-nostats',
          mainPath
        )
        lastResult = await spawnFfmpeg({
          ffmpeg,
          args: normArgs,
          taskId,
          outputPath: mainPath,
          inputPathHint: inputPath,
          duration: mainDuration,
          resolved: 'libx264',
          onProgress: mapProgress(taskId, onProgress, range.start, range.end),
          signal
        })
        if (lastResult.commandLine) commandLines.push(lastResult.commandLine)
        if (lastResult.code !== 0) {
          return {
            ...lastResult,
            inputSize: inputSize || undefined,
            commandLine: commandLines.join(' && ')
          }
        }
      } else {
        // 不应到达：无 intro/outro/overlay 已在 validate 拦截
        mapProgress(taskId, onProgress, range.start, range.end)({
          taskId,
          percent: 100
        })
      }
      if (signal?.cancelled) {
        return {
          code: -1,
          error: '已取消',
          inputSize: inputSize || undefined,
          commandLine: commandLines.join(' && ')
        }
      }
    }

    // 片尾
    if (hasOutro) {
      const range = nextRange()
      outroPath = path.join(tempDir, 'outro.mp4')
      tempFiles.push(outroPath)
      const dur = normalizeComposeDurationSec(c.outro!.durationSec)
      lastResult = await makeStillClip({
        ffmpeg,
        taskId,
        imagePath: c.outro!.imagePath,
        outputPath: outroPath,
        durationSec: dur,
        width,
        height,
        fit,
        withAudio: mainHasAudio,
        onProgress: mapProgress(taskId, onProgress, range.start, range.end),
        signal
      })
      if (lastResult.commandLine) commandLines.push(lastResult.commandLine)
      if (lastResult.code !== 0) {
        return {
          ...lastResult,
          inputSize: inputSize || undefined,
          commandLine: commandLines.join(' && ')
        }
      }
      if (signal?.cancelled) {
        return {
          code: -1,
          error: '已取消',
          inputSize: inputSize || undefined,
          commandLine: commandLines.join(' && ')
        }
      }
    }

    // 仅有 overlay 已在前面返回；此处至少 intro 或 outro
    const parts: string[] = []
    if (introPath) parts.push(introPath)
    parts.push(mainPath)
    if (outroPath) parts.push(outroPath)

    if (parts.length === 1) {
      // 理论上不会：只有 main 且无 intro/outro 应已 early return
      try {
        fs.copyFileSync(mainPath, outputPath)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { code: 1, error: `写出失败: ${msg}`, inputSize }
      }
      onProgress?.({ taskId, percent: 100, etaSec: 0 })
      return {
        code: 0,
        inputSize: inputSize || undefined,
        outputSize: getFileSize(outputPath),
        resolvedEncoder: resolved,
        commandLine: commandLines.join(' && ') || undefined
      }
    }

    const range = nextRange()
    let totalDur = mainDuration
    if (hasIntro) totalDur += normalizeComposeDurationSec(c.intro!.durationSec)
    if (hasOutro) totalDur += normalizeComposeDurationSec(c.outro!.durationSec)

    lastResult = await tryWithFallback((enc) =>
      concatClips({
        ffmpeg,
        taskId,
        inputPaths: parts,
        outputPath,
        options,
        hasAudio: mainHasAudio,
        duration: totalDur,
        resolved: enc,
        onProgress: mapProgress(taskId, onProgress, range.start, range.end),
        signal
      })
    )
    if (lastResult.commandLine) commandLines.push(lastResult.commandLine)

    return {
      ...lastResult,
      inputSize: inputSize || undefined,
      resolvedEncoder: lastResult.resolvedEncoder || resolved,
      commandLine: commandLines.join(' && ')
    }
  } finally {
    for (const f of tempFiles) removeFile(f)
    removeDirRecursive(tempDir)
  }
}

