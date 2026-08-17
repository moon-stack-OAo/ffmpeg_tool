import {
  type CompressTask,
  formatSaveRatio,
  type TaskMode,
  type TaskStatus
} from '@shared/types'

/** 任务状态中文标签 */
export function statusLabel(s: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    pending: '待处理',
    queued: '排队中',
    running: '处理中',
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

/** 任务模式中文标签 */
export function modeLabel(mode?: TaskMode | null): string {
  switch (mode) {
    case 'audio':
      return '音频'
    case 'image':
      return '图片'
    case 'image-crop':
      return '裁切'
    case 'image-stitch':
      return '拼图'
    case 'video-concat':
      return '拼接'
    case 'media-compose':
      return '图+视频'
    case 'compress':
    default:
      return '压缩'
  }
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
  const mode = o.mode || 'compress'

  if (mode === 'audio') {
    parts.push('模式: 抽音频')
    parts.push(`格式: ${o.audioFormat || 'm4a'}`)
    parts.push(`码率: ${o.audioBitrate || '192k'}`)
  } else if (
    mode === 'image' ||
    mode === 'image-crop' ||
    mode === 'image-stitch'
  ) {
    const labels: Record<string, string> = {
      image: '图片压缩',
      'image-crop': '图片裁切',
      'image-stitch': '图片拼接'
    }
    parts.push(`模式: ${labels[mode] || mode}`)
    const img = o.image
    if (img) {
      if (img.format) parts.push(`格式: ${img.format}`)
      if (img.quality != null) parts.push(`质量: ${img.quality}`)
      if (img.maxEdge != null && img.maxEdge > 0) {
        parts.push(`最长边: ${img.maxEdge}`)
      }
      if (img.strip === false) parts.push('保留元数据')
      else parts.push('去除元数据')
      if (mode === 'image-stitch') {
        const layoutMap: Record<string, string> = {
          horizontal: '横向',
          vertical: '纵向',
          grid: '网格'
        }
        if (img.layout) {
          parts.push(`布局: ${layoutMap[img.layout] || img.layout}`)
        }
        if (img.layout === 'grid' && img.gridCols) {
          parts.push(`列数: ${img.gridCols}`)
        }
        if (img.gap != null && img.gap > 0) parts.push(`间距: ${img.gap}px`)
        if (img.background) parts.push(`背景: ${img.background}`)
      }
    }
    const crop = o.crop || img?.crop
    if (crop && crop.w > 0 && crop.h > 0) {
      parts.push(`裁切: ${crop.w}×${crop.h}@${crop.x},${crop.y}`)
    }
    if (task.inputPaths && task.inputPaths.length > 1) {
      parts.push(`输入: ${task.inputPaths.length} 张`)
    }
  } else if (mode === 'video-concat') {
    parts.push('模式: 视频拼接')
    parts.push(
      o.concatPreferCopy === false ? '优先重编码' : '优先流复制'
    )
    if (task.inputPaths && task.inputPaths.length > 1) {
      parts.push(`输入: ${task.inputPaths.length} 段`)
    }
  } else if (mode === 'media-compose') {
    parts.push('模式: 图+视频')
    const c = o.compose
    if (c?.intro?.imagePath) {
      parts.push(`片头: ${c.intro.durationSec ?? 3}s`)
    }
    if (c?.outro?.imagePath) {
      parts.push(`片尾: ${c.outro.durationSec ?? 3}s`)
    }
    if (c?.overlay?.imagePath) {
      parts.push('叠加图: 有')
    }
  } else {
    parts.push(`预设: ${o.presetId}`)
    parts.push(`CRF: ${o.crf}`)
    parts.push(`格式: ${o.format}`)
    parts.push(`编码器: ${o.encoder}`)
    if (o.scaleMode === 'fixed' && o.outWidth && o.outHeight) {
      parts.push(
        `分辨率: ${o.outWidth}×${o.outHeight}${o.scalePad === 'none' ? '（仅缩入）' : '（黑边）'}`
      )
    } else if (o.scaleMode === 'aspect' && o.aspectRatio) {
      const sizeHint =
        o.outWidth && o.outWidth > 0
          ? `宽${o.outWidth}`
          : o.maxEdge && o.maxEdge > 0
            ? `长边${o.maxEdge}`
            : ''
      parts.push(
        `比例: ${o.aspectRatio}${sizeHint ? ` ${sizeHint}` : ''}${o.scalePad === 'none' ? '（仅缩入）' : '（黑边）'}`
      )
    } else if (o.scaleMode === 'none') {
      parts.push('分辨率: 不缩放')
    } else if (o.maxEdge && o.maxEdge > 0) {
      parts.push(`最长边: ${o.maxEdge}`)
    }
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
    if (o.crop && o.crop.w > 0 && o.crop.h > 0) {
      parts.push(`画面裁切: ${o.crop.w}×${o.crop.h}@${o.crop.x},${o.crop.y}`)
    }
  }

  if (o.trimStart && o.trimStart > 0) parts.push(`裁剪起: ${o.trimStart}s`)
  if (o.trimEnd && o.trimEnd > 0) parts.push(`裁剪止: ${o.trimEnd}s`)
  if (o.rotate90 === 'cw') parts.push('旋转: 顺时针 90°')
  if (o.rotate90 === 'ccw') parts.push('旋转: 逆时针 90°')
  if (o.rotate90 === '180') parts.push('旋转: 180°')
  if (mode === 'compress' && o.watermark && o.watermark.mode !== 'none') {
    if (o.watermark.mode === 'image') {
      parts.push('水印: 图片')
    } else if (o.watermark.mode === 'text') {
      const t = (o.watermark.text || '').slice(0, 20)
      parts.push(t ? `水印: 文字「${t}」` : '水印: 文字')
    }
  }
  if (o.outputDirMode && o.outputDirMode !== 'fixed') {
    parts.push(`输出目录模式: ${o.outputDirMode}`)
  }
  if (o.nameTemplate) parts.push(`命名: ${o.nameTemplate}`)
  return parts.join('\n')
}
