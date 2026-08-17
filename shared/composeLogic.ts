import type {
  MediaComposeOptions,
  WatermarkOptions,
  WatermarkPosition
} from './types'
import { normalizeTrimSec } from './ffmpegLogic'

/** 片头/片尾默认时长（秒） */
export const DEFAULT_COMPOSE_DURATION_SEC = 3

/**
 * 规范化静图时长：>0 有效，否则回退默认
 */
export function normalizeComposeDurationSec(
  v: unknown,
  defaultSec = DEFAULT_COMPOSE_DURATION_SEC
): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return defaultSec
  return Math.min(3600, Math.round(n * 1000) / 1000)
}

function hasImagePath(p?: string | null): boolean {
  return typeof p === 'string' && p.trim().length > 0
}

/** 是否配置了至少一项混剪能力 */
export function isComposeActive(
  compose?: MediaComposeOptions | null
): boolean {
  if (!compose) return false
  if (hasImagePath(compose.intro?.imagePath)) return true
  if (hasImagePath(compose.outro?.imagePath)) return true
  if (hasImagePath(compose.overlay?.imagePath)) return true
  return false
}

/**
 * 校验混剪选项（路径与时长语义，不检查磁盘）
 * 通过返回 null，失败返回中文错误
 */
export function validateComposeOptions(
  compose?: MediaComposeOptions | null
): string | null {
  if (!isComposeActive(compose)) {
    return '请设置片头、片尾或叠加图'
  }
  const c = compose as MediaComposeOptions
  if (c.intro && hasImagePath(c.intro.imagePath)) {
    if (
      typeof c.intro.durationSec === 'number' &&
      Number.isFinite(c.intro.durationSec) &&
      c.intro.durationSec <= 0
    ) {
      return '片头时长须大于 0'
    }
  }
  if (c.outro && hasImagePath(c.outro.imagePath)) {
    if (
      typeof c.outro.durationSec === 'number' &&
      Number.isFinite(c.outro.durationSec) &&
      c.outro.durationSec <= 0
    ) {
      return '片尾时长须大于 0'
    }
  }
  if (c.overlay && hasImagePath(c.overlay.imagePath)) {
    const start = normalizeTrimSec(c.overlay.startSec)
    const end = normalizeTrimSec(c.overlay.endSec)
    if (start != null && end != null && end <= start) {
      return '叠加图结束时间须大于开始时间'
    }
  }
  return null
}

/**
 * 静图视频缩放滤镜
 * fit=true：等比缩入 + 黑边 pad 到目标尺寸
 * fit=false：直接拉伸到目标尺寸
 */
export function buildStillImageVf(
  width: number,
  height: number,
  fit = true
): string {
  const w = Math.max(2, Math.floor(width / 2) * 2)
  const h = Math.max(2, Math.floor(height / 2) * 2)
  if (fit) {
    return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`
  }
  return `scale=${w}:${h},setsar=1,fps=30,format=yuv420p`
}

/** 将 compose.overlay 映射为图片水印选项 */
export function overlayToWatermarkOptions(
  overlay: NonNullable<MediaComposeOptions['overlay']>
): WatermarkOptions {
  const pos: WatermarkPosition = overlay.position || 'br'
  const opacity =
    typeof overlay.opacity === 'number' && Number.isFinite(overlay.opacity)
      ? Math.max(0, Math.min(1, overlay.opacity))
      : 0.8
  const scalePercent =
    typeof overlay.scalePercent === 'number' &&
    Number.isFinite(overlay.scalePercent)
      ? Math.max(1, Math.min(100, overlay.scalePercent))
      : 15
  const marginX =
    typeof overlay.marginX === 'number' && Number.isFinite(overlay.marginX)
      ? Math.max(0, Math.round(overlay.marginX))
      : 16
  const marginY =
    typeof overlay.marginY === 'number' && Number.isFinite(overlay.marginY)
      ? Math.max(0, Math.round(overlay.marginY))
      : 16
  return {
    mode: 'image',
    imagePath: (overlay.imagePath || '').trim(),
    position: pos,
    opacity,
    scalePercent,
    marginX,
    marginY,
    startSec: overlay.startSec,
    endSec: overlay.endSec
  }
}

/** 规范化 compose 用于写入 options（补默认时长） */
export function normalizeMediaCompose(
  compose?: MediaComposeOptions | null
): MediaComposeOptions | undefined {
  if (!compose) return undefined
  const out: MediaComposeOptions = {}
  if (compose.fitIntroOutro === false) out.fitIntroOutro = false
  if (compose.intro && hasImagePath(compose.intro.imagePath)) {
    out.intro = {
      imagePath: compose.intro.imagePath.trim(),
      durationSec: normalizeComposeDurationSec(compose.intro.durationSec)
    }
  }
  if (compose.outro && hasImagePath(compose.outro.imagePath)) {
    out.outro = {
      imagePath: compose.outro.imagePath.trim(),
      durationSec: normalizeComposeDurationSec(compose.outro.durationSec)
    }
  }
  if (compose.overlay && hasImagePath(compose.overlay.imagePath)) {
    out.overlay = {
      imagePath: compose.overlay.imagePath.trim(),
      position: compose.overlay.position || 'br',
      opacity: compose.overlay.opacity,
      scalePercent: compose.overlay.scalePercent,
      marginX: compose.overlay.marginX,
      marginY: compose.overlay.marginY,
      startSec: compose.overlay.startSec,
      endSec: compose.overlay.endSec
    }
  }
  return isComposeActive(out) ? out : undefined
}
