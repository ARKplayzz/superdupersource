import { EASINGS, EasingName, lerpBox } from './geometry'
import { BoxState, FULLSCREEN, box } from './units'

// Slide 10: slides at 75% on the left (A), presenter cropped to a portrait strip on the right (B).
// Values measured from Supersources-templates/Slide_10.PNG (project.md §3).
export const FINAL = {
  A: box({ x: -4, y: 0, size: 0.75 }),
  B: box({ x: 12, y: 0, size: 0.5, cropL: 8, cropR: 8 }),
}

// Just past the frame edge (visible edge at ±16.5).
const OFFSCREEN_LEFT_A = box({ ...FINAL.A, x: -28.5 })
const OFFSCREEN_RIGHT_B = box({ ...FINAL.B, x: 20.5 })

export type ObjectId = 'A' | 'B'

export interface Track {
  object: ObjectId
  from: BoxState
  to: BoxState
  delayMs: number
  durationMs: number
  easing: EasingName
}

export interface Transition {
  name: string
  // boxOrder[0] goes in SuperSource box 1, which draws on top.
  boxOrder: ObjectId[]
  tracks: Track[]
}

export const TRANSITIONS: Record<string, Transition> = {
  'in-from-cam': {
    name: 'IN from Presenter',
    boxOrder: ['B', 'A'],
    tracks: [
      { object: 'B', from: FULLSCREEN, to: FINAL.B, delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
      { object: 'A', from: FINAL.A, to: FINAL.A, delayMs: 0, durationMs: 0, easing: 'linear' },
    ],
  },
  'in-from-slides': {
    name: 'IN from Slides',
    boxOrder: ['A', 'B'],
    tracks: [
      { object: 'A', from: FULLSCREEN, to: FINAL.A, delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
      { object: 'B', from: OFFSCREEN_RIGHT_B, to: FINAL.B, delayMs: 120, durationMs: 600, easing: 'easeOutCubic' },
    ],
  },
  'out-to-cam': {
    name: 'OUT to Presenter',
    boxOrder: ['B', 'A'],
    tracks: [
      { object: 'B', from: FINAL.B, to: FULLSCREEN, delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
      { object: 'A', from: FINAL.A, to: OFFSCREEN_LEFT_A, delayMs: 0, durationMs: 500, easing: 'easeInCubic' },
    ],
  },
  'out-to-slides': {
    name: 'OUT to Slides',
    boxOrder: ['A', 'B'],
    tracks: [
      { object: 'A', from: FINAL.A, to: FULLSCREEN, delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
      { object: 'B', from: FINAL.B, to: OFFSCREEN_RIGHT_B, delayMs: 0, durationMs: 400, easing: 'easeInCubic' },
    ],
  },
}

export function pickTransitions(name: string): Transition[] {
  if (name === 'all') return Object.values(TRANSITIONS)
  const t = TRANSITIONS[name]
  if (!t) throw new Error(`Unknown transition "${name}". Use one of: all, ${Object.keys(TRANSITIONS).join(', ')}`)
  return [t]
}

// One entry per output frame, including frame 0 (start state) and the last frame (end state).
// Each entry holds one BoxState per box, in boxOrder.
export function buildFrames(tr: Transition, fps: number): BoxState[][] {
  const endMs = Math.max(...tr.tracks.map((t) => t.delayMs + t.durationMs))
  const lastFrame = Math.ceil((endMs * fps) / 1000)
  const frames: BoxState[][] = []
  for (let f = 0; f <= lastFrame; f++) {
    const ms = (f * 1000) / fps
    frames.push(
      tr.boxOrder.map((id) => {
        const track = tr.tracks.find((t) => t.object === id)!
        const raw = track.durationMs === 0 ? 1 : (ms - track.delayMs) / track.durationMs
        const k = EASINGS[track.easing](Math.min(1, Math.max(0, raw)))
        return lerpBox(track.from, track.to, k)
      }),
    )
  }
  return frames
}
