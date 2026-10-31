import { EASINGS, lerpBox, nearestEdge, offscreen, reverseEasing, shrunk } from './geometry'
import { Design, Direction, Motion, Placement, TransitionKey, transitionKey } from './model'
import { BoxState, FULLSCREEN } from './units'

export const DEFAULT_MATCHED_MOTION: Record<Direction, Motion> = {
  in: { delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
  out: { delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
}

// Other objects sit in place and are revealed (IN) or covered (OUT) by the matched object,
// which is always on top. Clean whatever the layout, so it's the safe default.
export const DEFAULT_OTHER_MOTION: Motion = { placement: 'in-place', delayMs: 0, durationMs: 0, easing: 'linear' }

export interface Track {
  objectId: string
  from: BoxState
  to: BoxState
  motion: Motion
  // Where the motion came from, for the designer to show.
  origin: 'custom' | 'reversed' | 'default'
}

export interface ResolvedTransition {
  key: TransitionKey
  direction: Direction
  matchedId: string
  // boxOrder[0] goes in SuperSource box 1, which draws on top.
  boxOrder: string[]
  tracks: Track[]
}

export function placementState(final: BoxState, placement: Placement = 'in-place'): BoxState {
  switch (placement) {
    case 'in-place':
      return final
    case 'offscreen-nearest':
      return offscreen(final, nearestEdge(final))
    case 'offscreen-left':
      return offscreen(final, 'left')
    case 'offscreen-right':
      return offscreen(final, 'right')
    case 'offscreen-top':
      return offscreen(final, 'top')
    case 'offscreen-bottom':
      return offscreen(final, 'bottom')
    case 'shrunk':
      return shrunk(final)
  }
}

function totalMs(motions: Motion[]): number {
  return Math.max(0, ...motions.map((m) => m.delayMs + m.durationMs))
}

// The motion for one object in one transition. An OUT with nothing custom plays the matching IN
// backwards if that IN was customised; otherwise defaults apply.
export function motionFor(design: Design, dir: Direction, matchedId: string, objectId: string): { motion: Motion; origin: Track['origin'] } {
  const own = design.transitions[transitionKey(dir, matchedId)]?.[objectId]
  if (own) return { motion: own, origin: 'custom' }

  if (dir === 'out') {
    const inMotions = design.transitions[transitionKey('in', matchedId)]
    const src = inMotions?.[objectId]
    if (inMotions && src) {
      const total = totalMs(Object.values(inMotions))
      return {
        motion: {
          placement: src.placement,
          durationMs: src.durationMs,
          delayMs: Math.max(0, total - src.delayMs - src.durationMs),
          easing: reverseEasing(src.easing),
        },
        origin: 'reversed',
      }
    }
  }

  return { motion: objectId === matchedId ? DEFAULT_MATCHED_MOTION[dir] : DEFAULT_OTHER_MOTION, origin: 'default' }
}

export function resolveTransition(design: Design, dir: Direction, matchedId: string): ResolvedTransition {
  const matched = design.objects.find((o) => o.id === matchedId)
  if (!matched) throw new Error(`Design "${design.name}" has no object "${matchedId}"`)
  const boxOrder = [matchedId, ...design.objects.filter((o) => o.id !== matchedId).map((o) => o.id)]

  const tracks = boxOrder.map((id): Track => {
    const obj = design.objects.find((o) => o.id === id)!
    const { motion, origin } = motionFor(design, dir, matchedId, id)
    const other = id === matchedId ? FULLSCREEN : placementState(obj.final, motion.placement)
    return dir === 'in'
      ? { objectId: id, from: other, to: obj.final, motion, origin }
      : { objectId: id, from: obj.final, to: other, motion, origin }
  })

  return { key: transitionKey(dir, matchedId), direction: dir, matchedId, boxOrder, tracks }
}

// Every transition a design can do: an IN and an OUT for each object.
export function transitionKeys(design: Design): TransitionKey[] {
  return design.objects.flatMap((o) => [transitionKey('in', o.id), transitionKey('out', o.id)])
}

export function durationMs(rt: ResolvedTransition): number {
  return totalMs(rt.tracks.map((t) => t.motion))
}

export function stateAt(track: Track, ms: number): BoxState {
  const { delayMs, durationMs, easing } = track.motion
  const raw = durationMs === 0 ? (ms >= delayMs ? 1 : 0) : (ms - delayMs) / durationMs
  return lerpBox(track.from, track.to, EASINGS[easing](Math.min(1, Math.max(0, raw))))
}

// One entry per output frame, from frame 0 (start state) to the last frame (end state).
// Each entry holds one BoxState per box, in boxOrder.
export function buildFrames(rt: ResolvedTransition, fps: number): BoxState[][] {
  const lastFrame = Math.ceil((durationMs(rt) * fps) / 1000)
  const frames: BoxState[][] = []
  for (let f = 0; f <= lastFrame; f++) {
    const ms = (f * 1000) / fps
    frames.push(rt.tracks.map((t) => stateAt(t, ms)))
  }
  return frames
}
