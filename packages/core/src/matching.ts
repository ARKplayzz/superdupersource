import { area } from './geometry'
import { Design, ShowSettings, SourceRef } from './model'
import { SwitcherState } from './switcher'

// Source matching rules (project.md §6): which object in a design shows the same picture as
// the source on air (IN) or on preview (OUT), so it can start or end full screen.

export function inputFor(ref: SourceRef, roles: Record<string, number>): number | undefined {
  return 'input' in ref ? ref.input : roles[ref.role]
}

export interface Resolved {
  input: number // the source at the end of any M/E chain
  viaMe: number[] // M/Es passed through, outermost first
  keysOnAir: boolean
  inTransition: boolean
}

// Follow M/E program outputs down to the source they show.
export function resolveSource(id: number, state: SwitcherState): Resolved {
  const viaMe: number[] = []
  let keysOnAir = false
  let inTransition = false
  let current = id
  for (;;) {
    const info = state.inputs[current]
    if (info?.kind !== 'me' || info.me === undefined) break
    const me = state.mixEffects[info.me]
    if (!me || viaMe.includes(info.me)) break
    viaMe.push(info.me)
    keysOnAir ||= me.keysOnAir
    inTransition ||= me.inTransition
    current = me.program
  }
  return { input: current, viaMe, keysOnAir, inTransition }
}

export type MatchResult =
  | { kind: 'match'; objectId: string; how: 'direct' | 'via-me'; detail: string }
  | { kind: 'none'; reason: string }

export function findMatch(design: Design, settings: ShowSettings, sourceOnBus: number, state: SwitcherState): MatchResult {
  const info = state.inputs[sourceOnBus]
  if (info?.kind === 'supersource') return { kind: 'none', reason: 'A SuperSource is on the bus. Morphing between layouts comes later.' }

  const bus = resolveSource(sourceOnBus, state)
  if (bus.inTransition) return { kind: 'none', reason: `M/E ${bus.viaMe.map((m) => m + 1).join(' > ')} is mid-transition` }

  const candidates: { objectId: string; how: 'direct' | 'via-me'; detail: string; priority: number; area: number }[] = []
  const blocked: string[] = []
  for (const obj of design.objects) {
    const input = inputFor(obj.source, settings.roles)
    if (input === undefined) continue
    const label = `${obj.name} (${name(state, input)})`

    // Exactly the same source id is always the same picture, keys and all.
    if (input === sourceOnBus) {
      candidates.push({ objectId: obj.id, how: 'direct', detail: `${label} is on the bus`, priority: obj.matchPriority, area: area(obj.final) })
      continue
    }

    const own = resolveSource(input, state)
    if (own.inTransition || own.input !== bus.input) continue
    if ((bus.keysOnAir || own.keysOnAir) && !settings.animateWithKeysOnAir) {
      blocked.push(`${label} matches through an M/E with keys on air`)
      continue
    }
    const path = [...bus.viaMe, ...own.viaMe].map((m) => `M/E ${m + 1}`).join(', ')
    candidates.push({ objectId: obj.id, how: 'via-me', detail: `${label} matches through ${path}`, priority: obj.matchPriority, area: area(obj.final) })
  }

  if (candidates.length === 0) {
    return { kind: 'none', reason: blocked[0] ?? `Nothing in "${design.name}" shows ${name(state, sourceOnBus)}` }
  }
  candidates.sort((a, b) => a.priority - b.priority || b.area - a.area)
  const best = candidates[0]
  return { kind: 'match', objectId: best.objectId, how: best.how, detail: best.detail }
}

function name(state: SwitcherState, id: number): string {
  return state.inputs[id]?.name ?? `input ${id}`
}
