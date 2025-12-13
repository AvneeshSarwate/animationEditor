<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import Konva from 'konva'
import type { TrackRuntime, EditorAction, NumberElement } from '../types'
import {
  NUMBER_LANE_HEIGHT,
  EDIT_LANE_BG_COLOR,
  NUMBER_LINE_COLOR,
  NUMBER_POINT_COLOR,
  EDIT_NUMBER_POINT_RADIUS,
  EDIT_NUMBER_LINE_WIDTH,
  EDIT_NUMBER_LINE_WIDTH_FRONT,
  EDIT_NUMBER_BOUNDS_LINE_COLOR,
  SELECTION_COLOR,
  SELECTION_STROKE_WIDTH,
  FRONT_TRACK_OPACITY,
  REFERENCE_TRACK_OPACITY,
} from '../constants'
import { timeToX, xToTime, clamp } from '../utils'

const props = defineProps<{
  tracks: TrackRuntime[]
  frontTrackId: string | undefined
  windowStart: number
  windowEnd: number
  selectedElementId: string | undefined
  selectedTrackId: string | undefined
  renderVersion: number
}>()

const emit = defineEmits<{
  action: [action: EditorAction]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let resizeObserver: ResizeObserver | null = null

// Map of element ID to Konva node (for front track only)
const elementNodes = new Map<string, Konva.Circle>()

// Drag state
let dragElementIndex: number | null = null
let dragTrack: TrackRuntime | null = null

const width = ref(0)
const height = NUMBER_LANE_HEIGHT

const frontTrack = computed(() => {
  if (!props.frontTrackId) return undefined
  return props.tracks.find(t => t.id === props.frontTrackId)
})

function timeToXLocal(t: number): number {
  return timeToX(t, props.windowStart, props.windowEnd, width.value)
}

function xToTimeLocal(x: number): number {
  return xToTime(x, props.windowStart, props.windowEnd, width.value)
}

function valueToY(value: number, low: number, high: number): number {
  const padding = 20
  const drawHeight = height - padding * 2
  const normalized = (value - low) / (high - low)
  return padding + drawHeight * (1 - normalized)
}

function yToValue(y: number, low: number, high: number): number {
  const padding = 20
  const drawHeight = height - padding * 2
  const normalized = 1 - (y - padding) / drawHeight
  return low + normalized * (high - low)
}

function rebuildScene() {
  if (!layer || !stage) return

  layer.destroyChildren()
  elementNodes.clear()

  const w = width.value
  if (w <= 0) return

  // Draw reference tracks first (non-front, lower opacity)
  for (const track of props.tracks) {
    if (track.id === props.frontTrackId) continue
    drawTrackLine(track, false)
  }

  // Draw front track last
  if (frontTrack.value) {
    drawTrackLine(frontTrack.value, true)
    drawFrontTrackPoints(frontTrack.value)
  }

  layer.batchDraw()
}

function drawTrackLine(track: TrackRuntime, isFront: boolean) {
  const elements = track.elementData as NumberElement[]
  if (elements.length === 0) return

  const points: number[] = []

  // Start from left edge (evaluate at windowStart)
  const startValue = evaluateAtTime(track, props.windowStart)
  points.push(0, valueToY(startValue, track.low, track.high))

  // Add visible points
  for (const elem of elements) {
    if (elem.time < props.windowStart) continue
    if (elem.time > props.windowEnd) break
    points.push(timeToXLocal(elem.time), valueToY(elem.value, track.low, track.high))
  }

  // End at right edge
  const endValue = evaluateAtTime(track, props.windowEnd)
  points.push(width.value, valueToY(endValue, track.low, track.high))

  const line = new Konva.Line({
    points,
    stroke: NUMBER_LINE_COLOR,
    strokeWidth: isFront ? EDIT_NUMBER_LINE_WIDTH_FRONT : EDIT_NUMBER_LINE_WIDTH,
    opacity: isFront ? FRONT_TRACK_OPACITY : REFERENCE_TRACK_OPACITY,
    lineCap: 'round',
    lineJoin: 'round',
  })

  layer!.add(line)

  // Draw bounds lines for front track
  if (isFront) {
    const lowY = valueToY(track.low, track.low, track.high)
    const highY = valueToY(track.high, track.low, track.high)

    const lowLine = new Konva.Line({
      points: [0, lowY, width.value, lowY],
      stroke: EDIT_NUMBER_BOUNDS_LINE_COLOR,
      strokeWidth: 1,
      dash: [4, 4],
    })
    layer!.add(lowLine)

    const highLine = new Konva.Line({
      points: [0, highY, width.value, highY],
      stroke: EDIT_NUMBER_BOUNDS_LINE_COLOR,
      strokeWidth: 1,
      dash: [4, 4],
    })
    layer!.add(highLine)
  }
}

function drawFrontTrackPoints(track: TrackRuntime) {
  const elements = track.elementData as NumberElement[]

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i]
    if (elem.time < props.windowStart || elem.time > props.windowEnd) continue

    const x = timeToXLocal(elem.time)
    const y = valueToY(elem.value, track.low, track.high)
    const isSelected = elem.id === props.selectedElementId && track.id === props.selectedTrackId

    const circle = new Konva.Circle({
      x,
      y,
      radius: EDIT_NUMBER_POINT_RADIUS,
      fill: NUMBER_POINT_COLOR,
      stroke: isSelected ? SELECTION_COLOR : undefined,
      strokeWidth: isSelected ? SELECTION_STROKE_WIDTH : 0,
      draggable: true,
    })

    // Store element info on the node
    circle.setAttr('elementId', elem.id)
    circle.setAttr('elementIndex', i)

    // Event handlers
    circle.on('click', (e) => {
      if (e.evt.shiftKey) {
        // Shift-click to delete
        emit('action', { type: 'NUMBER/DELETE', trackId: track.id, elementId: elem.id })
      } else {
        // Regular click to select
        emit('action', { type: 'ELEMENT/SELECT', fieldType: 'number', trackId: track.id, elementId: elem.id })
      }
    })

    circle.on('dragstart', () => {
      dragElementIndex = i
      dragTrack = track
      emit('action', { type: 'ELEMENT/SELECT', fieldType: 'number', trackId: track.id, elementId: elem.id })
      emit('action', { type: 'NUMBER/DRAG_START', trackId: track.id, elementId: elem.id })
    })

    circle.on('dragmove', () => {
      if (dragElementIndex === null || !dragTrack) return

      const pos = circle.position()
      let t = xToTimeLocal(pos.x)
      let v = yToValue(pos.y, dragTrack.low, dragTrack.high)

      // Clamp to window
      t = clamp(t, props.windowStart, props.windowEnd)

      // Clamp to neighbors
      const elems = dragTrack.elementData as NumberElement[]
      const prevTime = dragElementIndex > 0 ? elems[dragElementIndex - 1].time : 0
      const nextTime = dragElementIndex < elems.length - 1 ? elems[dragElementIndex + 1].time : Infinity
      t = clamp(t, prevTime, nextTime)

      // Clamp value to bounds
      v = clamp(v, dragTrack.low, dragTrack.high)

      // Snap circle back to clamped position
      circle.position({
        x: timeToXLocal(t),
        y: valueToY(v, dragTrack.low, dragTrack.high),
      })

      // Update the line visually (find and update)
      updateLinePreview(dragTrack, dragElementIndex, t, v)

      // Emit preview for live callbacks
      emit('action', {
        type: 'NUMBER/DRAG_PREVIEW',
        trackId: dragTrack.id,
        elementId: elem.id,
        time: t,
        value: v,
      })
    })

    circle.on('dragend', () => {
      if (dragElementIndex === null || !dragTrack) return

      const pos = circle.position()
      let t = xToTimeLocal(pos.x)
      let v = yToValue(pos.y, dragTrack.low, dragTrack.high)

      // Apply same clamping
      t = clamp(t, props.windowStart, props.windowEnd)
      const elems = dragTrack.elementData as NumberElement[]
      const prevTime = dragElementIndex > 0 ? elems[dragElementIndex - 1].time : 0
      const nextTime = dragElementIndex < elems.length - 1 ? elems[dragElementIndex + 1].time : Infinity
      t = clamp(t, prevTime, nextTime)
      v = clamp(v, dragTrack.low, dragTrack.high)

      emit('action', {
        type: 'NUMBER/DRAG_END',
        trackId: dragTrack.id,
        elementId: elem.id,
        time: t,
        value: v,
      })

      dragElementIndex = null
      dragTrack = null
    })

    layer!.add(circle)
    elementNodes.set(elem.id, circle)
  }
}

