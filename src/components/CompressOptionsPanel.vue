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
  <div class="panel options-panel">
    <div class="panel-title">
      <span>任务选项</span>
      <div class="panel-title-right">
        <span class="muted">
          {{ isAudioMode ? '仅抽取音频' : presetDescription }}
        </span>
        <el-button size="small" @click="emit('applyToPending')">应用到待处理</el-button>
      </div>
    </div>

    <!-- 主选项：模式 + 预设/音频 + 输出，单层紧凑布局 -->
    <div class="opt-grid">
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

      <template v-if="!isAudioMode">
        <div class="opt-item opt-item-grow">
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
            class="w-3xl"
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
            class="w-md"
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

      <div class="opt-item">
        <span class="label">输出位置</span>
        <el-select
          :model-value="outputDirMode"
          size="small"
          class="w-2xl"
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

      <div class="opt-item opt-item-grow">
        <span class="label">输出命名</span>
        <el-select
          :model-value="nameSelectValue(nameTemplate, nameTemplateCustom)"
          size="small"
          class="w-4xl"
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
          class="w-4xl name-template-input"
          @update:model-value="(v: string) => emit('customNameTemplateInput', v)"
        />
      </div>
    </div>

    <!-- 高级：编码 / 裁剪 / 体积 / 自定义 -->
    <div class="opt-advanced">
      <button
        type="button"
        class="opt-advanced-toggle"
        :aria-expanded="advancedOpen"
        aria-controls="opt-advanced-body"
        @click="advancedOpen = !advancedOpen"
      >
        <span class="opt-advanced-chevron" :class="{ open: advancedOpen }">▸</span>
        <span>高级选项</span>
        <span class="muted">编码器 · 并发 · 裁剪 · 目标体积</span>
      </button>

      <div v-show="advancedOpen" id="opt-advanced-body" class="opt-advanced-body">
        <div class="opt-grid">
          <template v-if="!isAudioMode">
            <div class="opt-item">
              <span class="label">编码器</span>
              <el-select
                :disabled="isWebm"
                :model-value="encoder"
                size="small"
                class="w-4xl"
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
              class="w-xs"
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

          <div class="opt-item">
            <span class="label">裁剪</span>
            <span class="hint-inline">开始(秒)</span>
            <el-input-number
              :model-value="trimStart"
              :min="0"
              :max="86400"
              :step="1"
              :precision="1"
              size="small"
              controls-position="right"
              class="w-lg"
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
              class="w-lg"
              @change="(v: number | undefined) => emit('trimEndChange', typeof v === 'number' ? v : 0)"
            />
            <span class="hint-inline">0 = 不裁剪 / 到结尾</span>
          </div>

          <template v-if="!isAudioMode">
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
                class="w-lg"
                @change="(v: number | undefined) => emit('targetSizeMbChange', typeof v === 'number' ? v : 0)"
              />
              <span class="hint-inline">MB，0=不限制</span>
            </div>

            <div v-if="targetSizeMb > 0" class="opt-item">
              <span class="label">两遍编码</span>
              <el-switch
                :model-value="twoPass"
                size="small"
                @change="(v: string | number | boolean) => emit('twoPassChange', Boolean(v))"
              />
              <span class="hint-inline" title="仅软件 x264/VP9；硬件自动单遍">
                更准更慢；仅软件 x264/VP9
              </span>
            </div>

            <template v-if="isCustom">
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
                <el-select v-model="custom.format" size="small" class="w-5xl">
                  <el-option
                    v-for="opt in OUTPUT_FORMAT_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
            </template>
          </template>
        </div>
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

/* 主选项网格：自动换行，宽屏多列 */
.opt-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
}

.opt-grid > .opt-item {
  margin: 0;
}

.opt-item-grow {
  flex: 1 1 auto;
  min-width: min(100%, 280px);
}

.opt-advanced {
  margin-top: var(--space-3);
  border-top: none;
  box-shadow: inset 0 1px 0 0 var(--panel-border);
  padding-top: var(--space-2);
}

.opt-advanced-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  margin: 0;
  padding: 6px var(--space-2);
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--app-fg-secondary);
  font-size: var(--fs-md);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
}

.opt-advanced-toggle:hover {
  background: color-mix(in srgb, var(--app-fg) var(--overlay-soft), transparent);
  color: var(--app-fg);
}

.opt-advanced-toggle:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.opt-advanced-toggle .muted {
  font-weight: 400;
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
}

.opt-advanced-chevron {
  display: inline-block;
  width: 1em;
  font-size: var(--fs-sm);
  color: var(--app-fg-muted);
  transition: transform 0.15s ease;
  transform: rotate(0deg);
}

.opt-advanced-chevron.open {
  transform: rotate(90deg);
}

.opt-advanced-body {
  padding: var(--space-2) 0 2px;
}

.name-template-input {
  margin-left: var(--space-2);
}
</style>
