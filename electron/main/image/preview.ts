import fs from 'fs'
import path from 'path'
import { IMAGE_EXTENSIONS } from '../../../shared/types'
import { checkSharpReady } from './bin'

const IMAGE_EXT_SET = new Set(
  (IMAGE_EXTENSIONS as string[]).map((e) => e.toLowerCase())
)

export interface ImageInfoResult {
  ok: boolean
  width?: number
  height?: number
  error?: string
}

export interface ImageDataUrlResult {
  ok: boolean
  dataUrl?: string
  width?: number
  height?: number
  previewWidth?: number
  previewHeight?: number
  error?: string
}

type SharpFn = {
  (input?: string | Buffer, options?: unknown): SharpInstance
}

interface SharpMetadata {
  width?: number
  height?: number
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
  metadata: () => Promise<SharpMetadata>
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

function validateImagePath(filePath: string): string | null {
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
  if (!IMAGE_EXT_SET.has(ext)) {
    return `不支持的图片格式: ${ext || '(无扩展名)'}`
  }
  return null
}

/** sharp metadata（含路径与扩展名校验） */
export async function getImageInfo(filePath: string): Promise<ImageInfoResult> {
  const pathErr = validateImagePath(filePath)
  if (pathErr) return { ok: false, error: pathErr }
  if (!checkSharpReady()) {
    return { ok: false, error: 'Sharp 不可用' }
  }
  try {
    const sharp = loadSharp()
    // rotate 后 metadata 才是 auto-orient 后的尺寸
    const meta = await sharp(filePath.trim()).rotate().metadata()
    const width = meta.width
    const height = meta.height
    if (!(typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0)) {
      return { ok: false, error: '无法读取图片尺寸' }
    }
    return { ok: true, width, height }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || '读取图片信息失败' }
  }
}

/**
 * 生成预览 data URL
 * - rotate() 按 EXIF 校正
 * - 裁切坐标基于 orient 后原图尺寸
 * - maxEdge 默认 1600，inside 缩小，jpeg quality 80
 */
export async function getImageDataUrl(
  filePath: string,
  maxEdge = 1600
): Promise<ImageDataUrlResult> {
  const pathErr = validateImagePath(filePath)
  if (pathErr) return { ok: false, error: pathErr }
  if (!checkSharpReady()) {
    return { ok: false, error: 'Sharp 不可用' }
  }

  const edge =
    typeof maxEdge === 'number' && Number.isFinite(maxEdge) && maxEdge > 0
      ? Math.floor(maxEdge)
      : 1600

  try {
    const sharp = loadSharp()
    const input = filePath.trim()
    // 先 orient，再取实际尺寸
    const oriented = sharp(input).rotate()
    const meta = await oriented.metadata()
    const width = meta.width
    const height = meta.height
    if (!(typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0)) {
      return { ok: false, error: '无法读取图片尺寸' }
    }

    // 重新 pipeline：rotate + resize + jpeg
    let pipeline = sharp(input).rotate()
    if (width > edge || height > edge) {
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

    const previewWidth = result.info.width
    const previewHeight = result.info.height
    const b64 = result.data.toString('base64')
    const dataUrl = `data:image/jpeg;base64,${b64}`

    return {
      ok: true,
      dataUrl,
      width,
      height,
      previewWidth,
      previewHeight
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || '生成预览失败' }
  }
}
