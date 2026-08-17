import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { ImageProcessOptions, ImageProcessResult } from '../../../shared/types'
import {
  buildMagickArgs,
  formatMagickCommandLine
} from '../../../shared/imageLogic'
import { resolveMagickPath } from './bin'

export async function processWithMagick(
  options: ImageProcessOptions
): Promise<ImageProcessResult> {
  const magickPath = resolveMagickPath()
  if (!magickPath) {
    return {
      ok: false,
      engine: 'imagemagick',
      error: '未找到 ImageMagick（magick）'
    }
  }

  const stitchInputs = (options.inputs || [])
    .map((p) => (p || '').trim())
    .filter(Boolean)
  if (stitchInputs.length >= 2) {
    return {
      ok: false,
      engine: 'imagemagick',
      error: '拼接请使用 Sharp 引擎'
    }
  }

  const inputPath = (options.inputPath || '').trim()
  const outputPath = (options.outputPath || '').trim()
  if (!inputPath || !outputPath) {
    return { ok: false, engine: 'imagemagick', error: '输入或输出路径为空' }
  }
  if (!fs.existsSync(inputPath)) {
    return { ok: false, engine: 'imagemagick', error: '输入文件不存在' }
  }

  // 输出扩展名随 format 调整（keep 则沿用用户给定 outputPath）
  let finalOutput = outputPath
  const format = options.format || 'keep'
  if (format !== 'keep') {
    const dir = path.dirname(outputPath)
    const base = path.basename(outputPath, path.extname(outputPath))
    const ext =
      format === 'jpeg' ? '.jpg' : format === 'png' ? '.png' : '.webp'
    finalOutput = path.join(dir, `${base}${ext}`)
  }

  try {
    const outDir = path.dirname(finalOutput)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      engine: 'imagemagick',
      error: message || '无法创建输出目录'
    }
  }

  const args = buildMagickArgs({ ...options, outputPath: finalOutput })
  const commandLine = formatMagickCommandLine(magickPath, args)

  try {
    await runMagick(magickPath, args)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      engine: 'imagemagick',
      error: message || 'ImageMagick 处理失败',
      commandLine
    }
  }

  let width: number | undefined
  let height: number | undefined
  let size: number | undefined
  try {
    size = fs.statSync(finalOutput).size
  } catch {
    // ignore
  }
  try {
    const identify = await runMagickCapture(magickPath, [
      'identify',
      '-format',
      '%w %h',
      finalOutput
    ])
    const parts = identify.trim().split(/\s+/)
    if (parts.length >= 2) {
      const w = Number(parts[0])
      const h = Number(parts[1])
      if (Number.isFinite(w)) width = w
      if (Number.isFinite(h)) height = h
    }
  } catch {
    // identify 失败不影响主结果
  }

  return {
    ok: true,
    engine: 'imagemagick',
    outputPath: finalOutput,
    width,
    height,
    size,
    commandLine
  }
}

function runMagick(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      reject(err)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const detail = stderr.trim() || `exit code ${code}`
      reject(new Error(detail))
    })
  })
}

function runMagickCapture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      reject(err)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      reject(new Error(stderr.trim() || `exit code ${code}`))
    })
  })
}
