import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { app } from 'electron'
import type {
  AudioFormat,
  CompressOptions,
  CompressTask,
  LanRemoteConfigInput,
  LanStatus,
  LanTaskView,
  OutputFormat,
  PresetId,
  ProgressPayload,
  TaskEndPayload,
  TaskMode
} from '../../../shared/types'
import {
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_AUDIO_NAME_TEMPLATE,
  DEFAULT_NAME_TEMPLATE,
  DEFAULT_PRESETS,
  VIDEO_EXTENSIONS
} from '../../../shared/types'
import { checkFfmpegAvailable } from '../ffmpeg'
import { getSettings, saveSettings } from '../settings'
import { taskQueue } from '../taskQueue'
import {
  MAX_UPLOAD_BYTES,
  parseMultipart,
  readJsonBody,
  sanitizeFileName
} from './multipart'
import { hashPassword, verifyPassword } from './password'
import { LoginRateLimiter } from './rateLimit'
import {
  SESSION_COOKIE,
  SessionStore,
  buildSetCookie,
  parseCookie
} from './session'

/** 默认端口 */
export const DEFAULT_LAN_PORT = 17890

/** 允许的扩展名：视频 + 常见音频源 */
const ALLOWED_EXTENSIONS = new Set<string>([
  ...(VIDEO_EXTENSIONS as string[]),
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.flac',
  '.ogg',
  '.opus',
  '.wma'
])

/** 局域网任务内存表（含路径，不下发前端） */
interface LanTaskRecord {
  task: CompressTask
  /** 是否由局域网创建 */
  fromLan: boolean
}

let server: Server | null = null
let listenPort = 0
let lastError: string | undefined
const sessions = new SessionStore()
const loginLimiter = new LoginRateLimiter()
const lanTasks = new Map<string, LanTaskRecord>()
let removeQueueListener: (() => void) | null = null

function uploadsDir(): string {
  return path.join(app.getPath('userData'), 'lan-uploads')
}

function publicDir(): string {
  // 开发：源码旁 public；打包：与 main 同级 lanServer/public 或 resources
  const candidates = [
    path.join(__dirname, 'public'),
    path.join(__dirname, 'lanServer', 'public'),
    path.join(app.getAppPath(), 'electron', 'main', 'lanServer', 'public'),
    path.join(process.resourcesPath || '', 'lan-web')
  ]
  for (const d of candidates) {
    if (d && fs.existsSync(path.join(d, 'index.html'))) return d
  }
  return path.join(__dirname, 'public')
}

function ensureUploadsDir(): void {
  const d = uploadsDir()
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true })
  }
}

/** 本机局域网 IPv4 地址 */
export function getLanAddresses(): string[] {
  const addrs: string[] = []
  try {
    const ifaces = os.networkInterfaces()
    for (const list of Object.values(ifaces)) {
      if (!list) continue
      for (const info of list) {
        if (info.family === 'IPv4' && !info.internal) {
          addrs.push(info.address)
        }
      }
    }
  } catch {
    // ignore
  }
  if (addrs.length === 0) addrs.push('127.0.0.1')
  return addrs
}

export function getLanStatus(): LanStatus {
  const s = getSettings()
  const port = s.lanPort || DEFAULT_LAN_PORT
  const running = server != null && listenPort > 0
  const activePort = running ? listenPort : port
  const urls = getLanAddresses().map((ip) => `http://${ip}:${activePort}`)
  return {
    enabled: Boolean(s.lanRemoteEnabled),
    running,
    port: activePort,
    username: s.lanUsername || 'admin',
    hasPassword: Boolean(s.lanPasswordHash),
    urls,
    error: lastError
  }
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>
): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    ...extraHeaders
  })
  res.end(data)
}

function clientIp(req: IncomingMessage): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

function getSession(req: IncomingMessage) {
  const sid = parseCookie(req.headers.cookie, SESSION_COOKIE)
  return sessions.get(sid)
}

function requireAuth(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const sess = getSession(req)
  if (!sess) {
    json(res, 401, { ok: false, error: '未登录' })
    return false
  }
  return true
}

