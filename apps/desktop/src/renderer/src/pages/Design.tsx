import { CSSProperties, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BoxState,
  Design as DesignT,
  DesignObject,
  EasingName,
  LIMITS,
  Motion,
  Placement,
  TransitionKey,
  box,
  durationMs,
  motionFor,
  parseTransitionKey,
  resolveTransition,
  statesAt,
} from '@sds/core/browser'
import type { AppSnapshot } from '../../../shared/api'
import { cutouts, fitToCutout } from '../cutouts'
import { canUndo, draftOf, edit, forget, isDirty, save, undo, useDrafts } from '../drafts'
import { onImagesLoaded } from '../render'
import { backgroundFile, finalBoxes, groupNames, mediaPlayers, mpShort, objectName, roleOf, sourceText } from '../shared'
import { LayoutView, ViewBox, boxRect, useOutside } from '../ui'

const PLACEMENTS: { value: Placement; label: string }[] = [
  { value: 'in-place', label: 'In place' },
  { value: 'pushed', label: 'Pushed by full-screen box' },
  { value: 'offscreen-nearest', label: 'Off nearest edge' },
  { value: 'offscreen-left', label: 'Off left' },
  { value: 'offscreen-right', label: 'Off right' },
  { value: 'offscreen-top', label: 'Off top' },
  { value: 'offscreen-bottom', label: 'Off bottom' },
  { value: 'shrunk', label: 'Shrink to centre' },
]

const EASINGS: { value: EasingName; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeInCubic', label: 'Ease in' },
  { value: 'easeOutCubic', label: 'Ease out' },
  { value: 'easeInOutCubic', label: 'Ease in-out' },
]
// Older layouts can use the stronger curves. They're listed only when a box already uses one.
const STRONG: Partial<Record<EasingName, string>> = { easeInQuart: 'Strong ease in', easeOutQuart: 'Strong ease out', easeInOutQuart: 'Strong ease in-out' }

const GRIDS = [
  { value: 'thirds', label: 'Thirds' },
  { value: 'quarters', label: '4 × 4' },
  { value: 'units', label: 'Units (2 × 2)' },
  { value: 'safe', label: 'Safe area 90/80%' },
  { value: 'cross', label: 'Crosshair' },
]
const TEMPLATES = ['02', '03', '04', '05', '06', '10', '11', '12'].map((n) => ({ value: `Slide_${n}.PNG`, label: `Slide ${n}` }))

function gridLines(grid: string): CSSProperties[] {
  const at = (n: number) => Array.from({ length: n - 1 }, (_, i) => ((i + 1) / n) * 100)
  const v = (p: number): CSSProperties => ({ left: `${p}%`, top: 0, width: 1, height: '100%' })
  const h = (p: number): CSSProperties => ({ left: 0, top: `${p}%`, width: '100%', height: 1 })
  if (grid === 'thirds') return [...at(3).map(v), ...at(3).map(h)]
  if (grid === 'quarters') return [...at(4).map(v), ...at(4).map(h)]
  if (grid === 'units') return [...at(16).map(v), ...at(9).map(h)]
  if (grid === 'safe') return [90, 80].map((p) => ({ left: `${(100 - p) / 2}%`, top: `${(100 - p) / 2}%`, width: `${p}%`, height: `${p}%`, border: '1px solid var(--grid)', background: 'none' }))
  if (grid === 'cross') return [{ left: '50%', top: '44%', width: 1, height: '12%' }, { left: '46.6%', top: '50%', width: '6.8%', height: 1 }]
  return []
}

