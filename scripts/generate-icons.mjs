/**
 * 从 resources/icon.svg 生成各尺寸 PNG / ICO / favicon
 * 用法: node scripts/generate-icons.mjs
 */
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Resvg} from '@resvg/resvg-js'
import toIco from 'to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'resources', 'icon.svg')
const resourcesDir = join(root, 'resources')
const buildDir = join(root, 'build')
const srcDir = join(root, 'src')

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
/** ICO 内嵌尺寸（Windows 任务栏 / 资源管理器常用） */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

function renderPng(svg, size) {
    const resvg = new Resvg(svg, {
        fitTo: {mode: 'width', value: size},
        background: 'rgba(0,0,0,0)'
    })
    return resvg.render().asPng()
}

async function main() {
    if (!existsSync(svgPath)) {
        console.error('缺少 resources/icon.svg')
        process.exit(1)
    }

    mkdirSync(resourcesDir, {recursive: true})
    mkdirSync(buildDir, {recursive: true})
    mkdirSync(srcDir, {recursive: true})

    const svg = readFileSync(svgPath)

    /** @type {Map<number, Buffer>} */
    const pngBySize = new Map()
    for (const size of SIZES) {
        const png = renderPng(svg, size)
        pngBySize.set(size, png)
        const name = size === 1024 ? 'icon.png' : `icon-${size}.png`
        writeFileSync(join(resourcesDir, name), png)
        console.log(`✓ resources/${name} (${size}x${size})`)
    }

    // 主 PNG 副本
    copyFileSync(join(resourcesDir, 'icon.png'), join(resourcesDir, 'icon-1024.png'))

    // ICO（多尺寸）
    const icoBuffers = ICO_SIZES.map((s) => pngBySize.get(s))
    const ico = await toIco(icoBuffers)
    writeFileSync(join(resourcesDir, 'icon.ico'), ico)
    console.log('✓ resources/icon.ico')

    // electron-builder 使用 build/
    copyFileSync(join(resourcesDir, 'icon.ico'), join(buildDir, 'icon.ico'))
    copyFileSync(join(resourcesDir, 'icon.png'), join(buildDir, 'icon.png'))
    // mac 常用 512/1024；electron-builder 也会读 build/icon.png
    console.log('✓ build/icon.ico')
    console.log('✓ build/icon.png')

    // 开发页 favicon
    copyFileSync(join(resourcesDir, 'icon.ico'), join(srcDir, 'favicon.ico'))
    copyFileSync(join(resourcesDir, 'icon-32.png'), join(srcDir, 'favicon.png'))
    console.log('✓ src/favicon.ico')
    console.log('✓ src/favicon.png')

    console.log('\n图标生成完成。')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
