import { BoxState, LIMITS } from './units'

// Visible rectangle of a box on screen, in ATEM units (y up).
// Assumes crop is measured in source-frame units and scales with size; spike/test-ranges checks this.
export interface Rect {
  l: number
  r: number
  t: number
  b: number
}

export function visibleRect(s: BoxState): Rect {
  return {
    l: s.x - 16 * s.size + s.cropL * s.size,
    r: s.x + 16 * s.size - s.cropR * s.size,
    t: s.y + 9 * s.size - s.cropT * s.size,
    b: s.y - 9 * s.size + s.cropB * s.size,
  }
}

export function area(s: BoxState): number {
  const r = visibleRect(s)
  return Math.max(0, r.r - r.l) * Math.max(0, r.t - r.b)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Interpolate between two box states so the visible edges move linearly in k.
// Interpolating crop values directly makes edges drift backwards when size changes too,
// so we interpolate position, size and the visible rectangle, then solve for crop.
export function lerpBox(a: BoxState, b: BoxState, k: number): BoxState {
  const L = (p: number, q: number) => p + (q - p) * k
  const size = L(a.size, b.size)
  const x = L(a.x, b.x)
  const y = L(a.y, b.y)
  const ra = visibleRect(a)
  const rb = visibleRect(b)
  const l = L(ra.l, rb.l)
  const r = L(ra.r, rb.r)
  const t = L(ra.t, rb.t)
  const bot = L(ra.b, rb.b)
  return {
    x,
    y,
    size,
    cropL: clamp((l - (x - 16 * size)) / size, 0, LIMITS.cropLR),
    cropR: clamp((x + 16 * size - r) / size, 0, LIMITS.cropLR),
    cropT: clamp((y + 9 * size - t) / size, 0, LIMITS.cropTB),
    cropB: clamp((bot - (y - 9 * size)) / size, 0, LIMITS.cropTB),
  }
}

export type Edge = 'left' | 'right' | 'top' | 'bottom'

// The same box moved so its visible edge sits just outside the frame.
export function offscreen(s: BoxState, edge: Edge, margin = 0.5): BoxState {
  const r = visibleRect(s)
  switch (edge) {
    case 'left':
      return { ...s, x: s.x - (r.r + 16 + margin) }
    case 'right':
      return { ...s, x: s.x + (16 + margin - r.l) }
    case 'top':
      return { ...s, y: s.y + (9 + margin - r.b) }
    case 'bottom':
      return { ...s, y: s.y - (r.t + 9 + margin) }
  }
}

// The frame edge closest to the box's visible centre.
export function nearestEdge(s: BoxState): Edge {
  const r = visibleRect(s)
  const cx = (r.l + r.r) / 2
  const cy = (r.t + r.b) / 2
  const d: [Edge, number][] = [
    ['left', cx + 16],
    ['right', 16 - cx],
    ['top', 9 - cy],
    ['bottom', cy + 9],
  ]
  return d.sort((a, b) => a[1] - b[1])[0][0]
}

// The box shrunk to the switcher's minimum size about its own centre.
// Crop is in source units, so it shrinks with the box and the shape is kept.
export function shrunk(s: BoxState): BoxState {
  return { ...s, size: Math.min(s.size, LIMITS.minSize) }
}

export type EasingName = 'linear' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'

export const EASINGS: Record<EasingName, (k: number) => number> = {
  linear: (k) => k,
  easeInCubic: (k) => k * k * k,
  easeOutCubic: (k) => 1 - Math.pow(1 - k, 3),
  easeInOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  easeInQuart: (k) => k * k * k * k,
  easeOutQuart: (k) => 1 - Math.pow(1 - k, 4),
  easeInOutQuart: (k) => (k < 0.5 ? 8 * k * k * k * k : 1 - Math.pow(-2 * k + 2, 4) / 2),
}

// The easing that plays the same curve backwards in time.
export function reverseEasing(e: EasingName): EasingName {
  if (e.startsWith('easeIn') && !e.startsWith('easeInOut')) return e.replace('easeIn', 'easeOut') as EasingName
  if (e.startsWith('easeOut')) return e.replace('easeOut', 'easeIn') as EasingName
  return e
}
