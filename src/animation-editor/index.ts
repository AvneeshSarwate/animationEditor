/**
 * Animation Editor - Main exports
 */

// Types
export * from './types'

// Constants (for tweaking)
export * from './constants'

// Core logic
export { Core } from './core'
export { RenderScheduler } from './renderScheduler'

// Utilities
export * from './utils'

// Composables
export { useToast } from './useToast'

// Main component
export { default as AnimationEditorView } from './components/AnimationEditorView.vue'
