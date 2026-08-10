import fs from 'fs'
import {
  buildOutputPath,
  suggestUniqueOutputPath
} from '../../../shared/ffmpegLogic'

export { buildOutputPath }

/** 若输出文件已存在则追加序号 */
export function uniqueOutputPath(outputPath: string): string {
  return suggestUniqueOutputPath(outputPath, (p) => fs.existsSync(p))
}

/** 获取文件大小（字节），失败返回 undefined */
export function getFileSize(filePath: string): number | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined
    return fs.statSync(filePath).size
  } catch {
    return undefined
  }
}
