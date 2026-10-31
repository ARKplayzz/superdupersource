import { useMemo, useState } from 'react'
import { Design } from '@sds/core/browser'
import type { AppSnapshot } from '../../../shared/api'
import { drawLayout } from '../render'
import { backgroundFile, describeNext, sourcesFor, tallyFor } from '../shared'
import { Frame, Icon } from '../ui'

const TALLY_LABEL = { pgm: 'Program', pvw: 'Preview', loaded: 'Loaded', none: '' }

function Thumb({ snap, design }: { snap: AppSnapshot; design: Design }) {
  const sources = sourcesFor(snap, design)
  return (
    <Frame
      deps={[design, sources.join(), snap.switcher.inputs]}
      draw={(g, w, h) =>
        drawLayout(
          g,
          snap.switcher,
          design.objects.map((o, i) => ({ source: sources[i], state: o.final })),
          w,
          h,
          backgroundFile(design),
        )
      }
    />
  )
}

export function SuperSources({ snap, onEdit, onMessage }: { snap: AppSnapshot; onEdit: (id: string) => void; onMessage: (m: string) => void }) {
  const [dragOver, setDragOver] = useState(false)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  const shortlist = snap.shortlist.map((id) => snap.designs.find((d) => d.id === id)).filter((d): d is Design => !!d)
  const groups = useMemo(() => {
    const m = new Map<string, Design[]>()
    for (const d of snap.designs) m.set(d.group, [...(m.get(d.group) ?? []), d])
    return [...m.entries()]
  }, [snap.designs])

  const add = (id: string) => {
    if (!snap.shortlist.includes(id)) void window.sds.setShortlist([...snap.shortlist, id])
  }
  const remove = (id: string) => void window.sds.setShortlist(snap.shortlist.filter((s) => s !== id))

  const load = async (design: Design) => {
    const res = await window.sds.load(design.id)
    if (!res.ok) onMessage(res.error)
  }

  const take = async () => {
    setBusy(true)
    try {
      const res = await window.sds.take()
      if (res.action === 'none') onMessage(res.reason)
    } finally {
      setBusy(false)
    }
  }

  const next = describeNext(snap)
  const animating = snap.slots.some((s) => s.phase.startsWith('animating'))

  return (
    <div className="layouts">
      <div className="layouts-main">
        <div
          className={`shortlist ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            setDragOver(false)
            const id = e.dataTransfer.getData('text/design')
            if (id) add(id)
          }}
        >
          <h2 className="section-title">Today's shortlist</h2>
          {shortlist.length === 0 ? (
            <div className="empty">Drag layouts here from the library, or press + next to one.</div>
          ) : (
            <div className="card-grid">
              {shortlist.map((d) => {
                const { tally, ss } = tallyFor(snap, d.id)
                return (
                  <article key={d.id} className={`card tally-${tally}`} onClick={() => void load(d)} title="Load into a free SuperSource and put it on preview">
                    <Thumb snap={snap} design={d} />
                    <div className="card-meta">
                      <div>
                        <div className="card-name">{d.name}</div>
                        <div className="card-sub">
                          {d.objects.map((o) => o.name).join(' · ')}
                        </div>
                      </div>
                      {tally !== 'none' && (
                        <span className={`chip ${tally === 'pgm' ? 'pgm' : tally === 'pvw' ? 'pvw' : ''}`}>
                          <span className="dot" />
                          {TALLY_LABEL[tally]}
                          {snap.slots.length > 1 && ss !== undefined ? ` · SS${ss + 1}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn ghost small" onClick={() => onEdit(d.id)}>
                        Edit
                      </button>
                      <button className="btn ghost small" onClick={() => remove(d.id)} title="Remove from the shortlist">
                        {Icon.close()}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <footer className="take-bar">
          <div className="take-text">
            <div className="take-headline">{animating ? 'Animating…' : next.headline}</div>
            <div className="take-detail muted">{next.detail}</div>
          </div>
          <button className="btn primary take-btn" disabled={busy || animating || snap.next.action === 'none'} onClick={() => void take()}>
            SS CUT
          </button>
        </footer>
      </div>

      <aside className="library">
        <h2 className="section-title">Library</h2>
        {groups.map(([group, designs]) => (
          <div key={group} className="lib-group">
            <button className="lib-group-head" onClick={() => setClosed({ ...closed, [group]: !closed[group] })}>
              {Icon.chevron(!closed[group])}
              <span>{group}</span>
              <span className="muted num">{designs.length}</span>
            </button>
            {!closed[group] &&
              designs.map((d) => {
                const listed = snap.shortlist.includes(d.id)
                return (
                  <div key={d.id} className="lib-row" draggable onDragStart={(e) => e.dataTransfer.setData('text/design', d.id)}>
                    <div className="lib-thumb">
                      <Thumb snap={snap} design={d} />
                    </div>
                    <div className="lib-text">
                      <div>{d.name}</div>
                      <div className="muted num">
                        {d.objects.length} {d.objects.length === 1 ? 'box' : 'boxes'}
                      </div>
                    </div>
                    <button className="btn ghost small" disabled={listed} onClick={() => add(d.id)} title={listed ? 'Already on the shortlist' : 'Add to the shortlist'}>
                      {listed ? 'Listed' : Icon.plus()}
                    </button>
                  </div>
                )
              })}
          </div>
        ))}
      </aside>
    </div>
  )
}
