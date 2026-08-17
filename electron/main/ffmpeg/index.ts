import { app } from 'electron'

export {
  getFfmpegPath,
  getFfprobePath,
  checkFfmpegAvailable,
  setBinaryOverride
} from './bin'

export {
  detectHardwareEncoders,
  probeDuration,
  probeHasAudioStream,
  probeVideoSize
} from './probe'

export {
  extractVideoFrame,
  type ExtractVideoFrameOpts,
  type ExtractVideoFrameResult
} from './frameExtract'

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

export {
  runVideoConcat,
  type RunVideoConcatParams
} from './concatRunner'

export {
  runMediaCompose,
  type RunMediaComposeParams
} from './composeRunner'

// 纯逻辑 re-export，保持原 ffmpeg.ts 对外 API 兼容
export {
  mapCrfToHardwareQuality,
  isH264Container,
  resolveVideoEncoder,
  isHardwareEncoder,
  buildVideoEncoderArgs,
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
