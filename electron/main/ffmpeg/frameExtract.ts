import {spawn} from 'child_process'
import fs from 'fs'
import path from 'path'
import {VIDEO_EXTENSIONS} from '../../../shared/types'
import {getFfmpegPath, getFfprobePath} from './bin'
import {checkSharpReady} from '../image/bin'

const VIDEO_EXT_SET = new Set(
  (VIDEO_EXTENSIONS as string[]).map((e) => e.toLowerCase())
)

export interface ExtractVideoFrameOpts {
  path: string
  /** 抽帧时间点（秒），默认 0 */
  timeSec?: number
  /** 预览最长边，默认 1600 */
  maxEdge?: number
}

export interface ExtractVideoFrameResult {
  ok: boolean
  dataUrl?: string
  /** 源视频显示宽（裁切坐标系） */
  width?: number
  /** 源视频显示高 */
  height?: number
  previewWidth?: number
  previewHeight?: number
  error?: string
}

type SharpFn = {
  (input?: string | Buffer, options?: unknown): SharpInstance
}

interface SharpInstance {
  rotate: (angle?: number) => SharpInstance
  resize: (options: {
    width?: number
    height?: number
    fit?: string
    withoutEnlargement?: boolean
  }) => SharpInstance
  jpeg: (options?: { quality?: number; mozjpeg?: boolean }) => SharpInstance
  metadata: () => Promise<{ width?: number; height?: number }>
  toBuffer: (options?: {
    resolveWithObject?: boolean
  }) => Promise<Buffer | { data: Buffer; info: { width: number; height: number } }>
}

function loadSharp(): SharpFn {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod: unknown = require('sharp')
  if (typeof mod === 'function') return mod as SharpFn
  if (
    mod &&
    typeof mod === 'object' &&
    typeof (mod as { default?: unknown }).default === 'function'
  ) {
    return (mod as { default: SharpFn }).default
  }
  throw new Error('sharp 模块格式异常')
}

function validateVideoPath(filePath: string): string | null {
  const raw = typeof filePath === 'string' ? filePath.trim() : ''
  if (!raw) return '路径为空'
  if (!fs.existsSync(raw)) return '文件不存在'
  let st: fs.Stats
  try {
    st = fs.statSync(raw)
  } catch {
    return '无法读取文件'
  }
  if (!st.isFile()) return '不是文件'
  const ext = path.extname(raw).toLowerCase()
  if (!VIDEO_EXT_SET.has(ext)) {
    return `不支持的视频格式: ${ext || '(无扩展名)'}`
  }
  return null
}

/**
 * ffprobe：取视频流宽高、时长
 * 若有 displaymatrix 旋转 90/270，交换宽高得到显示尺寸
 */
function probeVideoMeta(
  inputPath: string
): Promise<{ width: number; height: number; duration: number } | null> {
  return new Promise((resolve) => {
    const ffprobe = getFfprobePath()
    if (!ffprobe) {
      resolve(null)
      return
    }

    const proc = spawn(
      ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:stream_tags=rotate:stream_side_data=rotation:format=duration',
        '-of',
        'json',
        inputPath
      ],
      { windowsHide: true }
    )

    let out = ''
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('error', () => resolve(null))
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(out) as {
          streams?: Array<{
            width?: number
            height?: number
            tags?: { rotate?: string }
            side_data_list?: Array<{ rotation?: number }>
          }>
          format?: { duration?: string }
        }
        const stream = parsed.streams?.[0]
        let width = Number(stream?.width)
        let height = Number(stream?.height)
        if (
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        ) {
          resolve(null)
          return
        }

        let rotation = 0
        const tagRot = stream?.tags?.rotate
        if (tagRot != null && String(tagRot).trim() !== '') {
          const n = parseFloat(String(tagRot))
          if (Number.isFinite(n)) rotation = n
        }
        const side = stream?.side_data_list
        if (Array.isArray(side)) {
          for (const sd of side) {
            if (typeof sd?.rotation === 'number' && Number.isFinite(sd.rotation)) {
              rotation = sd.rotation
              break
            }
          }
        }
        // 90/270 显示尺寸互换
        const absRot = Math.abs(Math.round(rotation)) % 360
        if (absRot === 90 || absRot === 270) {
          const t = width
          width = height
          height = t
        }

        const durRaw = parseFloat(String(parsed.format?.duration ?? '0'))
        const duration =
          Number.isFinite(durRaw) && durRaw > 0 ? durRaw : 0

        resolve({ width, height, duration })
      } catch {
        resolve(null)
      }
    })
  })
}

