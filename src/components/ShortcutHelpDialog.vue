<script lang="ts" setup>
import { computed, ref } from 'vue'
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@shared/brand'
import faviconUrl from '../favicon.png'

const visible = defineModel<boolean>({ default: false })

const activeTab = ref<'guide' | 'shortcuts'>('guide')

/** 是否 macOS 风格修饰键展示 */
const isMac = computed(() => {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
})

const mod = computed(() => (isMac.value ? '⌘' : 'Ctrl'))

const rows = computed(() => [
  { keys: [`${mod.value}`, 'Enter'], action: '全部开始' },
  { keys: [`${mod.value}`, 'Shift', 'Enter'], action: '全部取消' },
  { keys: [`${mod.value}`, 'Esc'], action: '全部取消' },
  { keys: [`${mod.value}`, 'O'], action: '添加视频' },
  { keys: [`${mod.value}`, 'Shift', 'O'], action: '选择输出目录' },
  { keys: [`${mod.value}`, 'L'], action: '清除已完成' },
  { keys: [`${mod.value}`, 'D'], action: '切换浅色 / 深色主题' },
  { keys: ['F1'], altKeys: ['Ctrl', '/'], action: '打开帮助' }
])

const guideSteps = [
  {
    title: '添加文件',
    desc: '拖拽视频到窗口，或使用「添加视频」；支持文件夹递归添加。'
  },
  {
    title: '选择模式与参数',
    desc: '视频压缩或仅抽取音频；预设、输出目录、命名模板可在任务选项中调整。高级选项含旋转、帧率、水印等。'
  },
  {
    title: '开始处理',
    desc: '点击全部开始或使用快捷键；可并行多个任务，支持取消与查看进度 / ETA。'
  },
  {
    title: '查看结果',
    desc: '完成后可打开文件或在文件夹中显示；任务详情含参数摘要与完整命令行。'
  }
]

const tips = [
  '关闭窗口可最小化到托盘或退出（设置中可改默认行为）。',
  '设置中可切换主题、开机自启、FFmpeg 路径、图片引擎，并检查更新。',
  '打包安装后支持自动更新；下载完成后需点「重启并安装」，普通退出不会安装。'
]
</script>

<template>
  <el-dialog
    v-model="visible"
    class="help-dialog"
    width="min(760px, 96vw)"
    destroy-on-close
    append-to-body
    align-center
  >
    <template #header>
      <div class="help-header">
        <div class="help-brand">
          <div class="help-brand-mark" aria-hidden="true">
            <img class="help-brand-icon" :src="faviconUrl" alt="" />
          </div>
          <div class="help-brand-text">
            <div class="help-brand-name">帮助中心</div>
            <div class="help-brand-sub">{{ PRODUCT_NAME }} · {{ PRODUCT_TAGLINE }}</div>
          </div>
        </div>
      </div>
    </template>

    <div class="help-body">
      <div class="help-seg" role="tablist">
        <button
          type="button"
          class="help-seg-item"
          :class="{ active: activeTab === 'guide' }"
          role="tab"
          :aria-selected="activeTab === 'guide'"
          @click="activeTab = 'guide'"
        >
          使用说明
        </button>
        <button
          type="button"
          class="help-seg-item"
          :class="{ active: activeTab === 'shortcuts' }"
          role="tab"
          :aria-selected="activeTab === 'shortcuts'"
          @click="activeTab = 'shortcuts'"
        >
          快捷键
        </button>
      </div>

      <div v-show="activeTab === 'guide'" class="help-panel thin-scrollbar">
        <ol class="help-steps">
          <li v-for="(step, i) in guideSteps" :key="i" class="help-step">
            <span class="help-step-idx">{{ i + 1 }}</span>
            <div class="help-step-body">
              <div class="help-step-title">{{ step.title }}</div>
              <div class="help-step-desc">{{ step.desc }}</div>
            </div>
          </li>
        </ol>
        <div class="help-tips">
          <div class="help-tips-title">小提示</div>
          <ul>
            <li v-for="(t, i) in tips" :key="i">{{ t }}</li>
          </ul>
        </div>
      </div>

      <div v-show="activeTab === 'shortcuts'" class="help-panel thin-scrollbar">
        <div class="help-keys">
          <div v-for="(row, i) in rows" :key="i" class="help-key-row">
            <div class="help-key-combo">
              <template v-for="(k, j) in row.keys" :key="`a-${j}`">
                <kbd class="help-kbd">{{ k }}</kbd>
                <span v-if="j < row.keys.length - 1" class="help-key-plus">+</span>
              </template>
              <template v-if="row.altKeys">
                <span class="help-key-or">或</span>
                <template v-for="(k, j) in row.altKeys" :key="`b-${j}`">
                  <kbd class="help-kbd">{{ k }}</kbd>
                  <span v-if="j < row.altKeys.length - 1" class="help-key-plus">+</span>
                </template>
              </template>
            </div>
            <div class="help-key-action">{{ row.action }}</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="help-footer">
        <el-button type="primary" class="help-btn-primary" @click="visible = false">
          知道了
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.help-header {
  min-width: 0;
  padding-right: 28px;
}

