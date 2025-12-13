<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Core } from '../core'
import type {
  TrackRuntime,
  TrackType,
  EditorAction,
  PrecisionState,
  PrecisionDraft,
  NumberElement,
  EnumElement,
  FuncElementData,
  FuncArg,
} from '../types'
import { useToast } from '../useToast'
import EditSidebar from './EditSidebar.vue'
import NumberLane from './NumberLane.vue'
import EnumLane from './EnumLane.vue'
import FuncLane from './FuncLane.vue'
import PrecisionEditor from './PrecisionEditor.vue'
import TimeRibbon from './TimeRibbon.vue'
import TimeTicksHeader from './TimeTicksHeader.vue'
import Playhead from './Playhead.vue'
import { NAME_COLUMN_WIDTH } from '../constants'

const props = defineProps<{
  core: Core
  windowStart: number
  windowEnd: number
  currentTime: number
}>()

const emit = defineEmits<{
  'update:windowStart': [value: number]
  'update:windowEnd': [value: number]
}>()

const { warning } = useToast()

// Edit state
const editEnabledTrackIds = ref<Set<string>>(new Set())
const frontTrackIdByType = ref<{ number?: string; enum?: string; func?: string }>({})
const selectedElementByType = ref<{
  number?: { trackId: string; elementId: string }
  enum?: { trackId: string; elementId: string }
  func?: { trackId: string; elementId: string }
}>({})
const precision = ref<PrecisionState | null>(null)

// Render version (increment to trigger lane rebuilds)
const renderVersion = ref(0)

// Track refs for getting element positions
const numberLaneRef = ref<InstanceType<typeof NumberLane> | null>(null)
const enumLaneRef = ref<InstanceType<typeof EnumLane> | null>(null)
const funcLaneRef = ref<InstanceType<typeof FuncLane> | null>(null)

// Lanes container for playhead width calculation
const lanesContainerRef = ref<HTMLElement | null>(null)
const lanesWidth = ref(0)

// Computed tracks by type
const allTracks = computed(() => props.core.getOrderedTracks())

const numberTracks = computed(() => {
  const ids = editEnabledTrackIds.value
  return allTracks.value.filter(t => t.def.fieldType === 'number' && ids.has(t.id))
})

const enumTracks = computed(() => {
  const ids = editEnabledTrackIds.value
  return allTracks.value.filter(t => t.def.fieldType === 'enum' && ids.has(t.id))
})

const funcTracks = computed(() => {
  const ids = editEnabledTrackIds.value
  return allTracks.value.filter(t => t.def.fieldType === 'func' && ids.has(t.id))
})

// Precision editor helpers
const precisionTrackName = computed(() => {
  if (!precision.value) return ''
  const track = props.core.getTrackById(precision.value.trackId)
  return track?.def.name || ''
})

const precisionEnumOptions = computed(() => {
  if (!precision.value || precision.value.fieldType !== 'enum') return []
  return props.core.getEnumOptions(precision.value.trackId)
})

// Enable all tracks by default when entering edit mode
watch(allTracks, (tracks) => {
  for (const track of tracks) {
    editEnabledTrackIds.value.add(track.id)
    // Set first track of each type as front by default
    if (!frontTrackIdByType.value[track.def.fieldType]) {
      frontTrackIdByType.value[track.def.fieldType] = track.id
    }
  }
}, { immediate: true })

// Update lanes width on resize
watch(lanesContainerRef, (el) => {
  if (!el) return
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      lanesWidth.value = entry.contentRect.width
    }
  })
  observer.observe(el)
}, { immediate: true })

function incrementRenderVersion() {
  renderVersion.value++
}

