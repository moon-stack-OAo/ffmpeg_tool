import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildAudioExtractArgs,
  buildCompressArgs,
  buildCompressArgsPass,
  buildOutputPath,
  buildSeekArgs,
  buildWatermarkOverlayExpr,
  effectiveDuration,
  escapeDrawtext,
  escapeFilterPath,
  estimateEtaSec,
  estimateVideoBitrateKbps,
  nullOutputPath,
  parseProgressLine,
  parseSpeedMultiplier,
  planVideoFilters,
  resolveAudioEncoder,
  resolveVideoEncoder,
  shouldUseTwoPass,
  suggestUniqueOutputPath,
  supportsTwoPass
} from '../shared/ffmpegLogic'
import type { CompressOptions, EncoderDetectResult } from '../shared/types'
import { formatFileSize, formatSaveRatio } from '../shared/types'

function baseOptions(partial: Partial<CompressOptions> = {}): CompressOptions {
  return {
    presetId: 'standard',
    crf: 23,
    maxEdge: 0,
    format: 'mp4',
    outputDir: 'D:\\out',
    encoder: 'auto',
    ...partial
  }
}

describe('buildCompressArgs', () => {
  it('libx264 关键参数', () => {
    const args = buildCompressArgs(baseOptions({ crf: 23 }), 'libx264')
    expect(args).toContain('-c:v')
    expect(args).toContain('libx264')
    expect(args).toContain('-preset')
    expect(args).toContain('medium')
    expect(args).toContain('-crf')
    expect(args).toContain('23')
    expect(args).toContain('aac')
    expect(args).toContain('-movflags')
    expect(args).toContain('+faststart')
    expect(args).toContain('-f')
    expect(args).toContain('mp4')
  })

  it('nvenc 关键参数', () => {
    const args = buildCompressArgs(baseOptions({ crf: 28 }), 'h264_nvenc')
    expect(args).toContain('h264_nvenc')
    expect(args).toContain('-preset')
    expect(args).toContain('p4')
    expect(args).toContain('-rc')
    expect(args).toContain('vbr')
    expect(args).toContain('-cq')
    expect(args).toContain('28')
    expect(args).toContain('-b:v')
    expect(args).toContain('0')
  })

  it('qsv 关键参数', () => {
    const args = buildCompressArgs(baseOptions({ crf: 22 }), 'h264_qsv')
    expect(args).toContain('h264_qsv')
    expect(args).toContain('-global_quality')
    expect(args).toContain('22')
    expect(args).toContain('-look_ahead')
    expect(args).toContain('1')
  })

  it('amf 关键参数', () => {
    const args = buildCompressArgs(baseOptions({ crf: 25 }), 'h264_amf')
    expect(args).toContain('h264_amf')
    expect(args).toContain('-rc')
    expect(args).toContain('cqp')
    expect(args).toContain('-qp_i')
    expect(args).toContain('25')
    expect(args).toContain('-qp_p')
    expect(args).toContain('-quality')
    expect(args).toContain('balanced')
  })

  it('vp9 / webm 关键参数', () => {
    const args = buildCompressArgs(
      baseOptions({ format: 'webm', crf: 30 }),
      'libvpx-vp9'
    )
    expect(args).toContain('libvpx-vp9')
    expect(args).toContain('-b:v')
    expect(args).toContain('0')
    expect(args).toContain('-crf')
    expect(args).toContain('30')
    expect(args).toContain('-deadline')
    expect(args).toContain('good')
    expect(args).toContain('libopus')
    expect(args).toContain('-f')
    expect(args).toContain('webm')
  })

  it('maxEdge>0 时包含 scale 滤镜', () => {
    const args = buildCompressArgs(baseOptions({ maxEdge: 1280 }), 'libx264')
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toContain("scale='min(1280,iw)'")
  })

  it('rotate90=cw 时包含 transpose=1', () => {
    const args = buildCompressArgs(baseOptions({ rotate90: 'cw' }), 'libx264')
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toBe('transpose=1')
  })

  it('rotate90=ccw 时包含 transpose=2', () => {
    const args = buildCompressArgs(baseOptions({ rotate90: 'ccw' }), 'libx264')
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toBe('transpose=2')
  })

  it('rotate90=180 时包含 hflip,vflip', () => {
    const args = buildCompressArgs(baseOptions({ rotate90: '180' }), 'libx264')
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toBe('hflip,vflip')
  })

  it('旋转 + 缩放：先 transpose 再 scale', () => {
    const args = buildCompressArgs(
      baseOptions({ rotate90: 'cw', maxEdge: 1280 }),
      'libx264'
    )
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toBe(
      "transpose=1,scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease"
    )
  })

  it('targetSizeMb + duration 使用 -b:v ABR（libx264）', () => {
    const args = buildCompressArgs(
      baseOptions({ targetSizeMb: 10, crf: 23 }),
      'libx264',
      { durationSec: 100 }
    )
    expect(args).toContain('-b:v')
    expect(args).toContain('-maxrate')
    expect(args).toContain('-bufsize')
    expect(args).not.toContain('-crf')
    const bvIdx = args.indexOf('-b:v')
    expect(args[bvIdx + 1]).toMatch(/^\d+k$/)
  })

  it('targetSizeMb 无 duration 回退 CRF', () => {
    const notes: string[] = []
    const args = buildCompressArgs(
      baseOptions({ targetSizeMb: 10 }),
      'libx264',
      { durationSec: 0, notes }
    )
    expect(args).toContain('-crf')
    expect(notes.some((n) => /回退/.test(n))).toBe(true)
  })

  it('nvenc ABR 模式', () => {
    const args = buildCompressArgs(
      baseOptions({ targetSizeMb: 5 }),
      'h264_nvenc',
      { durationSec: 60 }
    )
    expect(args).toContain('h264_nvenc')
    expect(args).toContain('-b:v')
    expect(args).toContain('vbr')
    expect(args).not.toContain('-cq')
  })

  it('videotoolbox 质量模式含 -q:v', () => {
    const args = buildCompressArgs(baseOptions({ crf: 23 }), 'h264_videotoolbox')
    expect(args).toContain('h264_videotoolbox')
    expect(args).toContain('-q:v')
    expect(args).toContain('-allow_sw')
  })

  it('videotoolbox ABR 模式', () => {
    const args = buildCompressArgs(
      baseOptions({ targetSizeMb: 8 }),
      'h264_videotoolbox',
      { durationSec: 120 }
    )
    expect(args).toContain('-b:v')
    expect(args).not.toContain('-q:v')
  })

  it('pass1 含 -pass 1 -an 与 -b:v（libx264）', () => {
    const args = buildCompressArgsPass(
      baseOptions({ targetSizeMb: 10, twoPass: true }),
      'libx264',
      1,
      { durationSec: 100, passLogFile: '/tmp/ffmpeg-pass-test' }
    )
    expect(args).toContain('-pass')
    expect(args).toContain('1')
    expect(args).toContain('-passlogfile')
    expect(args).toContain('/tmp/ffmpeg-pass-test')
    expect(args).toContain('-an')
    expect(args).toContain('-b:v')
    expect(args).not.toContain('-c:a')
    expect(args).toContain('-f')
    expect(args).toContain('null')
  })

  it('pass2 含 -pass 2 与 -b:v 及音频（libx264）', () => {
    const args = buildCompressArgsPass(
      baseOptions({ targetSizeMb: 10, twoPass: true }),
      'libx264',
      2,
      { durationSec: 100, passLogFile: '/tmp/ffmpeg-pass-test' }
    )
    expect(args).toContain('-pass')
    expect(args).toContain('2')
    expect(args).toContain('-passlogfile')
    expect(args).toContain('-b:v')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
    expect(args).not.toContain('-an')
    expect(args).toContain('mp4')
  })

  it('vp9 pass1 含 -pass 1 -an', () => {
    const args = buildCompressArgsPass(
      baseOptions({ targetSizeMb: 5, format: 'webm', twoPass: true }),
      'libvpx-vp9',
      1,
      { durationSec: 60, passLogFile: 'D:\\tmp\\pass' }
    )
    expect(args).toContain('libvpx-vp9')
    expect(args).toContain('-pass')
    expect(args).toContain('1')
    expect(args).toContain('-an')
    expect(args).toContain('null')
  })

  it('muteAudio=true 时含 -an，不含 aac / libopus', () => {
    const x264 = buildCompressArgs(baseOptions({ muteAudio: true }), 'libx264')
    expect(x264).toContain('-an')
    expect(x264).not.toContain('aac')
    expect(x264).not.toContain('libopus')
    expect(x264).not.toContain('-c:a')

    const vp9 = buildCompressArgs(
      baseOptions({ muteAudio: true, format: 'webm' }),
      'libvpx-vp9'
    )
    expect(vp9).toContain('-an')
    expect(vp9).not.toContain('aac')
    expect(vp9).not.toContain('libopus')
    expect(vp9).not.toContain('-c:a')
  })

  it('muteAudio 未设时仍有音频编码器', () => {
    const x264 = buildCompressArgs(baseOptions(), 'libx264')
    expect(x264).toContain('aac')
    expect(x264).not.toContain('-an')

    const vp9 = buildCompressArgs(baseOptions({ format: 'webm' }), 'libvpx-vp9')
    expect(vp9).toContain('libopus')
    expect(vp9).not.toContain('-an')
  })

  it('main-l4 + libx264 含 profile/level/pix_fmt', () => {
    const args = buildCompressArgs(
      baseOptions({ compatProfile: 'main-l4' }),
      'libx264'
    )
    expect(args).toContain('-profile:v')
    expect(args).toContain('main')
    expect(args).toContain('-level')
    expect(args).toContain('4.0')
    expect(args).toContain('-pix_fmt')
    expect(args).toContain('yuv420p')
  })

  it('high + libx264 含 profile high 与 pix_fmt，不含 level', () => {
    const args = buildCompressArgs(
      baseOptions({ compatProfile: 'high' }),
      'libx264'
    )
    expect(args).toContain('-profile:v')
    expect(args).toContain('high')
    expect(args).toContain('-pix_fmt')
    expect(args).toContain('yuv420p')
    expect(args).not.toContain('-level')
  })

  it('auto 不含 -profile:v', () => {
    const args = buildCompressArgs(
      baseOptions({ compatProfile: 'auto' }),
      'libx264'
    )
    expect(args).not.toContain('-profile:v')
    const unset = buildCompressArgs(baseOptions(), 'libx264')
    expect(unset).not.toContain('-profile:v')
  })

  it('webm + main-l4 不含 -profile:v', () => {
    const args = buildCompressArgs(
      baseOptions({ format: 'webm', compatProfile: 'main-l4' }),
      'libvpx-vp9'
    )
    expect(args).not.toContain('-profile:v')
  })

  it("videoAudioBitrate='192k' + libx264：-b:a 后为 192k，编码器 aac", () => {
    const args = buildCompressArgs(
      baseOptions({ videoAudioBitrate: '192k' }),
      'libx264'
    )
    expect(args).toContain('aac')
    const baIdx = args.indexOf('-b:a')
    expect(baIdx).toBeGreaterThanOrEqual(0)
    expect(args[baIdx + 1]).toBe('192k')
  })

  it('videoAudioBitrate 未设时仍为 128k', () => {
    const args = buildCompressArgs(baseOptions(), 'libx264')
    const baIdx = args.indexOf('-b:a')
    expect(baIdx).toBeGreaterThanOrEqual(0)
    expect(args[baIdx + 1]).toBe('128k')
  })

  it("fps='30'：-vf 含 fps=30", () => {
    const args = buildCompressArgs(baseOptions({ fps: '30' }), 'libx264')
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toBe('fps=30')
  })

  it('rotate + scale + fps：transpose=1,scale=...,fps=30', () => {
    const args = buildCompressArgs(
      baseOptions({ rotate90: 'cw', maxEdge: 1280, fps: '30' }),
      'libx264'
    )
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toBe(
      "transpose=1,scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease,fps=30"
    )
  })

  it("encodePreset='slow' + libx264：-preset slow", () => {
    const args = buildCompressArgs(
      baseOptions({ encodePreset: 'slow' }),
      'libx264'
    )
    const presetIdx = args.indexOf('-preset')
    expect(presetIdx).toBeGreaterThanOrEqual(0)
    expect(args[presetIdx + 1]).toBe('slow')
  })

  it("encodePreset='slow' + h264_nvenc：仍是 -preset p4", () => {
    const args = buildCompressArgs(
      baseOptions({ encodePreset: 'slow' }),
      'h264_nvenc'
    )
    const presetIdx = args.indexOf('-preset')
    expect(presetIdx).toBeGreaterThanOrEqual(0)
    expect(args[presetIdx + 1]).toBe('p4')
    expect(args).not.toContain('slow')
  })

  it('默认 libx264 仍是 -preset medium', () => {
    const args = buildCompressArgs(baseOptions(), 'libx264')
    const presetIdx = args.indexOf('-preset')
    expect(presetIdx).toBeGreaterThanOrEqual(0)
    expect(args[presetIdx + 1]).toBe('medium')
  })

  it('无水印时与旧行为一致（无 -filter_complex）', () => {
    const args = buildCompressArgs(baseOptions({ maxEdge: 1280 }), 'libx264')
    expect(args).toContain('-vf')
    expect(args).not.toContain('-filter_complex')
    expect(args).not.toContain('-map')
  })

  it('文字水印：args 含 drawtext', () => {
    const args = buildCompressArgs(
      baseOptions({
        watermark: {
          mode: 'text',
          text: 'Hello',
          position: 'br',
          opacity: 0.8,
          fontSize: 24
        }
      }),
      'libx264'
    )
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toContain('drawtext=')
    expect(args[vfIdx + 1]).toContain("text='Hello'")
    expect(args).not.toContain('-filter_complex')
  })

  it('图片水印：含 filter_complex 与 map，无 -vf', () => {
    const filterPlanOut: { extraInputs?: string[]; filterComplex?: string } = {}
    const args = buildCompressArgs(
      baseOptions({
        watermark: {
          mode: 'image',
          imagePath: 'D:\\logo\\mark.png',
          position: 'br',
          opacity: 0.7,
          scalePercent: 20
        }
      }),
      'libx264',
      { filterPlanOut }
    )
    expect(args).toContain('-filter_complex')
    expect(args).toContain('-map')
    expect(args).toContain('[vout]')
    expect(args).toContain('0:a?')
    expect(args).not.toContain('-vf')
    expect(filterPlanOut.extraInputs).toEqual(['D:\\logo\\mark.png'])
    expect(filterPlanOut.filterComplex).toContain('overlay=')
    expect(filterPlanOut.filterComplex).toContain('colorchannelmixer=aa=0.7')
  })

  it('图片水印 + mute：map 视频不 map 音频', () => {
    const args = buildCompressArgs(
      baseOptions({
        muteAudio: true,
        watermark: {
          mode: 'image',
          imagePath: 'C:/wm.png',
          position: 'tl'
        }
      }),
      'libx264'
    )
    expect(args).toContain('-filter_complex')
    expect(args).toContain('[vout]')
    expect(args).toContain('-an')
    expect(args).not.toContain('0:a?')
  })

  it('mode=audio 时忽略水印（buildCompressArgs 不走视频滤镜）', () => {
    // 音频模式不调用 buildCompressArgs 做视频；plan 应无水印
    const plan = planVideoFilters(
      baseOptions({
        mode: 'audio',
        watermark: { mode: 'text', text: 'x' }
      })
    )
    expect(plan.vf).toBeUndefined()
    expect(plan.filterComplex).toBeUndefined()
  })

  it('rotate + scale + fps + 文字水印顺序', () => {
    const args = buildCompressArgs(
      baseOptions({
        rotate90: 'cw',
        maxEdge: 1280,
        fps: '30',
        watermark: { mode: 'text', text: 'WM', position: 'tl' }
      }),
      'libx264'
    )
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf.startsWith('transpose=1,scale=')).toBe(true)
    expect(vf).toContain(',fps=30,drawtext=')
  })
})

