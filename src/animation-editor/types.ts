/**
 * Animation Editor Type Definitions
 */

export type TrackType = 'number' | 'enum' | 'func'

export type FuncElement = {
  funcName: string
  args: unknown[]
}

export type NumberDatum = { time: number; element: number }
export type EnumDatum = { time: number; element: string }
export type FuncDatum = { time: number; element: FuncElement }

export type TrackDatum = NumberDatum | EnumDatum | FuncDatum

export type TrackDef = {
  name: string
  fieldType: TrackType
  data: TrackDatum[]

  // Callbacks - only one should be defined based on fieldType
  updateNumber?: (v: number) => void
  updateEnum?: (v: string) => void
  updateFunc?: (funcName: string, ...args: unknown[]) => void

  // Number track bounds (defaults: 0-1)
  low?: number
  high?: number
}

export type TrackRuntime = {
  id: string
  def: TrackDef
  times: number[]
  elements: (number | string | FuncElement)[]
  low: number
  high: number
}
