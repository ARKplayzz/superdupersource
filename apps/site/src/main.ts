import { SLIDE_10, SimSwitcher, durationMs, inputFor, DEFAULT_SETTINGS, resolveTransition, statesAt, type Direction } from '@sds/core/browser'
import { drawLayout, onImagesLoaded, setSourceLabels } from '../../desktop/src/renderer/src/render'
import './styles.css'

// ---------- hero: the real Slide 10 transitions, drawn with the app's own renderer ----------

const canvas = document.getElementById('hero') as HTMLCanvasElement
const stepLabel = document.getElementById('step')!
const pauseBtn = document.getElementById('pause') as HTMLButtonElement
const g = canvas.getContext('2d')!
setSourceLabels(false)
const switcher = new SimSwitcher() // only for its input names and stand-in pictures
const state = switcher.getState()
const sources = Object.fromEntries(SLIDE_10.objects.map((o) => [o.id, inputFor(o.source, DEFAULT_SETTINGS.roles) ?? 1]))

type Beat = { kind: 'hold'; ms: number; dir: Direction; matched: string; at: 'start' | 'end'; label: string } | { kind: 'move'; dir: Direction; matched: string; label: string }

// Presenter full screen -> layout -> slides full screen -> layout -> presenter full screen, looping.
const BEATS: Beat[] = [
  { kind: 'hold', ms: 1400, dir: 'in', matched: 'B', at: 'start', label: 'Program: Presenter cam' },
  { kind: 'move', dir: 'in', matched: 'B', label: 'SS CUT: in from Presenter' },
  { kind: 'hold', ms: 1800, dir: 'in', matched: 'B', at: 'end', label: 'Program: Slides + presenter' },
  { kind: 'move', dir: 'out', matched: 'A', label: 'SS CUT: out to Slides' },
  { kind: 'hold', ms: 1400, dir: 'out', matched: 'A', at: 'end', label: 'Program: Slides PC' },
  { kind: 'move', dir: 'in', matched: 'A', label: 'SS CUT: in from Slides' },
  { kind: 'hold', ms: 1800, dir: 'in', matched: 'A', at: 'end', label: 'Program: Slides + presenter' },
  { kind: 'move', dir: 'out', matched: 'B', label: 'SS CUT: out to Presenter' },
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
      const boxes = rt.tracks.map((tr, i) => ({ source: sources[tr.objectId], state: states[i] }))
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
  const r = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(r.width * dpr)
  const h = Math.round(r.height * dpr)
  if (w === 0) return
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const f = frameAt(elapsed)
  if (!f) return
  drawLayout(g, state, f.boxes, w, h, 'Slide_01.PNG')
  if (f.label !== lastLabel) {
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
requestAnimationFrame(tick)
onImagesLoaded(draw)

pauseBtn.textContent = playing ? 'Pause' : 'Play'
pauseBtn.addEventListener('click', () => {
  playing = !playing
  pauseBtn.textContent = playing ? 'Pause' : 'Play'
})

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

function render(el: HTMLElement, release: Release | null, match: RegExp, what: string) {
  const asset = release?.assets.find((a) => match.test(a.name))
  el.replaceChildren()
  if (!release || !asset) {
    el.textContent = release ? `The latest release (${release.tag_name}) doesn't include the ${what} yet.` : `No release yet. The first one comes after hardware testing.`
    el.classList.add('muted')
    return
  }
  const a = document.createElement('a')
  a.className = 'btn primary'
  a.href = asset.browser_download_url
  a.textContent = `Download ${asset.name}`
  const meta = document.createElement('div')
  meta.className = 'muted num'
  const date = new Date(release.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  meta.textContent = `${release.tag_name} · ${date} · ${(asset.size / 1e6).toFixed(1)} MB · `
  const notes = document.createElement('a')
  notes.href = release.html_url
  notes.textContent = 'release notes'
  meta.append(notes)
  el.append(a, meta)
}

async function loadReleases() {
  const app = document.getElementById('app-release')!
  const mod = document.getElementById('module-release')!
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
      link.textContent = 'See releases on GitHub'
      el.append("Couldn't check for releases. ", link)
    }
    return
  }
  render(app, release, /\.exe$/i, 'Windows installer')
  // Once there's an installer, the hero's second button can say so.
  if (release?.assets.some((a) => /\.exe$/i.test(a.name))) document.getElementById('hero-download')!.textContent = 'Download for Windows'
  render(mod, release, /\.tgz$/i, 'Companion module')
}
void loadReleases()