function onAction(action: EditorAction) {
  switch (action.type) {
    // Track management
    case 'TRACK/TOGGLE_EDIT_ENABLED':
      if (action.enabled) {
        editEnabledTrackIds.value.add(action.trackId)
      } else {
        editEnabledTrackIds.value.delete(action.trackId)
      }
      incrementRenderVersion()
      break

    case 'TRACK/SET_FRONT': {
      frontTrackIdByType.value[action.fieldType] = action.trackId
      incrementRenderVersion()
      break
    }

    case 'TRACK/DELETE': {
      props.core.pushSnapshot()
      props.core.deleteTrack(action.trackId)
      editEnabledTrackIds.value.delete(action.trackId)
      // Clear front if deleted
      for (const type of ['number', 'enum', 'func'] as TrackType[]) {
        if (frontTrackIdByType.value[type] === action.trackId) {
          frontTrackIdByType.value[type] = undefined
        }
      }
      // Clear selection if deleted
      for (const type of ['number', 'enum', 'func'] as TrackType[]) {
        if (selectedElementByType.value[type]?.trackId === action.trackId) {
          selectedElementByType.value[type] = undefined
        }
      }
      incrementRenderVersion()
      break
    }

    case 'TRACK/SET_BOUNDS': {
      props.core.pushSnapshot()
      props.core.setTrackBounds(action.trackId, action.low, action.high)
      incrementRenderVersion()
      break
    }

    // History
    case 'EDIT/UNDO':
      if (props.core.undo()) {
        incrementRenderVersion()
      }
      break

    case 'EDIT/REDO':
      if (props.core.redo()) {
        incrementRenderVersion()
      }
      break

    // Selection
    case 'ELEMENT/SELECT':
      selectedElementByType.value[action.fieldType] = {
        trackId: action.trackId,
        elementId: action.elementId,
      }
      break

    case 'ELEMENT/DESELECT':
      selectedElementByType.value[action.fieldType] = undefined
      break

    // Precision editor
    case 'PRECISION/OPEN': {
      const track = props.core.getTrackById(action.trackId)
      const element = props.core.getElement(action.trackId, action.elementId)
      if (!track || !element) break

      const draft = createDraftFromElement(track, element)
      precision.value = {
        open: true,
        fieldType: action.fieldType,
        trackId: action.trackId,
        elementId: action.elementId,
        saved: { ...draft },
        draft,
        dirty: false,
      }
      break
    }

    case 'PRECISION/CHANGE_DRAFT':
      if (precision.value) {
        Object.assign(precision.value.draft, action.draft)
        precision.value.dirty = true
      }
      break

    case 'PRECISION/SAVE':
      if (precision.value) {
        savePrecisionEdit()
      }
      break

    case 'PRECISION/REVERT':
      if (precision.value) {
        precision.value.draft = { ...precision.value.saved }
        precision.value.dirty = false
      }
      break

    case 'PRECISION/CLOSE':
      precision.value = null
      break

    // Number lane
    case 'NUMBER/ADD': {
      props.core.pushSnapshot()
      const elementId = props.core.addNumberElement(action.trackId, action.time, action.value)
      if (elementId) {
        selectedElementByType.value.number = { trackId: action.trackId, elementId }
      }
      incrementRenderVersion()
      break
    }

    case 'NUMBER/DELETE': {
      props.core.pushSnapshot()
      props.core.deleteElement(action.trackId, action.elementId)
      if (selectedElementByType.value.number?.elementId === action.elementId) {
        selectedElementByType.value.number = undefined
      }
      incrementRenderVersion()
      break
    }

    case 'NUMBER/DRAG_START':
      // Nothing special needed
      break

    case 'NUMBER/DRAG_PREVIEW':
      props.core.setDragPreview({
        fieldType: 'number',
        trackId: action.trackId,
        elementId: action.elementId,
        time: action.time,
        value: action.value,
      })
      props.core.evaluateAtCurrentTime()
      break

    case 'NUMBER/DRAG_END': {
      props.core.setDragPreview(null)
      props.core.pushSnapshot()
      props.core.updateNumberElement(action.trackId, action.elementId, action.time, action.value)
      incrementRenderVersion()
      break
    }

    // Enum lane
    case 'ENUM/ADD': {
      props.core.pushSnapshot()
      const elementId = props.core.addEnumElement(action.trackId, action.time)
      if (elementId) {
        selectedElementByType.value.enum = { trackId: action.trackId, elementId }
      }
      incrementRenderVersion()
      break
    }

    case 'ENUM/DELETE': {
      props.core.pushSnapshot()
      props.core.deleteElement(action.trackId, action.elementId)
      if (selectedElementByType.value.enum?.elementId === action.elementId) {
        selectedElementByType.value.enum = undefined
      }
      incrementRenderVersion()
      break
    }

    case 'ENUM/DRAG_PREVIEW':
      props.core.setDragPreview({
        fieldType: 'enum',
        trackId: action.trackId,
        elementId: action.elementId,
        time: action.time,
      })
      props.core.evaluateAtCurrentTime()
      break

    case 'ENUM/DRAG_END': {
      props.core.setDragPreview(null)
      props.core.pushSnapshot()
      const result = props.core.updateEnumElement(action.trackId, action.elementId, action.time)
      if (result.collision) {
        warning("Can't have elements at the same time")
      }
      incrementRenderVersion()
      break
    }

    // Func lane
    case 'FUNC/ADD': {
      props.core.pushSnapshot()
      const elementId = props.core.addFuncElement(action.trackId, action.time)
      if (elementId) {
        selectedElementByType.value.func = { trackId: action.trackId, elementId }
      }
      incrementRenderVersion()
      break
    }

    case 'FUNC/DELETE': {
      props.core.pushSnapshot()
      props.core.deleteElement(action.trackId, action.elementId)
      if (selectedElementByType.value.func?.elementId === action.elementId) {
        selectedElementByType.value.func = undefined
      }
      incrementRenderVersion()
      break
    }

    case 'FUNC/DRAG_PREVIEW':
      // Func tracks don't update callbacks during drag (per plan)
      break

    case 'FUNC/DRAG_END': {
      props.core.pushSnapshot()
      const result = props.core.updateFuncElement(action.trackId, action.elementId, action.time)
      if (result.collision) {
        warning("Can't have elements at the same time")
      }
      incrementRenderVersion()
      break
    }
  }
}

