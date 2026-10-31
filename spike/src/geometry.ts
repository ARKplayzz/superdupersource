import { BoxState } from './units'

// Visible rectangle of a box on screen, in ATEM units (y up).
// Assumes crop is measured in source-frame units and scales with size; test-ranges checks this.
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
    cropL: clamp((l - (x - 16 * size)) / size, 0, 32),
    cropR: clamp((x + 16 * size - r) / size, 0, 32),
    cropT: clamp((y + 9 * size - t) / size, 0, 18),
    cropB: clamp((bot - (y - 9 * size)) / size, 0, 18),
  }
}

export type EasingName = 'linear' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'

export const EASINGS: Record<EasingName, (k: number) => number> = {
  linear: (k) => k,
  easeInCubic: (k) => k * k * k,
  easeOutCubic: (k) => 1 - Math.pow(1 - k, 3),
  easeInOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
}