describe('watermark helpers', () => {
  it('escapeDrawtext 转义特殊字符', () => {
    expect(escapeDrawtext(`a:b'c%d\\e`)).toBe(`a\\:b\\'c\\%d\\\\e`)
  })

  it('escapeFilterPath Windows 路径', () => {
    expect(escapeFilterPath('C:\\Fonts\\msyh.ttc')).toBe('C\\:/Fonts/msyh.ttc')
  })

  it('buildWatermarkOverlayExpr 九宫格', () => {
    expect(buildWatermarkOverlayExpr('tl', 10, 20)).toEqual({ x: '10', y: '20' })
    expect(buildWatermarkOverlayExpr('br', 16, 16)).toEqual({
      x: 'W-w-16',
      y: 'H-h-16'
    })
    expect(buildWatermarkOverlayExpr('mc', 0, 0)).toEqual({
      x: '(W-w)/2',
      y: '(H-h)/2'
    })
  })

  it('planVideoFilters 图片含 extraInputs', () => {
    const plan = planVideoFilters(
      baseOptions({
        watermark: {
          mode: 'image',
          imagePath: '/tmp/a.png',
          scalePercent: 15
        }
      })
    )
    expect(plan.extraInputs).toEqual(['/tmp/a.png'])
    expect(plan.mapVideoLabel).toBe('[vout]')
    expect(plan.filterComplex).toContain('[1:v]')
    expect(plan.filterComplex).toContain('overlay=')
  })

  it('planVideoFilters 文字可带 fontfile', () => {
    const plan = planVideoFilters(
      baseOptions({
        watermark: { mode: 'text', text: '测', startSec: 1, endSec: 5 }
      }),
      { fontfile: 'C:\\Windows\\Fonts\\msyh.ttc' }
    )
    expect(plan.vf).toContain('drawtext=')
    expect(plan.vf).toContain("fontfile='C\\:/Windows/Fonts/msyh.ttc'")
    expect(plan.vf).toContain("enable='between(t\\,1\\,5)'")
  })
})

