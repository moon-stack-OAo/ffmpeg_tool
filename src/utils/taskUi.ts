import { type CompressTask, formatSaveRatio, type TaskStatus } from '@shared/types'

/** 任务状态中文标签 */
export function statusLabel(s: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    pending: '待处理',
    queued: '排队中',
    running: '压缩中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
  return map[s] || s
}

/** Element Plus Tag 类型 */
export function statusType(s: TaskStatus): '' | 'success' | 'warning' | 'info' | 'danger' {
  if (s === 'completed') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'running') return 'warning'
  if (s === 'queued') return 'info'
  if (s === 'cancelled') return 'info'
  return ''
}

/** 任务体积对比文案（仅完成态） */
export function sizeCompareText(row: CompressTask): string {
  if (row.status !== 'completed') return '—'
  const ratio = formatSaveRatio(row.inputSize, row.outputSize)
  if (!ratio) return '—'
  return ratio
}

/** 体积对比样式 class */
export function sizeCompareClass(row: CompressTask): string {
  if (row.status !== 'completed') return ''
  const ratio = formatSaveRatio(row.inputSize, row.outputSize)
  if (!ratio) return ''
  if (ratio.startsWith('-')) return 'save-good'
  if (ratio.startsWith('+')) return 'save-bad'
  return ''
}

/**
 * 格式化剩余时间：秒 → `剩余 m:ss` / `剩余 h:mm:ss`
 */
export function formatEta(etaSec?: number | null): string {
  if (etaSec == null || !Number.isFinite(etaSec) || etaSec < 0) return ''
  const total = Math.round(etaSec)
  if (total <= 0) return '剩余 0:00'
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) {
    return `剩余 ${h}:${pad(m)}:${pad(s)}`
  }
  return `剩余 ${m}:${pad(s)}`
}

/** 选项摘要（任务详情用） */
export function optionsSummary(task: CompressTask): string {
  const o = task.options
  if (!o) return '—'
  const parts: string[] = []
  if (o.mode === 'audio') {
    parts.push('模式: 抽音频')
    parts.push(`格式: ${o.audioFormat || 'm4a'}`)
    parts.push(`码率: ${o.audioBitrate || '192k'}`)
  } else {
    parts.push(`预设: ${o.presetId}`)
    parts.push(`CRF: ${o.crf}`)
    parts.push(`格式: ${o.format}`)
    parts.push(`编码器: ${o.encoder}`)
    if (o.maxEdge && o.maxEdge > 0) parts.push(`最长边: ${o.maxEdge}`)
    if (o.targetSizeMb && o.targetSizeMb > 0) {
      const passLabel =
        o.twoPass === false ? '单遍估算' : '两遍优先（硬件自动单遍）'
      parts.push(`目标体积: 约 ${o.targetSizeMb} MB（${passLabel}）`)
    }
    if (o.muteAudio) parts.push('音频: 静音')
    else if (o.videoAudioBitrate && o.videoAudioBitrate !== '128k') {
      parts.push(`音轨: ${o.videoAudioBitrate}`)
    }
    if (o.compatProfile === 'main-l4') parts.push('兼容: Main@L4')
    if (o.compatProfile === 'high') parts.push('兼容: High')
    if (o.fps && o.fps !== 'source') parts.push(`帧率: ${o.fps}`)
    if (o.encodePreset === 'fast') parts.push('编码速度: 快速')
    if (o.encodePreset === 'slow') parts.push('编码速度: 高质量')
  }
  if (o.trimStart && o.trimStart > 0) parts.push(`裁剪起: ${o.trimStart}s`)
  if (o.trimEnd && o.trimEnd > 0) parts.push(`裁剪止: ${o.trimEnd}s`)
  if (o.rotate90 === 'cw') parts.push('旋转: 顺时针 90°')
  if (o.rotate90 === 'ccw') parts.push('旋转: 逆时针 90°')
  if (o.rotate90 === '180') parts.push('旋转: 180°')
  if (o.outputDirMode && o.outputDirMode !== 'fixed') {
    parts.push(`输出目录模式: ${o.outputDirMode}`)
  }
  if (o.nameTemplate) parts.push(`命名: ${o.nameTemplate}`)
  return parts.join('\n')
}
