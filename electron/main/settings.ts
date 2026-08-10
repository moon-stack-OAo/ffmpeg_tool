import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type {
  AppSettings,
  AudioFormat,
  EncoderId,
  OutputDirMode,
  OutputFormat,
  PresetId,
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
  nameTemplate: DEFAULT_NAME_TEMPLATE,
  outputDirMode: 'fixed',
  targetSizeMb: 0,
  twoPass: true,
  taskMode: 'compress',
  audioFormat: 'm4a',
  audioBitrate: DEFAULT_AUDIO_BITRATE,
  notifyOnComplete: true,
  persistTasks: true,
  theme: 'system'
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
  return v === 'audio' ? 'audio' : 'compress'
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
    theme: normalizeTheme(src.theme)
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

export { DEFAULT_SETTINGS }
