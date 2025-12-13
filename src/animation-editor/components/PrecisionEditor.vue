<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TrackType, PrecisionDraft, FuncArg, EditorAction } from '../types'
import { PRECISION_MODAL_WIDTH } from '../constants'

const props = defineProps<{
  open: boolean
  fieldType: TrackType
  trackName: string
  saved: PrecisionDraft
  draft: PrecisionDraft
  dirty: boolean
  enumOptions: string[]
}>()

const emit = defineEmits<{
  action: [action: EditorAction]
}>()

// Local draft for immediate UI updates
const localDraft = ref<PrecisionDraft>({ ...props.draft })

watch(() => props.draft, (newDraft) => {
  localDraft.value = { ...newDraft }
}, { deep: true })

function updateDraft(changes: Partial<PrecisionDraft>) {
  Object.assign(localDraft.value, changes)
  emit('action', { type: 'PRECISION/CHANGE_DRAFT', draft: changes })
}

function save() {
  emit('action', { type: 'PRECISION/SAVE' })
}

function revert() {
  emit('action', { type: 'PRECISION/REVERT' })
}

function close() {
  emit('action', { type: 'PRECISION/CLOSE' })
}

function onTimeChange(e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(value) && value >= 0) {
    updateDraft({ time: value })
  }
}

function onValueChange(e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(value)) {
    updateDraft({ value })
  }
}

function onEnumChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  updateDraft({ enumValue: value })
}

function onFuncNameChange(e: Event) {
  const value = (e.target as HTMLInputElement).value
  updateDraft({ funcName: value })
}

// Func args handling
const funcArgs = computed(() => localDraft.value.funcArgs || [])

function addArg() {
  const newArgs = [...funcArgs.value, { type: 'text' as const, value: '' }]
  updateDraft({ funcArgs: newArgs })
}

function removeArg(index: number) {
  const newArgs = funcArgs.value.filter((_, i) => i !== index)
  updateDraft({ funcArgs: newArgs })
}

function updateArgType(index: number, type: 'text' | 'number') {
  const newArgs = [...funcArgs.value]
  newArgs[index] = { ...newArgs[index], type }
  updateDraft({ funcArgs: newArgs })
}

function updateArgValue(index: number, value: string) {
  const newArgs = [...funcArgs.value]
  newArgs[index] = { ...newArgs[index], value }
  updateDraft({ funcArgs: newArgs })
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click="handleBackdropClick">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit Element</h3>
          <button class="close-btn" @click="close">×</button>
        </div>

        <div class="modal-body">
          <div class="track-name">{{ trackName }}</div>

          <!-- Time (all types) -->
          <div class="field">
            <label>Time</label>
            <input
              type="number"
              :value="localDraft.time"
              step="0.1"
              min="0"
              @change="onTimeChange"
              class="input"
            />
          </div>

          <!-- Number value -->
          <template v-if="fieldType === 'number'">
            <div class="field">
              <label>Value</label>
              <input
                type="number"
                :value="localDraft.value"
                step="0.01"
                @change="onValueChange"
                class="input"
              />
            </div>
          </template>

          <!-- Enum value -->
          <template v-if="fieldType === 'enum'">
            <div class="field">
              <label>Value</label>
              <select
                :value="localDraft.enumValue"
                @change="onEnumChange"
                class="input"
              >
                <option v-for="opt in enumOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </div>
          </template>

          <!-- Func name and args -->
          <template v-if="fieldType === 'func'">
            <div class="field">
              <label>Function Name</label>
              <input
                type="text"
                :value="localDraft.funcName"
                @input="onFuncNameChange"
                class="input"
              />
            </div>

            <div class="field">
              <label>Arguments</label>
              <div class="args-list">
                <div v-for="(arg, index) in funcArgs" :key="index" class="arg-row">
                  <select
                    :value="arg.type"
                    @change="(e) => updateArgType(index, (e.target as HTMLSelectElement).value as 'text' | 'number')"
                    class="arg-type"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                  </select>
                  <input
                    type="text"
                    :value="arg.value"
                    @input="(e) => updateArgValue(index, (e.target as HTMLInputElement).value)"
                    class="arg-value"
                    :placeholder="arg.type === 'number' ? '0' : 'value'"
                  />
                  <button class="remove-arg-btn" @click="removeArg(index)">×</button>
                </div>
                <button v-if="funcArgs.length < 5" class="add-arg-btn" @click="addArg">
                  + Add Argument
                </button>
              </div>
            </div>
          </template>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="revert" :disabled="!dirty">
            Revert
          </button>
          <button class="btn btn-primary" @click="save">
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: v-bind('PRECISION_MODAL_WIDTH + "px"');
  background: #1a1a2e;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e0e0e0;
}

.close-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
}

.close-btn:hover {
  background: #333;
  color: #fff;
}

.modal-body {
  padding: 20px;
}

.track-name {
  font-size: 12px;
  color: #888;
  margin-bottom: 16px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}

.input {
  width: 100%;
  padding: 8px 12px;
  background: #0f0f23;
  border: 1px solid #333;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 14px;
}

.input:focus {
  outline: none;
  border-color: #7b2cbf;
}

.args-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.arg-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.arg-type {
  width: 90px;
  padding: 6px 8px;
  background: #0f0f23;
  border: 1px solid #333;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

.arg-value {
  flex: 1;
  padding: 6px 8px;
  background: #0f0f23;
  border: 1px solid #333;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

.remove-arg-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  border-radius: 3px;
}

.remove-arg-btn:hover {
  background: #ef4444;
  color: #fff;
}

.add-arg-btn {
  padding: 6px 12px;
  background: #2a2a4a;
  border: 1px dashed #444;
  border-radius: 4px;
  color: #888;
  font-size: 12px;
  cursor: pointer;
}

.add-arg-btn:hover {
  background: #3a3a5a;
  color: #e0e0e0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #333;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: none;
}

.btn-secondary {
  background: #333;
  color: #e0e0e0;
}

.btn-secondary:hover:not(:disabled) {
  background: #444;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #7b2cbf;
  color: #fff;
}

.btn-primary:hover {
  background: #9d4edd;
}
</style>