describe('supportsTwoPass / shouldUseTwoPass', () => {
  it('supportsTwoPass 仅 x264/vp9', () => {
    expect(supportsTwoPass('libx264')).toBe(true)
    expect(supportsTwoPass('libvpx-vp9')).toBe(true)
    expect(supportsTwoPass('h264_nvenc')).toBe(false)
    expect(supportsTwoPass('h264_qsv')).toBe(false)
    expect(supportsTwoPass('h264_amf')).toBe(false)
    expect(supportsTwoPass('h264_videotoolbox')).toBe(false)
  })

  it('shouldUseTwoPass：目标体积 + 默认 twoPass + 软件', () => {
    expect(
      shouldUseTwoPass(baseOptions({ targetSizeMb: 10 }), 'libx264')
    ).toBe(true)
    expect(
      shouldUseTwoPass(baseOptions({ targetSizeMb: 10, twoPass: true }), 'libx264')
    ).toBe(true)
  })

  it('shouldUseTwoPass：twoPass=false 关闭', () => {
    expect(
      shouldUseTwoPass(baseOptions({ targetSizeMb: 10, twoPass: false }), 'libx264')
    ).toBe(false)
  })

  it('shouldUseTwoPass：无目标体积 / 硬件 / 音频模式', () => {
    expect(shouldUseTwoPass(baseOptions({ targetSizeMb: 0 }), 'libx264')).toBe(
      false
    )
    expect(
      shouldUseTwoPass(baseOptions({ targetSizeMb: 10 }), 'h264_nvenc')
    ).toBe(false)
    expect(
      shouldUseTwoPass(
        baseOptions({ targetSizeMb: 10, mode: 'audio' }),
        'libx264'
      )
    ).toBe(false)
  })

  it('nullOutputPath 按平台', () => {
    expect(nullOutputPath('win32')).toBe('NUL')
    expect(nullOutputPath('darwin')).toBe('/dev/null')
    expect(nullOutputPath('linux')).toBe('/dev/null')
  })
})

