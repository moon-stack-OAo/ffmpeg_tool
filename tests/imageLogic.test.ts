import { describe, expect, it } from 'vitest'
import {
  buildMagickArgs,
  formatMagickCommandLine,
  normalizeImageQuality,
  normalizeMaxEdge,
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
