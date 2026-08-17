import {cpSync, existsSync, mkdirSync} from 'fs'
import {resolve} from 'path'
import type {Plugin} from 'vite'
import {defineConfig, externalizeDepsPlugin} from 'electron-vite'
import vue from '@vitejs/plugin-vue'

/** 将局域网 Web 静态资源复制到 out/main/public */
function copyLanWebPlugin(): Plugin {
  const src = resolve(__dirname, 'electron/main/lanServer/public')
  const dest = resolve(__dirname, 'out/main/public')
  const copy = (): void => {
    if (!existsSync(src)) return
    mkdirSync(dest, {recursive: true})
    cpSync(src, dest, {recursive: true})
  }
  return {
    name: 'copy-lan-web',
    buildStart() {
      copy()
    },
    closeBundle() {
      copy()
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyLanWebPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [vue()]
  }
})
