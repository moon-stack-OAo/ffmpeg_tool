import { ref } from 'vue'
import type { EncoderDetectResult, FfmpegStatus } from '@shared/types'

/** FFmpeg 就绪状态与硬件编码器探测 */
export function useFfmpegStatus() {
  const ffmpegStatus = ref<FfmpegStatus>({ ready: false })
  const encoderInfo = ref<EncoderDetectResult | null>(null)

  async function loadStatus(): Promise<void> {
    ffmpegStatus.value = await window.electronAPI.getFfmpegStatus()
    try {
      encoderInfo.value = await window.electronAPI.detectEncoders()
    } catch {
      encoderInfo.value = null
    }
  }

  return {
    ffmpegStatus,
    encoderInfo,
    loadStatus
  }
}
