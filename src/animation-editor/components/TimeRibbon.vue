<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  TIME_RIBBON_HEIGHT,
  NAME_COLUMN_WIDTH,
  RIBBON_BG_COLOR,
  RIBBON_VIEWPORT_COLOR,
  RIBBON_HANDLE_COLOR,
  RIBBON_HANDLE_WIDTH,
} from '../constants'

const props = defineProps<{
  duration: number
  windowStart: number
  windowEnd: number
}>()

const emit = defineEmits<{
  'update:windowStart': [value: number]
  'update:windowEnd': [value: number]
}>()

const ribbonRef = ref<HTMLElement | null>(null)
const isDragging = ref<'viewport' | 'start' | 'end' | null>(null)
const dragStartX = ref(0)
const dragStartWindowStart = ref(0)
const dragStartWindowEnd = ref(0)

// Computed positions as percentages
const viewportLeftPercent = computed(() => {
  return (props.windowStart / props.duration) * 100
})

const viewportWidthPercent = computed(() => {
  return ((props.windowEnd - props.windowStart) / props.duration) * 100
})

function getRibbonWidth(): number {
  return ribbonRef.value?.clientWidth ?? 0
}

function xToTime(x: number): number {
  const width = getRibbonWidth()
  if (width <= 0) return 0
  return (x / width) * props.duration
}

function onMouseDown(e: MouseEvent, type: 'viewport' | 'start' | 'end') {
  e.preventDefault()
  isDragging.value = type
  dragStartX.value = e.clientX
  dragStartWindowStart.value = props.windowStart
  dragStartWindowEnd.value = props.windowEnd

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value || !ribbonRef.value) return

  const rect = ribbonRef.value.getBoundingClientRect()
  const deltaX = e.clientX - dragStartX.value
  const deltaTime = xToTime(deltaX)

  const minWindow = 0.1 // Minimum window size

  if (isDragging.value === 'viewport') {
    // Drag entire viewport
    let newStart = dragStartWindowStart.value + deltaTime
    let newEnd = dragStartWindowEnd.value + deltaTime

    // Clamp to bounds
    if (newStart < 0) {
      newEnd -= newStart
      newStart = 0
    }
    if (newEnd > props.duration) {
      newStart -= (newEnd - props.duration)
      newEnd = props.duration
    }

    newStart = Math.max(0, newStart)
    newEnd = Math.min(props.duration, newEnd)

    emit('update:windowStart', newStart)
    emit('update:windowEnd', newEnd)
  } else if (isDragging.value === 'start') {
    // Drag start handle
    let newStart = dragStartWindowStart.value + deltaTime
    newStart = Math.max(0, Math.min(newStart, props.windowEnd - minWindow))
    emit('update:windowStart', newStart)
  } else if (isDragging.value === 'end') {
    // Drag end handle
    let newEnd = dragStartWindowEnd.value + deltaTime
    newEnd = Math.min(props.duration, Math.max(newEnd, props.windowStart + minWindow))
    emit('update:windowEnd', newEnd)
  }
}

function onMouseUp() {
  isDragging.value = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div class="time-ribbon-container">
    <div class="name-spacer"></div>
    <div class="ribbon" ref="ribbonRef">
      <!-- Viewport selector -->
      <div
        class="viewport"
        :style="{
          left: viewportLeftPercent + '%',
          width: viewportWidthPercent + '%',
        }"
        @mousedown="onMouseDown($event, 'viewport')"
      >
        <!-- Start handle -->
        <div
          class="handle handle-start"
          @mousedown.stop="onMouseDown($event, 'start')"
        ></div>
        <!-- End handle -->
        <div
          class="handle handle-end"
          @mousedown.stop="onMouseDown($event, 'end')"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.time-ribbon-container {
  display: flex;
  height: v-bind('TIME_RIBBON_HEIGHT + "px"');
  background: v-bind('RIBBON_BG_COLOR');
}

.name-spacer {
  width: v-bind('NAME_COLUMN_WIDTH + "px"');
  min-width: v-bind('NAME_COLUMN_WIDTH + "px"');
  background: #0f0f23;
}

.ribbon {
  flex: 1;
  position: relative;
  background: v-bind('RIBBON_BG_COLOR');
  border-bottom: 1px solid #444;
}

.viewport {
  position: absolute;
  top: 4px;
  bottom: 4px;
  background: v-bind('RIBBON_VIEWPORT_COLOR');
  border-radius: 4px;
  cursor: grab;
}

.viewport:active {
  cursor: grabbing;
}

.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: v-bind('RIBBON_HANDLE_WIDTH + "px"');
  background: v-bind('RIBBON_HANDLE_COLOR');
  cursor: ew-resize;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.handle:hover {
  opacity: 1;
}

.handle-start {
  left: 0;
  border-radius: 4px 0 0 4px;
}

.handle-end {
  right: 0;
  border-radius: 0 4px 4px 0;
}
</style>