describe('estimateVideoBitrateKbps', () => {
  it('按目标体积估算', () => {
    // 10MB / 100s → total ≈ 819.2 kbps - 128 = 691
    const kbps = estimateVideoBitrateKbps(10, 100, 128)
    expect(kbps).toBe(Math.floor((10 * 1024 * 1024 * 8) / 100 / 1000 - 128))
    expect(kbps).toBeGreaterThanOrEqual(200)
  })

  it('过小目标时下限 200', () => {
    expect(estimateVideoBitrateKbps(0.1, 1000, 128)).toBe(200)
  })
})

describe('parseSpeedMultiplier / estimateEtaSec', () => {
  it('parseSpeedMultiplier', () => {
    expect(parseSpeedMultiplier('1.5x')).toBe(1.5)
    expect(parseSpeedMultiplier('2.0')).toBe(2)
    expect(parseSpeedMultiplier('N/A')).toBeNull()
  })

  it('eta 优先 speed', () => {
    const eta = estimateEtaSec({
      percent: 50,
      elapsedSec: 10,
      speed: '2x',
      durationSec: 100,
      currentMediaSec: 50
    })
    expect(eta).toBe(25) // remain 50 / 2
  })

  it('eta 无 speed 时用 percent', () => {
    const eta = estimateEtaSec({
      percent: 25,
      elapsedSec: 10
    })
    // 10 * 75 / 25 = 30
    expect(eta).toBe(30)
  })
})

