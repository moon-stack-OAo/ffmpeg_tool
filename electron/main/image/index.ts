import type {
  ImageEngineId,
  ImageEngineStatus,
  ImageProcessOptions,
  ImageProcessResult
} from '../../../shared/types'
import {
  checkMagickAvailable,
  checkSharpReady,
  setMagickOverride
} from './bin'
import { processWithMagick } from './magickEngine'
import { processWithSharp } from './sharpEngine'

let currentEngine: ImageEngineId = 'sharp'

export function setImageEngine(engine: ImageEngineId): void {
  currentEngine = engine === 'imagemagick' ? 'imagemagick' : 'sharp'
}

export function getImageEngine(): ImageEngineId {
  return currentEngine
}

/** 设置 magick 路径覆盖（空串=清除） */
export function setMagickPath(input: string): {
  accepted: boolean
  path?: string
  error?: string
} {
  return setMagickOverride(input)
}

export function getImageEngineStatus(): ImageEngineStatus {
  const sharpReady = checkSharpReady()
  const magick = checkMagickAvailable()
  const engine = currentEngine

  let error: string | undefined
  if (engine === 'sharp' && !sharpReady) {
    error = '当前引擎 Sharp 不可用'
  } else if (engine === 'imagemagick' && !magick.ready) {
    error = magick.error || '当前引擎 ImageMagick 不可用'
  }

  return {
    engine,
    sharpReady,
    magickReady: magick.ready,
    magickPath: magick.path,
    error
  }
}

export async function processImage(
  options: ImageProcessOptions
): Promise<ImageProcessResult> {
  const engine = currentEngine
  if (engine === 'imagemagick') {
    const magick = checkMagickAvailable()
    if (!magick.ready) {
      // magick 不可用时回退 sharp（若可用）
      if (checkSharpReady()) {
        const r = await processWithSharp(options)
        if (r.ok) {
          return {
            ...r,
            error: undefined,
            engine: 'sharp'
          }
        }
      }
      return {
        ok: false,
        engine: 'imagemagick',
        error: magick.error || 'ImageMagick 不可用'
      }
    }
    return processWithMagick(options)
  }

  if (!checkSharpReady()) {
    const magick = checkMagickAvailable()
    if (magick.ready) {
      return processWithMagick(options)
    }
    return {
      ok: false,
      engine: 'sharp',
      error: 'sharp 不可用，且未找到 ImageMagick'
    }
  }
  return processWithSharp(options)
}

export { checkSharpReady, checkMagickAvailable, setMagickOverride }
