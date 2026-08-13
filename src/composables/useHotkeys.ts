/**
 * 全局快捷键
 * Windows: Ctrl；macOS: Cmd（metaKey）
 * 输入框内跳过文件/主题类快捷键；Ctrl/Cmd+Enter 全局开始仍可用
 */

export interface HotkeyHandlers {
  startAll: () => void
  cancelAll: () => void
  onSelectFiles: () => void
  onSelectOutput: () => void
  clearFinished: () => void
  /** 切换主题 light↔dark */
  toggleTheme: () => void
  /** 显示帮助（使用说明 + 快捷键） */
  showHelp: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  // Element Plus 等组件内部可编辑
  if (target.closest('input, textarea, select, [contenteditable="true"]')) {
    return true
  }
  return false
}

function isMod(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey
}

/**
 * 订阅 window keydown；返回取消订阅函数
 */
export function subscribeHotkeys(handlers: HotkeyHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    // 忽略仅修饰键
    if (!e.key) return

    const mod = isMod(e)
    const shift = e.shiftKey
    const key = e.key
    const lower = key.length === 1 ? key.toLowerCase() : key
    const editable = isEditableTarget(e.target)

    // F1 或 Ctrl+/ ：帮助中心（全局）
    if (key === 'F1' || (mod && (key === '/' || key === '?'))) {
      e.preventDefault()
      handlers.showHelp()
      return
    }

    // Ctrl/Cmd + Enter：全部开始（允许在输入框内）
    if (mod && !shift && (key === 'Enter' || key === 'NumpadEnter')) {
      e.preventDefault()
      handlers.startAll()
      return
    }

    // Ctrl/Cmd + Shift + Enter 或 Ctrl+Esc：全部取消
    if (
      (mod && shift && (key === 'Enter' || key === 'NumpadEnter')) ||
      (mod && !shift && key === 'Escape')
    ) {
      e.preventDefault()
      handlers.cancelAll()
      return
    }

    // 以下在输入框内跳过，避免与文本编辑冲突
    if (editable) return

    // Ctrl/Cmd + O：添加文件
    if (mod && !shift && lower === 'o') {
      e.preventDefault()
      handlers.onSelectFiles()
      return
    }

    // Ctrl/Cmd + Shift + O：选择输出目录
    if (mod && shift && lower === 'o') {
      e.preventDefault()
      handlers.onSelectOutput()
      return
    }

    // Ctrl/Cmd + L：清除已完成
    if (mod && !shift && lower === 'l') {
      e.preventDefault()
      handlers.clearFinished()
      return
    }

    // Ctrl/Cmd + D：切换主题 light↔dark
    if (mod && !shift && lower === 'd') {
      e.preventDefault()
      handlers.toggleTheme()
      return
    }
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