function createDraftFromElement(track: TrackRuntime, element: NumberElement | EnumElement | FuncElementData): PrecisionDraft {
  const draft: PrecisionDraft = { time: element.time }

  if (track.def.fieldType === 'number') {
    draft.value = (element as NumberElement).value
  } else if (track.def.fieldType === 'enum') {
    draft.enumValue = (element as EnumElement).value
  } else if (track.def.fieldType === 'func') {
    const func = (element as FuncElementData).value
    draft.funcName = func.funcName
    draft.funcArgs = func.args.map(arg => ({
      type: typeof arg === 'number' ? 'number' : 'text',
      value: String(arg),
    })) as FuncArg[]
  }

  return draft
}

function savePrecisionEdit() {
  if (!precision.value) return

  const { fieldType, trackId, elementId, draft } = precision.value

  props.core.pushSnapshot()

  if (fieldType === 'number') {
    props.core.updateNumberElement(trackId, elementId, draft.time, draft.value ?? 0)
  } else if (fieldType === 'enum') {
    const result = props.core.updateEnumElement(trackId, elementId, draft.time, draft.enumValue)
    if (result.collision) {
      warning("Can't have elements at the same time - time was adjusted")
    }
  } else if (fieldType === 'func') {
    // Parse func args
    const args: unknown[] = (draft.funcArgs || []).map(arg => {
      if (arg.type === 'number') {
        const num = Number(arg.value)
        return isFinite(num) ? num : 0
      }
      return arg.value
    })
    const result = props.core.updateFuncElement(trackId, elementId, draft.time, draft.funcName, args)
    if (result.collision) {
      warning("Can't have elements at the same time - time was adjusted")
    }
  }

  // Update saved to current draft
  precision.value.saved = { ...draft }
  precision.value.dirty = false
  incrementRenderVersion()
}

function openPrecisionForSelected(fieldType: TrackType) {
  const sel = selectedElementByType.value[fieldType]
  if (!sel) return
  onAction({ type: 'PRECISION/OPEN', fieldType, trackId: sel.trackId, elementId: sel.elementId })
}
</script>

