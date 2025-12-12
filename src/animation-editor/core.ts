/**
 * Animation Editor Core
 * Non-reactive state management and track evaluation logic
 */

import type { TrackDef, TrackRuntime, FuncElement } from './types'
import { DEFAULT_NUMBER_LOW, DEFAULT_NUMBER_HIGH, DEFAULT_TIMELINE_DURATION } from './constants'
import { upperBound, lerp, clamp } from './utils'

let trackIdCounter = 0

function generateTrackId(): string {
  return `track_${++trackIdCounter}`
}

export class Core {
  tracksByName: Map<string, TrackRuntime> = new Map()
  orderedTrackIds: string[] = []
  currentTime: number = 0
  lastTime: number = 0
  duration: number

  private onInvalidate: (() => void) | null = null

  constructor(duration?: number) {
    this.duration = duration ?? DEFAULT_TIMELINE_DURATION
  }

  /**
   * Set the invalidation callback (called when rendering should update)
   */
  setInvalidateCallback(cb: () => void): void {
    this.onInvalidate = cb
  }

  private invalidate(): void {
    this.onInvalidate?.()
  }

  /**
   * Add a track to the editor
   * Returns false if track name already exists
   */
  addTrack(def: TrackDef): boolean {
    if (this.tracksByName.has(def.name)) {
      console.warn(`Track "${def.name}" already exists`)
      return false
    }

    // Sort data by time (stable sort preserves insertion order for equal times)
    const sortedData = [...def.data].sort((a, b) => a.time - b.time)

    // Extract times and elements into parallel arrays
    const times: number[] = []
    const elements: (number | string | FuncElement)[] = []
    for (const datum of sortedData) {
      times.push(datum.time)
      elements.push(datum.element)
    }

    // Determine low/high bounds for number tracks
    const low = def.low ?? DEFAULT_NUMBER_LOW
    const high = def.high ?? DEFAULT_NUMBER_HIGH

    const id = generateTrackId()
    const runtime: TrackRuntime = {
      id,
      def,
      times,
      elements,
      low,
      high,
    }

    this.tracksByName.set(def.name, runtime)
    this.orderedTrackIds.push(id)

    // Update duration if needed
    if (times.length > 0) {
      const maxTime = times[times.length - 1]
      if (maxTime + 1 > this.duration) {
        this.duration = maxTime + 1
      }
    }

    this.invalidate()
    return true
  }

  /**
   * Get a track by name
   */
  getTrack(name: string): TrackRuntime | undefined {
    return this.tracksByName.get(name)
  }

  /**
   * Get a track by ID
   */
  getTrackById(id: string): TrackRuntime | undefined {
    for (const track of this.tracksByName.values()) {
      if (track.id === id) return track
    }
    return undefined
  }

  /**
   * Get all tracks in order
   */
  getOrderedTracks(): TrackRuntime[] {
    return this.orderedTrackIds
      .map(id => this.getTrackById(id))
      .filter((t): t is TrackRuntime => t !== undefined)
  }

  /**
   * Evaluate a number track at a given time
   * Returns interpolated value clamped to [low, high]
   */
  evaluateNumberTrack(track: TrackRuntime, t: number): number {
    const { times, elements, low, high } = track
    const n = times.length

    if (n === 0) return low

    const r = upperBound(times, t)
    const i1 = r - 1 // Last point with time <= t
    const i2 = r     // First point with time > t

    let value: number
    if (i1 < 0) {
      // Before first point - use first value
      value = elements[0] as number
    } else if (i2 >= n) {
      // After last point - use last value
      value = elements[i1] as number
    } else {
      // Interpolate between i1 and i2
      const t1 = times[i1]
      const t2 = times[i2]
      const v1 = elements[i1] as number
      const v2 = elements[i2] as number
      const alpha = (t - t1) / (t2 - t1)
      value = lerp(v1, v2, alpha)
    }

    return clamp(value, low, high)
  }

  /**
   * Evaluate an enum track at a given time
   * Returns the current enum value (step function)
   */
  evaluateEnumTrack(track: TrackRuntime, t: number): string {
    const { times, elements } = track
    const n = times.length

    if (n === 0) return ''

    const i = upperBound(times, t) - 1
    if (i < 0) {
      // Before first point - use first value
      return elements[0] as string
    }
    return elements[i] as string
  }

  /**
   * Fire func callbacks for hits in the range (lastTime, t]
   * Only fires when moving forward in time
   */
  private fireFuncHits(track: TrackRuntime, fromTime: number, toTime: number): void {
    if (toTime <= fromTime) return
    if (!track.def.updateFunc) return

    const { times, elements } = track
    const start = upperBound(times, fromTime) // First index > fromTime
    const end = upperBound(times, toTime)     // First index > toTime

    for (let i = start; i < end; i++) {
      const hit = elements[i] as FuncElement
      track.def.updateFunc(hit.funcName, ...hit.args)
    }
  }

  /**
   * Scrub to a specific time
   * Updates all state tracks and fires func callbacks
   */
  scrubToTime(t: number): void {
    this.currentTime = t

    // Update all tracks
    for (const track of this.tracksByName.values()) {
      switch (track.def.fieldType) {
        case 'number':
          if (track.def.updateNumber) {
            const value = this.evaluateNumberTrack(track, t)
            track.def.updateNumber(value)
          }
          break

        case 'enum':
          if (track.def.updateEnum) {
            const value = this.evaluateEnumTrack(track, t)
            track.def.updateEnum(value)
          }
          break

        case 'func':
          // Fire func hits for forward movement only
          this.fireFuncHits(track, this.lastTime, t)
          break
      }
    }

    this.lastTime = t
    this.invalidate()
  }

  /**
   * Jump to a specific time without firing callbacks
   */
  jumpToTime(t: number): void {
    this.currentTime = t
    this.lastTime = t
    this.invalidate()
  }
}
