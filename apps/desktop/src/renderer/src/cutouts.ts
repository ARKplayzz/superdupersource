import { BoxState, LIMITS, Rect } from '@sds/core/browser'
import { image } from './render'

// Finds the transparent cutouts in a template PNG, in ATEM units, so boxes can be fitted to them.
// Works on a 480x270 downsample: 4 px per sample is plenty for a 2-3 px outline.

const cache = new Map<string, Rect[]>()
const SW = 480
const SH = 270

export function cutouts(file: string | undefined): Rect[] {
  if (!file) return []
  const hit = cache.get(file)
  if (hit) return hit
  const img = image(file)
  if (!img) return []

  const c = document.createElement('canvas')
  c.width = SW
  c.height = SH
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, SW, SH)
  const data = g.getImageData(0, 0, SW, SH).data
  const clear = (i: number) => data[i * 4 + 3] < 10
  const seen = new Uint8Array(SW * SH)
  const rects: Rect[] = []

  for (let start = 0; start < SW * SH; start++) {
    if (seen[start] || !clear(start)) continue
    let x0 = SW
    let x1 = 0
    let y0 = SH
    let y1 = 0
    let n = 0
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % SW
      const y = (p - x) / SW
      n++
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
      for (const q of [p - 1, p + 1, p - SW, p + SW]) {
        if (q < 0 || q >= SW * SH || seen[q]) continue
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === SW - 1)) continue
        if (!clear(q)) continue
        seen[q] = 1
        stack.push(q)
      }
    }
    if (n < 200) continue
    const u = SW / 32
    rects.push({ l: x0 / u - 16, r: (x1 + 1) / u - 16, t: 9 - y0 / u, b: 9 - (y1 + 1) / u })
  }
  rects.sort((a, b) => b.t - a.t || a.l - b.l)
  cache.set(file, rects)
  return rects
}

// A box that covers the cutout plus its outline (a 0.05 unit bleed, 3 px), cropping the source
// to the cutout's shape.
export function fitToCutout(r: Rect, bleed = 0.05): BoxState {
  const l = r.l - bleed
  const rr = r.r + bleed
  const t = r.t + bleed
  const b = r.b - bleed
  const w = rr - l
  const h = t - b
  let size: number
  let cropLR = 0
  let cropTB = 0
  if (w / h <= 16 / 9) {
    size = Math.min(LIMITS.maxSize, h / 18)
    cropLR = Math.max(0, (32 - w / size) / 2)
  } else {
    size = Math.min(LIMITS.maxSize, w / 32)
    cropTB = Math.max(0, (18 - h / size) / 2)
  }
  const round = (v: number, step: number) => Math.round(v / step) * step
  return {
    x: round((l + rr) / 2, 0.01),
    y: round((t + b) / 2, 0.01),
    size: round(size, 0.001),
    cropL: round(cropLR, 0.001),
    cropR: round(cropLR, 0.001),
    cropT: round(cropTB, 0.001),
    cropB: round(cropTB, 0.001),
  }
}
