<script setup lang="ts">
import { ref, provide, onMounted, computed } from 'vue'
import type { TrackDef } from '../types'
import { Core } from '../core'
import { RenderScheduler } from '../renderScheduler'
import { NAME_COLUMN_WIDTH } from '../constants'
import TimeRibbon from './TimeRibbon.vue'
import TimeTicksHeader from './TimeTicksHeader.vue'
import TrackList from './TrackList.vue'
import Playhead from './Playhead.vue'

const props = defineProps<{
  duration?: number
}>()

// Core state
const core = new Core(props.duration)
const scheduler = new RenderScheduler()

// Wire up invalidation
core.setInvalidateCallback(() => scheduler.invalidate())

// View window state
const windowStart = ref(0)
const windowEnd = ref(core.duration)

// Search filter (for future use)
const searchFilter = ref('')

// Track list container ref for playhead positioning
const trackListRef = ref<HTMLElement | null>(null)
const canvasAreaWidth = ref(0)

// Provide to children
provide('core', core)
provide('scheduler', scheduler)
provide('windowStart', windowStart)
provide('windowEnd', windowEnd)
provide('searchFilter', searchFilter)

// Computed: filtered track IDs
const filteredTrackIds = computed(() => {
  const filter = searchFilter.value.toLowerCase()
  if (!filter) return core.orderedTrackIds

  return core.orderedTrackIds.filter(id => {
    const track = core.getTrackById(id)
    return track && track.def.name.toLowerCase().includes(filter)
  })
})

// Update canvas area width on resize
onMounted(() => {
  const updateWidth = () => {
    if (trackListRef.value) {
      canvasAreaWidth.value = trackListRef.value.clientWidth - NAME_COLUMN_WIDTH
    }
  }

  updateWidth()

  const observer = new ResizeObserver(updateWidth)
  if (trackListRef.value) {
    observer.observe(trackListRef.value)
  }

  // Initial draw
  scheduler.invalidate()
})

// Exposed API
function addTrack(def: TrackDef): boolean {
  const result = core.addTrack(def)
  // Update window end if duration changed
  windowEnd.value = core.duration
  return result
}

function scrubToTime(t: number): void {
  core.scrubToTime(t)
}

function jumpToTime(t: number): void {
  core.jumpToTime(t)
}

function setWindowRange(start: number, end: number): void {
  windowStart.value = start
  windowEnd.value = end
  scheduler.invalidate()
}

defineExpose({
  addTrack,
  scrubToTime,
  jumpToTime,
  setWindowRange,
  core,
})
</script>

<template>
  <div class="animation-editor">
    <!-- Time ribbon (viewport selector) -->
    <TimeRibbon
      :duration="core.duration"
      v-model:window-start="windowStart"
      v-model:window-end="windowEnd"
      @update:window-start="scheduler.invalidate()"
      @update:window-end="scheduler.invalidate()"
    />

    <!-- Header row with search and time ticks -->
    <div class="header-row">
      <div class="name-column-header">
        <input
          v-model="searchFilter"
          type="text"
          placeholder="Search tracks..."
          class="search-input"
        />
      </div>
      <div class="ticks-area">
        <TimeTicksHeader
          :window-start="windowStart"
          :window-end="windowEnd"
        />
      </div>
    </div>

    <!-- Track list with playhead overlay -->
    <div class="track-list-container" ref="trackListRef">
      <TrackList :track-ids="filteredTrackIds" />
      <Playhead
        :current-time="core.currentTime"
        :window-start="windowStart"
        :window-end="windowEnd"
        :canvas-width="canvasAreaWidth"
        :left-offset="NAME_COLUMN_WIDTH"
      />
    </div>
  </div>
</template>

<style scoped>
.animation-editor {
  display: flex;
  flex-direction: column;
  background: #0d0d1a;
  color: #e0e0e0;
  font-family: system-ui, -apple-system, sans-serif;
  height: 100%;
  overflow: hidden;
}

.header-row {
  display: flex;
  border-bottom: 1px solid #333;
}

.name-column-header {
  width: v-bind('NAME_COLUMN_WIDTH + "px"');
  min-width: v-bind('NAME_COLUMN_WIDTH + "px"');
  padding: 4px 8px;
  box-sizing: border-box;
  background: #0f0f23;
}

.search-input {
  width: 100%;
  padding: 4px 8px;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

.search-input::placeholder {
  color: #666;
}

.ticks-area {
  flex: 1;
  background: #0f0f23;
}

.track-list-container {
  flex: 1;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
