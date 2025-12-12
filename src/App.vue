<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { AnimationEditorView } from './animation-editor'
import type { TrackDef } from './animation-editor'

const editorRef = ref<InstanceType<typeof AnimationEditorView> | null>(null)
const currentTime = ref(0)

// Mock data for testing
const mockNumberTrack: TrackDef = {
  name: 'object1.position.x',
  fieldType: 'number',
  data: [
    { time: 0, element: 0.2 },
    { time: 2, element: 0.8 },
    { time: 4, element: 0.3 },
    { time: 6, element: 0.9 },
    { time: 8, element: 0.5 },
  ],
  low: 0,
  high: 1,
  updateNumber: (v) => {
    console.log(`[number] object1.position.x = ${v.toFixed(3)}`)
  },
}

const mockEnumTrack: TrackDef = {
  name: 'object1.state',
  fieldType: 'enum',
  data: [
    { time: 0, element: 'idle' },
    { time: 2.5, element: 'walking' },
    { time: 5, element: 'running' },
    { time: 7.5, element: 'jumping' },
  ],
  updateEnum: (v) => {
    console.log(`[enum] object1.state = "${v}"`)
  },
}

const mockFuncTrack: TrackDef = {
  name: 'events.triggers',
  fieldType: 'func',
  data: [
    { time: 1, element: { funcName: 'playSound', args: ['beep'] } },
    { time: 3, element: { funcName: 'spawnParticle', args: [100, 200] } },
    { time: 5.5, element: { funcName: 'flash', args: [] } },
    { time: 8, element: { funcName: 'playSound', args: ['boom'] } },
  ],
  updateFunc: (funcName, ...args) => {
    console.log(`[func] ${funcName}(${args.map(a => JSON.stringify(a)).join(', ')})`)
  },
}

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.addTrack(mockNumberTrack)
    editorRef.value.addTrack(mockEnumTrack)
    editorRef.value.addTrack(mockFuncTrack)
  }
})

function onSliderInput(e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  currentTime.value = value
  editorRef.value?.scrubToTime(value)
}
</script>

<template>
  <div class="app">
    <div class="controls">
      <label class="time-label">
        Time: {{ currentTime.toFixed(2) }}
      </label>
      <input
        type="range"
        min="0"
        max="10"
        step="0.01"
        :value="currentTime"
        @input="onSliderInput"
        class="time-slider"
      />
    </div>
    <div class="editor-container">
      <AnimationEditorView
        ref="editorRef"
        :duration="10"
      />
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d0d1a;
}

.controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: #1a1a2e;
  border-bottom: 1px solid #333;
}

.time-label {
  color: #e0e0e0;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  min-width: 100px;
}

.time-slider {
  flex: 1;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: #333;
  border-radius: 4px;
  outline: none;
}

.time-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #7b2cbf;
  border-radius: 50%;
  cursor: pointer;
}

.time-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #7b2cbf;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.editor-container {
  flex: 1;
  overflow: hidden;
}
</style>