.help-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.help-brand-mark {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #1b4dff 0%, #0ea5e9 52%, #14b8a6 100%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, #0ea5e9 28%, transparent),
    0 8px 18px color-mix(in srgb, #1b4dff 22%, transparent);
}

.help-brand-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  object-fit: cover;
  background: color-mix(in srgb, #fff 88%, transparent);
}

.help-brand-text {
  min-width: 0;
}

.help-brand-name {
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--app-fg);
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.help-brand-sub {
  margin-top: 3px;
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  line-height: 1.3;
}

.help-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.help-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-fg) 6%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--panel-border) 80%, transparent);
}

.help-seg-item {
  margin: 0;
  border: none;
  border-radius: 9px;
  padding: 9px 12px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--app-fg-secondary);
  background: transparent;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    box-shadow 0.15s;
}

.help-seg-item:hover {
  color: var(--app-fg);
  background: color-mix(in srgb, var(--app-fg) 5%, transparent);
}

.help-seg-item.active {
  color: var(--app-fg);
  background: var(--panel-bg);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.08),
    0 0 0 1px color-mix(in srgb, var(--panel-border) 70%, transparent);
}

.help-seg-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.help-panel {
  flex: 1 1 auto;
  max-height: min(460px, 58vh);
  min-height: min(280px, 36vh);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 6px;
}

.help-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.help-step {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--notes-bg);
  box-shadow: var(--ring-soft);
}

.help-step-idx {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #1b4dff 0%, #0ea5e9 55%, #14b8a6 100%);
  box-shadow: 0 4px 10px color-mix(in srgb, #1b4dff 22%, transparent);
}

.help-step-body {
  min-width: 0;
}

.help-step-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--app-fg);
  line-height: 1.3;
}

.help-step-desc {
  margin-top: 4px;
  font-size: var(--fs-sm);
  color: var(--app-fg-secondary);
  line-height: 1.55;
}

.help-tips {
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, #0ea5e9 8%, var(--notes-bg));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #0ea5e9 18%, transparent);
}

.help-tips-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--app-fg);
  margin-bottom: 8px;
}

.help-tips ul {
  margin: 0;
  padding-left: 1.15em;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: var(--fs-sm);
  color: var(--app-fg-secondary);
  line-height: 1.5;
}

.help-tips li::marker {
  color: #0ea5e9;
}

.help-keys {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.help-key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--notes-bg);
  box-shadow: var(--ring-soft);
}

.help-key-combo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 2px;
  min-width: 0;
}

.help-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  border-radius: 7px;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: var(--app-fg);
  background: color-mix(in srgb, var(--app-fg) 6%, var(--panel-bg));
  box-shadow:
    inset 0 -1px 0 color-mix(in srgb, var(--app-fg) 12%, transparent),
    0 0 0 1px color-mix(in srgb, var(--panel-border) 90%, transparent);
}

.help-key-plus {
  margin: 0 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-fg-muted);
}

.help-key-or {
  margin: 0 6px;
  font-size: var(--fs-xs);
  color: var(--app-fg-muted);
}

.help-key-action {
  flex-shrink: 0;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--app-fg-secondary);
  text-align: right;
}

.help-footer {
  display: flex;
  justify-content: flex-end;
}
</style>

<style>
.help-dialog.el-dialog {
  border-radius: 16px !important;
  overflow: hidden;
  background: var(--panel-bg) !important;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--panel-border) 90%, transparent),
    0 18px 48px rgba(0, 0, 0, 0.22) !important;
}

.help-dialog.el-dialog .el-dialog__header {
  margin: 0;
  padding: 18px 22px 10px;
  position: relative;
  box-shadow: none !important;
}

.help-dialog.el-dialog .el-dialog__header::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: linear-gradient(90deg, #1b4dff 0%, #0ea5e9 50%, #14b8a6 100%);
}

.help-dialog.el-dialog .el-dialog__body {
  padding: 6px 22px 4px;
}

.help-dialog.el-dialog .el-dialog__footer {
  padding: 10px 22px 16px;
  box-shadow: none !important;
}

.help-dialog.el-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
}

.help-dialog .el-button.help-btn-primary,
.help-dialog .el-button.help-btn-primary:focus,
.help-dialog .el-button.help-btn-primary:hover,
.help-dialog .el-button.help-btn-primary:active {
  border: none !important;
  color: #fff !important;
  background-image: linear-gradient(135deg, #1b4dff 0%, #0ea5e9 55%, #14b8a6 100%) !important;
  background-color: #0ea5e9 !important;
  box-shadow: 0 6px 16px color-mix(in srgb, #1b4dff 28%, transparent) !important;
}

.help-dialog .el-button.help-btn-primary:hover {
  filter: brightness(1.06);
}
</style>
