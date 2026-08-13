import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { resolveMagickCandidate } from '../../../shared/imageLogic'

/** 用户覆盖：magick 全路径或目录；空串=自动探测 */
let overridePath = ''

let sharpReadyCache: boolean | null = null

/** 探测 sharp 是否可加载 */
export function checkSharpReady(): boolean {
  if (sharpReadyCache != null) return sharpReadyCache
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as unknown
    const fn =
      typeof sharp === 'function'
        ? sharp
        : sharp &&
            typeof sharp === 'object' &&
            typeof (sharp as { default?: unknown }).default === 'function'
          ? (sharp as { default: unknown }).default
          : null
    sharpReadyCache = typeof fn === 'function'
    return sharpReadyCache
  } catch {
    sharpReadyCache = false
    return false
  }
}

/** 重置 sharp 探测缓存（测试用） */
export function resetSharpReadyCache(): void {
  sharpReadyCache = null
}

/**
 * 设置 ImageMagick 路径覆盖
 * - 空串 → 清除，改用 PATH / 常见路径探测
 * - 可为 magick(.exe) 全路径，或含 magick 的目录
 */
export function setMagickOverride(input: string): {
  accepted: boolean
  path?: string
  error?: string
} {
  const target = (input || '').trim()
  if (!target) {
    overridePath = ''
    return { accepted: true }
  }

  const candidate = resolveMagickCandidate(target)
  if (!candidate) {
    return { accepted: false, error: '路径无效' }
  }

  try {
    if (!fs.existsSync(candidate)) {
      return { accepted: false, error: '未找到 magick 可执行文件' }
    }
    const st = fs.statSync(candidate)
    if (!st.isFile()) {
      return { accepted: false, error: '未找到 magick 可执行文件' }
    }
  } catch {
    return { accepted: false, error: '未找到 magick 可执行文件' }
  }

  if (!verifyMagickBinary(candidate)) {
    return { accepted: false, error: '文件无法作为 ImageMagick 运行' }
  }

  overridePath = candidate
  return { accepted: true, path: candidate }
}

export function getMagickOverride(): string {
  return overridePath
}

function verifyMagickBinary(binPath: string): boolean {
  try {
    execFileSync(binPath, ['-version'], {
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return true
  } catch {
    return false
  }
}

function whichMagick(): string {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  const name = process.platform === 'win32' ? 'magick' : 'magick'
  try {
    const out = execFileSync(cmd, [name], {
      timeout: 3000,
      windowsHide: true,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const first = (out || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s.length > 0)
    if (first && fs.existsSync(first)) return first
  } catch {
    // ignore
  }
  return ''
}

/** Windows 常见安装路径 */
function windowsCommonMagickPaths(): string[] {
  if (process.platform !== 'win32') return []
  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['LOCALAPPDATA']
  ].filter((x): x is string => typeof x === 'string' && x.length > 0)

  const results: string[] = []
  for (const root of roots) {
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true })
      for (const ent of entries) {
        if (!ent.isDirectory()) continue
        if (!/ImageMagick/i.test(ent.name)) continue
        const candidate = path.join(root, ent.name, 'magick.exe')
        if (fs.existsSync(candidate)) results.push(candidate)
      }
    } catch {
      // ignore
    }
  }
  return results
}

/**
 * 解析 magick 路径
 * 顺序：用户 override → PATH → Windows 常见目录
 */
export function resolveMagickPath(): string {
  if (overridePath && fs.existsSync(overridePath)) {
    return overridePath
  }

  const fromPath = whichMagick()
  if (fromPath) return fromPath

  for (const p of windowsCommonMagickPaths()) {
    if (fs.existsSync(p)) return p
  }

  return ''
}

export function checkMagickAvailable(): {
  ready: boolean
  path?: string
  error?: string
} {
  const magickPath = resolveMagickPath()
  if (!magickPath) {
    return {
      ready: false,
      error: '未找到 ImageMagick（magick），请安装或在设置中指定路径'
    }
  }
  if (!verifyMagickBinary(magickPath)) {
    return {
      ready: false,
      path: magickPath,
      error: 'magick 无法运行，请检查安装或路径'
    }
  }
  return { ready: true, path: magickPath }
}
