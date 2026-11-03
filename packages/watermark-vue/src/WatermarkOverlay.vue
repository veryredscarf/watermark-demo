<script setup lang="ts">
import { computed } from 'vue'
import type { WatermarkLease } from '../../watermark-core/src/index'

const props = defineProps<{ lease: WatermarkLease | null }>()
const cells = Array.from({ length: 120 }, (_, index) => index)
const opacity = computed(() => Math.min(0.25, Math.max(0.05, props.lease?.layout.opacity ?? 0.12)))
</script>

<template>
  <div v-if="lease" class="wm-layer" aria-hidden="true" role="presentation" :style="{ opacity }">
    <div v-for="cell in cells" :key="cell" class="wm-cell">
      <span class="wm-label">{{ lease.displayText }}</span>
      <span class="wm-code">{{ lease.code }}</span>
    </div>
  </div>
</template>

<style scoped>
.wm-layer {
  position: fixed;
  inset: -30px;
  z-index: 2147483647;
  display: grid;
  grid-template-columns: repeat(auto-fill, 320px);
  grid-auto-rows: 170px;
  align-content: start;
  justify-content: start;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  color: #102d42;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.wm-cell {
  width: 320px;
  height: 170px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 9px;
  transform: rotate(-17deg);
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.wm-code { font-size: 12px; letter-spacing: 0.12em; }
@media print {
  .wm-layer { position: fixed; color: #222; opacity: 0.24 !important; }
}
</style>