type Drag =
  | { kind: 'move'; id: string; start: BoxState; ux: number; uy: number }
  | { kind: 'resize'; id: string; start: BoxState; d0: number }
  | { kind: 'crop'; id: string; start: BoxState; edge: 'l' | 'r' | 't' | 'b'; ux: number; uy: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r1 = (v: number) => Math.round(v * 10) / 10

function transitionKeys(d: DesignT): TransitionKey[] {
  return [...d.objects.map((o) => `in:${o.id}` as const), ...d.objects.map((o) => `out:${o.id}` as const)]
}

function transitionLabel(d: DesignT, key: TransitionKey): string {
  const { direction, objectId } = parseTransitionKey(key)
  return direction === 'in' ? `IN from ${objectName(d, objectId)}` : `OUT to ${objectName(d, objectId)}`
}

const firstKey = (d: DesignT): TransitionKey | null => (d.objects.length ? `in:${d.objects[d.objects.length - 1].id}` : null)

export function Design({
  snap,
  designId,
  library,
  onShowLibrary,
  onSelect,
  onMessage,
}: {
  snap: AppSnapshot
  designId: string
  library: ReactNode | null
  onShowLibrary: () => void
  onSelect: (id: string) => void
  onMessage: (m: string) => void
}) {
  useDrafts()
  const saved = snap.designs.find((d) => d.id === designId) ?? snap.designs[0]
  const design = saved ? draftOf(saved) : undefined

  const [selected, setSelected] = useState<string | null>(saved?.objects[0]?.id ?? null)
  const [tKey, setTKey] = useState<TransitionKey | null>(saved ? firstKey(saved) : null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [grid, setGrid] = useState('')
  const [hoverBox, setHoverBox] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [boxDrag, setBoxDrag] = useState<number | null>(null)
  const [boxOver, setBoxOver] = useState<number | null>(null)
  const [canvasW, setCanvasW] = useState(0)
  const [testing, setTesting] = useState(false)
  const [, setImgTick] = useState(0)
  const drag = useRef<Drag | null>(null)
  const canvas = useRef<HTMLDivElement | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)

  useOutside('settings', settingsOpen, useCallback(() => setSettingsOpen(false), []))
  useOutside('more', moreOpen, useCallback(() => setMoreOpen(false), []))
  useEffect(() => onImagesLoaded(() => setImgTick((t) => t + 1)), [])

  // A different layout starts fresh: first box selected, the last box's IN shown, nothing playing.
  useEffect(() => {
    setSelected(saved?.objects[0]?.id ?? null)
    setTKey(saved ? firstKey(saved) : null)
    setTime(0)
    setPlaying(false)
    setPreviewing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id])

  // The canvas is as big as fits the stage at 16:9.
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect
      setCanvasW(Math.floor(Math.max(120, Math.min(r.width, (r.height * 16) / 9))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const keys = design ? transitionKeys(design) : []
  const key = tKey && keys.includes(tKey) ? tKey : design ? firstKey(design) : null
  const resolved = useMemo(() => {
    if (!design || !key) return null
    const { direction, objectId } = parseTransitionKey(key)
    return resolveTransition(design, direction, objectId)
  }, [design, key])
  const total = Math.max(1, resolved ? durationMs(resolved) : 0)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const t0 = performance.now() - (time >= total ? 0 : time)
    const step = () => {
      const t = performance.now() - t0
      if (t >= total) {
        setTime(total)
        setPlaying(false)
        return
      }
      setTime(t)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  // Ctrl+Z undoes layout edits, except while typing in a text field.
  useEffect(() => {
    if (!design) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLInputElement
      if (t.tagName === 'INPUT' && t.type === 'text') return
      e.preventDefault()
      undo(design.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [design])

  const update = (next: DesignT) => design && edit(design, next)
  const setObject = (id: string, patch: Partial<DesignObject>) => design && update({ ...design, objects: design.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) })
  const setFinal = (id: string, patch: Partial<BoxState>) => {
    const o = design?.objects.find((x) => x.id === id)
    if (!o) return
    const f = { ...o.final, ...patch }
    setObject(id, {
      final: {
        x: clamp(f.x, -LIMITS.x, LIMITS.x),
        y: clamp(f.y, -LIMITS.y, LIMITS.y),
        size: clamp(f.size, LIMITS.minSize, LIMITS.maxSize),
        cropL: clamp(f.cropL, 0, LIMITS.cropLR),
        cropR: clamp(f.cropR, 0, LIMITS.cropLR),
        cropT: clamp(f.cropT, 0, LIMITS.cropTB),
        cropB: clamp(f.cropB, 0, LIMITS.cropTB),
      },
    })
  }

  // ----- canvas dragging -----
  const toUnits = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    return { ux: ((e.clientX - r.left) / r.width) * 32 - 16, uy: 9 - ((e.clientY - r.top) / r.height) * 18 }
  }

  // Latest setFinal for the window listeners below.
  const setFinalRef = useRef(setFinal)
  setFinalRef.current = setFinal
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d || !canvas.current) return
      const { ux, uy } = toUnits(e)
      const sn = (v: number) => (e.altKey ? v : Math.round(v * 10) / 10)
      const st = d.start
      if (d.kind === 'move') return setFinalRef.current(d.id, { x: sn(st.x + ux - d.ux), y: sn(st.y + uy - d.uy) })
      if (d.kind === 'resize') return setFinalRef.current(d.id, { size: Math.round(st.size * (Math.hypot(ux - st.x, uy - st.y) / Math.max(0.01, d.d0)) * 100) / 100 })
      const dx = (ux - d.ux) / st.size
      const dy = (uy - d.uy) / st.size
      const p: Partial<BoxState> =
        d.edge === 'l' ? { cropL: sn(st.cropL + dx) } : d.edge === 'r' ? { cropR: sn(st.cropR - dx) } : d.edge === 't' ? { cropT: sn(st.cropT - dy) } : { cropB: sn(st.cropB + dy) }
      setFinalRef.current(d.id, p)
    }
    const onUp = () => (drag.current = null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  if (!design || !saved) return <div className="empty">No layouts yet.</div>

  const sel = design.objects.find((o) => o.id === selected)
  const holes = cutouts(design.guide)
  const dirty = isDirty(design.id)
  const showPreview = previewing && !!resolved

  const viewBoxes: ViewBox[] =
    showPreview && resolved
      ? (() => {
          const states = statesAt(resolved, time)
          return resolved.tracks.map((t, i) => {
            const o = design.objects.find((x) => x.id === t.objectId)!
            return { object: o, state: states[i], sub: sourceText(snap, o) }
          })
        })()
      : finalBoxes(snap, design)

  const closePops = () => {
    setSettingsOpen(false)
    setMoreOpen(false)
  }

  const startHandle = (kind: 'resize' | 'crop', edge?: 'l' | 'r' | 't' | 'b') => (e: React.PointerEvent) => {
    if (!sel) return
    e.stopPropagation()
    const u = toUnits(e)
    drag.current =
      kind === 'resize' ? { kind, id: sel.id, start: sel.final, d0: Math.hypot(u.ux - sel.final.x, u.uy - sel.final.y) } : { kind, id: sel.id, start: sel.final, edge: edge!, ...u }
  }

  // ----- boxes -----
  const roles = Object.keys(snap.settings.roles)
  const addBox = () => {
    const used = new Set(design.objects.map((o) => o.id))
    const id = 'ABCDEFGH'.split('').find((c) => !used.has(c))
    if (!id) return
    const role = roles.find((r) => !design.objects.some((o) => roleOf(o) === r)) ?? roles[0]
    update({ ...design, objects: [...design.objects, { id, name: role, source: { role }, final: box({ size: 0.4 }), matchPriority: design.objects.length + 1 }] })
    setSelected(id)
    setPreviewing(false)
  }
  const removeBox = (id: string) => {
    const transitions = Object.fromEntries(
      Object.entries(design.transitions)
        .filter(([k]) => parseTransitionKey(k as TransitionKey).objectId !== id)
        .map(([k, v]) => [k, Object.fromEntries(Object.entries(v ?? {}).filter(([oid]) => oid !== id))]),
    )
    update({ ...design, objects: design.objects.filter((o) => o.id !== id), transitions })
    setSelected(null)
  }
  // Row order is layer order: the first row draws on top.
  const moveBox = (from: number, to: number) => {
    if (from === to) return
    const objects = [...design.objects]
    const [o] = objects.splice(from, 1)
    objects.splice(to > from ? to - 1 : to, 0, o)
    update({ ...design, objects })
  }

  // ----- motion -----
  const setMotion = (objectId: string, patch: Partial<Motion>) => {
    if (!key) return
    const { direction, objectId: matched } = parseTransitionKey(key)
    // The first edit to a transition copies every box's current motion, so the others look the same.
    const current = design.transitions[key] ?? Object.fromEntries(design.objects.map((o) => [o.id, motionFor(design, direction, matched, o.id).motion]))
    update({ ...design, transitions: { ...design.transitions, [key]: { ...current, [objectId]: { ...current[objectId], ...patch } } } })
  }

  // ----- layout -----
  const duplicate = () => {
    const id = `${design.id}-copy-${Date.now().toString(36)}`
    void window.sds.saveDesign({ ...structuredClone(design), id, name: `${design.name} copy` }).then(() => onSelect(id))
  }
  const remove = () => {
    if (snap.slots.some((s) => s.designId === design.id)) return onMessage('This layout is loaded in a SuperSource. Load a different one first.')
    if (!confirm(`Delete "${design.name}"? This can't be undone.`)) return
    const next = snap.designs.find((d) => d.id !== design.id)
    forget(design.id)
    void window.sds.deleteDesign(design.id).then(() => next && onSelect(next.id))
  }

  const overlay = grid ? `grid:${grid}` : design.guide ? `tpl:${design.guide}` : ''
  const setOverlay = (v: string) => {
    const [kind, value] = v.split(':')
    if (kind === 'grid') return setGrid(value)
    setGrid('')
    const guide = kind === 'tpl' ? value : undefined
    if (guide !== design.guide) update({ ...design, guide })
  }

  const playhead = `${(Math.min(time, total) / total) * 100}%`
  const dir = key ? parseTransitionKey(key).direction : 'in'
  const players = mediaPlayers(snap)
  const mp = design.mp ?? snap.settings.backgroundInput

  const fields = (list: [keyof BoxState, string][]) =>
    sel &&
    list.map(([k, label]) => (
      <label key={k} className="field">
        <span>{label}</span>
        <input
          type="number"
          step={k === 'size' ? 1 : 0.1}
          value={k === 'size' ? r1(sel.final.size * 100) : r1(sel.final[k])}
          onChange={(e) => {
            const v = Number(e.target.value)
            setFinal(sel.id, { [k]: k === 'size' ? v / 100 : v })
            setPreviewing(false)
          }}
        />
      </label>
    ))

  return (
    <main className="design">
      <div className="design-left">
        <div className="design-top">
          {library}
          <div className="design-main">
            <div className="toolbar">
              {!library && (
                <button className="btn" onClick={onShowLibrary} style={{ marginRight: 4 }}>
                  Library
                </button>
              )}
              <button data-pop="settings" className={`title-btn ${settingsOpen ? 'on' : ''}`} onClick={() => (setSettingsOpen(!settingsOpen), setMoreOpen(false))} title="Layout settings">
                <span className="title-name ellipsis">{design.name}</span>
                <span className="muted title-meta">{[design.group, mpShort(snap, design)].filter((x) => x).join(', ')}</span>
              </button>
              <div className="grow" />
              <select value={overlay} onChange={(e) => setOverlay(e.target.value)} title="Overlay">
                <option value="">No overlay</option>
                <optgroup label="Grids">
                  {GRIDS.map((g) => (
                    <option key={g.value} value={`grid:${g.value}`}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Templates">
                  {TEMPLATES.map((t) => (
                    <option key={t.value} value={`tpl:${t.value}`}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button data-pop="more" className={`more-btn ${moreOpen ? 'on' : ''}`} onClick={() => (setMoreOpen(!moreOpen), setSettingsOpen(false))}>
                More
              </button>
            </div>

            {settingsOpen && (
              <div data-pop="settings" className="popover settings-pop">
                <label className="field">
                  <span>Name</span>
                  <input type="text" value={design.name} onChange={(e) => update({ ...design, name: e.target.value })} />
                </label>
                <label className="field">
                  <span>Group</span>
                  <input type="text" list="design-groups" value={design.group} onChange={(e) => update({ ...design, group: e.target.value })} />
                  <datalist id="design-groups">
                    {groupNames(snap).map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  <span>Background media player</span>
                  <select value={mp} onChange={(e) => update({ ...design, mp: Number(e.target.value) })}>
                    {players.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                    {!players.some((p) => p.value === mp) && <option value={mp}>Input {mp}</option>}
                  </select>
                </label>
                <button className="btn main done" onClick={() => setSettingsOpen(false)}>
                  Done
                </button>
              </div>
            )}
            {moreOpen && (
              <div data-pop="more" className="popover more-pop" onMouseLeave={() => setMoreOpen(false)}>
                <button onClick={() => (setMoreOpen(false), duplicate())}>Duplicate</button>
                <button className="danger" onClick={() => (setMoreOpen(false), remove())}>
                  Delete layout
                </button>
              </div>
            )}

            <div ref={stage} className="stage">
              <div
                ref={canvas}
                className="canvas"
                style={{ width: canvasW || '100%' }}
                onPointerDown={() => {
                  setSelected(null)
                  setPreviewing(false)
                  closePops()
                }}
              >
                <LayoutView
                  boxes={viewBoxes}
                  background={backgroundFile(design)}
                  labels
                  subSize="10px"
                  fontSize="13px"
                  boxProps={(b) => ({
                    style: {
                      cursor: showPreview || b.object.locked ? 'default' : 'move',
                      boxShadow: !showPreview && hoverBox === b.object.id ? 'inset 0 0 0 2px rgba(255,255,255,.75)' : undefined,
                    },
                    onPointerDown: (e) => {
                      e.stopPropagation()
                      if (playing) return
                      setSelected(b.object.id)
                      setPreviewing(false)
                      closePops()
                      if (!b.object.locked) drag.current = { kind: 'move', id: b.object.id, start: b.object.final, ...toUnits(e) }
                    },
                  })}
                >
                  {!showPreview && design.guide && !grid && <div className="guide" style={{ backgroundImage: `url(./${design.guide})` }} />}
                  {!showPreview && gridLines(grid).map((s, i) => <div key={i} className="grid-line" style={s} />)}
                </LayoutView>
                {sel && !showPreview && !sel.locked && (
                  <div className="sel-frame" style={boxRect(sel.final)}>
                    {(
                      [
                        ['0%', '0%', 'nwse-resize'],
                        ['100%', '0%', 'nesw-resize'],
                        ['0%', '100%', 'nesw-resize'],
                        ['100%', '100%', 'nwse-resize'],
                      ] as const
                    ).map(([left, top, cursor]) => (
                      <div key={left + top} className="handle corner" style={{ left, top, cursor }} onPointerDown={startHandle('resize')} />
                    ))}
                    {(
                      [
                        ['0%', '50%', 'l', 'ew-resize'],
                        ['100%', '50%', 'r', 'ew-resize'],
                        ['50%', '0%', 't', 'ns-resize'],
                        ['50%', '100%', 'b', 'ns-resize'],
                      ] as const
                    ).map(([left, top, edge, cursor]) => (
                      <div key={edge} className="handle edge" style={{ left, top, cursor }} onPointerDown={startHandle('crop', edge)} />
                    ))}
                  </div>
                )}
                {showPreview && key && <div className="preview-label">{transitionLabel(design, key)}</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="anim">
          <div className="anim-tabs">
            {keys.map((k) => (
              <button
                key={k}
                className={k === key ? 'on' : ''}
                onClick={() => {
                  setTKey(k)
                  setTime(0)
                  setPlaying(false)
                  setPreviewing(true)
                }}
              >
                {transitionLabel(design, k)}
              </button>
            ))}
          </div>
          <div className="anim-controls">
            <button
              className="btn play"
              disabled={!resolved}
              onClick={() => {
                if (!playing && time >= total) setTime(0)
                setPreviewing(true)
                setPlaying(!playing)
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <input
              type="range"
              className="grow"
              min={0}
              max={total}
              step={1}
              value={Math.min(time, total)}
              onChange={(e) => {
                setPlaying(false)
                setPreviewing(true)
                setTime(Number(e.target.value))
              }}
            />
            <span className="muted num anim-time">
              {Math.round(Math.min(time, total))} / {resolved ? durationMs(resolved) : 0} ms
            </span>
            <button
              className="btn"
              disabled={!key || dirty || testing}
              title={dirty ? 'Save the layout first: the test plays the saved version' : 'Plays this take on the switcher while the layout is only on preview'}
              onClick={async () => {
                if (!key) return
                setTesting(true)
                const res = await window.sds.rehearse(design.id, key)
                setTesting(false)
                onMessage(res.ok ? `Played ${transitionLabel(design, key)} on preview, ${res.via === 'macro' ? 'as a switcher macro' : 'streamed from this PC'}` : res.error)
              }}
            >
              {testing ? 'Testing…' : 'Test on preview'}
            </button>
          </div>
          <div className="anim-grid anim-head">
            <span>Box</span>
            <span />
            <span>{dir === 'in' ? 'Comes from' : 'Goes to'}</span>
            <span>Delay ms</span>
            <span>Duration ms</span>
            <span>Easing</span>
          </div>
          <div className="anim-rows">
            {resolved &&
              design.objects.map((o) => {
                const t = resolved.tracks.find((x) => x.objectId === o.id)!
                const matched = o.id === resolved.matchedId
                const follows = !!t.follow
                const easings = STRONG[t.motion.easing] ? [...EASINGS, { value: t.motion.easing, label: STRONG[t.motion.easing]! }] : EASINGS
                const lock = follows ? `Moves with ${objectName(design, resolved.matchedId)}, using its timing` : undefined
                return (
                  <div key={o.id} className="anim-grid">
                    <span className="anim-name ellipsis">{o.name}</span>
                    <div className="anim-track">
                      <div
                        className={`anim-bar ${matched ? 'matched' : ''}`}
                        style={{ left: `${(t.motion.delayMs / total) * 100}%`, width: `${Math.max(0.5, (t.motion.durationMs / total) * 100)}%` }}
                      />
                      <div className="anim-head-line" style={{ left: playhead }} />
                    </div>
                    {matched ? (
                      <span className="muted">{dir === 'in' ? 'Starts full screen' : 'Ends full screen'}</span>
                    ) : (
                      <select value={t.motion.placement ?? 'in-place'} onChange={(e) => setMotion(o.id, { placement: e.target.value as Placement })}>
                        {PLACEMENTS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <input type="number" step={20} min={0} value={t.motion.delayMs} disabled={follows} title={lock} onChange={(e) => setMotion(o.id, { delayMs: Math.max(0, Number(e.target.value)) })} />
                    <input type="number" step={20} min={0} value={t.motion.durationMs} disabled={follows} title={lock} onChange={(e) => setMotion(o.id, { durationMs: Math.max(0, Number(e.target.value)) })} />
                    <select value={t.motion.easing} disabled={follows} title={lock} onChange={(e) => setMotion(o.id, { easing: e.target.value as EasingName })}>
                      {easings.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      <aside className="props">
        <div className="props-head">
          <h3 className="grow">Boxes</h3>
          <button className="link" onClick={addBox} disabled={design.objects.length >= snap.info.boxCount}>
            Add box
          </button>
        </div>
        <div
          className="box-rows"
          onDragOver={(e) => {
            if (boxDrag === null) return
            e.preventDefault()
            if (boxOver !== design.objects.length) setBoxOver(design.objects.length)
          }}
          onDrop={(e) => {
            if (boxDrag === null) return
            e.preventDefault()
            moveBox(boxDrag, design.objects.length)
            setBoxDrag(null)
            setBoxOver(null)
          }}
        >
          {design.objects.map((o, i) => (
            <button
              key={o.id}
              className={`box-row ${o.id === selected ? 'on' : ''} ${boxDrag === i ? 'dragging' : ''} ${boxOver === i && boxDrag !== i ? 'drop-before' : ''}`}
              draggable
              onDragStart={(e) => {
                setBoxDrag(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/sds-box', o.id)
              }}
              onDragOver={(e) => {
                if (boxDrag === null) return
                e.preventDefault()
                e.stopPropagation()
                if (boxOver !== i) setBoxOver(i)
              }}
              onDrop={(e) => {
                if (boxDrag === null) return
                e.preventDefault()
                e.stopPropagation()
                moveBox(boxDrag, i)
                setBoxDrag(null)
                setBoxOver(null)
              }}
              onDragEnd={() => {
                setBoxDrag(null)
                setBoxOver(null)
              }}
              onClick={() => {
                setSelected(o.id)
                setPreviewing(false)
              }}
              onMouseEnter={() => setHoverBox(o.id)}
              onMouseLeave={() => setHoverBox(null)}
            >
              <span className="box-row-name">
                <span className="ellipsis">{o.name}</span>
                {o.locked && <span className="lock" title="Locked" />}
              </span>
              <span className="muted">{roleOf(o)}</span>
            </button>
          ))}
          <div className={`box-rows-end ${boxOver === design.objects.length ? 'drop-before' : ''}`} />
        </div>
        {sel && (
          <>
            <div className="props-pad">
              <button className="btn wide" onClick={() => setObject(sel.id, { locked: !sel.locked })}>
                {sel.locked ? 'Unlock box' : 'Lock box'}
              </button>
            </div>
            <div className="props-pad props-fields">
              <div className="field-stack">
                <label className="field">
                  <span>Name</span>
                  <input type="text" value={sel.name} onChange={(e) => setObject(sel.id, { name: e.target.value })} />
                </label>
                <label className="field">
                  <span>Source</span>
                  <select
                    value={'role' in sel.source ? `role:${sel.source.role}` : `input:${sel.source.input}`}
                    onChange={(e) => {
                      const [kind, v] = e.target.value.split(/:(.*)/)
                      setObject(sel.id, { source: kind === 'role' ? { role: v } : { input: Number(v) } })
                    }}
                  >
                    {roles.map((r) => (
                      <option key={r} value={`role:${r}`}>
                        {r}
                      </option>
                    ))}
                    {'input' in sel.source && <option value={`input:${sel.source.input}`}>Input {sel.source.input}</option>}
                  </select>
                </label>
              </div>
              <div className="grid3">
                {fields([
                  ['x', 'X'],
                  ['y', 'Y'],
                  ['size', 'Size %'],
                ])}
              </div>
              <div className="field-stack">
                <button className="fold" onClick={() => setCropOpen(!cropOpen)}>
                  <span className={`arrow ${cropOpen ? 'open' : ''}`}>›</span>
                  <span className="grow">Crop</span>
                  <span className="muted">{(['cropT', 'cropB', 'cropL', 'cropR'] as const).some((k) => sel.final[k] > 0) ? 'On' : 'None'}</span>
                </button>
                {cropOpen && (
                  <>
                    <div className="grid2">
                      {fields([
                        ['cropT', 'Top'],
                        ['cropB', 'Bottom'],
                        ['cropL', 'Left'],
                        ['cropR', 'Right'],
                      ])}
                    </div>
                    {holes.length > 0 && (
                      <select value="" onChange={(e) => e.target.value !== '' && setFinal(sel.id, fitToCutout(holes[Number(e.target.value)]))}>
                        <option value="">Fit to cutout…</option>
                        {holes.map((h, i) => (
                          <option key={i} value={i}>
                            Cutout {i + 1}, {Math.round((h.r - h.l) * 60)} × {Math.round((h.t - h.b) * 60)} px
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>
              <button className="link danger remove-box" onClick={() => removeBox(sel.id)}>
                Remove box
              </button>
            </div>
          </>
        )}
        <div className="props-foot">
          <button className="btn tall" disabled={!canUndo(design.id)} onClick={() => undo(design.id)}>
            Undo
          </button>
          <span className="grow muted save-status">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <button className={`btn tall ${dirty ? 'main' : 'idle'}`} onClick={() => void save(design.id)}>
            Save design
          </button>
        </div>
      </aside>
    </main>
  )
}