describe('resolveVideoEncoder', () => {
  const detectAll: EncoderDetectResult = {
    nvenc: true,
    qsv: true,
    amf: true,
    videotoolbox: true,
    preferred: 'h264_nvenc'
  }

  it('webm → vp9', () => {
    const r = resolveVideoEncoder(baseOptions({ format: 'webm', encoder: 'nvenc' }), detectAll)
    expect(r.encoder).toBe('libvpx-vp9')
  })

  it('software → x264', () => {
    const r = resolveVideoEncoder(baseOptions({ encoder: 'software' }), detectAll)
    expect(r.encoder).toBe('libx264')
  })

  it('auto 优先 nvenc（非 darwin）', () => {
    const r = resolveVideoEncoder(
      baseOptions({ encoder: 'auto' }),
      detectAll,
      'win32'
    )
    expect(r.encoder).toBe('h264_nvenc')
  })

  it('auto 在 darwin 优先 videotoolbox', () => {
    const r = resolveVideoEncoder(
      baseOptions({ encoder: 'auto' }),
      detectAll,
      'darwin'
    )
    expect(r.encoder).toBe('h264_videotoolbox')
  })

  it('auto 无硬件时回退 x264', () => {
    const r = resolveVideoEncoder(baseOptions({ encoder: 'auto' }), {
      nvenc: false,
      qsv: false,
      amf: false,
      videotoolbox: false,
      preferred: 'libx264'
    })
    expect(r.encoder).toBe('libx264')
  })

  it('指定 nvenc 但未检测到时抛错', () => {
    expect(() =>
      resolveVideoEncoder(baseOptions({ encoder: 'nvenc' }), {
        nvenc: false,
        qsv: false,
        amf: false,
        preferred: 'libx264'
      })
    ).toThrow(/NVENC/)
  })

  it('指定 videotoolbox', () => {
    const r = resolveVideoEncoder(
      baseOptions({ encoder: 'videotoolbox' }),
      detectAll
    )
    expect(r.encoder).toBe('h264_videotoolbox')
  })
})

