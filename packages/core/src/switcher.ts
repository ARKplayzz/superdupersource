import type { BoxRaw } from './units'

// What the engine needs to know about a switcher, independent of whether it's a real ATEM
// or the simulator. Input ids follow ATEM numbering: 1..n cameras, 3010/3020 media players,
// 6000+ SuperSources, 10010/10020/... M/E program outputs.

export type InputKind = 'external' | 'me' | 'supersource' | 'mediaplayer' | 'other'

export interface InputInfo {
  id: number
  kind: InputKind
  me?: number // for kind 'me': which M/E's program this is
  ss?: number // for kind 'supersource'
  short: string
  name: string
}

export interface MeState {
  program: number
  preview: number
  inTransition: boolean
  keysOnAir: boolean // any upstream key on air
}

export interface SuperSourceState {
  boxes: BoxRaw[]
  artFill: number
  artBehind: boolean
}

export interface SwitcherState {
  mixEffects: MeState[]
  superSources: SuperSourceState[]
  auxes: number[]
  inputs: Record<number, InputInfo>
}

export interface SwitcherInfo {
  model: string
  fps: number
  meCount: number
  superSourceCount: number
  boxCount: number
  macroCount: number
  mediaPlayers: number
  simulated: boolean
}

// One step of a take, at frame granularity. A run of ops is what becomes a switcher macro.
export type Op =
  | { op: 'box'; ss: number; box: number; props: Partial<BoxRaw> }
  | { op: 'wait'; frames: number }
  | { op: 'cut'; me: number }
  | { op: 'auto'; me: number } // the M/E's own mix, at its transition rate
  | { op: 'preview'; me: number; input: number }
  | { op: 'art'; ss: number; fill: number; behind: boolean }

export interface Switcher {
  readonly info: SwitcherInfo
  getState(): SwitcherState
  // Runs ops on the switcher's frame clock. Resolves when the last op has run.
  run(ops: Op[]): Promise<void>
  readonly busy: boolean
  on(event: 'state', listener: (state: SwitcherState) => void): void
  off(event: 'state', listener: (state: SwitcherState) => void): void
}

export const ssInput = (ss: number) => 6000 + ss
export const meProgramInput = (me: number) => 10010 + me * 10

// Every source visible on an M/E's program, following nested M/E outputs and SuperSource boxes.
export function programTree(state: SwitcherState, me: number): Set<number> {
  const out = new Set<number>()
  const visit = (id: number) => {
    if (out.has(id)) return
    out.add(id)
    const info = state.inputs[id]
    if (info?.kind === 'me' && info.me !== undefined && state.mixEffects[info.me]) visit(state.mixEffects[info.me].program)
    if (info?.kind === 'supersource' && info.ss !== undefined) {
      const ss = state.superSources[info.ss]
      ss?.boxes.forEach((b) => b.enabled && visit(b.source))
      if (ss) visit(ss.artFill)
    }
  }
  visit(state.mixEffects[me].program)
  return out
}

// Same, starting from an M/E's preview bus.
export function previewTree(state: SwitcherState, me: number): Set<number> {
  const copy: SwitcherState = {
    ...state,
    mixEffects: state.mixEffects.map((m, i) => (i === me ? { ...m, program: m.preview } : m)),
  }
  return programTree(copy, me)
}

export function isOnAir(state: SwitcherState, ss: number, me = 0): boolean {
  return programTree(state, me).has(ssInput(ss)) || state.auxes.includes(ssInput(ss))
}

export function isOnPreview(state: SwitcherState, ss: number, me = 0): boolean {
  return previewTree(state, me).has(ssInput(ss))
}

export type DesignTally = 'pgm' | 'pvw' | 'loaded' | 'none'

// Where a design is right now: on program, on preview, loaded but unseen, or not loaded.
export function designTally(state: SwitcherState, slots: { ss: number; designId: string | null }[], designId: string, me = 0): { tally: DesignTally; ss?: number } {
  const slot = slots.find((s) => s.designId === designId)
  if (!slot) return { tally: 'none' }
  if (isOnAir(state, slot.ss, me)) return { tally: 'pgm', ss: slot.ss }
  if (isOnPreview(state, slot.ss, me)) return { tally: 'pvw', ss: slot.ss }
  return { tally: 'loaded', ss: slot.ss }
}
