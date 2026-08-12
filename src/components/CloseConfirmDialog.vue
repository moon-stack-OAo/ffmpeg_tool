<script lang="ts" setup>
import { ref, watch } from 'vue'

const visible = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  decide: [action: 'tray' | 'quit', remember: boolean]
  cancel: []
}>()

const remember = ref(false)
const submitting = ref(false)
/** 是否已做出选择（托盘/退出），避免关闭时误触发 cancel */
let decided = false

watch(visible, (v) => {
  if (v) {
    remember.value = false
    submitting.value = false
    decided = false
  }
})

function decide(action: 'tray' | 'quit'): void {
  if (submitting.value) return
  submitting.value = true
  decided = true
  emit('decide', action, remember.value)
  visible.value = false
}

function onClosed(): void {
  if (!decided) emit('cancel')
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="关闭应用"
    width="min(420px, 92vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    append-to-body
    destroy-on-close
    @closed="onClosed"
  >
    <p class="close-desc">请选择关闭窗口后的行为：</p>
    <ul class="close-list">
      <li><strong>最小化到托盘</strong>：后台继续运行，可从托盘恢复</li>
      <li><strong>退出应用</strong>：结束所有任务并完全退出</li>
    </ul>
    <el-checkbox v-model="remember">记住我的选择，下次不再询问</el-checkbox>
    <template #footer>
      <el-button :disabled="submitting" @click="visible = false">取消</el-button>
      <el-button :disabled="submitting" type="primary" @click="decide('tray')">
        最小化到托盘
      </el-button>
      <el-button :disabled="submitting" type="danger" @click="decide('quit')">
        退出应用
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.close-desc {
  margin: 0 0 10px;
  color: var(--app-fg);
  font-size: var(--fs-md);
}

.close-list {
  margin: 0 0 16px;
  padding-left: 1.2em;
  color: var(--app-fg-secondary);
  font-size: var(--fs-sm);
  line-height: 1.6;
}

.close-list strong {
  color: var(--app-fg);
  font-weight: 600;
}
</style>
