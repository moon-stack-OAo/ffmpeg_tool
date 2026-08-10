<script lang="ts" setup>
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
  notifyOnComplete: boolean
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
  notifyOnCompleteChange: [v: boolean]
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
      <span class="muted">
        {{ isAudioMode ? '仅抽取音频' : presetDescription }}
      </span>
    </div>

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

      <div class="opt-item">
        <span class="label">完成后通知</span>
        <el-switch
          :model-value="notifyOnComplete"
          size="small"
          @change="(v: string | number | boolean) => emit('notifyOnCompleteChange', Boolean(v))"
        />
      </div>

      <div class="opt-item">
        <el-button size="small" @click="emit('applyToPending')">应用到待处理</el-button>
      </div>
    </div>

    <!-- 时间段裁剪（压缩 / 抽音频通用） -->
    <div class="options-row" style="margin-top: 12px">
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

    <!-- 输出目录模式 + 命名（通用） -->
    <div class="options-row" style="margin-top: 12px">
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
    </div>

    <!-- 视频压缩选项 -->
    <template v-if="!isAudioMode">
      <div class="options-row" style="margin-top: 12px">
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
      </div>

      <div class="custom-row" style="margin-top: 12px">
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
          <span class="hint-inline" :title="CONCURRENCY_HINT">{{ CONCURRENCY_HINT }}</span>
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
            placeholder="{name}_{preset}"
            style="width: 180px; margin-left: 8px"
            @update:model-value="(v: string) => emit('customNameTemplateInput', v)"
          />
        </div>

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
            <el-select v-model="custom.format" size="small" style="width: 200px">
              <el-option
                v-for="opt in OUTPUT_FORMAT_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
        </template>
      </div>
    </template>

    <!-- 仅抽音频选项 -->
    <template v-else>
      <div class="custom-row" style="margin-top: 12px">
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
            placeholder="{name}_audio"
            style="width: 180px; margin-left: 8px"
            @update:model-value="(v: string) => emit('customNameTemplateInput', v)"
          />
        </div>
      </div>
    </template>
  </div>
</template>