describe('parseProgressLine', () => {
  it('解析 time/speed/percent', () => {
    const line =
      'frame=  123 fps= 30 q=28.0 size=    1024kB time=00:00:50.00 bitrate= 100.0kbits/s speed=1.2x'
    const p = parseProgressLine(line, 100)
    expect(p).not.toBeNull()
    expect(p!.time).toBe('00:00:50.00')
    expect(p!.speed).toBe('1.2x')
    expect(p!.fps).toBe('30')
    expect(p!.percent).toBe(50)
  })

  it('无 time= 返回 null', () => {
    expect(parseProgressLine('frame=1 fps=30', 100)).toBeNull()
  })
})

describe('formatFileSize / formatSaveRatio', () => {
  it('formatFileSize', () => {
    expect(formatFileSize(null)).toBe('—')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB')
  })

  it('formatSaveRatio', () => {
    expect(formatSaveRatio(1000, 350)).toBe('-65.0%')
    expect(formatSaveRatio(1000, 1200)).toBe('+20.0%')
    expect(formatSaveRatio(0, 100)).toBeNull()
  })
})

describe('buildOutputPath / suggestUniqueOutputPath', () => {
  it('默认命名 *_compressed.ext', () => {
    const out = buildOutputPath(
      path.join('D:', 'videos', 'demo.mp4'),
      baseOptions({ format: 'mp4', outputDir: path.join('D:', 'out') })
    )
    expect(path.basename(out)).toBe('demo_compressed.mp4')
    expect(path.dirname(out)).toBe(path.join('D:', 'out'))
  })

  it('webm 扩展名跟随 format', () => {
    const out = buildOutputPath(
      path.join('D:', 'a', 'clip.mkv'),
      baseOptions({ format: 'webm', outputDir: path.join('D:', 'out') })
    )
    expect(out.endsWith('clip_compressed.webm')).toBe(true)
  })

  it('模板 {name}_{preset}', () => {
    const out = buildOutputPath(
      path.join('D:', 'videos', 'demo.mp4'),
      baseOptions({
        format: 'mp4',
        presetId: 'standard',
        nameTemplate: '{name}_{preset}',
        outputDir: path.join('D:', 'out')
      })
    )
    expect(path.basename(out)).toBe('demo_standard.mp4')
  })

  it('模板 {name}_{date} 使用注入时钟', () => {
    const fixed = new Date(2026, 7, 10, 14, 30, 45) // 2026-08-10
    const out = buildOutputPath(
      path.join('D:', 'videos', 'demo.mp4'),
      baseOptions({
        format: 'mp4',
        nameTemplate: '{name}_{date}',
        outputDir: path.join('D:', 'out')
      }),
      fixed
    )
    expect(path.basename(out)).toBe('demo_20260810.mp4')
  })

  it('模板 {name}_{time}', () => {
    const fixed = new Date(2026, 7, 10, 14, 30, 45)
    const out = buildOutputPath(
      path.join('D:', 'videos', 'clip.mp4'),
      baseOptions({
        format: 'mkv',
        nameTemplate: '{name}_{time}',
        outputDir: path.join('D:', 'out')
      }),
      fixed
    )
    expect(path.basename(out)).toBe('clip_143045.mkv')
  })

  it('非法文件名字符被替换', () => {
    const out = buildOutputPath(
      path.join('D:', 'videos', 'a:b*c?.mp4'),
      baseOptions({
        format: 'mp4',
        nameTemplate: '{name}_compressed',
        outputDir: path.join('D:', 'out')
      })
    )
    // basename 在 Windows 上可能已不含非法字符，至少输出名不应含 * ?
    expect(path.basename(out)).not.toMatch(/[*:?]/)
  })

  it('suggestUniqueOutputPath 追加序号', () => {
    const exists = new Set([
      path.join('D:', 'out', 'a_compressed.mp4'),
      path.join('D:', 'out', 'a_compressed_1.mp4')
    ])
    const result = suggestUniqueOutputPath(
      path.join('D:', 'out', 'a_compressed.mp4'),
      (p) => exists.has(p)
    )
    expect(path.basename(result)).toBe('a_compressed_2.mp4')
  })

  it('mode=audio 默认扩展名 .m4a 与模板 _audio', () => {
    const out = buildOutputPath(
      path.join('D:', 'videos', 'demo.mp4'),
      baseOptions({
        mode: 'audio',
        audioFormat: 'm4a',
        outputDir: path.join('D:', 'out')
      })
    )
    expect(path.basename(out)).toBe('demo_audio.m4a')
  })

  it('mode=audio mp3 扩展名', () => {
    const out = buildOutputPath(
      path.join('D:', 'videos', 'demo.mp4'),
      baseOptions({
        mode: 'audio',
        audioFormat: 'mp3',
        nameTemplate: '{name}_audio',
        outputDir: path.join('D:', 'out')
      })
    )
    expect(path.basename(out)).toBe('demo_audio.mp3')
  })

  it('mode=audio opus 扩展名', () => {
    const out = buildOutputPath(
      path.join('D:', 'videos', 'clip.mkv'),
      baseOptions({
        mode: 'audio',
        audioFormat: 'opus',
        nameTemplate: '{name}_audio',
        outputDir: path.join('D:', 'out')
      })
    )
    expect(path.basename(out)).toBe('clip_audio.opus')
  })

  it('outputDirMode=sidecar 输出到源目录', () => {
    const input = path.join('D:', 'videos', 'demo.mp4')
    const out = buildOutputPath(
      input,
      baseOptions({
        outputDirMode: 'sidecar',
        outputDir: path.join('D:', 'out')
      })
    )
    expect(path.dirname(out)).toBe(path.dirname(input))
  })

  it('outputDirMode=dated 使用 outputDir/YYYYMMDD', () => {
    const fixed = new Date(2026, 7, 10, 12, 0, 0)
    const out = buildOutputPath(
      path.join('D:', 'videos', 'demo.mp4'),
      baseOptions({
        outputDirMode: 'dated',
        outputDir: path.join('D:', 'out')
      }),
      fixed
    )
    expect(path.dirname(out)).toBe(path.join('D:', 'out', '20260810'))
  })
})

