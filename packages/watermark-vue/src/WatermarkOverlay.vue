<script setup lang="ts">
import type { WatermarkLease } from '../../watermark-core/src/index'

defineProps<{ lease: WatermarkLease | null }>()
</script>

<template>
  <div v-if="lease" class="wm-layer" aria-hidden="true" role="presentation"
    :style="{ backgroundImage: `url('${lease.imageDataUrl}')`, backgroundSize: `${lease.width}px ${lease.height}px` }" />
</template>

<style scoped>
.wm-layer {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background-repeat: repeat;
  pointer-events: none;
  user-select: none;
}
@media print { .wm-layer { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>