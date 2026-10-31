import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxState,
  Design as DesignT,
  DesignObject,
  EASINGS,
  EasingName,
  LIMITS,
  Motion,
  Placement,
  TransitionKey,
  box,
  buildFrames,
  durationMs,
  inputFor,
  motionFor,
  parseTransitionKey,
  resolveTransition,
  statesAt,
  transitionKeys,
  visibleRect,
} from '@sds/core/browser'
import type { AppSnapshot } from '../../../shared/api'
import { cutouts, fitToCutout } from '../cutouts'
import { drawLayout, image } from '../render'
import { backgroundFile, objectName } from '../shared'
import { Frame, Icon } from '../ui'

const PLACEMENTS: { value: Placement; label: string }[] = [
  { value: 'in-place', label: 'In place (revealed / covered)' },
  { value: 'pushed', label: 'Pushed by the full-screen box' },
  { value: 'offscreen-nearest', label: 'Off nearest edge' },
  { value: 'offscreen-left', label: 'Off left' },
  { value: 'offscreen-right', label: 'Off right' },
  { value: 'offscreen-top', label: 'Off top' },
  { value: 'offscreen-bottom', label: 'Off bottom' },
  { value: 'shrunk', label: 'Shrink to centre' },
]

const ORIGIN_LABEL = { custom: 'Custom', reversed: 'Reverse of IN', default: 'Default' }