function toLanView(task: CompressTask): LanTaskView {
  const downloadable =
    task.status === 'completed' &&
    Boolean(task.outputPath) &&
    fs.existsSync(task.outputPath)
  return {
    id: task.id,
    fileName: task.fileName,
    status: task.status,
    progress: task.progress ?? 0,
    inputSize: task.inputSize,
    outputSize: task.outputSize,
    error: task.error,
    time: task.time,
    speed: task.speed,
    etaSec: task.etaSec,
    mode: task.options?.mode,
    downloadable
  }
}

function genTaskId(): string {
  return `lan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isAllowedExt(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return ALLOWED_EXTENSIONS.has(ext)
}

function resolvePreset(presetId: PresetId): {
  crf: number
  maxEdge: number
  format: OutputFormat
} {
  const p = DEFAULT_PRESETS.find((x) => x.id === presetId)
  if (p && presetId !== 'custom') {
    return { crf: p.crf, maxEdge: p.maxEdge, format: p.format }
  }
  const s = getSettings()
  return {
    crf: s.customCrf,
    maxEdge: s.customMaxEdge,
    format: s.customFormat
  }
}

function buildLanOptions(params: {
  mode?: TaskMode
  presetId?: PresetId
  format?: OutputFormat
  maxEdge?: number
  /** 自定义预设时可覆盖 CRF */
  crf?: number
  /** 可选目标体积 MB（>0 生效） */
  targetSizeMb?: number
  audioFormat?: AudioFormat
  audioBitrate?: string
}): CompressOptions {
  const settings = getSettings()
  const mode: TaskMode = params.mode === 'audio' ? 'audio' : 'compress'
  const presetId: PresetId =
    params.presetId === 'archive' ||
    params.presetId === 'standard' ||
    params.presetId === 'social' ||
    params.presetId === 'custom'
      ? params.presetId
      : settings.presetId || 'standard'

  const base = resolvePreset(presetId)
  let format: OutputFormat = base.format
  if (
    params.format === 'mp4' ||
    params.format === 'webm' ||
    params.format === 'mkv' ||
    params.format === 'mov'
  ) {
    format = params.format
  }

  let maxEdge = base.maxEdge
  if (typeof params.maxEdge === 'number' && Number.isFinite(params.maxEdge)) {
    maxEdge = Math.max(0, Math.floor(params.maxEdge))
  }

  // 自定义预设允许远程覆盖 CRF；其它预设用预设固定值
  let crf = base.crf
  if (
    presetId === 'custom' &&
    typeof params.crf === 'number' &&
    Number.isFinite(params.crf)
  ) {
    crf = Math.max(0, Math.min(51, Math.round(params.crf)))
  }

  let targetSizeMb =
    settings.targetSizeMb > 0 ? settings.targetSizeMb : undefined
  if (
    typeof params.targetSizeMb === 'number' &&
    Number.isFinite(params.targetSizeMb) &&
    params.targetSizeMb > 0
  ) {
    targetSizeMb = Math.min(10240, Math.max(1, params.targetSizeMb))
  }

  const audioFormat: AudioFormat =
    params.audioFormat === 'mp3' ||
    params.audioFormat === 'opus' ||
    params.audioFormat === 'm4a'
      ? params.audioFormat
      : settings.audioFormat || 'm4a'

  const audioBitrate =
    typeof params.audioBitrate === 'string' && params.audioBitrate.trim()
      ? params.audioBitrate.trim()
      : settings.audioBitrate || DEFAULT_AUDIO_BITRATE

  // 远程任务：编码器/水印/并发用本机设置；输出尊重用户 outputDir
  const outputDir =
    settings.outputDir && settings.outputDir.trim()
      ? settings.outputDir.trim()
      : path.join(app.getPath('userData'), 'lan-outputs')

  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true })
    } catch {
      // 后续 enqueue 再报错
    }
  }

  return {
    presetId,
    crf,
    maxEdge,
    format,
    outputDir,
    encoder: settings.encoder || 'auto',
    nameTemplate:
      mode === 'audio'
        ? settings.nameTemplate || DEFAULT_AUDIO_NAME_TEMPLATE
        : settings.nameTemplate || DEFAULT_NAME_TEMPLATE,
    outputDirMode: settings.outputDirMode || 'fixed',
    targetSizeMb,
    twoPass: settings.twoPass,
    mode,
    audioFormat,
    audioBitrate,
    // 水印等高级项不暴露远程，使用本机默认（无）
    fallbackToSoftware: true
  }
}

function updateLanTaskFromProgress(p: ProgressPayload): void {
  const rec = lanTasks.get(p.taskId)
  if (!rec) return
  rec.task = {
    ...rec.task,
    status: 'running',
    progress: p.percent,
    time: p.time,
    speed: p.speed,
    etaSec: p.etaSec
  }
}

function updateLanTaskFromEnd(p: TaskEndPayload): void {
  const rec = lanTasks.get(p.taskId)
  if (!rec) return
  rec.task = {
    ...rec.task,
    status: p.status,
    progress: p.status === 'completed' ? 100 : rec.task.progress,
    error: p.error,
    outputPath: p.outputPath || rec.task.outputPath,
    inputSize: p.inputSize ?? rec.task.inputSize,
    outputSize: p.outputSize,
    resolvedEncoder: p.resolvedEncoder,
    commandLine: p.commandLine,
    etaSec: p.status === 'completed' ? 0 : rec.task.etaSec
  }
}

function attachQueueListener(): void {
  if (removeQueueListener) return
  removeQueueListener = taskQueue.addListener({
    onProgress: updateLanTaskFromProgress,
    onEnd: updateLanTaskFromEnd,
    onQueued: (taskId, task) => {
      const rec = lanTasks.get(taskId)
      if (rec) {
        rec.task = { ...task, status: 'queued' }
      }
    }
  })
}

function detachQueueListener(): void {
  removeQueueListener?.()
  removeQueueListener = null
}

async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const ip = clientIp(req)
  if (loginLimiter.isBlocked(ip)) {
    json(res, 429, { ok: false, error: '登录尝试过多，请稍后再试' })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (e) {
    json(res, 400, {
      ok: false,
      error: e instanceof Error ? e.message : '请求无效'
    })
    return
  }

  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const username = typeof obj.username === 'string' ? obj.username.trim() : ''
  const password = typeof obj.password === 'string' ? obj.password : ''

  const settings = getSettings()
  if (!settings.lanPasswordHash) {
    json(res, 503, { ok: false, error: '服务端未设置密码' })
    return
  }

  const userOk = username === (settings.lanUsername || 'admin')
  const passOk = userOk && verifyPassword(password, settings.lanPasswordHash)

  if (!passOk) {
    loginLimiter.recordFail(ip)
    json(res, 401, {
      ok: false,
      error: '用户名或密码错误',
      remaining: loginLimiter.remaining(ip)
    })
    return
  }

  loginLimiter.reset(ip)
  const sess = sessions.create(username)
  json(
    res,
    200,
    { ok: true, username: sess.username },
    {
      'Set-Cookie': buildSetCookie(SESSION_COOKIE, sess.id)
    }
  )
}

function handleLogout(req: IncomingMessage, res: ServerResponse): void {
  const sid = parseCookie(req.headers.cookie, SESSION_COOKIE)
  sessions.destroy(sid)
  json(
    res,
    200,
    { ok: true },
    { 'Set-Cookie': buildSetCookie(SESSION_COOKIE, '', { clear: true }) }
  )
}

function handleStatus(req: IncomingMessage, res: ServerResponse): void {
  const sess = getSession(req)
  const settings = getSettings()
  json(res, 200, {
    ok: true,
    product: '轻影',
    authenticated: Boolean(sess),
    username: sess?.username,
    needLogin: true,
    hasPassword: Boolean(settings.lanPasswordHash),
    presets: DEFAULT_PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description
    })),
    modes: [
      { value: 'compress', label: '视频压缩' },
      { value: 'audio', label: '仅抽取音频' }
    ],
    audioFormats: [
      { value: 'm4a', label: 'M4A' },
      { value: 'mp3', label: 'MP3' },
      { value: 'opus', label: 'Opus' }
    ],
    audioBitrates: ['128k', '192k', '256k', '320k'],
    videoFormats: ['mp4', 'mkv', 'mov', 'webm'],
    maxUploadMb: Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))
  })
}

function handleListTasks(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAuth(req, res)) return
  const list = Array.from(lanTasks.values())
    .map((r) => toLanView(r.task))
    .sort((a, b) => {
      // 新任务 id 含时间戳，倒序
      return b.id.localeCompare(a.id)
    })
  json(res, 200, { ok: true, tasks: list })
}

async function handleCreateTask(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!requireAuth(req, res)) return

  const status = checkFfmpegAvailable()
  if (!status.ready) {
    json(res, 503, { ok: false, error: status.error || 'ffmpeg 未就绪' })
    return
  }

  ensureUploadsDir()
  let parsed
  try {
    parsed = await parseMultipart(req, uploadsDir(), MAX_UPLOAD_BYTES)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 400, { ok: false, error: msg })
    return
  }

  const file =
    parsed.files.find((f) => f.fieldName === 'file') || parsed.files[0]
  if (!file) {
    json(res, 400, { ok: false, error: '请上传文件（字段名 file）' })
    return
  }

  if (!isAllowedExt(file.fileName)) {
    try {
      fs.unlinkSync(file.tempPath)
    } catch {
      // ignore
    }
    json(res, 400, {
      ok: false,
      error: `不支持的文件类型：${path.extname(file.fileName) || '未知'}`
    })
    return
  }

  // options 可来自字段 options（JSON 字符串）或独立字段
  let optRaw: Record<string, unknown> = {}
  if (parsed.fields.options) {
    try {
      const o = JSON.parse(parsed.fields.options) as unknown
      if (o && typeof o === 'object') optRaw = o as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, error: 'options JSON 无效' })
      return
    }
  } else {
    optRaw = { ...parsed.fields }
  }

  const mode = optRaw.mode === 'audio' ? 'audio' : 'compress'
  const presetId = (optRaw.presetId as PresetId) || undefined
  const format = optRaw.format as OutputFormat | undefined
  const maxEdge =
    typeof optRaw.maxEdge === 'number'
      ? optRaw.maxEdge
      : optRaw.maxEdge != null
        ? Number(optRaw.maxEdge)
        : undefined
  const crf =
    typeof optRaw.crf === 'number'
      ? optRaw.crf
      : optRaw.crf != null
        ? Number(optRaw.crf)
        : undefined
  const targetSizeMb =
    typeof optRaw.targetSizeMb === 'number'
      ? optRaw.targetSizeMb
      : optRaw.targetSizeMb != null
        ? Number(optRaw.targetSizeMb)
        : undefined
  const audioFormat = optRaw.audioFormat as AudioFormat | undefined
  const audioBitrate =
    typeof optRaw.audioBitrate === 'string' ? optRaw.audioBitrate : undefined

  const options = buildLanOptions({
    mode,
    presetId,
    format,
    maxEdge,
    crf,
    targetSizeMb,
    audioFormat,
    audioBitrate
  })

  // 固定文件名到上传目录（已是 sanitize 后）
  const finalName = sanitizeFileName(file.fileName)
  const finalPath = path.join(uploadsDir(), `${genTaskId()}-${finalName}`)
  try {
    fs.renameSync(file.tempPath, finalPath)
  } catch {
    try {
      fs.copyFileSync(file.tempPath, finalPath)
      fs.unlinkSync(file.tempPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      json(res, 500, { ok: false, error: `保存上传失败: ${msg}` })
      return
    }
  }

  const taskId = genTaskId()
  const task: CompressTask = {
    id: taskId,
    inputPath: finalPath,
    fileName: finalName,
    outputPath: '',
    status: 'queued',
    progress: 0,
    options,
    inputSize: file.size
  }

  lanTasks.set(taskId, { task, fromLan: true })
  taskQueue.enqueue(task)
  // 同步到桌面 UI
  taskQueue.notifyTaskAdded({
    ...task,
    status: 'queued',
    progress: 0
  })

  json(res, 200, { ok: true, task: toLanView(lanTasks.get(taskId)!.task) })
}

function handleDownload(
  req: IncomingMessage,
  res: ServerResponse,
  taskId: string
): void {
  if (!requireAuth(req, res)) return

  // 防路径穿越：仅允许 map 中的 id
  if (!taskId || taskId.includes('..') || taskId.includes('/') || taskId.includes('\\')) {
    json(res, 400, { ok: false, error: '无效任务 ID' })
    return
  }

  const rec = lanTasks.get(taskId)
  if (!rec) {
    json(res, 404, { ok: false, error: '任务不存在' })
    return
  }

  const t = rec.task
  if (t.status !== 'completed' || !t.outputPath) {
    json(res, 400, { ok: false, error: '任务未完成，无法下载' })
    return
  }

  if (!fs.existsSync(t.outputPath)) {
    json(res, 404, { ok: false, error: '输出文件不存在' })
    return
  }

  // 确认输出路径在用户目录或 outputDir 下（防误配）
  const resolved = path.resolve(t.outputPath)
  try {
    const st = fs.statSync(resolved)
    if (!st.isFile()) {
      json(res, 404, { ok: false, error: '输出不是文件' })
      return
    }
  } catch {
    json(res, 404, { ok: false, error: '无法读取输出文件' })
    return
  }

  const downloadName = path.basename(resolved)
  const type = guessMime(downloadName)
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': fs.statSync(resolved).size,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
  })
  const stream = fs.createReadStream(resolved)
  stream.pipe(res)
  stream.on('error', () => {
    try {
      res.end()
    } catch {
      // ignore
    }
  })
}

function guessMime(name: string): string {
  const ext = path.extname(name).toLowerCase()
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.opus': 'audio/opus',
    '.wav': 'audio/wav'
  }
  return map[ext] || 'application/octet-stream'
}

function safeJoinPublic(urlPath: string): string | null {
  const root = path.resolve(publicDir())
  // 去掉 query
  const clean = urlPath.split('?')[0].split('#')[0]
  let rel = decodeURIComponent(clean)
  if (rel === '/' || rel === '') rel = '/index.html'
  if (rel.includes('\0')) return null
  // 去掉开头 /
  const joined = path.resolve(root, '.' + rel.replace(/\\/g, '/'))
  if (!joined.startsWith(root)) return null
  return joined
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url || '/'
  const filePath = safeJoinPublic(url)
  if (!filePath) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  let target = filePath
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    const index = path.join(publicDir(), 'index.html')
    if (fs.existsSync(index)) {
      target = index
    } else {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
  }

  const ext = path.extname(target).toLowerCase()
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json'
  }
  try {
    const data = fs.readFileSync(target)
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Content-Length': data.length
    })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not Found')
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // CORS：仅局域网同源使用，仍允许简单跨源调试
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'no-store')

  const method = (req.method || 'GET').toUpperCase()
  const url = req.url || '/'
  const pathOnly = url.split('?')[0]

  try {
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true'
      })
      res.end()
      return
    }

    if (pathOnly === '/api/status' && method === 'GET') {
      handleStatus(req, res)
      return
    }
    if (pathOnly === '/api/login' && method === 'POST') {
      await handleLogin(req, res)
      return
    }
    if (pathOnly === '/api/logout' && method === 'POST') {
      handleLogout(req, res)
      return
    }
    if (pathOnly === '/api/tasks' && method === 'GET') {
      handleListTasks(req, res)
      return
    }
    if (pathOnly === '/api/tasks' && method === 'POST') {
      await handleCreateTask(req, res)
      return
    }

    const dl = /^\/api\/tasks\/([^/]+)\/download$/.exec(pathOnly)
    if (dl && method === 'GET') {
      handleDownload(req, res, decodeURIComponent(dl[1]))
      return
    }

    if (pathOnly.startsWith('/api/')) {
      json(res, 404, { ok: false, error: '接口不存在' })
      return
    }

    if (method === 'GET' || method === 'HEAD') {
      serveStatic(req, res)
      return
    }

    json(res, 405, { ok: false, error: '方法不允许' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[lanServer] request error:', msg)
    if (!res.headersSent) {
      json(res, 500, { ok: false, error: msg })
    }
  }
}

/**
 * 启动局域网 HTTP 服务（0.0.0.0）
 */
export function startLanServer(port?: number): Promise<LanStatus> {
  return new Promise((resolve) => {
    const settings = getSettings()
    const p =
      typeof port === 'number' && Number.isFinite(port)
        ? Math.max(1024, Math.min(65535, Math.floor(port)))
        : settings.lanPort || DEFAULT_LAN_PORT

    if (server) {
      // 已在运行：若端口一致直接返回
      if (listenPort === p) {
        lastError = undefined
        resolve(getLanStatus())
        return
      }
      stopLanServer()
    }

    if (!settings.lanPasswordHash) {
      lastError = '请先设置远程访问密码'
      resolve(getLanStatus())
      return
    }

    ensureUploadsDir()
    attachQueueListener()
    sessions.purgeExpired()

    const s = http.createServer((req, res) => {
      void handleRequest(req, res)
    })

    s.on('error', (err: NodeJS.ErrnoException) => {
      lastError = err.code === 'EADDRINUSE' ? `端口 ${p} 已被占用` : err.message
      console.warn('[lanServer] listen error:', lastError)
      server = null
      listenPort = 0
      resolve(getLanStatus())
    })

    s.listen(p, '0.0.0.0', () => {
      server = s
      listenPort = p
      lastError = undefined
      console.log(`[lanServer] listening on 0.0.0.0:${p}`)
      resolve(getLanStatus())
    })
  })
}

/**
 * 停止服务并清除会话
 */
export function stopLanServer(): LanStatus {
  if (server) {
    try {
      server.close()
    } catch (err) {
      console.warn('[lanServer] close error:', err)
    }
    server = null
  }
  listenPort = 0
  sessions.clearAll()
  loginLimiter.clearAll()
  // 保留 lanTasks 状态，便于再次开启后查看历史；不 detach 进度监听以便运行中任务仍更新
  // 若完全关闭远程，仍可保留内存任务
  lastError = undefined
  return getLanStatus()
}

/**
 * 应用局域网配置：持久化 + start/stop + 改密清会话
 */
export async function applyLanRemoteConfig(
  input: LanRemoteConfigInput
): Promise<{ ok: boolean; status: LanStatus; error?: string }> {
  try {
    const current = getSettings()
    const partial: Partial<typeof current> = {}

    if (typeof input.enabled === 'boolean') {
      partial.lanRemoteEnabled = input.enabled
    }
    if (typeof input.port === 'number' && Number.isFinite(input.port)) {
      partial.lanPort = Math.max(1024, Math.min(65535, Math.floor(input.port)))
    }
    if (typeof input.username === 'string') {
      const u = input.username.trim()
      if (u && u.length <= 64) {
        partial.lanUsername = u
      }
    }

    let passwordChanged = false
    if (typeof input.password === 'string' && input.password.length > 0) {
      if (input.password.length < 4) {
        return {
          ok: false,
          status: getLanStatus(),
          error: '密码至少 4 位'
        }
      }
      if (input.password.length > 128) {
        return {
          ok: false,
          status: getLanStatus(),
          error: '密码过长'
        }
      }
      partial.lanPasswordHash = hashPassword(input.password)
      passwordChanged = true
    }

    const next = saveSettings(partial)

    if (passwordChanged) {
      sessions.clearAll()
    }

    // 关闭 → 停服务
    if (!next.lanRemoteEnabled) {
      const status = stopLanServer()
      return { ok: true, status }
    }

    // 开启：需有密码
    if (!next.lanPasswordHash) {
      lastError = '请先设置远程访问密码'
      return {
        ok: false,
        status: getLanStatus(),
        error: lastError
      }
    }

    // 端口变更或未运行 → 重启
    const needRestart =
      !server ||
      listenPort !== next.lanPort ||
      passwordChanged

    if (needRestart) {
      if (server) stopLanServer()
      const status = await startLanServer(next.lanPort)
      if (!status.running) {
        return {
          ok: false,
          status,
          error: status.error || '启动失败'
        }
      }
      return { ok: true, status }
    }

    return { ok: true, status: getLanStatus() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    lastError = msg
    return { ok: false, status: getLanStatus(), error: msg }
  }
}

/**
 * 根据当前设置同步服务状态（启动时 / settings 变更后）
 */
export async function syncLanServerFromSettings(): Promise<LanStatus> {
  const s = getSettings()
  if (!s.lanRemoteEnabled) {
    if (server) stopLanServer()
    return getLanStatus()
  }
  if (!s.lanPasswordHash) {
    lastError = '请先设置远程访问密码'
    if (server) stopLanServer()
    return getLanStatus()
  }
  if (server && listenPort === s.lanPort) {
    return getLanStatus()
  }
  return startLanServer(s.lanPort)
}
