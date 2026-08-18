<script lang="ts" setup>
import {ref, watch} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {Folder} from '@element-plus/icons-vue'
import type {
  AppInfo,
  CloseAction,
  FfmpegStatus,
  ImageEngineId,
  ImageEngineStatus,
  LanStatus,
  ThemeMode
} from '@shared/types'
import {
  CLOSE_ACTION_OPTIONS,
  CONCURRENCY_HINT,
  CONCURRENCY_OPTIONS,
  IMAGE_ENGINE_OPTIONS,
  THEME_OPTIONS
} from '@shared/types'
import {PRODUCT_NAME, PRODUCT_TAGLINE} from '@shared/brand'

const props = defineProps<{
  visible: boolean
  theme: ThemeMode
  concurrency: number
  notifyOnComplete: boolean
  persistTasks: boolean
  closeAction: CloseAction
  openAtLogin: boolean
  startMinimizedToTray: boolean
  ffmpegBinDir: string
  ffmpegStatus: FfmpegStatus | null
  imageEngine: ImageEngineId
  imagemagickPath: string
  imageStatus: ImageEngineStatus | null
  appVersion: string
  isPackaged: boolean
  appInfo: AppInfo | null
  updateChecking: boolean
  lanStatus: LanStatus | null
  lanSaving: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  themeChange: [v: ThemeMode]
  concurrencyChange: [n: number]
  notifyOnCompleteChange: [v: boolean]
  persistTasksChange: [v: boolean]
  closeActionChange: [v: CloseAction]
  openAtLoginChange: [v: boolean]
  startMinimizedToTrayChange: [v: boolean]
  browseFfmpegDir: []
  clearFfmpegBinDir: []
  reDetectFfmpeg: []
  imageEngineChange: [v: ImageEngineId]
  browseMagickPath: []
  clearMagickPath: []
  reDetectImage: []
  testImageEngine: []
  openAppData: []
  changeDataDir: []
  clearStoredTasks: []
  resetSettings: []
  checkUpdate: []
  refreshLanStatus: []
  saveLanConfig: [
    config: {
      enabled?: boolean
      port?: number
      username?: string
      password?: string
    }
  ]
}>()

const activeTab = ref('general')

/** 远程访问表单（本地编辑，点保存后提交） */
const lanEnabled = ref(false)
const lanPort = ref(17890)
const lanUsername = ref('admin')
const lanPassword = ref('')
const lanPassword2 = ref('')

function syncLanFormFromProps(): void {
  const s = props.lanStatus
  if (!s) return
  lanEnabled.value = s.enabled
  lanPort.value = s.port || 17890
  lanUsername.value = s.username || 'admin'
  lanPassword.value = ''
  lanPassword2.value = ''
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      activeTab.value = 'general'
      syncLanFormFromProps()
      emit('refreshLanStatus')
    }
  }
)

watch(
  () => props.lanStatus,
  () => {
    if (props.visible) syncLanFormFromProps()
  }
)

function onLanToggle(v: string | number | boolean): void {
  const enabled = Boolean(v)
  // 开启时若无密码，提示先填密码再保存
  if (enabled && !props.lanStatus?.hasPassword && !lanPassword.value) {
    lanEnabled.value = false
    ElMessage.warning('首次开启请先设置密码，再点击「保存远程设置」')
    return
  }
  lanEnabled.value = enabled
  emit('saveLanConfig', {
    enabled,
    port: lanPort.value,
    username: lanUsername.value,
    ...(lanPassword.value ? { password: lanPassword.value } : {})
  })
}

function onSaveLan(): void {
  if (lanPassword.value || lanPassword2.value) {
    if (lanPassword.value.length < 4) {
      ElMessage.warning('密码至少 4 位')
      return
    }
    if (lanPassword.value !== lanPassword2.value) {
      ElMessage.warning('两次密码不一致')
      return
    }
  }
  if (lanEnabled.value && !props.lanStatus?.hasPassword && !lanPassword.value) {
    ElMessage.warning('开启远程访问前请设置密码')
    return
  }
  const port = Math.max(1024, Math.min(65535, Math.floor(Number(lanPort.value) || 17890)))
  lanPort.value = port
  emit('saveLanConfig', {
    enabled: lanEnabled.value,
    port,
    username: lanUsername.value.trim() || 'admin',
    ...(lanPassword.value ? { password: lanPassword.value } : {})
  })
  lanPassword.value = ''
  lanPassword2.value = ''
}

async function copyLanUrl(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('已复制访问地址')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function confirmClearTasks(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将删除本地已持久化的任务记录，进行中的任务不受影响。确定清空吗？',
      '清空持久化任务',
      {
        type: 'warning',
        confirmButtonText: '清空',
        cancelButtonText: '取消'
      }
    )
    emit('clearStoredTasks')
  } catch {
    // 用户取消
  }
}

