import { describe, expect, it } from 'vitest'
import { isHardwareEncoderFailure, mapFfmpegError } from '../shared/errorMap'

describe('mapFfmpegError', () => {
  it('输入不存在', () => {
    expect(mapFfmpegError('No such file or directory')).toMatch(/输入文件不存在/)
    expect(mapFfmpegError('ENOENT: no such file')).toMatch(/输入文件不存在/)
  })

  it('权限不足', () => {
    expect(mapFfmpegError('Permission denied')).toMatch(/无权限/)
    expect(mapFfmpegError('Access is denied.')).toMatch(/无权限/)
  })

  it('磁盘空间不足', () => {
    expect(mapFfmpegError('No space left on device')).toMatch(/磁盘空间不足/)
    expect(mapFfmpegError('disk full')).toMatch(/磁盘空间不足/)
  })

  it('损坏或不支持格式', () => {
    expect(mapFfmpegError('Invalid data found when processing input')).toMatch(
      /损坏|不支持/
    )
    expect(mapFfmpegError('could not find codec parameters')).toMatch(/损坏|不支持/)
  })

  it('NVIDIA 硬件', () => {
    expect(mapFfmpegError('Cannot load nvcuda.dll')).toMatch(/NVIDIA/)
    expect(mapFfmpegError('OpenEncodeSessionEx failed: NVENC')).toMatch(/NVIDIA/)
  })

  it('Intel QSV', () => {
    expect(mapFfmpegError('Error while opening encoder h264_qsv')).toMatch(/QSV|Intel/)
    expect(mapFfmpegError('Failed to create a QSV session')).toMatch(/QSV|Intel/)
  })

  it('AMD AMF', () => {
    expect(mapFfmpegError('AMF failed to initialize')).toMatch(/AMD|AMF/)
    expect(mapFfmpegError('h264_amf encoder error')).toMatch(/AMD|AMF/)
  })

  it('Apple VideoToolbox', () => {
    expect(mapFfmpegError('Error opening h264_videotoolbox')).toMatch(/VideoToolbox/)
  })

  it('编码器未找到', () => {
    // 不含具体硬件关键字时命中通用「编码器不可用」
    expect(mapFfmpegError("Unknown encoder 'libfoo'")).toMatch(/编码器不可用/)
    expect(mapFfmpegError('Encoder not found')).toMatch(/编码器不可用/)
  })

  it('编码器初始化失败', () => {
    expect(mapFfmpegError('Error while opening encoder for output stream')).toMatch(
      /编码器初始化失败/
    )
    expect(mapFfmpegError('Conversion failed!')).toMatch(/编码器初始化失败/)
  })

  it('其它错误截断并加前缀', () => {
    const long = 'x'.repeat(250)
    const msg = mapFfmpegError(long)
    expect(msg.startsWith('压缩失败：')).toBe(true)
    expect(msg.length).toBeLessThan(long.length + 20)
  })

  it('无音频流', () => {
    expect(
      mapFfmpegError('Output file does not contain any stream')
    ).toMatch(/没有可用的音频流/)
    expect(
      mapFfmpegError("Stream map '0:a' matches no streams")
    ).toMatch(/没有可用的音频流/)
  })
})

describe('isHardwareEncoderFailure', () => {
  it('含 nvenc/cuda 关键字', () => {
    expect(isHardwareEncoderFailure('nvenc init failed', 'h264_nvenc')).toBe(true)
    expect(isHardwareEncoderFailure('Cannot load nvcuda', 'h264_nvenc')).toBe(true)
  })

  it('含 qsv/amf/videotoolbox 关键字', () => {
    expect(isHardwareEncoderFailure('qsv session error', 'h264_qsv')).toBe(true)
    expect(isHardwareEncoderFailure('AMF init failed', 'h264_amf')).toBe(true)
    expect(isHardwareEncoderFailure('videotoolbox failed', 'h264_videotoolbox')).toBe(
      true
    )
  })

  it('硬件编码器失败（即使文案不含关键字）', () => {
    expect(isHardwareEncoderFailure('exit code 1', 'h264_nvenc')).toBe(true)
    expect(isHardwareEncoderFailure('exit code 1', 'h264_videotoolbox')).toBe(true)
  })

  it('软件编码不算硬件失败', () => {
    expect(isHardwareEncoderFailure('some error', 'libx264')).toBe(false)
    expect(isHardwareEncoderFailure('some error', 'libvpx-vp9')).toBe(false)
  })
})
