import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import type { ThemeMode } from '@shared/types'

export interface UseThemeOptions {
  /** 当前主题设置（light | dark | system） */
  theme: Ref<ThemeMode>
  /** 变更主题并持久化 */
  setTheme: (mode: ThemeMode) => void
}

/**
 * 主题：读 settings.theme，解析最终 dark/light，
 * system 监听 prefers-color-scheme，并切换 html.dark
 */
export function useTheme(options: UseThemeOptions) {
  const systemDark = ref(false)
  let mql: MediaQueryList | null = null

  function readSystemDark(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  function onSystemChange(e: MediaQueryListEvent): void {
    systemDark.value = e.matches
    applyDom()
  }

  /** 解析最终是否暗色 */
  const isDark = computed(() => {
    if (options.theme.value === 'dark') return true
    if (options.theme.value === 'light') return false
    return systemDark.value
  })

  /** 应用 documentElement.dark 与 data-theme */
  function applyDom(): void {
    if (typeof document === 'undefined') return
    const dark = isDark.value
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }

  /** 切换 light ↔ dark（不经 system）；若当前 system 则按解析结果切到另一端 */
  function toggleLightDark(): void {
    const next: ThemeMode = isDark.value ? 'light' : 'dark'
    options.setTheme(next)
  }

  /** 循环 light → dark → system → light */
  function cycleTheme(): void {
    const order: ThemeMode[] = ['light', 'dark', 'system']
    const idx = order.indexOf(options.theme.value)
    const next = order[(idx + 1) % order.length]
    options.setTheme(next)
  }

  function start(): void {
    systemDark.value = readSystemDark()
    if (typeof window !== 'undefined' && window.matchMedia) {
      mql = window.matchMedia('(prefers-color-scheme: dark)')
      // 兼容旧浏览器
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onSystemChange)
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(onSystemChange)
      }
    }
    applyDom()
  }

  function stop(): void {
    if (mql) {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', onSystemChange)
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(onSystemChange)
      }
      mql = null
    }
  }

  // theme 或系统偏好变化时立即应用
  const stopWatch = watch(
    [() => options.theme.value, isDark],
    () => applyDom(),
    { immediate: false }
  )

  onUnmounted(() => {
    stopWatch()
    stop()
  })

  return {
    isDark,
    applyDom,
    start,
    stop,
    toggleLightDark,
    cycleTheme
  }
}
