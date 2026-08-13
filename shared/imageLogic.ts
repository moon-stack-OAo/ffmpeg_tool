import type { ImageProcessOptions } from './types'

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
 * 示例：input -auto-orient -resize 1280x1280> -quality 80 -strip output
 */
export function buildMagickArgs(options: ImageProcessOptions): string[] {
  const input = options.inputPath
  const output = options.outputPath
  const maxEdge = normalizeMaxEdge(options.maxEdge)
  const strip = options.strip !== false
  const format = options.format || 'keep'
  const quality = normalizeImageQuality(options.quality, 80)

  const args: string[] = [input, '-auto-orient']

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
