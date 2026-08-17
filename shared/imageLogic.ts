import type { ImageProcessOptions } from './types'

/** 拼接布局 */
export type StitchLayout = 'horizontal' | 'vertical' | 'grid'

/** 拼接单项放置信息 */
export interface StitchPlanItem {
  path: string
  left: number
  top: number
  /** 目标放置宽 */
  width: number
  height: number
}

/** 拼接画布规划 */
export interface StitchPlan {
  canvasWidth: number
  canvasHeight: number
  items: StitchPlanItem[]
  /** 默认 #000000 */
  background: string
}

/** 规范化 quality：1–100，非法时回退默认 */
export function normalizeImageQuality(
  quality: number | undefined,
  fallback = 80
): number {
  const n = typeof quality === 'number' ? quality : Number(quality)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(100, Math.round(n)))
}

/** 规范化最长边：>=0 的整数，非法为 0（不缩放） */
export function normalizeMaxEdge(maxEdge: number | undefined): number {
  const n = typeof maxEdge === 'number' ? maxEdge : Number(maxEdge)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.floor(n)
}

/**
 * 规范化裁切区域：有限数、w>0 h>0、x/y>=0，否则 null；取整
 */
export function normalizeCrop(
  crop?: { x: number; y: number; w: number; h: number } | null
): { x: number; y: number; w: number; h: number } | null {
  if (crop == null || typeof crop !== 'object') return null
  const x = Number(crop.x)
  const y = Number(crop.y)
  const w = Number(crop.w)
  const h = Number(crop.h)
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h)
  ) {
    return null
  }
  if (w <= 0 || h <= 0 || x < 0 || y < 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h)
  }
}

/**
 * 从用户输入解析 magick 可执行文件候选路径
 * - 空串 → null（表示自动探测）
 * - 文件路径 → 原样
 * - 目录 → 拼接 magick(.exe)
 */
export function resolveMagickCandidate(
  input: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  const raw = (input || '').trim()
  if (!raw) return null
  const exe = platform === 'win32' ? 'magick.exe' : 'magick'
  const normalized = raw.replace(/[/\\]+$/, '')
  const baseName = normalized.split(/[/\\]/).pop()?.toLowerCase() || ''
  // 仅当最后一段就是可执行文件名时视为文件路径
  if (
    baseName === 'magick.exe' ||
    baseName === 'magick' ||
    baseName === 'convert.exe' ||
    baseName === 'convert'
  ) {
    return normalized
  }
  const sep = platform === 'win32' ? '\\' : '/'
  return `${normalized}${sep}${exe}`
}

/**
 * 构建 ImageMagick 参数数组（不含可执行文件本身）
 * 顺序：input -auto-orient [-crop WxH+X+Y +repage] [-resize] [-quality] [-strip] output
 */
export function buildMagickArgs(options: ImageProcessOptions): string[] {
  const input = options.inputPath
  const output = options.outputPath
  const maxEdge = normalizeMaxEdge(options.maxEdge)
  const strip = options.strip !== false
  const format = options.format || 'keep'
  const quality = normalizeImageQuality(options.quality, 80)
  const crop = normalizeCrop(options.crop)

  const args: string[] = [input, '-auto-orient']

  if (crop) {
    args.push('-crop', `${crop.w}x${crop.h}+${crop.x}+${crop.y}`, '+repage')
  }

  if (maxEdge > 0) {
    // 仅缩小：宽高均不超过 maxEdge，且不放大
    args.push('-resize', `${maxEdge}x${maxEdge}>`)
  }

  if (format === 'jpeg' || format === 'webp') {
    args.push('-quality', String(quality))
  }

  if (strip) {
    args.push('-strip')
  }

  // 输出格式由扩展名决定；keep 时使用 output 原扩展名
  args.push(output)
  return args
}

/**
 * 根据各图尺寸与布局计算画布与位置
 * - horizontal: 统一高度为 min(heights)，等比缩放宽，gap 分隔
 * - vertical: 统一宽度为 min(widths)，等比缩放高
 * - grid: 统一缩放到 cell 高=min height、宽=min width，按 gridCols 排列
 */