describe('buildSeekArgs / effectiveDuration', () => {
  it('无 trim 时 before/after 皆空', () => {
    const r = buildSeekArgs(baseOptions())
    expect(r.beforeInput).toEqual([])
    expect(r.afterInput).toEqual([])
  })

  it('trimStart=0 视为不裁剪', () => {
    const r = buildSeekArgs(baseOptions({ trimStart: 0, trimEnd: 0 }))
    expect(r.beforeInput).toEqual([])
    expect(r.afterInput).toEqual([])
  })

  it('仅 trimStart：-ss 在 beforeInput', () => {
    const r = buildSeekArgs(baseOptions({ trimStart: 12.5 }))
    expect(r.beforeInput).toEqual(['-ss', '12.5'])
    expect(r.afterInput).toEqual([])
  })

  it('仅 trimEnd：-to 在 afterInput', () => {
    const r = buildSeekArgs(baseOptions({ trimEnd: 60 }))
    expect(r.beforeInput).toEqual([])
    expect(r.afterInput).toEqual(['-to', '60'])
  })

  it('trimStart + trimEnd 同时生效（-t 时长）', () => {
    const r = buildSeekArgs(baseOptions({ trimStart: 10, trimEnd: 90 }))
    expect(r.beforeInput).toEqual(['-ss', '10'])
    expect(r.afterInput).toEqual(['-t', '80'])
  })

  it('trimEnd <= trimStart 时忽略 end', () => {
    const r = buildSeekArgs(baseOptions({ trimStart: 50, trimEnd: 40 }))
    expect(r.beforeInput).toEqual(['-ss', '50'])
    expect(r.afterInput).toEqual([])
  })

  it('effectiveDuration：完整段', () => {
    expect(effectiveDuration(baseOptions({ trimStart: 10, trimEnd: 40 }), 100)).toBe(30)
  })

  it('effectiveDuration：仅 start', () => {
    expect(effectiveDuration(baseOptions({ trimStart: 20 }), 100)).toBe(80)
  })

  it('effectiveDuration：无 trim 返回源时长', () => {
    expect(effectiveDuration(baseOptions(), 120)).toBe(120)
  })

  it('effectiveDuration：end 超出源时长时钳制', () => {
    expect(effectiveDuration(baseOptions({ trimStart: 10, trimEnd: 999 }), 50)).toBe(40)
  })
})

