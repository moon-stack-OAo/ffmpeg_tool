import fs from 'fs'
import path from 'path'
import type { ImageProcessOptions, ImageProcessResult } from '../../../shared/types'
import {
  normalizeImageQuality,
  normalizeMaxEdge
} from '../../../shared/imageLogic'
import { checkSharpReady } from './bin'

type SharpFn = (input?: string | Buffer, options?: unknown) => SharpInstance

interface SharpInstance {
  rotate: (angle?: number) => SharpInstance
  resize: (options: {
    width?: number
    height?: number
    fit?: string
    withoutEnlargement?: boolean
  }) => SharpInstance
  withMetadata: (options?: unknown) => SharpInstance
  jpeg: (options?: { quality?: number; mozjpeg?: boolean }) => SharpInstance
  png: (options?: { compressionLevel?: number }) => SharpInstance
  webp: (options?: { quality?: number }) => SharpInstance
  toFile: (path: string) => Promise<{
    width: number
    height: number
    size: number
  }>
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

export async function processWithSharp(
  options: ImageProcessOptions
): Promise<ImageProcessResult> {
  if (!checkSharpReady()) {
    return { ok: false, engine: 'sharp', error: 'sharp 不可用' }
  }

  const inputPath = (options.inputPath || '').trim()
  const outputPath = (options.outputPath || '').trim()
  if (!inputPath || !outputPath) {
    return { ok: false, engine: 'sharp', error: '输入或输出路径为空' }
  }
  if (!fs.existsSync(inputPath)) {
    return { ok: false, engine: 'sharp', error: '输入文件不存在' }
  }

  const maxEdge = normalizeMaxEdge(options.maxEdge)
  const quality = normalizeImageQuality(options.quality, 80)
  const strip = options.strip !== false
  const format = options.format || 'keep'

  try {
    const outDir = path.dirname(outputPath)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    const sharp = loadSharp()
    // rotate() 无参：按 EXIF 自动方向
    let pipeline = sharp(inputPath).rotate()

    if (maxEdge > 0) {
      pipeline = pipeline.resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true
      })
    }

    // sharp 默认剥离大部分元数据；仅在 strip=false 时保留
    if (!strip) {
      pipeline = pipeline.withMetadata()
    }

    const resolvedFormat =
      format === 'keep'
        ? guessFormatFromPath(outputPath) || guessFormatFromPath(inputPath) || 'jpeg'
        : format

    if (resolvedFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true })
    } else if (resolvedFormat === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9 })
    } else if (resolvedFormat === 'webp') {
      pipeline = pipeline.webp({ quality })
    }

    const info = await pipeline.toFile(outputPath)
    let size: number | undefined
    try {
      size = fs.statSync(outputPath).size
    } catch {
      size = info.size
    }

    return {
      ok: true,
      engine: 'sharp',
      outputPath,
      width: info.width,
      height: info.height,
      size
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, engine: 'sharp', error: message || 'sharp 处理失败' }
  }
}

function guessFormatFromPath(
  p: string
): 'jpeg' | 'png' | 'webp' | null {
  const ext = path.extname(p).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg'
  if (ext === '.png') return 'png'
  if (ext === '.webp') return 'webp'
  return null
}
