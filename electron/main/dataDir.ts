import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { APP_NAME, LEGACY_APP_NAMES } from '../../shared/brand'

/** 数据目录覆盖配置存放位置（appData，不随 userData 变化） */
const OVERRIDE_DIR_NAME = APP_NAME
const LEGACY_OVERRIDE_DIR_NAMES = [...LEGACY_APP_NAMES]

/** 应用业务数据文件（优先保证迁移） */
const APP_DATA_FILES = ['settings.json', 'tasks.json'] as const

/**
 * 切换目录时跳过的 Electron/Chromium 运行时目录
 * （体积大、可重建，且可能被进程占用）
 */
const SKIP_DIR_NAMES = new Set(
  [
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'blob_storage',
    'Network',
    'Session Storage',
    'Shared Dictionary',
    'Dictionaries',
    'Crashpad',
    'logs',
    'Local Storage',
    'IndexedDB',
    'Service Worker',
    'WebStorage',
    'VideoDecodeStats',
    'File System'
  ].map((s) => s.toLowerCase())
)

/** 根目录下跳过的文件（运行时/本机绑定） */
const SKIP_FILE_NAMES = new Set(
  ['lock', 'lockfile', 'dev tools active port', 'singletoncookie', 'singletonlock'].map((s) =>
    s.toLowerCase()
  )
)

export interface MigrateResult {
  copied: string[]
  skipped: string[]
  errors: string[]
}

function overrideFile(dirName = OVERRIDE_DIR_NAME): string {
  return path.join(app.getPath('appData'), dirName, 'user-data-dir.txt')
}

function normalizePath(p: string): string {
  return (p || '').trim().replace(/[\\/]+$/, '')
}

function readOverrideFrom(dirName: string): string {
  try {
    const file = overrideFile(dirName)
    if (!fs.existsSync(file)) return ''
    const text = fs.readFileSync(file, 'utf-8').trim()
    if (!text) return ''
    if (!fs.existsSync(text) || !fs.statSync(text).isDirectory()) return ''
    return text
  } catch {
    return ''
  }
}

/** 启动时固定 ASCII 应用名，避免 userData 落在中文产品名目录 */
export function applyAppIdentity(): void {
  try {
    app.setName(APP_NAME)
  } catch (err) {
    console.warn('[dataDir] setName failed:', err)
  }
}

/** 启动时应用持久化的自定义数据目录（须在读取 userData 之前调用） */
export function applyUserDataOverride(): void {
  migrateLegacyUserData()
  const dir = readUserDataOverride()
  if (!dir) return
  try {
    app.setPath('userData', dir)
  } catch (err) {
    console.warn('[dataDir] apply override failed:', err)
  }
}

/** 读取持久化的自定义数据目录；缺失/无效返回空串（回退默认） */
export function readUserDataOverride(): string {
  const current = readOverrideFrom(OVERRIDE_DIR_NAME)
  if (current) return current

  for (const legacy of LEGACY_OVERRIDE_DIR_NAMES) {
    const old = readOverrideFrom(legacy)
    if (!old) continue
    try {
      const file = overrideFile()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, old, 'utf-8')
    } catch (err) {
      console.warn('[dataDir] copy legacy override failed:', err)
    }
    return old
  }
  return ''
}

/** 将旧版默认 userData 中的数据迁到当前目录（不覆盖已有文件） */
function migrateLegacyUserData(): void {
  const current = app.getPath('userData')
  const appData = app.getPath('appData')
  const candidates = [
    ...LEGACY_APP_NAMES.map((name) => path.join(appData, name)),
    path.join(appData, 'FFmpeg视频压缩工具')
  ]
  for (const oldDir of candidates) {
    if (normalizePath(oldDir) === normalizePath(current)) continue
    if (!fs.existsSync(oldDir) || !fs.statSync(oldDir).isDirectory()) continue
    migrateUserData(oldDir, current)
  }
}

function shouldSkipName(name: string, isDir: boolean): boolean {
  const key = name.toLowerCase()
  if (isDir) return SKIP_DIR_NAMES.has(key)
  return SKIP_FILE_NAMES.has(key)
}

