import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type {
  AppSettings,
  AspectRatioId,
  AudioFormat,
  CloseAction,
  EncoderId,
  ImageEngineId,
  OutputDirMode,
  OutputFormat,
  PresetId,
  ScaleMode,
  ScalePadMode,
  TaskMode,
  ThemeMode
} from '../../shared/types'
import {
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_NAME_TEMPLATE
} from '../../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  outputDir: '',
  presetId: 'standard',
  encoder: 'auto',
  concurrency: 2,
  customCrf: 23,
  customMaxEdge: 0,
  customFormat: 'mp4',
  scaleMode: 'maxEdge',
  outWidth: 1920,
  outHeight: 1080,
  aspectRatio: '16:9',
  scalePad: 'black',
  nameTemplate: DEFAULT_NAME_TEMPLATE,
  outputDirMode: 'fixed',
  targetSizeMb: 0,
  twoPass: true,
  taskMode: 'compress',
  audioFormat: 'm4a',
  audioBitrate: DEFAULT_AUDIO_BITRATE,
  notifyOnComplete: true,
  persistTasks: true,
  theme: 'system',
  ffmpegBinDir: '',
  closeAction: 'ask',
  imageEngine: 'sharp',
  imagemagickPath: '',
  imageFormat: 'jpeg',
  imageQuality: 80,
  imageMaxEdge: 1920,
  imageStrip: true,
  imageLayout: 'horizontal',
  imageGridCols: 2,
  imageGap: 0,
  imageBackground: '#000000',
  concatPreferCopy: true,
  lanRemoteEnabled: false,
  lanPort: 17890,
  lanUsername: 'admin',
  lanPasswordHash: ''
}

let cached: AppSettings | null = null

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function clampConcurrency(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return DEFAULT_SETTINGS.concurrency
  return Math.max(1, Math.min(4, Math.floor(v)))
}

function normalizeTaskMode(v: unknown): TaskMode {
  if (
    v === 'audio' ||
    v === 'image' ||
    v === 'image-crop' ||
    v === 'image-stitch' ||
    v === 'video-concat' ||
    v === 'media-compose' ||
    v === 'compress'
  ) {
    return v
  }
  return 'compress'
}

function normalizeImageFormat(
  v: unknown
): AppSettings['imageFormat'] {
  if (v === 'jpeg' || v === 'png' || v === 'webp' || v === 'keep') return v
  return DEFAULT_SETTINGS.imageFormat
}

function normalizeImageLayout(
  v: unknown
): AppSettings['imageLayout'] {
  if (v === 'horizontal' || v === 'vertical' || v === 'grid') return v
  return DEFAULT_SETTINGS.imageLayout
}

function normalizeNonNegInt(v: unknown, fallback: number, max = 1e7): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(max, Math.floor(n))
}

function normalizeQuality(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.imageQuality
  return Math.max(1, Math.min(100, Math.round(n)))
}

function normalizeAudioFormat(v: unknown): AudioFormat {
  if (v === 'mp3' || v === 'opus' || v === 'm4a') return v
  return DEFAULT_SETTINGS.audioFormat
}

function normalizeOutputDirMode(v: unknown): OutputDirMode {
  if (v === 'sidecar' || v === 'dated' || v === 'fixed') return v
  return DEFAULT_SETTINGS.outputDirMode
}

