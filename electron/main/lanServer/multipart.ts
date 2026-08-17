import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import type { IncomingMessage } from 'http'
import { Readable } from 'stream'

/** 上传大小上限：512MB */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

export interface MultipartFile {
  fieldName: string
  fileName: string
  mimeType: string
  tempPath: string
  size: number
}

export interface MultipartResult {
  fields: Record<string, string>
  files: MultipartFile[]
}

/**
 * 从 Content-Type 解析 multipart boundary
 */
export function parseBoundary(contentType: string | undefined): string | null {
  if (!contentType) return null
  const m = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  if (!m) return null
  return m[1] || m[2] || null
}

/**
 * 简易 multipart/form-data 解析（流式写盘，避免大文件占内存）
 * 仅支持常见浏览器上传形态
 */
export async function parseMultipart(
  req: IncomingMessage,
  uploadDir: string,
  maxBytes = MAX_UPLOAD_BYTES
): Promise<MultipartResult> {
  const contentType = req.headers['content-type']
  const boundary = parseBoundary(
    typeof contentType === 'string' ? contentType : undefined
  )
  if (!boundary) {
    throw new Error('缺少 multipart boundary')
  }

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  const raw = await readBodyWithLimit(req, maxBytes)
  return parseMultipartBuffer(raw, boundary, uploadDir)
}

function readBodyWithLimit(
  req: IncomingMessage,
  maxBytes: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let aborted = false

    const onData = (chunk: Buffer | string): void => {
      if (aborted) return
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      total += buf.length
      if (total > maxBytes) {
        aborted = true
        req.removeListener('data', onData)
        req.destroy()
        reject(new Error(`上传超过上限 ${Math.floor(maxBytes / (1024 * 1024))}MB`))
        return
      }
      chunks.push(buf)
    }

    req.on('data', onData)
    req.on('end', () => {
      if (aborted) return
      resolve(Buffer.concat(chunks))
    })
    req.on('error', (err) => {
      if (!aborted) reject(err)
    })
  })
}

function parseMultipartBuffer(
  body: Buffer,
  boundary: string,
  uploadDir: string
): MultipartResult {
  const fields: Record<string, string> = {}
  const files: MultipartFile[] = []
  const delim = Buffer.from(`--${boundary}`)
  const parts = splitByBoundary(body, delim)

  for (const part of parts) {
    if (part.length === 0) continue
    // 末尾 -- 结束标记
    if (part.length <= 4 && part.toString('utf8').trim() === '--') continue

    const headerEnd = indexOfDoubleCrlf(part)
    if (headerEnd < 0) continue
    const headerBuf = part.subarray(0, headerEnd)
    // 去掉头部后的 \r\n\r\n，内容末尾可能带 \r\n
    let content = part.subarray(headerEnd + 4)
    if (
      content.length >= 2 &&
      content[content.length - 2] === 0x0d &&
      content[content.length - 1] === 0x0a
    ) {
      content = content.subarray(0, content.length - 2)
    }

    const headers = headerBuf.toString('utf8')
    const disp = /Content-Disposition:\s*form-data;\s*(.+)/i.exec(headers)
    if (!disp) continue
    const nameMatch = /name="([^"]+)"/i.exec(disp[1])
    if (!nameMatch) continue
    const fieldName = nameMatch[1]
    const fileMatch = /filename="([^"]*)"/i.exec(disp[1])
    const mimeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headers)
    const mimeType = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream'

    if (fileMatch && fileMatch[1] !== undefined) {
      const originalName = fileMatch[1] || 'upload.bin'
      // 空文件名视为无文件
      if (!originalName || originalName === 'upload.bin' && content.length === 0) {
        // 仍允许空文件名但有内容
      }
      if (!originalName) continue
      const safeBase = sanitizeFileName(originalName)
      const tempName = `${Date.now()}-${randomBytes(6).toString('hex')}-${safeBase}`
      const tempPath = path.join(uploadDir, tempName)
      fs.writeFileSync(tempPath, content)
      files.push({
        fieldName,
        fileName: safeBase,
        mimeType,
        tempPath,
        size: content.length
      })
    } else {
      fields[fieldName] = content.toString('utf8')
    }
  }

  return { fields, files }
}

function splitByBoundary(body: Buffer, delim: Buffer): Buffer[] {
  const parts: Buffer[] = []
  let start = 0
  // 跳过前导
  const first = body.indexOf(delim)
  if (first < 0) return parts
  start = first + delim.length
  // 跳过 boundary 后的 \r\n
  if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2

  while (start < body.length) {
    const next = body.indexOf(delim, start)
    if (next < 0) {
      parts.push(body.subarray(start))
      break
    }
    // part 内容在 start..next，前有可能是 \r\n--
    let end = next
    if (end >= 2 && body[end - 2] === 0x0d && body[end - 1] === 0x0a) {
      end -= 2
    }
    parts.push(body.subarray(start, end))
    start = next + delim.length
    // -- 表示结束
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2
  }
  return parts
}

function indexOfDoubleCrlf(buf: Buffer): number {
  for (let i = 0; i < buf.length - 3; i++) {
    if (
      buf[i] === 0x0d &&
      buf[i + 1] === 0x0a &&
      buf[i + 2] === 0x0d &&
      buf[i + 3] === 0x0a
    ) {
      return i
    }
  }
  return -1
}

/** 去掉路径穿越与危险字符，仅保留文件名 */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'))
  const cleaned = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'upload.bin'
  }
  // 限制长度
  if (cleaned.length > 180) {
    const ext = path.extname(cleaned)
    const stem = cleaned.slice(0, 180 - ext.length)
    return stem + ext
  }
  return cleaned
}

/**
 * 读取 JSON body（有上限）
 */
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes = 64 * 1024
): Promise<unknown> {
  const raw = await readBodyWithLimit(req, maxBytes)
  if (raw.length === 0) return {}
  try {
    return JSON.parse(raw.toString('utf8')) as unknown
  } catch {
    throw new Error('无效 JSON')
  }
}

/** 将可读流写入文件（供后续流式优化预留） */
export function streamToFile(
  stream: Readable,
  filePath: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath)
    let size = 0
    stream.on('data', (c: Buffer) => {
      size += c.length
    })
    stream.pipe(ws)
    ws.on('finish', () => resolve(size))
    ws.on('error', reject)
    stream.on('error', reject)
  })
}
