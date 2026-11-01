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

// Interpolate between two box states by their visible edges, so every edge moves linearly in k and
// an edge that sits in the same place at both ends stays put the whole way. Size is interpolated
// too; crop and position are then solved from the edges. The crop needed on each axis is split
// between the two sides in proportion to how the ends crop them.
export function lerpBox(a: BoxState, b: BoxState, k: number): BoxState {
  const L = (p: number, q: number) => p + (q - p) * k
  const ra = visibleRect(a)
  const rb = visibleRect(b)
  const l = L(ra.l, rb.l)
  const r = L(ra.r, rb.r)
  const t = L(ra.t, rb.t)
  const bot = L(ra.b, rb.b)
  const size = Math.max(0.001, L(a.size, b.size))
  const split = (c1: number, c2: number, total: number): [number, number] => {
    const sum = c1 + c2
    return sum > 1e-6 ? [total * (c1 / sum), total * (c2 / sum)] : [total / 2, total / 2]
  }
  const [cropL, cropR] = split(L(a.cropL, b.cropL), L(a.cropR, b.cropR), Math.max(0, 32 - (r - l) / size))
  const [cropT, cropB] = split(L(a.cropT, b.cropT), L(a.cropB, b.cropB), Math.max(0, 18 - (t - bot) / size))
  return {
    x: (l + r) / 2 - (size * (cropL - cropR)) / 2,
    y: (t + bot) / 2 + (size * (cropT - cropB)) / 2,
    size,
    cropL: clamp(cropL, 0, LIMITS.cropLR),
    cropR: clamp(cropR, 0, LIMITS.cropLR),
    cropT: clamp(cropT, 0, LIMITS.cropTB),
    cropB: clamp(cropB, 0, LIMITS.cropTB),
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
