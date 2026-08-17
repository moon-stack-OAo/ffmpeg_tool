import { describe, expect, it } from 'vitest'
import {
  buildStillImageVf,
  DEFAULT_COMPOSE_DURATION_SEC,
  isComposeActive,
  normalizeComposeDurationSec,
  normalizeMediaCompose,
  overlayToWatermarkOptions,
  validateComposeOptions
} from '../shared/composeLogic'

describe('composeLogic', () => {
  it('normalizeComposeDurationSec 默认与边界', () => {
    expect(normalizeComposeDurationSec(undefined)).toBe(DEFAULT_COMPOSE_DURATION_SEC)
    expect(normalizeComposeDurationSec(0)).toBe(DEFAULT_COMPOSE_DURATION_SEC)
    expect(normalizeComposeDurationSec(-1)).toBe(DEFAULT_COMPOSE_DURATION_SEC)
    expect(normalizeComposeDurationSec(NaN)).toBe(DEFAULT_COMPOSE_DURATION_SEC)
    expect(normalizeComposeDurationSec(2.5)).toBe(2.5)
    expect(normalizeComposeDurationSec(5)).toBe(5)
  })

  it('isComposeActive 至少一项', () => {
    expect(isComposeActive(undefined)).toBe(false)
    expect(isComposeActive({})).toBe(false)
    expect(isComposeActive({ intro: { imagePath: '', durationSec: 3 } })).toBe(
      false
    )
    expect(
      isComposeActive({ intro: { imagePath: 'a.png', durationSec: 3 } })
    ).toBe(true)
    expect(
      isComposeActive({ outro: { imagePath: 'b.png', durationSec: 2 } })
    ).toBe(true)
    expect(
      isComposeActive({ overlay: { imagePath: 'c.png' } })
    ).toBe(true)
  })

  it('validateComposeOptions', () => {
    expect(validateComposeOptions(undefined)).toBe(
      '请设置片头、片尾或叠加图'
    )
    expect(
      validateComposeOptions({ intro: { imagePath: 'a.png', durationSec: 3 } })
    ).toBeNull()
    expect(
      validateComposeOptions({
        intro: { imagePath: 'a.png', durationSec: 0 }
      })
    ).toBe('片头时长须大于 0')
    expect(
      validateComposeOptions({
        overlay: { imagePath: 'o.png', startSec: 5, endSec: 3 }
      })
    ).toBe('叠加图结束时间须大于开始时间')
  })

  it('buildStillImageVf fit / stretch', () => {
    const fit = buildStillImageVf(1920, 1080, true)
    expect(fit).toContain('force_original_aspect_ratio=decrease')
    expect(fit).toContain('pad=1920:1080')
    expect(fit).toContain('fps=30')
    const stretch = buildStillImageVf(640, 360, false)
    expect(stretch).toContain('scale=640:360')
    expect(stretch).not.toContain('force_original_aspect_ratio')
  })

  it('overlayToWatermarkOptions 默认值', () => {
    const wm = overlayToWatermarkOptions({ imagePath: 'logo.png' })
    expect(wm.mode).toBe('image')
    expect(wm.imagePath).toBe('logo.png')
    expect(wm.position).toBe('br')
    expect(wm.opacity).toBe(0.8)
    expect(wm.scalePercent).toBe(15)
  })

  it('normalizeMediaCompose 补默认时长', () => {
    const n = normalizeMediaCompose({
      intro: { imagePath: '  a.png  ', durationSec: 0 },
      overlay: { imagePath: 'o.png', position: 'tl' }
    })
    expect(n?.intro?.imagePath).toBe('a.png')
    expect(n?.intro?.durationSec).toBe(DEFAULT_COMPOSE_DURATION_SEC)
    expect(n?.overlay?.position).toBe('tl')
    expect(normalizeMediaCompose({})).toBeUndefined()
  })
})
