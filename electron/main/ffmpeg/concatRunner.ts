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
  buildConcatDemuxerList,
  buildConcatFilterComplex,
  buildVideoEncoderArgs,
  estimateEtaSec,
  formatSec,
  isHardwareEncoder,
  parseProgressLine,
  resolveVideoEncoder
} from '../../../shared/ffmpegLogic'
import {
  isHardwareEncoderFailure,
  mapFfmpegError
} from '../../../shared/errorMap'
import { getFfmpegPath } from './bin'
import {
  detectHardwareEncoders,
  probeDuration,
  probeHasAudioStream
} from './probe'
import { getFileSize } from './paths'
import type { RunCompressResult } from './runner'

export interface RunVideoConcatParams {
  taskId: string
  inputPaths: string[]
  outputPath: string
  options: CompressOptions
  onProgress?: (p: ProgressPayload) => void
  signal?: { cancelled: boolean }
}

/** 将参数数组格式化为可读命令行 */
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

function removeIncompleteOutput(outputPath: string): void {
  try {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath)
    }
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

/** 构建重编码参数：按用户 encoder 选择（含硬件） */
function buildReencodeArgs(
  options: CompressOptions,
  resolved: ResolvedEncoder,
  hasAudio: boolean,
  filterComplex: string,
  durationSec?: number
): string[] {
  const audioBr =
    (options.videoAudioBitrate || options.audioBitrate || '128k').trim() ||
    '128k'
  const args: string[] = [
    '-filter_complex',
    filterComplex,
    '-map',
    '[outv]'
  ]
  if (hasAudio) {
    args.push('-map', '[outa]')
  }
  args.push(...buildVideoEncoderArgs(options, resolved, { durationSec }))
  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', audioBr)
  } else {
    args.push('-an')
  }
  args.push('-movflags', '+faststart')
  return args
}

/**
 * 视频拼接：优先 concat demuxer + stream copy，失败则 filter_complex 重编码
 */
export async function runVideoConcat(
  params: RunVideoConcatParams
): Promise<RunCompressResult> {
  const { taskId, outputPath, options, onProgress, signal } = params
  const inputPaths = (params.inputPaths || [])
    .map((p) => (p || '').trim())
    .filter(Boolean)

  const ffmpeg = getFfmpegPath()
  if (!ffmpeg) {
    return { code: 1, error: 'ffmpeg 不可用' }
  }

  if (inputPaths.length < 2) {
    return { code: 1, error: '视频拼接至少需要 2 个输入文件' }
  }

  for (const p of inputPaths) {
    if (!fs.existsSync(p)) {
      return {
        code: 1,
        error: mapFfmpegError(`输入文件不存在: ${p}`, {
          inputPath: p,
          outputPath
        })
      }
    }
  }

  const outDir = path.dirname(outputPath)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  let inputSize = 0
  for (const p of inputPaths) {
    const s = getFileSize(p)
    if (typeof s === 'number') inputSize += s
  }

  // 总时长：各段之和（进度用）
  let duration = 0
  for (const p of inputPaths) {
    duration += await probeDuration(p)
  }

  const preferCopy = options.concatPreferCopy !== false
  const hint = inputPaths[0]
  onProgress?.({ taskId, percent: 0 })

  // —— 1) 尝试 stream copy ——
  if (preferCopy) {
    const listPath = path.join(
      os.tmpdir(),
      `ffmpeg-concat-${taskId}-${Date.now()}.txt`
    )
    try {
      fs.writeFileSync(listPath, buildConcatDemuxerList(inputPaths), 'utf8')
      const copyArgs = [
        '-y',
        '-hide_banner',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        '-progress',
        'pipe:1',
        '-nostats',
        outputPath
      ]
      const copyResult = await spawnFfmpeg({
        ffmpeg,
        args: copyArgs,
        taskId,
        outputPath,
        inputPathHint: hint,
        duration,
        resolved: 'copy',
        onProgress,
        signal
      })

      if (copyResult.code === 0 || copyResult.code === -1 || signal?.cancelled) {
        return {
          ...copyResult,
          inputSize: inputSize || undefined,
          resolvedEncoder: copyResult.resolvedEncoder || 'copy'
        }
      }

      // copy 失败：删残片后重编码
      removeIncompleteOutput(outputPath)
      onProgress?.({ taskId, percent: 0 })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 写 list 失败则直接走重编码
      if (!msg.includes('ENOENT')) {
        // continue to reencode
      }
      removeIncompleteOutput(outputPath)
    } finally {
      try {
        if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
      } catch {
        // ignore
      }
    }
  }

  if (signal?.cancelled) {
    return {
      code: -1,
      error: '已取消',
      inputSize: inputSize || undefined
    }
  }

  // —— 2) 重编码：任一无音轨则仅视频 ——
  let hasAudio = true
  for (const p of inputPaths) {
    const a = await probeHasAudioStream(p)
    if (!a) {
      hasAudio = false
      break
    }
  }

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

  const filterComplex = buildConcatFilterComplex(inputPaths.length, hasAudio)
  const inputArgs: string[] = []
  for (const p of inputPaths) {
    inputArgs.push('-i', p)
  }

  const runReencode = async (enc: ResolvedEncoder): Promise<RunCompressResult> => {
    const encodeArgs = buildReencodeArgs(
      options,
      enc,
      hasAudio,
      filterComplex,
      duration
    )
    const reArgs = [
      '-y',
      '-hide_banner',
      ...inputArgs,
      ...encodeArgs,
      '-progress',
      'pipe:1',
      '-nostats',
      outputPath
    ]
    return spawnFfmpeg({
      ffmpeg,
      args: reArgs,
      taskId,
      outputPath,
      inputPathHint: hint,
      duration,
      resolved: enc,
      onProgress,
      signal
    })
  }

  const first = await runReencode(resolved)
  const allowFallback = options.fallbackToSoftware !== false
  if (
    first.code !== 0 &&
    allowFallback &&
    isHardwareEncoder(resolved) &&
    isHardwareEncoderFailure(first.error || '', resolved)
  ) {
    removeIncompleteOutput(outputPath)
    const second = await runReencode('libx264')
    return {
      ...second,
      inputSize: inputSize || undefined,
      resolvedEncoder: second.resolvedEncoder || 'libx264',
      usedFallback: true,
      fallbackNote: '硬件编码失败，已回退 H.264 软件（libx264）'
    }
  }

  return {
    ...first,
    inputSize: inputSize || undefined,
    resolvedEncoder: first.resolvedEncoder || resolved
  }
}
