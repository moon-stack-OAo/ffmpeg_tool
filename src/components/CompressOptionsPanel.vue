<script lang="ts" setup>
import { ref } from 'vue'
import {
  AUDIO_BITRATE_OPTIONS,
  AUDIO_FORMAT_OPTIONS,
  type AudioFormat,
  CONCURRENCY_HINT,
  CONCURRENCY_OPTIONS,
  DEFAULT_PRESETS,
  ENCODER_OPTIONS,
  type EncoderDetectResult,
  type EncoderId,
  NAME_TEMPLATE_OPTIONS,
  OUTPUT_DIR_MODE_OPTIONS,
  OUTPUT_FORMAT_OPTIONS,
  type OutputDirMode,
  type OutputFormat,
  type PresetId,
  TASK_MODE_OPTIONS,
  type TaskMode
} from '@shared/types'

defineProps<{
  taskMode: TaskMode
  audioFormat: AudioFormat
  audioBitrate: string
  presetId: PresetId
  encoder: EncoderId
  concurrency: number
  nameTemplate: string
  nameTemplateCustom: boolean
  outputDirMode: OutputDirMode
  targetSizeMb: number
  /** 目标体积时两遍编码 */
  twoPass: boolean
  isCustom: boolean
  isWebm: boolean
  isAudioMode: boolean
  presetDescription: string
  encoderInfo: EncoderDetectResult | null
  /** 裁剪开始秒，0 表示不裁剪 */
  trimStart: number
  /** 裁剪结束秒，0 表示到结尾 */
  trimEnd: number
  custom: {
    crf: number
    maxEdge: number
    format: OutputFormat
  }
}>()

const emit = defineEmits<{
  taskModeChange: [mode: TaskMode]
  audioFormatChange: [v: AudioFormat]
  audioBitrateChange: [v: string]
  presetChange: [id: PresetId]
  encoderChange: [v: EncoderId]
  concurrencyChange: [n: number]
  nameTemplateChange: [v: string]
  customNameTemplateInput: [v: string]
  outputDirModeChange: [v: OutputDirMode]
  targetSizeMbChange: [v: number]
  twoPassChange: [v: boolean]
  trimStartChange: [v: number]
  trimEndChange: [v: number]
  applyToPending: []
}>()

/** 高级选项默认折叠 */
const advancedOpen = ref(false)

/** 下拉展示值：自定义时用哨兵 */
function nameSelectValue(nameTemplate: string, isCustom: boolean): string {
  if (isCustom) return '__custom__'
  const known = NAME_TEMPLATE_OPTIONS.find(
    (o) => o.id !== 'custom' && o.value === nameTemplate
  )
  return known ? known.value : '__custom__'
}
</script>

