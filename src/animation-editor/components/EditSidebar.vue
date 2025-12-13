<script setup lang="ts">
import { computed } from 'vue'
import type { TrackRuntime, TrackType, EditorAction } from '../types'
import {
  EDIT_SIDEBAR_WIDTH,
  EDIT_SIDEBAR_BG_COLOR,
  EDIT_SIDEBAR_TRACK_BG,
  EDIT_SIDEBAR_TRACK_BG_HOVER,
  EDIT_SIDEBAR_TRACK_BG_ENABLED,
} from '../constants'

const props = defineProps<{
  tracks: TrackRuntime[]
  editEnabledTrackIds: Set<string>
  frontTrackIdByType: { number?: string; enum?: string; func?: string }
}>()

const emit = defineEmits<{
  action: [action: EditorAction]
}>()

// Group tracks by type
const numberTracks = computed(() => props.tracks.filter(t => t.def.fieldType === 'number'))
const enumTracks = computed(() => props.tracks.filter(t => t.def.fieldType === 'enum'))
const funcTracks = computed(() => props.tracks.filter(t => t.def.fieldType === 'func'))

function isEnabled(trackId: string): boolean {
  return props.editEnabledTrackIds.has(trackId)
}

function isFront(track: TrackRuntime): boolean {
  return props.frontTrackIdByType[track.def.fieldType] === track.id
}

function toggleEnabled(trackId: string) {
  const enabled = !isEnabled(trackId)
  emit('action', { type: 'TRACK/TOGGLE_EDIT_ENABLED', trackId, enabled })
}

function setFront(track: TrackRuntime) {
  emit('action', { type: 'TRACK/SET_FRONT', fieldType: track.def.fieldType, trackId: track.id })
}

function deleteTrack(trackId: string) {
  if (confirm('Delete this track?')) {
    emit('action', { type: 'TRACK/DELETE', trackId })
  }
}

function updateBounds(trackId: string, low: number, high: number) {
  emit('action', { type: 'TRACK/SET_BOUNDS', trackId, low, high })
}

function onLowChange(track: TrackRuntime, e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(value) && value < track.high) {
    updateBounds(track.id, value, track.high)
  }
}

function onHighChange(track: TrackRuntime, e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(value) && value > track.low) {
    updateBounds(track.id, track.low, value)
  }
}

function undo() {
  emit('action', { type: 'EDIT/UNDO' })
}

function redo() {
  emit('action', { type: 'EDIT/REDO' })
}
</script>

<template>
  <div class="edit-sidebar">
    <!-- Undo/Redo buttons -->
    <div class="undo-redo-row">
      <button class="undo-btn" @click="undo">Undo</button>
      <button class="redo-btn" @click="redo">Redo</button>
    </div>

    <!-- Number tracks section -->
    <div class="track-section" v-if="numberTracks.length > 0">
      <div class="section-header">Number Tracks</div>
      <div
        v-for="track in numberTracks"
        :key="track.id"
        class="track-item"
        :class="{
          'track-enabled': isEnabled(track.id),
          'track-front': isFront(track),
        }"
        @click="setFront(track)"
      >
        <div class="track-row">
          <input
            type="checkbox"
            :checked="isEnabled(track.id)"
            @click.stop
            @change="toggleEnabled(track.id)"
            class="track-checkbox"
          />
          <span class="track-name">{{ track.def.name }}</span>
          <button class="delete-btn" @click.stop="deleteTrack(track.id)">×</button>
        </div>
        <div class="bounds-row" v-if="isEnabled(track.id)">
          <label>
            Low:
            <input
              type="number"
              :value="track.low"
              step="0.1"
              @change="onLowChange(track, $event)"
              class="bounds-input"
            />
          </label>
          <label>
            High:
            <input
              type="number"
              :value="track.high"
              step="0.1"
              @change="onHighChange(track, $event)"
              class="bounds-input"
            />
          </label>
        </div>
      </div>
    </div>

    <!-- Enum tracks section -->
    <div class="track-section" v-if="enumTracks.length > 0">
      <div class="section-header">Enum Tracks</div>
      <div
        v-for="track in enumTracks"
        :key="track.id"
        class="track-item"
        :class="{
          'track-enabled': isEnabled(track.id),
          'track-front': isFront(track),
        }"
        @click="setFront(track)"
      >
        <div class="track-row">
          <input
            type="checkbox"
            :checked="isEnabled(track.id)"
            @click.stop
            @change="toggleEnabled(track.id)"
            class="track-checkbox"
          />
          <span class="track-name">{{ track.def.name }}</span>
          <button class="delete-btn" @click.stop="deleteTrack(track.id)">×</button>
        </div>
      </div>
    </div>

    <!-- Func tracks section -->
    <div class="track-section" v-if="funcTracks.length > 0">
      <div class="section-header">Func Tracks</div>
      <div
        v-for="track in funcTracks"
        :key="track.id"
        class="track-item"
        :class="{
          'track-enabled': isEnabled(track.id),
          'track-front': isFront(track),
        }"
        @click="setFront(track)"
      >
        <div class="track-row">
          <input
            type="checkbox"
            :checked="isEnabled(track.id)"
            @click.stop
            @change="toggleEnabled(track.id)"
            class="track-checkbox"
          />
          <span class="track-name">{{ track.def.name }}</span>
          <button class="delete-btn" @click.stop="deleteTrack(track.id)">×</button>
        </div>
      </div>
    </div>

    <div v-if="tracks.length === 0" class="empty-message">
      No tracks
    </div>
  </div>
</template>

<style scoped>
.edit-sidebar {
  width: v-bind('EDIT_SIDEBAR_WIDTH + "px"');
  min-width: v-bind('EDIT_SIDEBAR_WIDTH + "px"');
  background: v-bind('EDIT_SIDEBAR_BG_COLOR');
  border-right: 1px solid #333;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.undo-redo-row {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #333;
}

.undo-btn,
.redo-btn {
  flex: 1;
  padding: 6px 12px;
  background: #2a2a4a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
  cursor: pointer;
}

.undo-btn:hover,
.redo-btn:hover {
  background: #3a3a5a;
}

.track-section {
  padding: 8px 0;
  border-bottom: 1px solid #333;
}

.section-header {
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.track-item {
  padding: 8px 12px;
  background: v-bind('EDIT_SIDEBAR_TRACK_BG');
  cursor: pointer;
  transition: background 0.15s;
}

.track-item:hover {
  background: v-bind('EDIT_SIDEBAR_TRACK_BG_HOVER');
}

.track-item.track-enabled {
  background: v-bind('EDIT_SIDEBAR_TRACK_BG_ENABLED');
}

.track-item.track-front {
  border-left: 3px solid #7b2cbf;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-checkbox {
  flex-shrink: 0;
}

.track-name {
  flex: 1;
  font-size: 12px;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  border-radius: 3px;
}

.delete-btn:hover {
  background: #ef4444;
  color: #fff;
}

.bounds-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  padding-left: 24px;
}

.bounds-row label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #888;
}

.bounds-input {
  width: 60px;
  padding: 2px 4px;
  background: #1a1a2e;
  border: 1px solid #444;
  border-radius: 3px;
  color: #e0e0e0;
  font-size: 11px;
}

.empty-message {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 13px;
}
</style>
