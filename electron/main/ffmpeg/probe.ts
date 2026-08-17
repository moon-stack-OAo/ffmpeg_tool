import { spawn, type ChildProcess } from 'child_process'
import type {
  EncoderDetectResult,
  EncoderId,
  ResolvedEncoder
} from '../../../shared/types'
import { getFfmpegPath, getFfprobePath } from './bin'

let encoderCache: EncoderDetectResult | null = null
let encoderCacheAt = 0
/** 探测缓存 5 分钟；force 时强制重测 */
const ENCODER_CACHE_MS = 5 * 60_000

/** 单次试编超时（毫秒）；mf 可能较慢 */
const TRIAL_ENCODE_TIMEOUT_MS = 12_000
const TRIAL_ENCODE_TIMEOUT_MF_MS = 20_000

/** 需列表探测的全部 codec */
const ALL_PROBE_CODECS: ResolvedEncoder[] = [
  'libx264',
  'libx265',
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'h264_videotoolbox',
  'h264_mf',
  'hevc_nvenc',
  'hevc_qsv',
  'hevc_amf',
  'hevc_videotoolbox',
  'hevc_mf'
]

/** 需试编验证的硬件 codec */
const HW_TRIAL_CODECS: ResolvedEncoder[] = [
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'h264_videotoolbox',
  'h264_mf',
  'hevc_nvenc',
  'hevc_qsv',
  'hevc_amf',
  'hevc_videotoolbox',
  'hevc_mf'
]

/** UI EncoderId → 对应 codec（auto/software 无固定 codec） */
const UI_ENCODER_CODEC: Array<{ id: EncoderId; codec?: ResolvedEncoder }> = [
  { id: 'auto' },
  { id: 'software', codec: 'libx264' },
  { id: 'h264_nvenc', codec: 'h264_nvenc' },
  { id: 'h264_qsv', codec: 'h264_qsv' },
  { id: 'h264_amf', codec: 'h264_amf' },
  { id: 'h264_videotoolbox', codec: 'h264_videotoolbox' },
  { id: 'h264_mf', codec: 'h264_mf' },
  { id: 'hevc_nvenc', codec: 'hevc_nvenc' },
  { id: 'hevc_qsv', codec: 'hevc_qsv' },
  { id: 'hevc_amf', codec: 'hevc_amf' },
  { id: 'hevc_videotoolbox', codec: 'hevc_videotoolbox' },
  { id: 'hevc_mf', codec: 'hevc_mf' },
  { id: 'libx264', codec: 'libx264' },
  { id: 'libx265', codec: 'libx265' }
]

function emptyDetect(error?: string): EncoderDetectResult {
  const codecs: Partial<Record<ResolvedEncoder, boolean>> = {}
  for (const c of ALL_PROBE_CODECS) codecs[c] = false
  codecs.libx264 = true
  return {
    nvenc: false,
    qsv: false,
    amf: false,
    videotoolbox: false,
    codecs,
    preferred: 'libx264',
    probed: false,
    verified: {},
    availability: buildAvailability(codecs),
    error
  }
}

function buildAvailability(
  codecs: Partial<Record<ResolvedEncoder, boolean>>
): Array<{ id: EncoderId; available: boolean; codec?: string }> {
  return UI_ENCODER_CODEC.map(({ id, codec }) => {
    if (id === 'auto' || id === 'software') {
      return { id, available: true, codec }
    }
    if (!codec) return { id, available: false }
    return {
      id,
      available: !!codecs[codec],
      codec
    }
  })
}

/**
 * 用极短 lavfi 黑帧试编，验证硬件编码器是否真正可用
 * 失败/超时则返回 false
 */
function trialEncode(ffmpeg: string, codec: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }

    const isVt = codec.includes('videotoolbox')
    const isMf = codec.endsWith('_mf')
    const timeoutMs = isMf ? TRIAL_ENCODE_TIMEOUT_MF_MS : TRIAL_ENCODE_TIMEOUT_MS

    const extraArgs: string[] = isVt
      ? ['-allow_sw', '1', '-b:v', '0', '-q:v', '50']
      : isMf
        ? ['-rate_control', 'quality', '-quality', '50']
        : []

    let proc: ChildProcess
    try {
      proc = spawn(
        ffmpeg,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=64x64:d=0.1',
          '-frames:v',
          '1',
          '-c:v',
          codec,
          ...extraArgs,
          '-f',
          'null',
          '-'
        ],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
      )
    } catch {
      finish(false)
      return
    }

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGTERM')
        if (process.platform === 'win32' && proc.pid) {
          spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
            windowsHide: true,
            stdio: 'ignore'
          })
        }
      } catch {
        // ignore
      }
      finish(false)
    }, timeoutMs)

    proc.on('error', () => finish(false))
    proc.on('close', (code) => {
      finish(code === 0)
    })
  })
}

/**
 * 探测本机可用硬件编码器
 * 1) ffmpeg -encoders 列表匹配
 * 2) 对列表中为 true 的硬件做可选试编，失败则标 false
 * libx264/libx265 仅列表存在即 available
 */
