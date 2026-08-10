import { app } from 'electron'

export {
  getFfmpegPath,
  getFfprobePath,
  checkFfmpegAvailable
} from './bin'

export {
  detectHardwareEncoders,
  probeDuration,
  probeHasAudioStream
} from './probe'

export {
  buildOutputPath,
  uniqueOutputPath,
  getFileSize
} from './paths'

export {
  runCompress,
  type RunCompressParams,
  type RunCompressResult
} from './runner'

// 纯逻辑 re-export，保持原 ffmpeg.ts 对外 API 兼容
export {
  mapCrfToHardwareQuality,
  isH264Container,
  resolveVideoEncoder,
  resolveAudioEncoder,
  buildScaleFilter,
  buildCompressArgs,
  buildAudioExtractArgs,
  buildCompressArgsLegacy,
  buildSeekArgs,
  effectiveDuration,
  normalizeTrimSec,
  parseProgressLine,
  formatSec,
  suggestUniqueOutputPath
} from '../../../shared/ffmpegLogic'

/** 用户数据目录 */
export function getAppDataPath(): string {
  return app.getPath('userData')
}