<template>
  <div class="edit-mode-view">
    <EditSidebar
      :tracks="allTracks"
      :edit-enabled-track-ids="editEnabledTrackIds"
      :front-track-id-by-type="frontTrackIdByType"
      @action="onAction"
    />

    <div class="lanes-area">
      <!-- Time ribbon -->
      <TimeRibbon
        :duration="core.duration"
        :window-start="windowStart"
        :window-end="windowEnd"
        @update:window-start="emit('update:windowStart', $event)"
        @update:window-end="emit('update:windowEnd', $event)"
      />

      <!-- Time ticks header -->
      <div class="ticks-header">
        <div class="lane-label-spacer"></div>
        <TimeTicksHeader
          :window-start="windowStart"
          :window-end="windowEnd"
        />
      </div>

      <!-- Lanes container -->
      <div class="lanes-container" ref="lanesContainerRef">
        <NumberLane
          v-if="numberTracks.length > 0"
          ref="numberLaneRef"
          :tracks="numberTracks"
          :front-track-id="frontTrackIdByType.number"
          :window-start="windowStart"
          :window-end="windowEnd"
          :selected-element-id="selectedElementByType.number?.elementId"
          :selected-track-id="selectedElementByType.number?.trackId"
          :render-version="renderVersion"
          @action="onAction"
        />

        <EnumLane
          v-if="enumTracks.length > 0"
          ref="enumLaneRef"
          :tracks="enumTracks"
          :front-track-id="frontTrackIdByType.enum"
          :window-start="windowStart"
          :window-end="windowEnd"
          :selected-element-id="selectedElementByType.enum?.elementId"
          :selected-track-id="selectedElementByType.enum?.trackId"
          :render-version="renderVersion"
          @action="onAction"
        />

        <FuncLane
          v-if="funcTracks.length > 0"
          ref="funcLaneRef"
          :tracks="funcTracks"
          :front-track-id="frontTrackIdByType.func"
          :window-start="windowStart"
          :window-end="windowEnd"
          :selected-element-id="selectedElementByType.func?.elementId"
          :selected-track-id="selectedElementByType.func?.trackId"
          :render-version="renderVersion"
          @action="onAction"
        />

        <div v-if="numberTracks.length === 0 && enumTracks.length === 0 && funcTracks.length === 0" class="empty-lanes">
          Enable tracks in the sidebar to edit
        </div>

        <!-- Playhead overlay -->
        <Playhead
          :current-time="currentTime"
          :window-start="windowStart"
          :window-end="windowEnd"
          :canvas-width="lanesWidth - 60"
          :left-offset="60"
        />

        <!-- Precision edit buttons -->
        <button
          v-if="selectedElementByType.number"
          class="precision-btn"
          @click="openPrecisionForSelected('number')"
        >
          +
        </button>
        <button
          v-if="selectedElementByType.enum"
          class="precision-btn precision-btn-enum"
          @click="openPrecisionForSelected('enum')"
        >
          +
        </button>
        <button
          v-if="selectedElementByType.func"
          class="precision-btn precision-btn-func"
          @click="openPrecisionForSelected('func')"
        >
          +
        </button>
      </div>
    </div>

    <!-- Precision Editor Modal -->
    <PrecisionEditor
      v-if="precision"
      :open="precision.open"
      :field-type="precision.fieldType"
      :track-name="precisionTrackName"
      :saved="precision.saved"
      :draft="precision.draft"
      :dirty="precision.dirty"
      :enum-options="precisionEnumOptions"
      @action="onAction"
    />
  </div>
</template>

<style scoped>
.edit-mode-view {
  display: flex;
  height: 100%;
  background: #0d0d1a;
}

.lanes-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ticks-header {
  display: flex;
  border-bottom: 1px solid #333;
}

.lane-label-spacer {
  width: 60px;
  min-width: 60px;
  background: #0a0a1a;
  border-right: 1px solid #333;
}

.lanes-container {
  flex: 1;
  position: relative;
  overflow-y: auto;
}

.empty-lanes {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #666;
  font-size: 14px;
}

.precision-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  padding: 0;
  background: #7b2cbf;
  border: none;
  border-radius: 50%;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  z-index: 100;
}

.precision-btn:hover {
  background: #9d4edd;
}

.precision-btn-enum {
  top: calc(v-bind('numberTracks.length > 0 ? "200px" : "0"') + 10px);
}

.precision-btn-func {
  top: calc(v-bind('(numberTracks.length > 0 ? 200 : 0) + (enumTracks.length > 0 ? 120 : 0)') + 10px);
}
</style>