async function confirmReset(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将恢复所有设置为默认值，包括主题、并发数与自定义 ffmpeg 目录。确定重置吗？',
      '重置全部设置',
      {
        type: 'warning',
        confirmButtonText: '重置',
        cancelButtonText: '取消'
      }
    )
    emit('resetSettings')
  } catch {
    // 用户取消
  }
}

async function copyUserDataPath(): Promise<void> {
  const p = props.appInfo?.userDataPath
  if (!p) return
  try {
    await navigator.clipboard.writeText(p)
    ElMessage.success('已复制数据目录路径')
  } catch {
    ElMessage.error('复制失败')
  }
}

function onPathKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    void copyUserDataPath()
  }
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    class="settings-drawer"
    size="35%"
    title="设置"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="通用" name="general" lazy>
        <div class="setting-pane">
          <div class="setting-row">
            <span class="setting-label">主题</span>
            <el-select
              :model-value="theme"
              size="small"
              class="w-xl"
              @change="(v: ThemeMode) => emit('themeChange', v)"
            >
              <el-option
                v-for="opt in THEME_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="setting-row">
            <span class="setting-label">并发数</span>
            <el-select
              :model-value="concurrency"
              size="small"
              class="w-sm"
              :title="CONCURRENCY_HINT"
              @change="(v: number) => emit('concurrencyChange', v)"
            >
              <el-option
                v-for="n in CONCURRENCY_OPTIONS"
                :key="n"
                :label="String(n)"
                :value="n"
              />
            </el-select>
            <span class="setting-hint" :title="CONCURRENCY_HINT">
              {{ CONCURRENCY_HINT }}
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-label">完成后通知</span>
            <el-switch
              :model-value="notifyOnComplete"
              size="small"
              @change="(v: string | number | boolean) => emit('notifyOnCompleteChange', Boolean(v))"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">持久化任务</span>
            <el-switch
              :model-value="persistTasks"
              size="small"
              @change="(v: string | number | boolean) => emit('persistTasksChange', Boolean(v))"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">关闭窗口</span>
            <el-select
              :model-value="closeAction"
              size="small"
              class="w-xl"
              @change="(v: CloseAction) => emit('closeActionChange', v)"
            >
              <el-option
                v-for="opt in CLOSE_ACTION_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <span class="setting-hint">点击关闭按钮时的默认行为</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">开机自启</span>
            <el-switch
              :model-value="openAtLogin"
              size="small"
              @change="(v: string | number | boolean) => emit('openAtLoginChange', Boolean(v))"
            />
            <span class="setting-hint">仅 Windows / macOS 安装版可靠；开发模式可能无效</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">启动到托盘</span>
            <el-switch
              :disabled="!openAtLogin"
              :model-value="startMinimizedToTray"
              size="small"
              @change="(v: string | number | boolean) => emit('startMinimizedToTrayChange', Boolean(v))"
            />
            <span class="setting-hint">开机启动后先进入托盘，不弹出主窗口</span>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="编码" name="ffmpeg" lazy>
        <div class="setting-pane">
          <div class="setting-row">
            <span class="setting-label">FFmpeg 状态</span>
            <el-tag
              :type="ffmpegStatus?.ready ? 'success' : 'danger'"
              effect="plain"
              size="small"
            >
              {{ ffmpegStatus?.ready ? '就绪' : '未就绪' }}
            </el-tag>
          </div>
          <div v-if="ffmpegStatus && !ffmpegStatus.ready && ffmpegStatus.error" class="setting-row">
            <span class="setting-label" />
            <span class="setting-error">{{ ffmpegStatus.error }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">ffmpeg</span>
            <span class="setting-value" :title="ffmpegStatus?.ffmpegPath || '内置自动探测'">
              {{ ffmpegStatus?.ffmpegPath || '内置自动探测' }}
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-label">ffprobe</span>
            <span class="setting-value" :title="ffmpegStatus?.ffprobePath || '内置自动探测'">
              {{ ffmpegStatus?.ffprobePath || '内置自动探测' }}
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-label">自定义 bin 目录</span>
            <el-input
              :model-value="ffmpegBinDir"
              class="bin-dir-input"
              placeholder="留空=自动探测（ffmpeg-static）"
              readonly
              size="small"
            />
          </div>
          <div class="setting-row actions">
            <el-button :icon="Folder" size="small" @click="emit('browseFfmpegDir')">
              浏览
            </el-button>
            <el-button size="small" @click="emit('clearFfmpegBinDir')">
              重置自动
            </el-button>
            <el-button size="small" @click="emit('reDetectFfmpeg')">
              重新检测
            </el-button>
          </div>

          <div class="setting-divider" />

          <div class="setting-row">
            <span class="setting-label">图片引擎</span>
            <el-select
              :model-value="imageEngine"
              size="small"
              class="w-xl"
              @change="(v: ImageEngineId) => emit('imageEngineChange', v)"
            >
              <el-option
                v-for="opt in IMAGE_ENGINE_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="setting-row">
            <span class="setting-label">Sharp</span>
            <el-tag
              :type="imageStatus?.sharpReady ? 'success' : 'danger'"
              effect="plain"
              size="small"
            >
              {{ imageStatus?.sharpReady ? '就绪' : '未就绪' }}
            </el-tag>
          </div>
          <div class="setting-row">
            <span class="setting-label">ImageMagick</span>
            <el-tag
              :type="imageStatus?.magickReady ? 'success' : 'info'"
              effect="plain"
              size="small"
            >
              {{ imageStatus?.magickReady ? '可用' : '未检测到' }}
            </el-tag>
          </div>
          <div
            v-if="imageStatus?.magickPath"
            class="setting-row"
          >
            <span class="setting-label">magick</span>
            <span class="setting-value" :title="imageStatus.magickPath">
              {{ imageStatus.magickPath }}
            </span>
          </div>
          <div
            v-if="imageStatus?.error"
            class="setting-row"
          >
            <span class="setting-label" />
            <span class="setting-error">{{ imageStatus.error }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">Magick 路径</span>
            <el-input
              :model-value="imagemagickPath"
              class="bin-dir-input"
              placeholder="留空=自动探测 PATH 中的 magick"
              readonly
              size="small"
            />
          </div>
          <div class="setting-row actions">
            <el-button :icon="Folder" size="small" @click="emit('browseMagickPath')">
              浏览
            </el-button>
            <el-button size="small" @click="emit('clearMagickPath')">
              清除
            </el-button>
            <el-button size="small" @click="emit('reDetectImage')">
              重新检测
            </el-button>
            <el-button size="small" type="primary" plain @click="emit('testImageEngine')">
              测试引擎
            </el-button>
          </div>
          <div class="setting-row">
            <span class="setting-label" />
            <span class="setting-hint">
              可指定 magick.exe 全路径，或含 magick 的安装目录
            </span>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="远程访问" name="lan" lazy>
        <div class="setting-pane">
          <p class="setting-hint lan-intro">
            开启后，同一局域网内可用浏览器访问本机服务，登录后上传视频/音频/图片任务并下载结果。编码器、水印、并发、图片引擎等仍使用本机设置。
          </p>
          <div class="setting-row">
            <span class="setting-label">允许远程访问</span>
            <el-switch
              :model-value="lanEnabled"
              :disabled="lanSaving"
              size="small"
              @change="onLanToggle"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">服务状态</span>
            <el-tag
              :type="lanStatus?.running ? 'success' : lanStatus?.error ? 'danger' : 'info'"
              effect="plain"
              size="small"
            >
              {{
                lanStatus?.running
                  ? '运行中'
                  : lanStatus?.enabled
                    ? lanStatus?.error || '未运行'
                    : '已关闭'
              }}
            </el-tag>
          </div>
          <div v-if="lanStatus?.error" class="setting-row">
            <span class="setting-label" />
            <span class="setting-error">{{ lanStatus.error }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">端口</span>
            <el-input-number
              v-model="lanPort"
              :min="1024"
              :max="65535"
              :step="1"
              size="small"
              controls-position="right"
              class="w-port"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">用户名</span>
            <el-input
              v-model="lanUsername"
              size="small"
              class="bin-dir-input"
              maxlength="64"
              placeholder="admin"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">新密码</span>
            <el-input
              v-model="lanPassword"
              type="password"
              size="small"
              class="bin-dir-input"
              show-password
              :placeholder="lanStatus?.hasPassword ? '留空则不修改' : '首次开启必填'"
              autocomplete="new-password"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">确认密码</span>
            <el-input
              v-model="lanPassword2"
              type="password"
              size="small"
              class="bin-dir-input"
              show-password
              placeholder="再次输入新密码"
              autocomplete="new-password"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">密码</span>
            <span class="setting-value">
              {{ lanStatus?.hasPassword ? '已设置（哈希存储）' : '未设置' }}
            </span>
          </div>
          <div class="setting-row actions">
            <el-button
              size="small"
              type="primary"
              :loading="lanSaving"
              @click="onSaveLan"
            >
              保存远程设置
            </el-button>
            <el-button size="small" :disabled="lanSaving" @click="emit('refreshLanStatus')">
              刷新状态
            </el-button>
          </div>
          <div v-if="lanStatus?.urls?.length" class="setting-divider" />
          <div v-if="lanStatus?.urls?.length" class="setting-row">
            <span class="setting-label">本机地址</span>
            <div class="lan-urls">
              <button
                v-for="url in lanStatus.urls"
                :key="url"
                type="button"
                class="setting-value path-copy-btn lan-url-btn"
                :title="'点击复制 ' + url"
                @click="copyLanUrl(url)"
              >
                {{ url }}
              </button>
            </div>
          </div>
          <p class="setting-hint">
            仅建议在受信局域网使用；关闭远程或修改密码将立即清除浏览器会话。
          </p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="数据" name="data" lazy>
        <div class="setting-pane">
          <div class="setting-row">
            <span class="setting-label">数据目录</span>
            <button
              type="button"
              class="setting-value path-copy-btn"
              :title="appInfo?.userDataPath ? '点击复制' : ''"
              :disabled="!appInfo?.userDataPath"
              @click="copyUserDataPath"
              @keydown="onPathKeydown"
            >
              {{ appInfo?.userDataPath || '—' }}
            </button>
          </div>
          <div class="setting-row actions">
            <el-button size="small" @click="emit('openAppData')">打开数据目录</el-button>
            <el-button size="small" @click="emit('changeDataDir')">修改数据目录…</el-button>
          </div>
          <p class="setting-hint">
            修改时会将设置、任务列表等迁移到新目录（不覆盖已有文件；缓存目录不迁移；原目录保留）。
          </p>
          <div class="setting-divider" />
          <div class="setting-row actions">
            <el-button size="small" plain type="danger" @click="confirmClearTasks">
              清空已持久化任务
            </el-button>
            <el-button size="small" type="danger" @click="confirmReset">
              重置全部设置
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="关于" name="about" lazy>
        <div class="setting-pane">
          <div class="setting-row">
            <span class="setting-label">应用</span>
            <span class="setting-value">{{ PRODUCT_NAME }} · {{ PRODUCT_TAGLINE }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">版本</span>
            <span class="setting-value">v{{ appVersion }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">打包状态</span>
            <el-tag :type="isPackaged ? 'success' : 'info'" effect="plain" size="small">
              {{ isPackaged ? '已打包' : '开发态' }}
            </el-tag>
          </div>
          <div class="setting-row">
            <span class="setting-label">Electron</span>
            <span class="setting-value">{{ appInfo?.electron ?? '—' }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">Chrome</span>
            <span class="setting-value">{{ appInfo?.chrome ?? '—' }}</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">Node</span>
            <span class="setting-value">{{ appInfo?.node ?? '—' }}</span>
          </div>
          <div class="setting-row actions">
            <el-button :loading="updateChecking" size="small" type="primary" @click="emit('checkUpdate')">
              检查更新
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<style scoped>
.settings-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-tabs :deep(.el-tabs__header) {
  margin: 0 0 var(--space-3);
  flex-shrink: 0;
}

.settings-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 0;
  background: none;
}

.settings-tabs :deep(.el-tabs__nav-wrap) {
  box-shadow: inset 0 -1px 0 0 var(--panel-border);
}

.settings-tabs :deep(.el-tabs__item) {
  font-size: var(--fs-md);
  height: 36px;
  line-height: 36px;
  padding: 0 14px;
  color: var(--app-fg-secondary);
}

.settings-tabs :deep(.el-tabs__item.is-active) {
  color: var(--primary);
  font-weight: 600;
}

.settings-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--primary);
}

.settings-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.settings-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.setting-pane {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
}

.setting-divider {
  height: 0;
  margin: var(--space-2) 0;
  box-shadow: inset 0 -1px 0 0 var(--panel-border);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 28px;
}

.setting-label {
  flex-shrink: 0;
  width: 108px;
  font-size: var(--fs-md);
  color: var(--app-fg-secondary);
}

.setting-value {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-fg);
}

.path-copy-btn {
  margin: 0;
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
  color: var(--app-fg);
}

.path-copy-btn:hover:not(:disabled) {
  color: var(--primary);
}

.path-copy-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.path-copy-btn:disabled {
  cursor: default;
  opacity: 0.7;
}

.setting-hint {
  font-size: var(--fs-xs);
  color: var(--app-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-error {
  font-size: var(--fs-sm);
  color: var(--status-bad);
}

.bin-dir-input {
  flex: 1;
  min-width: 0;
}

.setting-row.actions {
  flex-wrap: wrap;
  gap: var(--space-2);
}

.lan-intro {
  white-space: normal;
  line-height: 1.5;
  margin: 0 0 var(--space-1);
}

.w-port {
  width: 140px;
}

.lan-urls {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lan-url-btn {
  width: 100%;
}
</style>
