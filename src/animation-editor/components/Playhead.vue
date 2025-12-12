<script setup lang="ts">
import { computed, inject, ref, onMounted, onUnmounted } from 'vue'
import type { RenderScheduler } from '../renderScheduler'
import { PLAYHEAD_COLOR, PLAYHEAD_WIDTH } from '../constants'
import { timeToX } from '../utils'

const props = defineProps<{
  currentTime: number
  windowStart: number
  windowEnd: number
  canvasWidth: number
  leftOffset: number
}>()

const scheduler = inject<RenderScheduler>('scheduler')!

// We need to track currentTime reactively via scheduler
const displayTime = ref(props.currentTime)
let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = scheduler.subscribe(() => {
    displayTime.value = props.currentTime
  })
})

onUnmounted(() => {
  unsubscribe?.()
})

const isVisible = computed(() => {
  return displayTime.value >= props.windowStart && displayTime.value <= props.windowEnd
})

const xPosition = computed(() => {
  return props.leftOffset + timeToX(
    displayTime.value,
    props.windowStart,
    props.windowEnd,
    props.canvasWidth
  )
})
</script>

<template>
  <div
    v-if="isVisible"
    class="playhead"
    :style="{ left: xPosition + 'px' }"
  ></div>
</template>

<style scoped>
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: v-bind('PLAYHEAD_WIDTH + "px"');
  background: v-bind('PLAYHEAD_COLOR');
  pointer-events: none;
  z-index: 10;
  transform: translateX(-50%);
}
</style>
