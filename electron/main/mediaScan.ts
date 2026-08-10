import fs from 'fs'
import path from 'path'
import { VIDEO_EXTENSIONS } from '../../shared/types'

const VIDEO_EXT_SET = new Set(
  (VIDEO_EXTENSIONS as string[]).map((e) => e.toLowerCase())
)

function isVideoExt(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_EXT_SET.has(ext)
}

/**
 * 从路径列表收集视频文件（支持目录递归）
 * - 文件且视频扩展名 → 加入
 * - 目录 → 递归（深度限制 8）
 * - 最多 maxFiles 个（默认 500）
 */
export function collectVideoFiles(
  paths: string[],
  maxFiles = 500
): Array<{ path: string; name: string }> {
  const result: Array<{ path: string; name: string }> = []
  const seen = new Set<string>()
  const maxDepth = 8

  const pushFile = (filePath: string): void => {
    if (result.length >= maxFiles) return
    const normalized = path.normalize(filePath)
    if (seen.has(normalized)) return
    if (!isVideoExt(normalized)) return
    try {
      if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) return
    } catch {
      return
    }
    seen.add(normalized)
    result.push({ path: normalized, name: path.basename(normalized) })
  }

  const walkDir = (dir: string, depth: number): void => {
    if (result.length >= maxFiles || depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (result.length >= maxFiles) break
      // 跳过隐藏目录与常见噪音
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue
      const full = path.join(dir, ent.name)
      try {
        if (ent.isDirectory()) {
          walkDir(full, depth + 1)
        } else if (ent.isFile()) {
          pushFile(full)
        } else if (ent.isSymbolicLink()) {
          // 可选：跟随符号链接到文件
          try {
            const st = fs.statSync(full)
            if (st.isFile()) pushFile(full)
            else if (st.isDirectory()) walkDir(full, depth + 1)
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore 单条
      }
    }
  }

  for (const p of paths) {
    if (!p || typeof p !== 'string') continue
    if (result.length >= maxFiles) break
    let st: fs.Stats
    try {
      if (!fs.existsSync(p)) continue
      st = fs.statSync(p)
    } catch {
      continue
    }
    if (st.isFile()) {
      pushFile(p)
    } else if (st.isDirectory()) {
      walkDir(p, 0)
    }
  }

  return result
}