function updateLinePreview(track: TrackRuntime, dragIndex: number, newTime: number, newValue: number) {
  // Find the line for this track and update its points
  // For simplicity, just rebuild - a real optimization would update the line in place
  // This is called frequently during drag, so keeping it simple
}

function evaluateAtTime(track: TrackRuntime, t: number): number {
  const elements = track.elementData as NumberElement[]
  if (elements.length === 0) return track.low

  // Find surrounding elements
  let i1 = -1
  let i2 = 0
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].time <= t) {
      i1 = i
    } else {
      i2 = i
      break
    }
    i2 = i + 1
  }

  if (i1 < 0) return elements[0].value
  if (i2 >= elements.length) return elements[i1].value

  const t1 = elements[i1].time
  const t2 = elements[i2].time
  const v1 = elements[i1].value
  const v2 = elements[i2].value
  const alpha = (t - t1) / (t2 - t1)
  return v1 + (v2 - v1) * alpha
}

function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
  // Only handle clicks on empty space
  if (e.target !== stage && e.target !== layer) return
  if (!frontTrack.value) return

  const pos = stage!.getPointerPosition()
  if (!pos) return

  const t = clamp(xToTimeLocal(pos.x), props.windowStart, props.windowEnd)
  const v = clamp(yToValue(pos.y, frontTrack.value.low, frontTrack.value.high), frontTrack.value.low, frontTrack.value.high)

  emit('action', {
    type: 'NUMBER/ADD',
    trackId: frontTrack.value.id,
    time: t,
    value: v,
  })
}

