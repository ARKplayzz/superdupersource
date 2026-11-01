import { BoxState, DesignObject, SLIDE_10, SimSwitcher, durationMs, inputFor, DEFAULT_SETTINGS, resolveTransition, statesAt, visibleRect, type Direction } from '@sds/core/browser'
import { tone } from '../../desktop/src/renderer/src/tones'
import { fileSize, initReleases } from './releases'
import './styles.css'

// ---------- hero: the real Slides + presenter transitions, drawn the way the app draws layouts ----------

const canvas = document.getElementById('hero') as HTMLCanvasElement | null
const stepLabel = document.getElementById('step')
const pauseBtn = document.getElementById('pause') as HTMLButtonElement | null
const inputs = new SimSwitcher().getState().inputs // only for the stand-in input names
const sub = (o: DesignObject) => {
  const id = inputFor(o.source, DEFAULT_SETTINGS.roles)
  return id === undefined ? '' : `${id} ${inputs[id]?.name ?? ''}`
}

const background = new Image()
background.src = '/Slide_01.PNG'

// Flat boxes on the background, each with its source name and input, as in the app. boxes[0] is on top.
function drawFlat(g: CanvasRenderingContext2D, boxes: { object: DesignObject; state: BoxState }[], w: number, h: number) {
  if (background.complete && background.naturalWidth) g.drawImage(background, 0, 0, w, h)
  else {
    g.fillStyle = '#000'
    g.fillRect(0, 0, w, h)
  }
  const k = w / 32
  for (let i = boxes.length - 1; i >= 0; i--) {
    const { object, state } = boxes[i]
    const r = visibleRect(state)
    const x = (r.l + 16) * k
    const y = (9 - r.t) * k
    const bw = (r.r - r.l) * k
    const bh = (r.t - r.b) * k
    if (bw < 1 || bh < 1) continue
    const [bg, fg] = tone(object)
    g.fillStyle = bg
    g.fillRect(x, y, bw, bh)
    const name = w * 0.024
    if (bw < name * 3 || bh < name * 2.6) continue
    g.save()
    g.beginPath()
    g.rect(x, y, bw, bh)
    g.clip()
    g.fillStyle = fg
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `600 ${name}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`
    g.fillText(object.name, x + bw / 2, y + bh / 2 - name * 0.55)
    g.font = `${name * 0.78}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`
    g.fillText(sub(object), x + bw / 2, y + bh / 2 + name * 0.65)
    g.restore()
  }
}

type Beat = { kind: 'hold'; ms: number; dir: Direction; matched: string; at: 'start' | 'end'; label: string } | { kind: 'move'; dir: Direction; matched: string; label: string }

// Camera full screen -> layout -> slides full screen -> layout -> camera full screen, looping.
const BEATS: Beat[] = [
  { kind: 'hold', ms: 1400, dir: 'in', matched: 'B', at: 'start', label: 'Program: Presenter cam' },
  { kind: 'move', dir: 'in', matched: 'B', label: 'SS CUT: in from Static' },
  { kind: 'hold', ms: 1800, dir: 'in', matched: 'B', at: 'end', label: 'Program: Slides + presenter' },
  { kind: 'move', dir: 'out', matched: 'A', label: 'SS CUT: out to Presentation' },
  { kind: 'hold', ms: 1400, dir: 'out', matched: 'A', at: 'end', label: 'Program: Slides PC' },
  { kind: 'move', dir: 'in', matched: 'A', label: 'SS CUT: in from Presentation' },
  { kind: 'hold', ms: 1800, dir: 'in', matched: 'A', at: 'end', label: 'Program: Slides + presenter' },
  { kind: 'move', dir: 'out', matched: 'B', label: 'SS CUT: out to Static' },
]

const beatLength = (b: Beat) => (b.kind === 'hold' ? b.ms : durationMs(resolveTransition(SLIDE_10, b.dir, b.matched)))
const loopMs = BEATS.reduce((s, b) => s + beatLength(b), 0)

function frameAt(t: number) {
  let ms = t % loopMs
  for (const b of BEATS) {
    const len = beatLength(b)
    if (ms <= len) {
      const rt = resolveTransition(SLIDE_10, b.dir, b.matched)
      const at = b.kind === 'move' ? ms : b.at === 'start' ? 0 : Infinity
      const states = statesAt(rt, at)
      const boxes = rt.tracks.map((tr, i) => ({ object: SLIDE_10.objects.find((o) => o.id === tr.objectId)!, state: states[i] }))
      return { boxes, label: b.label }
    }
    ms -= len
  }
  return null
}

let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
let elapsed = playing ? 0 : 1400 + 700 + 100 // reduced motion: show the finished layout
let last = performance.now()
let lastLabel = ''

function draw() {
  if (!canvas) return
  const g = canvas.getContext('2d')!
  const r = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(r.width * dpr)
  const h = Math.round(r.height * dpr)
  if (w === 0) return
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const f = frameAt(elapsed)
  if (!f) return
  drawFlat(g, f.boxes, w, h)
  if (stepLabel && f.label !== lastLabel) {
    stepLabel.textContent = f.label
    lastLabel = f.label
  }
}

function tick(now: number) {
  if (playing && !document.hidden) elapsed += now - last
  last = now
  draw()
  requestAnimationFrame(tick)
}
if (canvas && pauseBtn) {
  requestAnimationFrame(tick)
  background.onload = draw
  pauseBtn.textContent = playing ? 'Pause' : 'Play'
  pauseBtn.addEventListener('click', () => {
    playing = !playing
    pauseBtn.textContent = playing ? 'Pause' : 'Play'
  })
}

// ---------- downloads: latest GitHub release, if there is one ----------

const REPO = 'ARKplayzz/superdupersource'

interface Asset {
  name: string
  size: number
  browser_download_url: string
}
interface Release {
  tag_name: string
  published_at: string
  html_url: string
  assets: Asset[]
}

// A plain link to the file, then the version, date and size.
function render(el: HTMLElement, release: Release | null, match: RegExp) {
  const asset = release?.assets.find((a) => match.test(a.name))
  el.replaceChildren()
  if (!release || !asset) {
    el.textContent = 'Not released yet'
    return
  }
  el.classList.remove('muted')
  const a = document.createElement('a')
  a.href = asset.browser_download_url
  a.textContent = asset.name
  const meta = document.createElement('span')
  meta.className = 'muted num'
  const date = new Date(release.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  meta.textContent = `${release.tag_name.replace(/^v/, '')}, ${date}, ${fileSize(asset.size)}`
  el.append(a, meta)
}

async function loadReleases() {
  const app = document.getElementById('app-release')
  const mod = document.getElementById('module-release')
  if (!app || !mod) return
  let release: Release | null = null
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    if (res.ok) release = (await res.json()) as Release
    else if (res.status !== 404) throw new Error(String(res.status))
  } catch {
    for (const el of [app, mod]) {
      el.replaceChildren()
      const link = document.createElement('a')
      link.href = `https://github.com/${REPO}/releases`
      link.textContent = 'See GitHub'
      el.append("Couldn't check. ", link)
    }
    return
  }
  render(app, release, /\.exe$/i)
  render(mod, release, /\.tgz$/i)
}
void loadReleases()
initReleases()
