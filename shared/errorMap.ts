/**
 * 将 ffmpeg 原始错误映射为用户可读的中文短句
 * 按优先级匹配 stderr/消息关键字
 */
export function mapFfmpegError(
  raw: string,
  ctx?: {
    resolvedEncoder?: string
    inputPath?: string
    outputPath?: string
  }
): string {
  const text = (raw || '').trim()
  const lower = text.toLowerCase()

  // 输入不存在
  if (
    /no such file/i.test(text) ||
    /cannot find the file/i.test(text) ||
    /输入文件不存在/.test(text) ||
    /enoent/i.test(text)
  ) {
    return '输入文件不存在或路径无效。请确认文件仍在原位置。'
  }

  // 权限
  if (
    /permission denied/i.test(text) ||
    /access is denied/i.test(text) ||
    /eacces/i.test(text) ||
    /eperm/i.test(text)
  ) {
    return '无权限读写文件。请检查文件是否被占用，以及读写权限。'
  }

  // 磁盘空间
  if (
    /no space left/i.test(text) ||
    /disk full/i.test(text) ||
    /not enough space/i.test(text) ||
    /enospc/i.test(text)
  ) {
    return '磁盘空间不足。请清理输出目录所在磁盘后重试。'
  }

  // 无音频流（抽取音频时常见）
  if (
    /does not contain any stream/i.test(text) ||
    /output file does not contain any stream/i.test(text) ||
    /stream map.*matches no streams/i.test(text) ||
    /matches no streams/i.test(text) ||
    /no audio streams/i.test(text) ||
    /does not contain.*audio/i.test(lower) ||
    /could not find.*audio/i.test(text)
  ) {
    return '源文件没有可用的音频流，无法抽取音频。'
  }

  // 损坏 / 不支持格式
  if (
    /invalid data found/i.test(text) ||
    /could not find codec/i.test(text) ||
    /unknown format/i.test(text) ||
    (/invalid argument/i.test(text) && /demuxer|codec/i.test(text))
  ) {
    return '文件损坏或不支持的格式。请换源文件或改用其他容器格式。'
  }

  // NVIDIA
  if (/nvenc|cuda|nvcuda|libcuda/i.test(text)) {
    return 'NVIDIA 硬件编码不可用。请检查显卡驱动，或改用软件 x264。'
  }

  // Intel QSV
  if (/qsv|quicksync|mfx|libmfx|vaapi.*qsv/i.test(text)) {
    return 'Intel QSV 硬件编码不可用。请检查核显驱动，或改用软件 x264。'
  }

  // AMD AMF
  if (/\bamf\b|amfrt|h264_amf|hevc_amf/i.test(text)) {
    return 'AMD AMF 硬件编码不可用。请检查显卡驱动，或改用软件 x264。'
  }

  // Apple VideoToolbox
  if (/videotoolbox|h264_videotoolbox|hevc_videotoolbox/i.test(text)) {
    return 'Apple VideoToolbox 硬件编码不可用。请检查系统支持，或改用软件 x264。'
  }

  // 编码器未找到
  if (/encoder\s+not found|unknown encoder|codec not found/i.test(text)) {
    return '编码器不可用。请改用「自动」或「软件 x264」。'
  }

  // 编码器初始化失败
  if (
    /conversion failed/i.test(text) ||
    /error while opening encoder/i.test(text) ||
    /error initializing/i.test(text) ||
    /cannot open encoder/i.test(text)
  ) {
    const enc = ctx?.resolvedEncoder
    if (enc && enc !== 'libx264' && enc !== 'libvpx-vp9') {
      return `编码器初始化失败（${enc}）。可尝试软件 x264 或检查硬件驱动。`
    }
    return '编码器初始化失败。请检查参数后重试，或改用软件 x264。'
  }

  // 其它：截断并加前缀
  const truncated = text.length > 200 ? `${text.slice(0, 200)}…` : text
  return truncated ? `压缩失败：${truncated}` : '压缩失败：未知错误'
}

/** 判断是否为硬件编码器相关失败（用于自动回退软件） */
export function isHardwareEncoderFailure(
  raw: string,
  resolvedEncoder?: string
): boolean {
  const enc = resolvedEncoder || ''
  const isHwEnc =
    enc === 'h264_nvenc' ||
    enc === 'h264_qsv' ||
    enc === 'h264_amf' ||
    enc === 'h264_videotoolbox' ||
    /nvenc|qsv|amf|videotoolbox/i.test(enc)

  if (!isHwEnc && enc) {
    // 明确是软件编码则不算硬件失败
    if (enc === 'libx264' || enc === 'libvpx-vp9') return false
  }

  const text = raw || ''
  if (
    /nvenc|cuda|nvcuda|libcuda|qsv|quicksync|mfx|libmfx|\bamf\b|amfrt|h264_amf|videotoolbox|h264_videotoolbox|opencl|device|encoder not found|error while opening encoder|cannot open encoder|error initializing/i.test(
      text
    )
  ) {
    return true
  }

  // 使用了硬件编码器且非 0 退出，也视为可回退
  return isHwEnc
}