<template>
  <div class="panel">
    <div class="panel-title">
      <span>任务选项</span>
      <div class="panel-title-right">
        <span class="muted">
          {{ isAudioMode ? '仅抽取音频' : presetDescription }}
        </span>
        <el-button size="small" @click="emit('applyToPending')">应用到待处理</el-button>
      </div>
    </div>

    <!-- 始终可见：任务模式 -->
    <div class="opt-group">
      <div class="opt-group-title">基本</div>
      <div class="options-row">
        <div class="opt-item">
          <span class="label">任务模式</span>
          <el-radio-group
            :model-value="taskMode"
            size="small"
            @change="(v: string | number | boolean | undefined) => emit('taskModeChange', v as TaskMode)"
          >
            <el-radio-button
              v-for="opt in TASK_MODE_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </div>

    <!-- 始终可见：预设 / 音频格式 -->
    <div class="opt-group">
      <div class="opt-group-title">{{ isAudioMode ? '音频' : '预设' }}</div>
      <div class="options-row">
        <template v-if="!isAudioMode">
          <div class="opt-item">
            <span class="label">预设</span>
            <el-radio-group
              :model-value="presetId"
              size="small"
              @change="(v: string | number | boolean | undefined) => emit('presetChange', v as PresetId)"
            >
              <el-radio-button v-for="p in DEFAULT_PRESETS" :key="p.id" :value="p.id">
                {{ p.name }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <template v-else>
          <div class="opt-item">
            <span class="label">音频格式</span>
            <el-select
              :model-value="audioFormat"
              size="small"
              style="width: 160px"
              @change="(v: AudioFormat) => emit('audioFormatChange', v)"
            >
              <el-option
                v-for="opt in AUDIO_FORMAT_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="opt-item">
            <span class="label">码率</span>
            <el-select
              :model-value="audioBitrate"
              size="small"
              style="width: 100px"
              @change="(v: string) => emit('audioBitrateChange', v)"
            >
              <el-option
                v-for="br in AUDIO_BITRATE_OPTIONS"
                :key="br"
                :label="br"
                :value="br"
              />
            </el-select>
          </div>
        </template>
      </div>
    </div>

    <!-- 始终可见：输出位置 + 命名 -->
    <div class="opt-group">
      <div class="opt-group-title">输出</div>
      <div class="options-row">
        <div class="opt-item">
          <span class="label">输出位置</span>
          <el-select
            :model-value="outputDirMode"
            size="small"
            style="width: 150px"
            @change="(v: OutputDirMode) => emit('outputDirModeChange', v)"
          >
            <el-option
              v-for="opt in OUTPUT_DIR_MODE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <span v-if="outputDirMode === 'sidecar'" class="hint-inline">与源文件同目录</span>
          <span v-else-if="outputDirMode === 'dated'" class="hint-inline">outputDir/YYYYMMDD</span>
        </div>

        <div class="opt-item">
          <span class="label">输出命名</span>
          <el-select
            :model-value="nameSelectValue(nameTemplate, nameTemplateCustom)"
            size="small"
            style="width: 180px"
            @change="(v: string) => emit('nameTemplateChange', v)"
          >
            <el-option
              v-for="opt in NAME_TEMPLATE_OPTIONS"
              :key="opt.id"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-input
            v-if="nameTemplateCustom || nameSelectValue(nameTemplate, nameTemplateCustom) === '__custom__'"
            :model-value="nameTemplate === '__custom__' ? '' : nameTemplate"
            size="small"
            :placeholder="isAudioMode ? '{name}_audio' : '{name}_{preset}'"
            style="width: 180px; margin-left: 8px"
            @update:model-value="(v: string) => emit('customNameTemplateInput', v)"
          />
        </div>
      </div>
    </div>

    <!-- 高级选项（默认折叠） -->
    <div class="opt-advanced">
      <button
        type="button"
        class="opt-advanced-toggle"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <span class="opt-advanced-chevron" :class="{ open: advancedOpen }">▸</span>
        <span>高级选项</span>
        <span class="muted">裁剪 · 编码器 · 目标体积等</span>
      </button>

      <div v-show="advancedOpen" class="opt-advanced-body">
        <!-- 裁剪起止 -->
        <div class="opt-group">
          <div class="opt-group-title">裁剪</div>
          <div class="options-row">
            <div class="opt-item">
              <span class="label">起止</span>
              <span class="hint-inline">开始(秒)</span>
              <el-input-number
                :model-value="trimStart"
                :min="0"
                :max="86400"
                :step="1"
                :precision="1"
                size="small"
                controls-position="right"
                style="width: 120px"
                @change="(v: number | undefined) => emit('trimStartChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">结束(秒)</span>
              <el-input-number
                :model-value="trimEnd"
                :min="0"
                :max="86400"
                :step="1"
                :precision="1"
                size="small"
                controls-position="right"
                style="width: 120px"
                @change="(v: number | undefined) => emit('trimEndChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">0 = 不裁剪 / 到结尾</span>
            </div>
          </div>
        </div>

        <!-- 编码器 + 并发（视频）；音频仅并发 -->
        <div class="opt-group">
          <div class="opt-group-title">{{ isAudioMode ? '并发' : '编码' }}</div>
          <div class="options-row">
            <template v-if="!isAudioMode">
              <div class="opt-item">
                <span class="label">编码器</span>
                <el-select
                  :disabled="isWebm"
                  :model-value="encoder"
                  size="small"
                  style="width: 180px"
                  @change="(v: EncoderId) => emit('encoderChange', v)"
                >
                  <el-option
                    v-for="opt in ENCODER_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
                <span v-if="isWebm" class="hint-inline">WebM 强制软件 VP9</span>
                <span v-else-if="encoderInfo" class="hint-inline">
                  硬件:
                  <template
                    v-if="
                      encoderInfo.nvenc ||
                      encoderInfo.qsv ||
                      encoderInfo.amf ||
                      encoderInfo.videotoolbox
                    "
                  >
                    <span v-if="encoderInfo.nvenc">NVENC </span>
                    <span v-if="encoderInfo.qsv">QSV </span>
                    <span v-if="encoderInfo.amf">AMF </span>
                    <span v-if="encoderInfo.videotoolbox">VT</span>
                  </template>
                  <template v-else>未检测到</template>
                </span>
              </div>
            </template>

            <div class="opt-item">
              <span class="label">并发数</span>
              <el-select
                :model-value="concurrency"
                size="small"
                style="width: 80px"
                @change="(v: number) => emit('concurrencyChange', v)"
              >
                <el-option
                  v-for="n in CONCURRENCY_OPTIONS"
                  :key="n"
                  :label="String(n)"
                  :value="n"
                />
              </el-select>
              <span v-if="!isAudioMode" class="hint-inline" :title="CONCURRENCY_HINT">
                {{ CONCURRENCY_HINT }}
              </span>
            </div>
          </div>
        </div>

        <!-- 目标体积 + 两遍（仅视频） -->
        <template v-if="!isAudioMode">
          <div class="opt-group">
            <div class="opt-group-title">体积</div>
            <div class="options-row">
              <div class="opt-item">
                <span class="label">目标体积</span>
                <el-input-number
                  :model-value="targetSizeMb"
                  :min="0"
                  :max="10240"
                  :step="1"
                  :precision="1"
                  size="small"
                  controls-position="right"
                  style="width: 120px"
                  @change="(v: number | undefined) => emit('targetSizeMbChange', typeof v === 'number' ? v : 0)"
                />
                <span class="hint-inline">MB，0=不限制；约达目标</span>
              </div>

              <div v-if="targetSizeMb > 0" class="opt-item">
                <span class="label">两遍编码</span>
                <el-switch
                  :model-value="twoPass"
                  size="small"
                  @change="(v: string | number | boolean) => emit('twoPassChange', Boolean(v))"
                />
                <span class="hint-inline" title="仅软件 x264/VP9；硬件自动单遍">
                  更准，更慢；仅软件 x264/VP9，硬件自动单遍
                </span>
              </div>
            </div>
          </div>

          <!-- 自定义 CRF / 最长边 / 格式 -->
          <div v-if="isCustom" class="opt-group">
            <div class="opt-group-title">自定义</div>
            <div class="options-row">
              <div class="opt-item">
                <span class="label">CRF</span>
                <el-input-number v-model="custom.crf" :max="51" :min="0" :step="1" size="small" />
              </div>
              <div class="opt-item">
                <span class="label">最长边</span>
                <el-input-number
                  v-model="custom.maxEdge"
                  :max="7680"
                  :min="0"
                  :step="2"
                  size="small"
                />
                <span class="hint-inline">0 = 不缩放</span>
              </div>
              <div class="opt-item">
                <span class="label">格式</span>
                <el-select v-model="custom.format" size="small" style="width: 200px">
                  <el-option
                    v-for="opt in OUTPUT_FORMAT_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-title-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
}

.opt-group {
  margin-top: 10px;
}

.opt-group:first-of-type {
  margin-top: 0;
}

.opt-group-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-fg-muted);
  margin-bottom: 6px;
  letter-spacing: 0.02em;
}

.opt-advanced {
  margin-top: 12px;
  border-top: 1px solid var(--panel-border);
  padding-top: 8px;
}

.opt-advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-fg-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
}

.opt-advanced-toggle:hover {
  background: color-mix(in srgb, var(--app-fg) 6%, transparent);
  color: var(--app-fg);
}

.opt-advanced-toggle .muted {
  font-weight: 400;
  font-size: 12px;
  color: var(--app-fg-muted);
}

.opt-advanced-chevron {
  display: inline-block;
  width: 1em;
  font-size: 12px;
  color: var(--app-fg-muted);
  transition: transform 0.15s ease;
  transform: rotate(0deg);
}

.opt-advanced-chevron.open {
  transform: rotate(90deg);
}

.opt-advanced-body {
  padding: 4px 0 2px;
}
</style>
