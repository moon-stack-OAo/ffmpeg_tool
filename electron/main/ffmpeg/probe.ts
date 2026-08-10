import { spawn, type ChildProcess } from 'child_process'
import type { EncoderDetectResult, ResolvedEncoder } from '../../../shared/types'
import { getFfmpegPath, getFfprobePath } from './bin'

let encoderCache: EncoderDetectResult | null = null
let encoderCacheAt = 0
/** 探测缓存 5 分钟；force 时强制重测 */
const ENCODER_CACHE_MS = 5 * 60_000

/** 单次试编超时（毫秒） */
const TRIAL_ENCODE_TIMEOUT_MS = 12_000

const HW_CODEC_MAP = {
  nvenc: 'h264_nvenc',
  qsv: 'h264_qsv',
  amf: 'h264_amf',
  videotoolbox: 'h264_videotoolbox'
} as const

type HwKey = keyof typeof HW_CODEC_MAP

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

    const extraArgs: string[] =
      codec === 'h264_videotoolbox' ? ['-allow_sw', '1', '-b:v', '0', '-q:v', '50'] : []

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
    }, TRIAL_ENCODE_TIMEOUT_MS)

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
    const empty: EncoderDetectResult = {
      nvenc: false,
      qsv: false,
      amf: false,
      videotoolbox: false,
      preferred: 'libx264',
      probed: false,
      verified: { nvenc: false, qsv: false, amf: false, videotoolbox: false },
      error: 'ffmpeg 不可用'
    }
    return empty
  }

  // —— 列表探测 ——
  const listResult = await new Promise<{
    nvenc: boolean
    qsv: boolean
    amf: boolean
    videotoolbox: boolean
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
      resolve({
        nvenc: false,
        qsv: false,
        amf: false,
        videotoolbox: false,
        error: e.message
      })
    })

    proc.on('close', () => {
      const text = `${out}\n${err}`
      const has = (name: string): boolean => {
        const re = new RegExp(`\\b${name}\\b`, 'i')
        return re.test(text)
      }
      resolve({
        nvenc: has('h264_nvenc'),
        qsv: has('h264_qsv'),
        amf: has('h264_amf'),
        videotoolbox: has('h264_videotoolbox')
      })
    })
  })

  if (listResult.error) {
    const result: EncoderDetectResult = {
      nvenc: false,
      qsv: false,
      amf: false,
      videotoolbox: false,
      preferred: 'libx264',
      probed: false,
      verified: { nvenc: false, qsv: false, amf: false, videotoolbox: false },
      error: listResult.error
    }
    encoderCache = result
    encoderCacheAt = Date.now()
    return result
  }

  // —— 对列表中存在的硬件做试编验证 ——
  let nvenc = listResult.nvenc
  let qsv = listResult.qsv
  let amf = listResult.amf
  let videotoolbox = listResult.videotoolbox
  const verified = {
    nvenc: false,
    qsv: false,
    amf: false,
    videotoolbox: false
  }

  const keys = (Object.keys(HW_CODEC_MAP) as HwKey[]).filter((k) => {
    if (k === 'nvenc') return nvenc
    if (k === 'qsv') return qsv
    if (k === 'amf') return amf
    return videotoolbox
  })

  // 串行试编，避免同时占满 GPU
  for (const key of keys) {
    const codec = HW_CODEC_MAP[key]
    const ok = await trialEncode(ffmpeg, codec)
    if (key === 'nvenc') {
      nvenc = ok
      verified.nvenc = ok
    } else if (key === 'qsv') {
      qsv = ok
      verified.qsv = ok
    } else if (key === 'amf') {
      amf = ok
      verified.amf = ok
    } else {
      videotoolbox = ok
      verified.videotoolbox = ok
    }
  }

  // preferred 与 resolveVideoEncoder auto 一致
  let preferred: ResolvedEncoder = 'libx264'
  if (process.platform === 'darwin') {
    if (videotoolbox) preferred = 'h264_videotoolbox'
    else if (nvenc) preferred = 'h264_nvenc'
    else if (qsv) preferred = 'h264_qsv'
    else if (amf) preferred = 'h264_amf'
  } else {
    if (nvenc) preferred = 'h264_nvenc'
    else if (qsv) preferred = 'h264_qsv'
    else if (amf) preferred = 'h264_amf'
    else if (videotoolbox) preferred = 'h264_videotoolbox'
  }

  const result: EncoderDetectResult = {
    nvenc,
    qsv,
    amf,
    videotoolbox,
    preferred,
    probed: true,
    verified
  }
  encoderCache = result
  encoderCacheAt = Date.now()
  return result
}

/** 使用 ffprobe 获取时长（秒） */
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
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('close', () => {
      const n = parseFloat(out.trim())
      resolve(Number.isFinite(n) && n > 0 ? n : 0)
    })
    proc.on('error', () => resolve(0))
  })
}

/**
 * 检测输入是否包含音频流
 * 无音频 / 探测失败返回 false
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
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('close', () => {
      // 有任意音频流 index 输出即视为有音轨
      resolve(out.trim().length > 0)
    })
    proc.on('error', () => resolve(false))
  })
}