function normalizeTargetSizeMb(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function normalizeTheme(v: unknown): ThemeMode {
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return DEFAULT_SETTINGS.theme
}

function normalizeCloseAction(v: unknown): CloseAction {
  if (v === 'tray' || v === 'quit' || v === 'ask') return v
  return DEFAULT_SETTINGS.closeAction
}

function normalizeImageEngine(v: unknown): ImageEngineId {
  return v === 'imagemagick' ? 'imagemagick' : 'sharp'
}

function normalizeLanPort(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.lanPort
  return Math.max(1024, Math.min(65535, Math.floor(n)))
}

function normalizeLanUsername(v: unknown): string {
  if (typeof v !== 'string') return DEFAULT_SETTINGS.lanUsername
  const s = v.trim()
  if (!s || s.length > 64) return DEFAULT_SETTINGS.lanUsername
  return s
}

function normalizeScaleMode(v: unknown): ScaleMode {
  if (v === 'none' || v === 'maxEdge' || v === 'fixed' || v === 'aspect') {
    return v
  }
  return DEFAULT_SETTINGS.scaleMode ?? 'maxEdge'
}

function normalizeAspectRatio(v: unknown): AspectRatioId {
  if (v === '16:9' || v === '9:16' || v === '1:1' || v === '4:3') return v
  return DEFAULT_SETTINGS.aspectRatio ?? '16:9'
}

function normalizeScalePad(v: unknown): ScalePadMode {
  if (v === 'none' || v === 'black') return v
  return DEFAULT_SETTINGS.scalePad ?? 'black'
}

function normalize(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    outputDir: typeof src.outputDir === 'string' ? src.outputDir : DEFAULT_SETTINGS.outputDir,
    presetId: (src.presetId as PresetId) || DEFAULT_SETTINGS.presetId,
    encoder: (src.encoder as EncoderId) || DEFAULT_SETTINGS.encoder,
    concurrency: clampConcurrency(src.concurrency ?? DEFAULT_SETTINGS.concurrency),
    customCrf:
      typeof src.customCrf === 'number' && Number.isFinite(src.customCrf)
        ? src.customCrf
        : DEFAULT_SETTINGS.customCrf,
    customMaxEdge:
      typeof src.customMaxEdge === 'number' && Number.isFinite(src.customMaxEdge)
        ? src.customMaxEdge
        : DEFAULT_SETTINGS.customMaxEdge,
    customFormat: (src.customFormat as OutputFormat) || DEFAULT_SETTINGS.customFormat,
    scaleMode: normalizeScaleMode(src.scaleMode),
    outWidth: normalizeNonNegInt(
      src.outWidth,
      DEFAULT_SETTINGS.outWidth ?? 1920,
      7680
    ),
    outHeight: normalizeNonNegInt(
      src.outHeight,
      DEFAULT_SETTINGS.outHeight ?? 1080,
      7680
    ),
    aspectRatio: normalizeAspectRatio(src.aspectRatio),
    scalePad: normalizeScalePad(src.scalePad),
    nameTemplate:
      typeof src.nameTemplate === 'string' && src.nameTemplate.trim()
        ? src.nameTemplate.trim()
        : DEFAULT_SETTINGS.nameTemplate,
    outputDirMode: normalizeOutputDirMode(src.outputDirMode),
    targetSizeMb: normalizeTargetSizeMb(src.targetSizeMb),
    twoPass: typeof src.twoPass === 'boolean' ? src.twoPass : DEFAULT_SETTINGS.twoPass,
    taskMode: normalizeTaskMode(src.taskMode),
    audioFormat: normalizeAudioFormat(src.audioFormat),
    audioBitrate:
      typeof src.audioBitrate === 'string' && src.audioBitrate.trim()
        ? src.audioBitrate.trim()
        : DEFAULT_SETTINGS.audioBitrate,
    notifyOnComplete:
      typeof src.notifyOnComplete === 'boolean'
        ? src.notifyOnComplete
        : DEFAULT_SETTINGS.notifyOnComplete,
    persistTasks:
      typeof src.persistTasks === 'boolean'
        ? src.persistTasks
        : DEFAULT_SETTINGS.persistTasks,
    theme: normalizeTheme(src.theme),
    ffmpegBinDir:
      typeof src.ffmpegBinDir === 'string' ? src.ffmpegBinDir.trim() : '',
    closeAction: normalizeCloseAction(src.closeAction),
    imageEngine: normalizeImageEngine(src.imageEngine),
    imagemagickPath:
      typeof src.imagemagickPath === 'string' ? src.imagemagickPath.trim() : '',
    imageFormat: normalizeImageFormat(src.imageFormat),
    imageQuality: normalizeQuality(src.imageQuality),
    imageMaxEdge: normalizeNonNegInt(
      src.imageMaxEdge,
      DEFAULT_SETTINGS.imageMaxEdge,
      7680
    ),
    imageStrip:
      typeof src.imageStrip === 'boolean'
        ? src.imageStrip
        : DEFAULT_SETTINGS.imageStrip,
    imageLayout: normalizeImageLayout(src.imageLayout),
    imageGridCols: Math.max(
      1,
      Math.min(
        20,
        normalizeNonNegInt(src.imageGridCols, DEFAULT_SETTINGS.imageGridCols, 20) ||
          DEFAULT_SETTINGS.imageGridCols
      )
    ),
    imageGap: normalizeNonNegInt(src.imageGap, DEFAULT_SETTINGS.imageGap, 500),
    imageBackground:
      typeof src.imageBackground === 'string' && src.imageBackground.trim()
        ? src.imageBackground.trim()
        : DEFAULT_SETTINGS.imageBackground,
    concatPreferCopy:
      typeof src.concatPreferCopy === 'boolean'
        ? src.concatPreferCopy
        : DEFAULT_SETTINGS.concatPreferCopy,
    lanRemoteEnabled:
      typeof src.lanRemoteEnabled === 'boolean'
        ? src.lanRemoteEnabled
        : DEFAULT_SETTINGS.lanRemoteEnabled,
    lanPort: normalizeLanPort(src.lanPort),
    lanUsername: normalizeLanUsername(src.lanUsername),
    lanPasswordHash:
      typeof src.lanPasswordHash === 'string' ? src.lanPasswordHash : ''
  }
}

/** 从磁盘加载设置，失败时返回默认值 */
export function loadSettings(): AppSettings {
  try {
    const file = settingsPath()
    if (!fs.existsSync(file)) {
      cached = { ...DEFAULT_SETTINGS }
      return cached
    }
    const text = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(text) as Partial<AppSettings>
    cached = normalize(parsed)
    return cached
  } catch (err) {
    console.warn('[settings] loadSettings failed:', err)
    cached = { ...DEFAULT_SETTINGS }
    return cached
  }
}

/** 合并并持久化部分设置 */
export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = cached ?? loadSettings()
  const next = normalize({ ...current, ...partial })
  cached = next
  try {
    const file = settingsPath()
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8')
  } catch (err) {
    console.warn('[settings] saveSettings failed:', err)
  }
  return next
}

/** 获取当前设置（内存优先，未加载则读盘） */
export function getSettings(): AppSettings {
  if (cached) return cached
  return loadSettings()
}

/** 重置全部设置为默认值：清空内存缓存并删除磁盘文件，返回默认设置 */
export function resetSettings(): AppSettings {
  cached = { ...DEFAULT_SETTINGS }
  try {
    const file = settingsPath()
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  } catch (err) {
    console.warn('[settings] resetSettings failed:', err)
  }
  return cached
}

export { DEFAULT_SETTINGS }