type Drag =
  | { kind: 'move'; id: string; start: BoxState; px: number; py: number }
  | { kind: 'resize'; id: string; start: BoxState; d0: number }
  | { kind: 'crop'; id: string; start: BoxState; edge: 'l' | 'r' | 't' | 'b'; px: number; py: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r2 = (v: number) => Math.round(v * 100) / 100

function transitionLabel(design: DesignT, key: TransitionKey): string {
  const { direction, objectId } = parseTransitionKey(key)
  const name = objectName(design, objectId)
  return direction === 'in' ? `IN from ${name}` : `OUT to ${name}`
}

export function Design({ snap, designId, onSelect, onMessage }: { snap: AppSnapshot; designId: string; onSelect: (id: string) => void; onMessage: (m: string) => void }) {
  const saved = snap.designs.find((d) => d.id === designId) ?? snap.designs[0]
  const [design, setDesign] = useState<DesignT | undefined>(saved)
  const [mode, setMode] = useState<'layout' | 'motion'>('layout')
  const [selected, setSelected] = useState<string | null>(saved?.objects[0]?.id ?? null)
  const [tKey, setTKey] = useState<TransitionKey | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const drag = useRef<Drag | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Switching designs resets local edits.
  useEffect(() => {
    setDesign(saved)
    setSelected(saved?.objects[0]?.id ?? null)
    setTKey(saved ? transitionKeys(saved)[0] : null)
    setTime(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id])

  const update = (next: DesignT) => {
    setDesign(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void window.sds.saveDesign(next), 250)
  }

  const resolved = useMemo(() => {
    if (!design || !tKey || !design.objects.some((o) => o.id === parseTransitionKey(tKey).objectId)) return null
    const { direction, objectId } = parseTransitionKey(tKey)
    return resolveTransition(design, direction, objectId)
  }, [design, tKey])
  const total = resolved ? durationMs(resolved) : 0

  // Playback: advance time on animation frames.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const t0 = performance.now() - (time >= total ? 0 : time)
    const step = () => {
      const t = performance.now() - t0
      if (t >= total + 400) {
        setTime(total)
        setPlaying(false)
        return
      }
      setTime(Math.min(total, t))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  if (!design) return <div className="empty">No designs yet.</div>

  const roles = snap.settings.roles
  const sourceOf = (o: DesignObject) => inputFor(o.source, roles) ?? 0
  const holes = cutouts(design.guide)
  const sel = design.objects.find((o) => o.id === selected)

  // What the canvas shows: final form in layout mode, the transition at `time` in motion mode.
  const layoutBoxes = (): { id: string; source: number; state: BoxState }[] => {
    if (mode === 'motion' && resolved) {
      const states = statesAt(resolved, time)
      return resolved.tracks.map((t, i) => ({ id: t.objectId, source: sourceOf(design.objects.find((o) => o.id === t.objectId)!), state: states[i] }))
    }
    return design.objects.map((o) => ({ id: o.id, source: sourceOf(o), state: o.final }))
  }

  const draw = (g: CanvasRenderingContext2D, w: number, h: number) => {
    const boxes = layoutBoxes()
    drawLayout(g, snap.switcher, boxes, w, h, backgroundFile(design))
    const k = w / 32
    if (mode === 'layout') {
      const guide = image(design.guide ?? '')
      if (showGuide && guide) {
        g.globalAlpha = 0.45
        g.drawImage(guide, 0, 0, w, h)
        g.globalAlpha = 1
      }
      for (const b of boxes) {
        const r = visibleRect(b.state)
        const x = (r.l + 16) * k
        const y = (9 - r.t) * k
        const bw = (r.r - r.l) * k
        const bh = (r.t - r.b) * k
        const isSel = b.id === selected
        g.strokeStyle = isSel ? '#e8642a' : 'rgba(255,255,255,0.55)'
        g.lineWidth = isSel ? 2 * devicePixelRatio : 1 * devicePixelRatio
        g.strokeRect(x, y, bw, bh)
        g.font = `600 ${12 * devicePixelRatio}px "Segoe UI", system-ui`
        const name = objectName(design, b.id)
        const tw = g.measureText(name).width
        g.fillStyle = isSel ? '#e8642a' : 'rgba(0,0,0,0.6)'
        g.fillRect(x, y, tw + 12 * devicePixelRatio, 20 * devicePixelRatio)
        g.fillStyle = isSel ? '#160a04' : '#fff'
        g.fillText(name, x + 6 * devicePixelRatio, y + 14 * devicePixelRatio)
        if (isSel) {
          const hs = 7 * devicePixelRatio
          g.fillStyle = '#e8642a'
          for (const [hx, hy] of [
            [x, y],
            [x + bw, y],
            [x, y + bh],
            [x + bw, y + bh],
          ])
            g.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
          g.fillStyle = '#fff'
          for (const [hx, hy] of [
            [x, y + bh / 2],
            [x + bw, y + bh / 2],
            [x + bw / 2, y],
            [x + bw / 2, y + bh],
          ])
            g.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
        }
      }
    }
  }

  const setObject = (id: string, patch: Partial<DesignObject>) =>
    update({ ...design, objects: design.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) })
  const setFinal = (id: string, patch: Partial<BoxState>) => {
    const o = design.objects.find((x) => x.id === id)!
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

  // ----- canvas interaction (layout mode) -----
  const toUnits = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    const k = r.width / 32
    return { ux: (e.clientX - r.left) / k - 16, uy: 9 - (e.clientY - r.top) / k, k }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'layout') return
    const { ux, uy, k } = toUnits(e)
    const near = 8 / k // 8 css px in units
    if (sel) {
      const r = visibleRect(sel.final)
      const corners = [
        [r.l, r.t],
        [r.r, r.t],
        [r.l, r.b],
        [r.r, r.b],
      ]
      if (corners.some(([cx, cy]) => Math.abs(ux - cx) < near && Math.abs(uy - cy) < near)) {
        drag.current = { kind: 'resize', id: sel.id, start: sel.final, d0: Math.hypot(ux - sel.final.x, uy - sel.final.y) }
      } else {
        const midY = (r.t + r.b) / 2
        const midX = (r.l + r.r) / 2
        const edges: ['l' | 'r' | 't' | 'b', number, number][] = [
          ['l', r.l, midY],
          ['r', r.r, midY],
          ['t', midX, r.t],
          ['b', midX, r.b],
        ]
        const edge = edges.find(([, ex, ey]) => Math.abs(ux - ex) < near && Math.abs(uy - ey) < near)
        if (edge) drag.current = { kind: 'crop', id: sel.id, start: sel.final, edge: edge[0], px: ux, py: uy }
      }
    }
    if (!drag.current) {
      // Box 1 draws on top, so hit-test in design order.
      const hit = design.objects.find((o) => {
        const r = visibleRect(o.final)
        return ux >= r.l && ux <= r.r && uy <= r.t && uy >= r.b
      })
      setSelected(hit?.id ?? null)
      if (hit) drag.current = { kind: 'move', id: hit.id, start: hit.final, px: ux, py: uy }
    }
    if (drag.current) (e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const { ux, uy } = toUnits(e)
    const snapTo = (v: number) => (e.altKey ? v : Math.round(v / 0.05) * 0.05)
    if (d.kind === 'move') {
      setFinal(d.id, { x: r2(snapTo(d.start.x + ux - d.px)), y: r2(snapTo(d.start.y + uy - d.py)) })
    } else if (d.kind === 'resize') {
      const ratio = Math.hypot(ux - d.start.x, uy - d.start.y) / Math.max(0.01, d.d0)
      setFinal(d.id, { size: Math.round(d.start.size * ratio * 1000) / 1000 })
    } else {
      const s = d.start.size
      const dx = (ux - d.px) / s
      const dy = (uy - d.py) / s
      const patch: Partial<BoxState> =
        d.edge === 'l' ? { cropL: d.start.cropL + dx } : d.edge === 'r' ? { cropR: d.start.cropR - dx } : d.edge === 't' ? { cropT: d.start.cropT - dy } : { cropB: d.start.cropB + dy }
      for (const k of Object.keys(patch) as (keyof BoxState)[]) patch[k] = Math.round(snapTo(patch[k]!) * 1000) / 1000
      setFinal(d.id, patch)
    }
  }

  const onPointerUp = () => (drag.current = null)

  // ----- objects -----
  const addObject = () => {
    const used = new Set(design.objects.map((o) => o.id))
    const id = 'ABCD'.split('').find((c) => !used.has(c))
    if (!id) return
    const role = Object.keys(roles).find((r) => !design.objects.some((o) => 'role' in o.source && o.source.role === r)) ?? Object.keys(roles)[0]
    update({
      ...design,
      objects: [...design.objects, { id, name: role ?? `Box ${id}`, source: { role }, final: box({ size: 0.4 }), matchPriority: design.objects.length + 1 }],
    })
    setSelected(id)
  }

  const removeObject = (id: string) => {
    const transitions = Object.fromEntries(
      Object.entries(design.transitions)
        .filter(([k]) => parseTransitionKey(k as TransitionKey).objectId !== id)
        .map(([k, v]) => [k, Object.fromEntries(Object.entries(v ?? {}).filter(([oid]) => oid !== id))]),
    )
    update({ ...design, objects: design.objects.filter((o) => o.id !== id), transitions })
    setSelected(design.objects.find((o) => o.id !== id)?.id ?? null)
  }

  // ----- motion -----
  const setMotion = (objectId: string, patch: Partial<Motion>) => {
    if (!tKey) return
    const { direction, objectId: matched } = parseTransitionKey(tKey)
    // First edit to a transition copies every object's current motion, so the rest stay as they look.
    const current = design.transitions[tKey] ?? Object.fromEntries(design.objects.map((o) => [o.id, motionFor(design, direction, matched, o.id).motion]))
    update({ ...design, transitions: { ...design.transitions, [tKey]: { ...current, [objectId]: { ...current[objectId], ...patch } } } })
  }

  const resetTransition = () => {
    if (!tKey) return
    const { [tKey]: _gone, ...rest } = design.transitions
    update({ ...design, transitions: rest })
  }

  // ----- design management -----
  const duplicate = () => {
    const id = `${design.id}-copy-${Date.now().toString(36)}`
    const copy: DesignT = { ...structuredClone(design), id, name: `${design.name} copy` }
    void window.sds.saveDesign(copy).then(() => onSelect(id))
  }

  const remove = () => {
    if (snap.slots.some((s) => s.designId === design.id)) return onMessage('This layout is loaded in a SuperSource. Load a different one first.')
    if (!confirm(`Delete "${design.name}"? This can't be undone.`)) return
    const next = snap.designs.find((d) => d.id !== design.id)
    void window.sds.deleteDesign(design.id).then(() => next && onSelect(next.id))
  }

  const groups = [...new Set(snap.designs.map((d) => d.group))]
  const fps = snap.info.fps
  const frameCount = resolved ? buildFrames(resolved, fps).length - 1 : 0

  return (
    <div className="design">
      <div className="design-stage">
        <div className="stage-toolbar">
          <div className="seg">
            <button className={mode === 'layout' ? 'on' : ''} onClick={() => setMode('layout')}>
              Layout
            </button>
            <button className={mode === 'motion' ? 'on' : ''} onClick={() => setMode('motion')}>
              Motion
            </button>
          </div>
          {mode === 'layout' ? (
            <>
              <label className="toggle">
                <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} disabled={!design.guide} />
                Guide overlay {design.guide ? <span className="muted">({design.guide.replace(/\.png$/i, '')})</span> : null}
              </label>
              <span className="muted hint">Drag to move · corners resize · edge handles crop · Alt for no snapping</span>
            </>
          ) : (
            <span className="muted hint">{resolved ? transitionLabel(design, resolved.key) : ''}</span>
          )}
        </div>

        <div className="stage-canvas">
          <div className="canvas-wrap" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            <Frame canvasRef={canvas} deps={[design, mode, time, selected, showGuide, resolved, snap.settings.roles, holes.length]} draw={draw} onPointerDown={onPointerDown} />
          </div>
        </div>

        {mode === 'motion' && resolved && (
          <div className="timeline panel">
            <div className="timeline-controls">
              <button
                className="btn small"
                onClick={() => {
                  if (time >= total) setTime(0)
                  setPlaying(!playing)
                }}
              >
                {Icon.play()} {playing ? 'Pause' : 'Play'}
              </button>
              <input type="range" min={0} max={total} step={1} value={time} onChange={(e) => (setPlaying(false), setTime(Number(e.target.value)))} />
              <span className="num muted">
                {Math.round(time)} / {total} ms · {frameCount} frames at {fps} fps
              </span>
            </div>
            {resolved.tracks.map((t) => (
              <div key={t.objectId} className="tl-row">
                <span className="tl-name">{objectName(design, t.objectId)}</span>
                <div className="tl-track">
                  <div
                    className={`tl-bar ${t.objectId === resolved.matchedId ? 'matched' : t.follow ? 'follows' : ''}`}
                    style={{ left: `${(t.motion.delayMs / Math.max(1, total)) * 100}%`, width: `${Math.max(0.5, (t.motion.durationMs / Math.max(1, total)) * 100)}%` }}
                  />
                  <div className="tl-head" style={{ left: `${(time / Math.max(1, total)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="design-side">
        <div className="side-block">
          <div className="row">
            <select value={design.id} onChange={(e) => onSelect(e.target.value)} className="grow">
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {snap.designs
                    .filter((d) => d.group === g)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <button className="btn small" onClick={duplicate} title="Make a copy to edit">
              Duplicate
            </button>
            <button className="btn ghost small" onClick={remove} title="Delete this layout">
              Delete
            </button>
          </div>
          <div className="grid2">
            <label className="field">
              <span>Name</span>
              <input type="text" value={design.name} onChange={(e) => update({ ...design, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Group</span>
              <input type="text" list="groups" value={design.group} onChange={(e) => update({ ...design, group: e.target.value })} />
              <datalist id="groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>
          </div>
        </div>

        {mode === 'layout' ? (
          <>
            <div className="side-block">
              <h3 className="section-title">Boxes</h3>
              <div className="obj-list">
                {design.objects.map((o, i) => (
                  <button key={o.id} className={`obj-row ${o.id === selected ? 'on' : ''}`} onClick={() => setSelected(o.id)}>
                    <span className="obj-name">{o.name}</span>
                    <span className="muted">{'role' in o.source ? o.source.role : `Input ${o.source.input}`}</span>
                    <span className="muted num" title="SuperSource box number in final form">
                      box {i + 1}
                    </span>
                  </button>
                ))}
              </div>
              <div className="row">
                <button className="btn small" onClick={addObject} disabled={design.objects.length >= snap.info.boxCount}>
                  {Icon.plus()} Add box
                </button>
                {sel && (
                  <button className="btn ghost small" onClick={() => removeObject(sel.id)}>
                    Remove {sel.name}
                  </button>
                )}
              </div>
            </div>

            {sel && (
              <div className="side-block">
                <h3 className="section-title">{sel.name}</h3>
                <div className="grid2">
                  <label className="field">
                    <span>Name</span>
                    <input type="text" value={sel.name} onChange={(e) => setObject(sel.id, { name: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Source</span>
                    <select
                      value={'role' in sel.source ? `role:${sel.source.role}` : `input:${sel.source.input}`}
                      onChange={(e) => {
                        const [kind, v] = e.target.value.split(':')
                        setObject(sel.id, { source: kind === 'role' ? { role: v } : { input: Number(v) } })
                      }}
                    >
                      <optgroup label="Roles (set per venue in Setup)">
                        {Object.keys(roles).map((r) => (
                          <option key={r} value={`role:${r}`}>
                            {r}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Fixed input">
                        {Object.values(snap.switcher.inputs)
                          .filter((i) => i.kind === 'external' || i.kind === 'me')
                          .map((i) => (
                            <option key={i.id} value={`input:${i.id}`}>
                              {i.name}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </label>
                </div>
                <div className="grid3">
                  {(
                    [
                      ['x', 'X', 0.1],
                      ['y', 'Y', 0.1],
                      ['size', 'Size', 0.01],
                      ['cropT', 'Crop top', 0.1],
                      ['cropB', 'Crop bottom', 0.1],
                      ['cropL', 'Crop left', 0.1],
                      ['cropR', 'Crop right', 0.1],
                    ] as [keyof BoxState, string, number][]
                  ).map(([k, label, step]) => (
                    <label key={k} className="field">
                      <span>{label}</span>
                      <input type="number" step={step} value={Math.round(sel.final[k] * 1000) / 1000} onChange={(e) => setFinal(sel.id, { [k]: Number(e.target.value) })} />
                    </label>
                  ))}
                  <label className="field" title="Lower wins when more than one box shows the source on air">
                    <span>Match priority</span>
                    <input type="number" min={1} step={1} value={sel.matchPriority} onChange={(e) => setObject(sel.id, { matchPriority: Number(e.target.value) })} />
                  </label>
                </div>
                {holes.length > 0 && (
                  <label className="field">
                    <span>Fit to a guide cutout</span>
                    <select value="" onChange={(e) => e.target.value !== '' && setFinal(sel.id, fitToCutout(holes[Number(e.target.value)]))}>
                      <option value="">Choose a cutout…</option>
                      {holes.map((h, i) => (
                        <option key={i} value={i}>
                          Cutout {i + 1}: {Math.round((h.r - h.l) * 60)}×{Math.round((h.t - h.b) * 60)} px at {r2((h.l + h.r) / 2)}, {r2((h.t + h.b) / 2)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="side-block">
              <h3 className="section-title">Transitions</h3>
              <p className="muted small-text">One per source: IN when the layout is taken from that source full screen, OUT when going to it.</p>
              <div className="t-list">
                {transitionKeys(design).map((k) => (
                  <button key={k} className={`t-row ${k === tKey ? 'on' : ''}`} onClick={() => (setTKey(k), setTime(0), setPlaying(false))}>
                    <span>{transitionLabel(design, k)}</span>
                    <span className="muted">{design.transitions[k] ? 'Custom' : parseTransitionKey(k).direction === 'out' && design.transitions[`in:${parseTransitionKey(k).objectId}`] ? 'Reverse of IN' : 'Default'}</span>
                  </button>
                ))}
              </div>
            </div>
            {resolved && (
              <div className="side-block">
                <div className="row spread">
                  <h3 className="section-title">{transitionLabel(design, resolved.key)}</h3>
                  {design.transitions[resolved.key] && (
                    <button className="btn ghost small" onClick={resetTransition}>
                      Reset
                    </button>
                  )}
                </div>
                {resolved.tracks.map((t) => {
                  const matched = t.objectId === resolved.matchedId
                  return (
                    <div key={t.objectId} className="motion-row">
                      <div className="row spread">
                        <strong>{objectName(design, t.objectId)}</strong>
                        <span className="muted">{matched ? (resolved.direction === 'in' ? 'starts full screen' : 'ends full screen') : ORIGIN_LABEL[t.origin]}</span>
                      </div>
                      {!matched && (
                        <label className="field">
                          <span>{resolved.direction === 'in' ? 'Comes from' : 'Goes to'}</span>
                          <select value={t.motion.placement ?? 'in-place'} onChange={(e) => setMotion(t.objectId, { placement: e.target.value as Placement })}>
                            {PLACEMENTS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {t.follow ? (
                        <p className="muted small-text">
                          Moves with {objectName(design, resolved.matchedId)}, against its {t.follow.side === 'right' ? 'right' : t.follow.side === 'left' ? 'left' : t.follow.side === 'above' ? 'top' : 'bottom'}{' '}
                          edge, using its timing.
                        </p>
                      ) : !matched && t.motion.placement === 'pushed' ? (
                        <p className="small-text warn-text">
                          Can't be pushed: it overlaps {objectName(design, resolved.matchedId)} both ways in the layout, so there's no edge to push against. It stays in place.
                        </p>
                      ) : null}
                      {!t.follow && (
                      <div className="grid3">
                        <label className="field">
                          <span>Delay ms</span>
                          <input type="number" step={20} min={0} value={t.motion.delayMs} onChange={(e) => setMotion(t.objectId, { delayMs: Math.max(0, Number(e.target.value)) })} />
                        </label>
                        <label className="field">
                          <span>Duration ms</span>
                          <input type="number" step={20} min={0} value={t.motion.durationMs} onChange={(e) => setMotion(t.objectId, { durationMs: Math.max(0, Number(e.target.value)) })} />
                        </label>
                        <label className="field">
                          <span>Easing</span>
                          <select value={t.motion.easing} onChange={(e) => setMotion(t.objectId, { easing: e.target.value as EasingName })}>
                            {(Object.keys(EASINGS) as EasingName[]).map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