export async function detectHardwareEncoders(
  force = false
): Promise<EncoderDetectResult> {
  const now = Date.now()
  if (!force && encoderCache && now - encoderCacheAt < ENCODER_CACHE_MS) {
    return encoderCache
  }

  const ffmpeg = getFfmpegPath()
  if (!ffmpeg) {
    return emptyDetect('ffmpeg 不可用')
  }

  // —— 列表探测 ——
  const listResult = await new Promise<{
    codecs: Partial<Record<ResolvedEncoder, boolean>>
    error?: string
  }>((resolve) => {
    const proc = spawn(ffmpeg, ['-hide_banner', '-encoders'], {
      windowsHide: true
    })

    let out = ''
    let err = ''
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.stderr?.on('data', (d: Buffer) => {
      err += d.toString()
    })

    proc.on('error', (e) => {
      resolve({ codecs: {}, error: e.message })
    })

    proc.on('close', () => {
      const text = `${out}\n${err}`
      const has = (name: string): boolean => {
        const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        return re.test(text)
      }
      const codecs: Partial<Record<ResolvedEncoder, boolean>> = {}
      for (const c of ALL_PROBE_CODECS) {
        codecs[c] = has(c)
      }
      // libx264 几乎总有；若列表解析异常也视为可用（软件回退）
      if (codecs.libx264 !== true) codecs.libx264 = true
      resolve({ codecs })
    })
  })

  if (listResult.error) {
    const result = emptyDetect(listResult.error)
    encoderCache = result
    encoderCacheAt = Date.now()
    return result
  }

  const codecs: Partial<Record<ResolvedEncoder, boolean>> = {
    ...listResult.codecs
  }
  const verified: Partial<Record<string, boolean>> = {}

  // —— 对列表中存在的硬件做试编验证 ——
  const toTrial = HW_TRIAL_CODECS.filter((c) => codecs[c])
  for (const codec of toTrial) {
    const ok = await trialEncode(ffmpeg, codec)
    codecs[codec] = ok
    verified[codec] = ok
  }

  // 旧布尔字段 = 对应 h264 硬件
  const nvenc = !!codecs.h264_nvenc
  const qsv = !!codecs.h264_qsv
  const amf = !!codecs.h264_amf
  const videotoolbox = !!codecs.h264_videotoolbox

  // preferred 与 resolveVideoEncoder auto 一致（仅 H.264 硬件）
  let preferred: ResolvedEncoder = 'libx264'
  if (process.platform === 'darwin') {
    if (videotoolbox) preferred = 'h264_videotoolbox'
    else if (nvenc) preferred = 'h264_nvenc'
    else if (qsv) preferred = 'h264_qsv'
    else if (amf) preferred = 'h264_amf'
    else if (codecs.h264_mf) preferred = 'h264_mf'
  } else {
    if (nvenc) preferred = 'h264_nvenc'
    else if (qsv) preferred = 'h264_qsv'
    else if (amf) preferred = 'h264_amf'
    else if (codecs.h264_mf) preferred = 'h264_mf'
    else if (videotoolbox) preferred = 'h264_videotoolbox'
  }

  const result: EncoderDetectResult = {
    nvenc,
    qsv,
    amf,
    videotoolbox,
    codecs,
    preferred,
    probed: true,
    verified,
    availability: buildAvailability(codecs)
  }
  encoderCache = result
  encoderCacheAt = Date.now()
  return result
}

/**
 * 探测视频显示宽高（含 rotate 90/270 互换）与时长
 */
export function probeVideoSize(
  inputPath: string
): Promise<{ width: number; height: number; duration: number } | null> {
  return new Promise((resolve) => {
    const ffprobe = getFfprobePath()
    if (!ffprobe) {
      resolve(null)
      return
    }

    const proc = spawn(
      ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:stream_tags=rotate:stream_side_data=rotation:format=duration',
        '-of',
        'json',
        inputPath
      ],
      { windowsHide: true }
    )

    let out = ''
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('error', () => resolve(null))
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(out) as {
          streams?: Array<{
            width?: number
            height?: number
            tags?: { rotate?: string }
            side_data_list?: Array<{ rotation?: number }>
          }>
          format?: { duration?: string }
        }
        const stream = parsed.streams?.[0]
        if (!stream?.width || !stream?.height) {
          resolve(null)
          return
        }
        let width = stream.width
        let height = stream.height
        let rotation = 0
        if (stream.tags?.rotate) {
          const r = parseInt(stream.tags.rotate, 10)
          if (Number.isFinite(r)) rotation = r
        }
        if (stream.side_data_list) {
          for (const sd of stream.side_data_list) {
            if (typeof sd.rotation === 'number' && Number.isFinite(sd.rotation)) {
              rotation = sd.rotation
              break
            }
          }
        }
        const absRot = Math.abs(rotation) % 360
        if (absRot === 90 || absRot === 270) {
          const t = width
          width = height
          height = t
        }
        const duration = parseFloat(parsed.format?.duration || '0') || 0
        resolve({ width, height, duration })
      } catch {
        resolve(null)
      }
    })
  })
}

/** 探测媒体时长（秒） */
export function probeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobe = getFfprobePath()
    if (!ffprobe) {
      resolve(0)
      return
    }

    const proc = spawn(
      ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath
      ],
      { windowsHide: true }
    )

    let out = ''
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('error', () => resolve(0))
    proc.on('close', () => {
      const n = parseFloat(out.trim())
      resolve(Number.isFinite(n) && n > 0 ? n : 0)
    })
  })
}

/**
 * 检测输入是否包含音频流
 * 无音轨 / 探测失败返回 false
 */
export function probeHasAudioStream(inputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ffprobe = getFfprobePath()
    if (!ffprobe) {
      resolve(false)
      return
    }

    const proc = spawn(
      ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'a',
        '-show_entries',
        'stream=index',
        '-of',
        'csv=p=0',
        inputPath
      ],
      { windowsHide: true }
    )

    let out = ''
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('close', () => {
      resolve(out.trim().length > 0)
    })
    proc.on('error', () => resolve(false))
  })
}