export function planImageStitch(
  paths: string[],
  sizes: Array<{ width: number; height: number }>,
  options: {
    layout?: StitchLayout
    gridCols?: number
    gap?: number
    background?: string
  } = {}
): StitchPlan {
  const n = Math.min(paths.length, sizes.length)
  const background =
    typeof options.background === 'string' && options.background.trim()
      ? options.background.trim()
      : '#000000'
  const gapRaw = Number(options.gap)
  const gap =
    Number.isFinite(gapRaw) && gapRaw > 0 ? Math.round(gapRaw) : 0

  if (n === 0) {
    return { canvasWidth: 0, canvasHeight: 0, items: [], background }
  }

  const layout: StitchLayout =
    options.layout === 'vertical' || options.layout === 'grid'
      ? options.layout
      : 'horizontal'

  const safeSizes = sizes.slice(0, n).map((s) => ({
    width: Math.max(1, Math.round(Number(s.width) || 1)),
    height: Math.max(1, Math.round(Number(s.height) || 1))
  }))

  if (layout === 'horizontal') {
    const targetH = Math.min(...safeSizes.map((s) => s.height))
    const items: StitchPlanItem[] = []
    let left = 0
    for (let i = 0; i < n; i++) {
      const s = safeSizes[i]
      const w = Math.max(1, Math.round((s.width * targetH) / s.height))
      items.push({
        path: paths[i],
        left,
        top: 0,
        width: w,
        height: targetH
      })
      left += w + (i < n - 1 ? gap : 0)
    }
    return {
      canvasWidth: left,
      canvasHeight: targetH,
      items,
      background
    }
  }

  if (layout === 'vertical') {
    const targetW = Math.min(...safeSizes.map((s) => s.width))
    const items: StitchPlanItem[] = []
    let top = 0
    for (let i = 0; i < n; i++) {
      const s = safeSizes[i]
      const h = Math.max(1, Math.round((s.height * targetW) / s.width))
      items.push({
        path: paths[i],
        left: 0,
        top,
        width: targetW,
        height: h
      })
      top += h + (i < n - 1 ? gap : 0)
    }
    return {
      canvasWidth: targetW,
      canvasHeight: top,
      items,
      background
    }
  }

  // grid：统一 cell = min 宽 × min 高，contain 缩放后居中
  const colsRaw = Number(options.gridCols)
  const cols = Math.max(
    1,
    Number.isFinite(colsRaw) && colsRaw > 0 ? Math.floor(colsRaw) : 2
  )
  const cellW = Math.min(...safeSizes.map((s) => s.width))
  const cellH = Math.min(...safeSizes.map((s) => s.height))
  const rows = Math.ceil(n / cols)
  const items: StitchPlanItem[] = []
  for (let i = 0; i < n; i++) {
    const s = safeSizes[i]
    const scale = Math.min(cellW / s.width, cellH / s.height)
    const w = Math.max(1, Math.round(s.width * scale))
    const h = Math.max(1, Math.round(s.height * scale))
    const col = i % cols
    const row = Math.floor(i / cols)
    const cellLeft = col * (cellW + gap)
    const cellTop = row * (cellH + gap)
    items.push({
      path: paths[i],
      left: cellLeft + Math.floor((cellW - w) / 2),
      top: cellTop + Math.floor((cellH - h) / 2),
      width: w,
      height: h
    })
  }
  const canvasWidth = cols * cellW + Math.max(0, cols - 1) * gap
  const canvasHeight = rows * cellH + Math.max(0, rows - 1) * gap
  return { canvasWidth, canvasHeight, items, background }
}

/** 将命令与参数拼成可展示的命令行（仅调试/展示用） */
export function formatMagickCommandLine(
  magickPath: string,
  args: string[]
): string {
  const quote = (s: string): string => {
    if (!/[\s"]/.test(s)) return s
    return `"${s.replace(/"/g, '\\"')}"`
  }
  return [magickPath, ...args].map(quote).join(' ')
}