function getSelectedElementPosition(): { x: number; y: number } | null {
  if (!props.selectedElementId || !props.selectedTrackId) return null
  const node = elementNodes.get(props.selectedElementId)
  if (!node) return null
  return { x: node.x(), y: node.y() }
}

onMounted(() => {
  if (!containerRef.value) return

  stage = new Konva.Stage({
    container: containerRef.value,
    width: containerRef.value.clientWidth,
    height: height,
  })

  layer = new Konva.Layer()
  stage.add(layer)

  stage.on('click', handleStageClick)

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      width.value = entry.contentRect.width
      if (stage) {
        stage.width(width.value)
        rebuildScene()
      }
    }
  })
  resizeObserver.observe(containerRef.value)

  width.value = containerRef.value.clientWidth
  rebuildScene()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  stage?.destroy()
})

// Watch for changes that require rebuild
watch(
  () => [props.renderVersion, props.windowStart, props.windowEnd, props.frontTrackId, props.tracks.length],
  () => rebuildScene(),
  { deep: false }
)

// Watch for selection changes (just update highlight)
watch(
  () => [props.selectedElementId, props.selectedTrackId],
  () => rebuildScene()
)

defineExpose({
  getSelectedElementPosition,
})
</script>

<template>
  <div class="number-lane">
    <div class="lane-label">Number</div>
    <div ref="containerRef" class="lane-canvas"></div>
  </div>
</template>

<style scoped>
.number-lane {
  height: v-bind('NUMBER_LANE_HEIGHT + "px"');
  background: v-bind('EDIT_LANE_BG_COLOR');
  border-bottom: 1px solid #333;
  display: flex;
}

.lane-label {
  width: 60px;
  min-width: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  background: #0a0a1a;
  border-right: 1px solid #333;
}

.lane-canvas {
  flex: 1;
  position: relative;
}
</style>
