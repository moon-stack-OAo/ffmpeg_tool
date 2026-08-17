import { describe, expect, it } from 'vitest'
import {
  buildMagickArgs,
  formatMagickCommandLine,
  normalizeCrop,
  normalizeImageQuality,
  normalizeMaxEdge,
  planImageStitch,
  resolveMagickCandidate
} from '../shared/imageLogic'
import type { ImageProcessOptions } from '../shared/types'

function base(partial: Partial<ImageProcessOptions> = {}): ImageProcessOptions {
  return {
    inputPath: 'D:\\in\\photo.jpg',
    outputPath: 'D:\\out\\photo.jpg',
    ...partial
  }
}

describe('normalizeImageQuality', () => {
  it('夹紧到 1–100', () => {
    expect(normalizeImageQuality(0)).toBe(1)
    expect(normalizeImageQuality(101)).toBe(100)
    expect(normalizeImageQuality(80)).toBe(80)
    expect(normalizeImageQuality(undefined)).toBe(80)
  })
})

describe('normalizeMaxEdge', () => {
  it('非法或 <=0 为 0', () => {
    expect(normalizeMaxEdge(0)).toBe(0)
    expect(normalizeMaxEdge(-1)).toBe(0)
    expect(normalizeMaxEdge(undefined)).toBe(0)
    expect(normalizeMaxEdge(1280)).toBe(1280)
  })
})

describe('resolveMagickCandidate', () => {
  it('空串返回 null', () => {
    expect(resolveMagickCandidate('')).toBeNull()
    expect(resolveMagickCandidate('   ')).toBeNull()
  })

  it('文件路径原样返回', () => {
    expect(resolveMagickCandidate('C:\\IM\\magick.exe', 'win32')).toBe(
      'C:\\IM\\magick.exe'
    )
    expect(resolveMagickCandidate('/usr/bin/magick', 'linux')).toBe(
      '/usr/bin/magick'
    )
  })

  it('目录拼接 magick 可执行名', () => {
    expect(resolveMagickCandidate('C:\\ImageMagick', 'win32')).toBe(
      'C:\\ImageMagick\\magick.exe'
    )
    expect(resolveMagickCandidate('/opt/imagemagick', 'linux')).toBe(
      '/opt/imagemagick/magick'
    )
  })
})

describe('buildMagickArgs', () => {
  it('基础：auto-orient + strip', () => {
    const args = buildMagickArgs(base())
    expect(args[0]).toBe('D:\\in\\photo.jpg')
    expect(args).toContain('-auto-orient')
    expect(args).toContain('-strip')
    expect(args[args.length - 1]).toBe('D:\\out\\photo.jpg')
  })

  it('maxEdge 生成仅缩小 resize', () => {
    const args = buildMagickArgs(base({ maxEdge: 1280 }))
    expect(args).toContain('-resize')
    expect(args).toContain('1280x1280>')
  })

  it('jpeg quality', () => {
    const args = buildMagickArgs(
      base({ format: 'jpeg', quality: 75, maxEdge: 0 })
    )
    expect(args).toContain('-quality')
    expect(args).toContain('75')
  })

  it('strip=false 时不含 -strip', () => {
    const args = buildMagickArgs(base({ strip: false }))
    expect(args).not.toContain('-strip')
  })

  it('含 crop：-crop WxH+X+Y 与 +repage，且在 resize 前', () => {
    const args = buildMagickArgs(
      base({ crop: { x: 10, y: 20, w: 100, h: 80 }, maxEdge: 640 })
    )
    const cropIdx = args.indexOf('-crop')
    const resizeIdx = args.indexOf('-resize')
    expect(cropIdx).toBeGreaterThanOrEqual(0)
    expect(args[cropIdx + 1]).toBe('100x80+10+20')
    expect(args).toContain('+repage')
    expect(resizeIdx).toBeGreaterThan(cropIdx)
  })
})

describe('normalizeCrop', () => {
  it('有效裁切取整', () => {
    expect(normalizeCrop({ x: 1.2, y: 3.7, w: 10.1, h: 20.9 })).toEqual({
      x: 1,
      y: 4,
      w: 10,
      h: 21
    })
  })

  it('非法返回 null', () => {
    expect(normalizeCrop(null)).toBeNull()
    expect(normalizeCrop(undefined)).toBeNull()
    expect(normalizeCrop({ x: -1, y: 0, w: 10, h: 10 })).toBeNull()
    expect(normalizeCrop({ x: 0, y: 0, w: 0, h: 10 })).toBeNull()
    expect(normalizeCrop({ x: 0, y: 0, w: 10, h: -1 })).toBeNull()
    expect(
      normalizeCrop({ x: NaN, y: 0, w: 10, h: 10 })
    ).toBeNull()
  })
})

describe('planImageStitch', () => {
  const paths = ['a.jpg', 'b.jpg', 'c.jpg']
  const sizes = [
    { width: 200, height: 100 },
    { width: 100, height: 50 },
    { width: 300, height: 150 }
  ]

  it('horizontal：统一高度 min(heights)，gap 分隔', () => {
    const plan = planImageStitch(paths, sizes, {
      layout: 'horizontal',
      gap: 10,
      background: '#ffffff'
    })
    expect(plan.background).toBe('#ffffff')
    expect(plan.canvasHeight).toBe(50)
    // 等比：200/100*50=100, 100/50*50=100, 300/150*50=100；gap*2=20
    expect(plan.items).toHaveLength(3)
    expect(plan.items[0]).toMatchObject({ left: 0, top: 0, width: 100, height: 50 })
    expect(plan.items[1]).toMatchObject({ left: 110, top: 0, width: 100, height: 50 })
    expect(plan.items[2]).toMatchObject({ left: 220, top: 0, width: 100, height: 50 })
    expect(plan.canvasWidth).toBe(320)
  })

  it('vertical：统一宽度 min(widths)', () => {
    const plan = planImageStitch(paths.slice(0, 2), sizes.slice(0, 2), {
      layout: 'vertical',
      gap: 5
    })
    expect(plan.canvasWidth).toBe(100)
    // 200/100*100=100 高；100/50*100 wait width min=100: first 200x100 → h=50; second 100x50 → h=50
    expect(plan.items[0]).toMatchObject({ left: 0, top: 0, width: 100, height: 50 })
    expect(plan.items[1]).toMatchObject({ left: 0, top: 55, width: 100, height: 50 })
    expect(plan.canvasHeight).toBe(105)
  })

  it('grid：cell=min 宽高，按 gridCols 排列', () => {
    const plan = planImageStitch(paths, sizes, {
      layout: 'grid',
      gridCols: 2,
      gap: 0
    })
    // min w=100, min h=50
    expect(plan.canvasWidth).toBe(200)
    expect(plan.canvasHeight).toBe(100)
    expect(plan.items).toHaveLength(3)
    expect(plan.items[0].width).toBeLessThanOrEqual(100)
    expect(plan.items[0].height).toBeLessThanOrEqual(50)
  })

  it('空输入返回零画布', () => {
    const plan = planImageStitch([], [], {})
    expect(plan.canvasWidth).toBe(0)
    expect(plan.canvasHeight).toBe(0)
    expect(plan.items).toEqual([])
    expect(plan.background).toBe('#000000')
  })
})

describe('formatMagickCommandLine', () => {
  it('含空格路径加引号', () => {
    const line = formatMagickCommandLine('C:\\Program Files\\magick.exe', [
      'a b.jpg',
      '-strip',
      'out.jpg'
    ])
    expect(line).toContain('"C:\\Program Files\\magick.exe"')
    expect(line).toContain('"a b.jpg"')
  })
})
