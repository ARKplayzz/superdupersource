import { BoxRaw, BoxState, SwitcherState, fromRaw, visibleRect } from '@sds/core/browser'

// Draws switcher sources and SuperSource layouts onto a canvas. Cameras are stand-in pictures
// (a presenter silhouette, a slide, a stage) so crops and framing read the way they would live.

const W = 1920
const H = 1080

const images = new Map<string, HTMLImageElement>()
const listeners = new Set<() => void>()

export function onImagesLoaded(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function image(file: string): HTMLImageElement | null {
  let img = images.get(file)
  if (!img) {
    img = new Image()
    img.src = `./${file}`
    img.onload = () => listeners.forEach((l) => l())
    images.set(file, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

const placeholders = new Map<number, HTMLCanvasElement>()

// Stand-in pictures carry their input name ("CAM1 Presenter cam"). The download page turns it off.
let sourceLabels = true
export function setSourceLabels(on: boolean): void {
  if (on === sourceLabels) return
  sourceLabels = on
  placeholders.clear()
}

function person(g: CanvasRenderingContext2D, cx: number, base: number, scale: number, colour: string) {
  g.fillStyle = colour
  g.beginPath()
  g.arc(cx, base - 520 * scale, 120 * scale, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(cx - 300 * scale, base)
  g.quadraticCurveTo(cx - 290 * scale, base - 360 * scale, cx, base - 380 * scale)
  g.quadraticCurveTo(cx + 290 * scale, base - 360 * scale, cx + 300 * scale, base)
  g.fill()
}

function label(g: CanvasRenderingContext2D, short: string, name: string) {
  g.font = '600 64px "Segoe UI", system-ui, sans-serif'
  g.fillStyle = 'rgba(0,0,0,0.55)'
  const text = `${short}  ${name}`
  const w = g.measureText(text).width
  g.fillRect(40, 40, w + 48, 96)
  g.fillStyle = '#fff'
  g.fillText(text, 64, 110)
}

function drawPlaceholder(id: number, short: string, name: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const kind = id % 4
  if (id === 2 || kind === 2) {
    // Slides: a light slide with a title and bullet lines.
    g.fillStyle = '#f4f2ee'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#1f3a5f'
    g.fillRect(0, 0, W, 200)
    g.fillStyle = '#fff'
    g.font = '600 96px "Segoe UI", system-ui, sans-serif'
    g.fillText('Slide title', 120, 135)
    g.fillStyle = '#9aa3ad'
    for (let i = 0; i < 5; i++) {
      g.beginPath()
      g.arc(150, 330 + i * 140, 18, 0, Math.PI * 2)
      g.fill()
      g.fillRect(210, 312 + i * 140, 1100 - i * 120, 36)
    }
  } else if (id === 3 || kind === 3) {
    // Wide: stage with a small figure.
    const grad = g.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#15181f')
    grad.addColorStop(1, '#2b2f38')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#3d4350'
    g.fillRect(0, 760, W, 320)
    g.fillStyle = '#4a5262'
    g.fillRect(560, 200, 800, 450)
    person(g, 1500, 820, 0.45, '#0c0e12')
  } else {
    // Cameras: a person, centred, so crops show what they keep.
    const hue = id === 1 ? '#2a4a5c' : id === 4 ? '#4b3a5a' : `hsl(${(id * 47) % 360} 25% 30%)`
    const grad = g.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, hue)
    grad.addColorStop(1, '#101215')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    person(g, W / 2, H, 1, 'rgba(10,12,16,0.92)')
    if (sourceLabels) {
      // Centre line, to judge crops by.
      g.strokeStyle = 'rgba(255,255,255,0.12)'
      g.lineWidth = 3
      g.strokeRect(W / 2 - 1, 0, 2, H)
    }
  }
  if (sourceLabels) label(g, short, name)
  return c
}

function placeholder(state: SwitcherState, id: number): HTMLCanvasElement {
  let c = placeholders.get(id)
  if (!c) {
    const info = state.inputs[id]
    c = drawPlaceholder(id, info?.short ?? `IN${id}`, info?.name ?? `Input ${id}`)
    placeholders.set(id, c)
  }
  return c
}

export interface LayoutBox {
  source: number
  state: BoxState
}

// Draw a full 16:9 picture of an input into (0,0,w,h).
export function drawInput(g: CanvasRenderingContext2D, state: SwitcherState, id: number, w: number, h: number, background: string, depth = 0): void {
  const info = state.inputs[id]
  if (depth > 4) return
  if (info?.kind === 'me' && info.me !== undefined) {
    drawInput(g, state, state.mixEffects[info.me].program, w, h, background, depth + 1)
  } else if (info?.kind === 'supersource' && info.ss !== undefined) {
    const ss = state.superSources[info.ss]
    const boxes = ss.boxes
      .map((b: BoxRaw) => (b.enabled ? { source: b.source, state: fromRaw(b) } : null))
      .filter((b): b is LayoutBox => b !== null)
    drawLayout(g, state, boxes, w, h, background, depth + 1)
  } else if (info?.kind === 'mediaplayer') {
    const img = image(background)
    if (img) g.drawImage(img, 0, 0, w, h)
    else fill(g, w, h, '#3a2015')
  } else {
    g.drawImage(placeholder(state, id), 0, 0, w, h)
  }
}

// Boxes in box order: index 0 is box 1 and draws on top, so paint from the end.
export function drawLayout(g: CanvasRenderingContext2D, state: SwitcherState, boxes: LayoutBox[], w: number, h: number, background: string, depth = 0): void {
  const img = image(background)
  if (img) g.drawImage(img, 0, 0, w, h)
  else fill(g, w, h, '#3a2015')
  const k = w / 32
  for (let i = boxes.length - 1; i >= 0; i--) {
    const { source, state: s } = boxes[i]
    const r = visibleRect(s)
    const dw = (r.r - r.l) * k
    const dh = (r.t - r.b) * k
    if (dw <= 0.5 || dh <= 0.5) continue
    const src = sourceCanvas(state, source, background, depth)
    const u = src.width / 32
    const sx = s.cropL * u
    const sy = s.cropT * u
    const sw = src.width - (s.cropL + s.cropR) * u
    const sh = src.height - (s.cropT + s.cropB) * u
    if (sw <= 0 || sh <= 0) continue
    g.drawImage(src, sx, sy, sw, sh, (r.l + 16) * k, (9 - r.t) * k, dw, dh)
  }
}

// Full-resolution picture of a source, for cropping into a box.
const scratch = new Map<string, HTMLCanvasElement>()
function sourceCanvas(state: SwitcherState, id: number, background: string, depth: number): HTMLCanvasElement {
  const info = state.inputs[id]
  if (!info || info.kind === 'external' || info.kind === 'other') return placeholder(state, id)
  const key = `${id}:${depth}`
  let c = scratch.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = W / 2
    c.height = H / 2
    scratch.set(key, c)
  }
  const g = c.getContext('2d')!
  drawInput(g, state, id, c.width, c.height, background, depth)
  return c
}

function fill(g: CanvasRenderingContext2D, w: number, h: number, colour: string) {
  g.fillStyle = colour
  g.fillRect(0, 0, w, h)
}
