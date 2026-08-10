/**
 * 从 CHANGELOG.md 提取指定版本小节，供 GitHub Release body 使用。
 * 用法：
 *   node scripts/extract-changelog.mjs [version] [outFile]
 * version 可带或不带 v 前缀；默认读 package.json 的 version。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  return String(pkg.version || '').trim()
}

function normalizeVersion(raw) {
  const v = String(raw || '').trim()
  if (!v) return ''
  return v.startsWith('v') || v.startsWith('V') ? v.slice(1) : v
}

/**
 * 提取 `## [x.y.z]` 到下一个 `## [` 之间的内容
 */
function extractSection(changelog, version) {
  const ver = normalizeVersion(version)
  if (!ver) return null

  const lines = changelog.replace(/\r\n/g, '\n').split('\n')
  // 匹配 ## [1.0.0] 或 ## [1.0.0] - 2026-08-10
  const headerRe = new RegExp(
    `^##\\s*\\[${ver.replace(/\./g, '\\.')}\\](?:\\s*-\\s*.*)?\\s*$`
  )

  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      start = i
      break
    }
  }
  if (start < 0) return null

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s*\[/.test(lines[i])) {
      end = i
      break
    }
  }

  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')

  return body
}

function buildReleaseBody(version, sectionBody) {
  const ver = normalizeVersion(version)
  const title = `# FFmpeg 视频压缩工具 v${ver}`
  if (!sectionBody || !sectionBody.trim()) {
    return [
      title,
      '',
      '> 未在 CHANGELOG.md 中找到该版本小节，请补充后重新发版。',
      '',
      '详见仓库 [CHANGELOG.md](https://github.com/moon-stack-OAo/ffmpeg_tool/blob/main/CHANGELOG.md)。'
    ].join('\n')
  }

  return [
    title,
    '',
    sectionBody.trim(),
    '',
    '---',
    '',
    '完整变更记录见 [CHANGELOG.md](https://github.com/moon-stack-OAo/ffmpeg_tool/blob/main/CHANGELOG.md)。',
    '发版说明见 [docs/RELEASE.md](https://github.com/moon-stack-OAo/ffmpeg_tool/blob/main/docs/RELEASE.md)。'
  ].join('\n')
}

const versionArg = process.argv[2]
const outArg = process.argv[3]
const version = normalizeVersion(versionArg) || readPackageVersion()
const outFile =
  outArg ||
  path.join(root, 'release-notes.md')

const changelogPath = path.join(root, 'CHANGELOG.md')
if (!fs.existsSync(changelogPath)) {
  console.error('[extract-changelog] 未找到 CHANGELOG.md')
  process.exit(1)
}

const changelog = fs.readFileSync(changelogPath, 'utf8')
const section = extractSection(changelog, version)
if (!section) {
  console.warn(
    `[extract-changelog] 警告：CHANGELOG 中无 [## [${version}]] 小节，将写入占位说明`
  )
}

const body = buildReleaseBody(version, section)
fs.writeFileSync(outFile, body, 'utf8')

// 同步一份到 release/ 目录（若存在），便于产物旁查看
const releaseDir = path.join(root, 'release')
if (fs.existsSync(releaseDir)) {
  fs.writeFileSync(path.join(releaseDir, 'RELEASE_NOTES.md'), body, 'utf8')
}

console.log(`[extract-changelog] version=${version}`)
console.log(`[extract-changelog] out=${outFile}`)
console.log(`[extract-changelog] bytes=${Buffer.byteLength(body, 'utf8')}`)
