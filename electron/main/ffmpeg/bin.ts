import fs from 'fs'
import path from 'path'

/** 用户通过「设置」指定的自定义 bin 目录（含 ffmpeg 与 ffprobe），空串=自动探测 */
let overrideDir = ''

function binaryName(base: 'ffmpeg' | 'ffprobe'): string {
  return process.platform === 'win32' ? `${base}.exe` : base
}

/**
 * 设置自定义 ffmpeg bin 目录覆盖
 * - 空串 → 清除覆盖，改用 ffmpeg-static 自动探测
 * - 目录需同时存在 ffmpeg(.exe) 与 ffprobe(.exe)
 */
export function setBinaryOverride(dir: string): {
  accepted: boolean
  error?: string
} {
  const target = (dir || '').trim()
  if (!target) {
    overrideDir = ''
    return { accepted: true }
  }
  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      return { accepted: false, error: '目录不存在' }
    }
  } catch {
    return { accepted: false, error: '目录不存在' }
  }
  const ffmpegFile = path.join(target, binaryName('ffmpeg'))
  const ffprobeFile = path.join(target, binaryName('ffprobe'))
  if (!fs.existsSync(ffmpegFile) || !fs.existsSync(ffprobeFile)) {
    return { accepted: false, error: '目录中未找到 ffmpeg 或 ffprobe' }
  }
  overrideDir = target
  return { accepted: true }
}

/** 解析 ffmpeg-static / ffprobe-static 在开发与打包后的路径 */
function resolveBinaryPath(moduleName: 'ffmpeg-static' | 'ffprobe-static'): string {
  // 开发环境：直接 require
  // 打包后：asarUnpack 会把二进制放到 app.asar.unpacked
  let binPath = ''

  try {
    if (moduleName === 'ffmpeg-static') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      binPath = require('ffmpeg-static') as string
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('ffprobe-static') as { path: string }
      binPath = mod.path
    }
  } catch {
    binPath = ''
  }

  if (!binPath) {
    return ''
  }

  // 打包后 asar 内路径需替换为 unpacked
  if (binPath.includes('app.asar') && !binPath.includes('app.asar.unpacked')) {
    binPath = binPath.replace('app.asar', 'app.asar.unpacked')
  }

  // 某些环境下路径可能带 file:// 前缀
  if (binPath.startsWith('file://')) {
    binPath = binPath.replace(/^file:\/\//, '')
    if (process.platform === 'win32' && binPath.startsWith('/')) {
      binPath = binPath.slice(1)
    }
  }

  return binPath
}

export function getFfmpegPath(): string {
  if (overrideDir) {
    return path.join(overrideDir, binaryName('ffmpeg'))
  }
  return resolveBinaryPath('ffmpeg-static')
}

export function getFfprobePath(): string {
  if (overrideDir) {
    return path.join(overrideDir, binaryName('ffprobe'))
  }
  return resolveBinaryPath('ffprobe-static')
}

export function checkFfmpegAvailable(): {
  ready: boolean
  ffmpegPath?: string
  ffprobePath?: string
  error?: string
} {
  const ffmpegPath = getFfmpegPath()
  const ffprobePath = getFfprobePath()

  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    return {
      ready: false,
      ffmpegPath,
      ffprobePath,
      error: '未找到 ffmpeg 二进制，请确认已安装 ffmpeg-static'
    }
  }

  if (!ffprobePath || !fs.existsSync(ffprobePath)) {
    return {
      ready: false,
      ffmpegPath,
      ffprobePath,
      error: '未找到 ffprobe 二进制，请确认已安装 ffprobe-static'
    }
  }

  return { ready: true, ffmpegPath, ffprobePath }
}