/** 用 ffmpeg 抽一帧 jpeg 到 stdout */
function extractJpegBuffer(
  inputPath: string,
  timeSec: number
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const ffmpeg = getFfmpegPath()
    if (!ffmpeg) {
      resolve(null)
      return
    }

    const t = Math.max(0, timeSec)
    const chunks: Buffer[] = []
    let settled = false
    const finish = (buf: Buffer | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(buf)
    }

    const proc = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        String(t),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-'
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGTERM')
      } catch {
        // ignore
      }
      finish(null)
    }, 30_000)

    proc.stdout?.on('data', (d: Buffer) => {
      chunks.push(d)
    })
    proc.on('error', () => finish(null))
    proc.on('close', (code) => {
      if (code !== 0) {
        finish(null)
        return
      }
      const buf = Buffer.concat(chunks)
      finish(buf.length > 0 ? buf : null)
    })
  })
}

export interface ExtractVideoFrameJpegResult {
  ok: boolean
  buffer?: Buffer
  width?: number
  height?: number
  previewWidth?: number
  previewHeight?: number
  error?: string
}

/**
 * 从视频抽取一帧 JPEG Buffer（任务列表缩略图 / 局域网接口复用）
 */
export async function extractVideoFrameJpeg(
  opts: ExtractVideoFrameOpts
): Promise<ExtractVideoFrameJpegResult> {
  const filePath = typeof opts?.path === 'string' ? opts.path.trim() : ''
  const pathErr = validateVideoPath(filePath)
  if (pathErr) return { ok: false, error: pathErr }

  if (!getFfmpegPath()) {
    return { ok: false, error: 'ffmpeg 不可用' }
  }
  if (!checkSharpReady()) {
    return { ok: false, error: 'Sharp 不可用' }
  }

  const meta = await probeVideoMeta(filePath)
  if (!meta) {
    return { ok: false, error: '无法读取视频信息' }
  }

  let timeSec =
    typeof opts.timeSec === 'number' && Number.isFinite(opts.timeSec)
      ? opts.timeSec
      : 0
  if (timeSec < 0) timeSec = 0
  if (meta.duration > 0) {
    const maxT = Math.max(0, meta.duration - 0.05)
    if (timeSec > maxT) timeSec = maxT
  }

  const edge =
    typeof opts.maxEdge === 'number' &&
    Number.isFinite(opts.maxEdge) &&
    opts.maxEdge > 0
      ? Math.floor(opts.maxEdge)
      : 1600

  try {
    const jpegBuf = await extractJpegBuffer(filePath, timeSec)
    if (!jpegBuf) {
      return { ok: false, error: '抽帧失败' }
    }

    const sharp = loadSharp()
    // 帧已是解码后像素；rotate 处理可能残留的 EXIF
    const oriented = sharp(jpegBuf).rotate()
    const frameMeta = await oriented.metadata()
    const fw = frameMeta.width || 0
    const fh = frameMeta.height || 0

    let pipeline = sharp(jpegBuf).rotate()
    if (fw > edge || fh > edge || fw === 0 || fh === 0) {
      pipeline = pipeline.resize({
        width: edge,
        height: edge,
        fit: 'inside',
        withoutEnlargement: true
      })
    }

    const result = (await pipeline
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })) as {
      data: Buffer
      info: { width: number; height: number }
    }

    return {
      ok: true,
      buffer: result.data,
      width: meta.width,
      height: meta.height,
      previewWidth: result.info.width,
      previewHeight: result.info.height
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || '抽帧失败' }
  }
}

/**
 * 从视频抽取一帧预览
 * - width/height：源视频显示尺寸（用于裁切坐标）
 * - dataUrl：jpeg 预览（可按 maxEdge 缩小）
 */
export async function extractVideoFrame(
  opts: ExtractVideoFrameOpts
): Promise<ExtractVideoFrameResult> {
  const r = await extractVideoFrameJpeg(opts)
  if (!r.ok || !r.buffer) {
    return { ok: false, error: r.error || '抽帧失败' }
  }
  return {
    ok: true,
    dataUrl: `data:image/jpeg;base64,${r.buffer.toString('base64')}`,
    width: r.width,
    height: r.height,
    previewWidth: r.previewWidth,
    previewHeight: r.previewHeight
  }
}
