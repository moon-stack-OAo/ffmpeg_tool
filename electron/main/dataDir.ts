import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/** 数据目录覆盖配置存放位置（appData，不随 userData 变化） */
const OVERRIDE_DIR_NAME = 'ffmpeg-tool'

function overrideFile(): string {
  return path.join(app.getPath('appData'), OVERRIDE_DIR_NAME, 'user-data-dir.txt')
}

function normalizePath(p: string): string {
  return (p || '').trim().replace(/[\\/]+$/, '')
}

/** 启动时应用持久化的自定义数据目录（须在读取 userData 之前调用） */
export function applyUserDataOverride(): void {
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
  try {
    const file = overrideFile()
    if (!fs.existsSync(file)) return ''
    const text = fs.readFileSync(file, 'utf-8').trim()
    if (!text) return ''
    if (!fs.existsSync(text) || !fs.statSync(text).isDirectory()) return ''
    return text
  } catch {
    return ''
  }
}

/** 复制关键数据文件到新目录（新目录已有同名文件则不覆盖） */
function migrateDataFiles(oldDir: string, newDir: string): void {
  for (const name of ['settings.json', 'tasks.json']) {
    try {
      const src = path.join(oldDir, name)
      const dst = path.join(newDir, name)
      if (!fs.existsSync(src) || fs.existsSync(dst)) continue
      fs.mkdirSync(newDir, { recursive: true })
      fs.copyFileSync(src, dst)
    } catch (err) {
      console.warn('[dataDir] migrate', name, 'failed:', err)
    }
  }
}

/** 修改数据目录：迁移数据 → 切换路径 → 持久化覆盖配置 */
export function setUserDataDir(
  dir: string
): { ok: boolean; error?: string; restart?: boolean } {
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

  migrateDataFiles(current, value)

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

  return { ok: true, restart: true }
}