/**
 * 将旧数据目录迁移到新目录
 * - 业务文件 settings.json / tasks.json 等
 * - 其它用户可见文件（不覆盖目标已存在项）
 * - 跳过 Chromium 缓存与锁文件
 */
export function migrateUserData(oldDir: string, newDir: string): MigrateResult {
  const result: MigrateResult = { copied: [], skipped: [], errors: [] }
  const from = normalizePath(oldDir)
  const to = normalizePath(newDir)
  if (!from || !to || from === to) return result
  if (!fs.existsSync(from) || !fs.statSync(from).isDirectory()) return result

  try {
    fs.mkdirSync(to, { recursive: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(`创建目标目录失败：${msg}`)
    return result
  }

  // 1) 优先业务文件
  for (const name of APP_DATA_FILES) {
    copyPathSafe(path.join(from, name), path.join(to, name), name, result)
  }

  // 2) 其余顶层项（跳过缓存目录）
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(from, { withFileTypes: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(`读取源目录失败：${msg}`)
    return result
  }

  for (const ent of entries) {
    const name = ent.name
    if ((APP_DATA_FILES as readonly string[]).includes(name)) continue
    if (shouldSkipName(name, ent.isDirectory())) {
      result.skipped.push(name)
      continue
    }
    // 覆盖配置文件不应进 userData 迁移（实际在 appData）
    if (name === 'user-data-dir.txt') {
      result.skipped.push(name)
      continue
    }
    const src = path.join(from, name)
    const dst = path.join(to, name)
    if (ent.isDirectory()) {
      copyDirRecursive(src, dst, name, result)
    } else if (ent.isFile()) {
      copyPathSafe(src, dst, name, result)
    }
  }

  return result
}

function copyPathSafe(
  src: string,
  dst: string,
  label: string,
  result: MigrateResult
): void {
  try {
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return
    if (fs.existsSync(dst)) {
      result.skipped.push(label)
      return
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
    result.copied.push(label)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(`${label}: ${msg}`)
  }
}

function copyDirRecursive(
  srcDir: string,
  dstDir: string,
  label: string,
  result: MigrateResult
): void {
  try {
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) return
    fs.mkdirSync(dstDir, { recursive: true })
    const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    for (const ent of entries) {
      if (shouldSkipName(ent.name, ent.isDirectory())) {
        result.skipped.push(`${label}/${ent.name}`)
        continue
      }
      const s = path.join(srcDir, ent.name)
      const d = path.join(dstDir, ent.name)
      const childLabel = `${label}/${ent.name}`
      if (ent.isDirectory()) {
        copyDirRecursive(s, d, childLabel, result)
      } else if (ent.isFile()) {
        copyPathSafe(s, d, childLabel, result)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(`${label}: ${msg}`)
  }
}

/** @deprecated 兼容旧调用名 */
function migrateDataFiles(oldDir: string, newDir: string): MigrateResult {
  return migrateUserData(oldDir, newDir)
}

/** 修改数据目录：迁移数据 → 切换路径 → 持久化覆盖配置 */
export function setUserDataDir(
  dir: string
): {
  ok: boolean
  error?: string
  restart?: boolean
  migrated?: string[]
  migrateSkipped?: string[]
  migrateErrors?: string[]
} {
  const value = (dir || '').trim()
  if (!value) {
    return { ok: false, error: '目录无效' }
  }
  try {
    if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) {
      return { ok: false, error: '目录不存在' }
    }
  } catch {
    return { ok: false, error: '目录不存在' }
  }

  const current = app.getPath('userData')
  if (normalizePath(current) === normalizePath(value)) {
    return { ok: true, restart: false }
  }

  const migrate = migrateDataFiles(current, value)
  if (migrate.errors.length && migrate.copied.length === 0) {
    // 业务文件一个都没迁成功且有错误时，仍允许切换，但提示
    console.warn('[dataDir] migrate warnings:', migrate.errors)
  }

  try {
    app.setPath('userData', value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `切换数据目录失败：${msg}` }
  }

  try {
    const file = overrideFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, value, 'utf-8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `保存数据目录配置失败：${msg}` }
  }

  return {
    ok: true,
    restart: true,
    migrated: migrate.copied,
    migrateSkipped: migrate.skipped,
    migrateErrors: migrate.errors
  }
}
