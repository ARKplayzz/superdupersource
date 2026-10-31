import { EASINGS, Rect, lerpBox, nearestEdge, offscreen, reverseEasing, shrunk, visibleRect } from './geometry'
import { Design, Direction, Motion, Placement, TransitionKey, transitionKey } from './model'
import { BoxState, FULLSCREEN, LIMITS } from './units'

export const DEFAULT_MATCHED_MOTION: Record<Direction, Motion> = {
  in: { delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
  out: { delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
}

// Other objects sit in place and are revealed (IN) or covered (OUT) by the matched object,
// which is always on top. Clean whatever the layout, so it's the safe default.
export const DEFAULT_OTHER_MOTION: Motion = { placement: 'in-place', delayMs: 0, durationMs: 0, easing: 'linear' }

// A pushed box keeps the same side and gap to the matched box as in the final layout.
export interface Follow {
  side: 'left' | 'right' | 'above' | 'below'
  gap: number
  final: BoxState
}

export interface Track {
  objectId: string
  from: BoxState
  to: BoxState
  motion: Motion
  // Where the motion came from, for the designer to show.
  origin: 'custom' | 'reversed' | 'default'
  // Set for 'pushed' boxes: positioned from the matched box every frame instead of from/to.
  follow?: Follow
}

// Which side of the leader the follower sits on in the final layout, and how far away.
// Null when the boxes overlap both ways, so there's no edge to push against.
export function followRelation(leader: BoxState, follower: BoxState): Omit<Follow, 'final'> | null {
  const l = visibleRect(leader)
  const f = visibleRect(follower)
  if (f.l >= l.r - 0.01) return { side: 'right', gap: f.l - l.r }
  if (f.r <= l.l + 0.01) return { side: 'left', gap: l.l - f.r }
  if (f.b >= l.t - 0.01) return { side: 'above', gap: f.b - l.t }
  if (f.t <= l.b + 0.01) return { side: 'below', gap: l.b - f.t }
  return null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// The follower's final box, moved so it sits against the leader's current edge.
export function pushedState(follow: Follow, leader: Rect): BoxState {
  const f = visibleRect(follow.final)
  let dx = 0
  let dy = 0
  if (follow.side === 'right') dx = leader.r + follow.gap - f.l
  else if (follow.side === 'left') dx = leader.l - follow.gap - f.r
  else if (follow.side === 'above') dy = leader.t + follow.gap - f.b
  else dy = leader.b - follow.gap - f.t
  return { ...follow.final, x: clamp(follow.final.x + dx, -LIMITS.x, LIMITS.x), y: clamp(follow.final.y + dy, -LIMITS.y, LIMITS.y) }
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
    case 'pushed': // positioned against the matched box each frame instead; see statesAt
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

  const matchedMotion = motionFor(design, dir, matchedId, matchedId).motion
  const tracks = boxOrder.map((id): Track => {
    const obj = design.objects.find((o) => o.id === id)!
    const { motion, origin } = motionFor(design, dir, matchedId, id)
    if (id !== matchedId && motion.placement === 'pushed') {
      const rel = followRelation(matched.final, obj.final)
      if (rel) {
        // Moves exactly when the matched box does, so it takes the matched box's timing.
        const pushed: Motion = { placement: 'pushed', delayMs: matchedMotion.delayMs, durationMs: matchedMotion.durationMs, easing: matchedMotion.easing }
        return { objectId: id, from: obj.final, to: obj.final, motion: pushed, origin, follow: { ...rel, final: obj.final } }
      }
    }
    const other = id === matchedId ? FULLSCREEN : placementState(obj.final, motion.placement === 'pushed' ? 'in-place' : motion.placement)
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

// Every box at `ms`, in boxOrder. The matched box (tracks[0]) is worked out first, because
// pushed boxes are positioned against it.
export function statesAt(rt: ResolvedTransition, ms: number): BoxState[] {
  const leader = stateAt(rt.tracks[0], ms)
  const leaderRect = visibleRect(leader)
  return rt.tracks.map((t, i) => (i === 0 ? leader : t.follow ? pushedState(t.follow, leaderRect) : stateAt(t, ms)))
}

// One entry per output frame, from frame 0 (start state) to the last frame (end state).
// Each entry holds one BoxState per box, in boxOrder.
export function buildFrames(rt: ResolvedTransition, fps: number): BoxState[][] {
  const lastFrame = Math.ceil((durationMs(rt) * fps) / 1000)
  const frames: BoxState[][] = []
  for (let f = 0; f <= lastFrame; f++) frames.push(statesAt(rt, (f * 1000) / fps))
  return frames
}