describe('buildAudioExtractArgs', () => {
  it('m4a: -vn + aac + ipod', () => {
    const args = buildAudioExtractArgs(
      baseOptions({ mode: 'audio', audioFormat: 'm4a', audioBitrate: '192k' })
    )
    expect(args).toContain('-vn')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
    expect(args).toContain('-b:a')
    expect(args).toContain('192k')
    expect(args).toContain('-f')
    expect(args).toContain('ipod')
    expect(args).not.toContain('-c:v')
  })

  it('mp3: libmp3lame', () => {
    const args = buildAudioExtractArgs(
      baseOptions({ mode: 'audio', audioFormat: 'mp3', audioBitrate: '128k' })
    )
    expect(args).toContain('-vn')
    expect(args).toContain('libmp3lame')
    expect(args).toContain('128k')
    expect(args).toContain('mp3')
  })

  it('opus: libopus', () => {
    const args = buildAudioExtractArgs(
      baseOptions({ mode: 'audio', audioFormat: 'opus', audioBitrate: '256k' })
    )
    expect(args).toContain('-vn')
    expect(args).toContain('libopus')
    expect(args).toContain('256k')
    expect(args).toContain('opus')
  })

  it('resolveAudioEncoder', () => {
    expect(resolveAudioEncoder(baseOptions({ audioFormat: 'm4a' }))).toBe('aac')
    expect(resolveAudioEncoder(baseOptions({ audioFormat: 'mp3' }))).toBe(
      'libmp3lame'
    )
    expect(resolveAudioEncoder(baseOptions({ audioFormat: 'opus' }))).toBe(
      'libopus'
    )
  })
})
