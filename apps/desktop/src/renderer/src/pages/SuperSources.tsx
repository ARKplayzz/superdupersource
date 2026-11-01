import { useState } from 'react'
import type { Design } from '@sds/core/browser'
import type { AppSnapshot } from '../../../shared/api'
import { libDrag } from '../Library'
import { backgroundFile, finalBoxes, mpShort } from '../shared'
import { LayoutView } from '../ui'

// The Active SuperSources: the show's shortlist, in Companion button order. Takes happen in Companion.
export function SuperSources({ snap, libraryOpen, libDragging, onEdit }: { snap: AppSnapshot; libraryOpen: boolean; libDragging: boolean; onEdit: (id: string) => void }) {
  const [over, setOver] = useState<number | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const active = snap.shortlist.map((id) => snap.designs.find((d) => d.id === id)).filter((d): d is Design => !!d)

  const moveTo = (id: string, index: number) => {
    const list = snap.shortlist.filter((x) => x !== id)
    const from = snap.shortlist.indexOf(id)
    const at = from > -1 && from < index ? index - 1 : index
    list.splice(Math.max(0, Math.min(at, list.length)), 0, id)
    void window.sds.setShortlist(list)
  }

  const dragId = () => dragging ?? (libDrag.kind === 'design' ? libDrag.id : null)
  const drop = (index: number) => {
    const id = dragId()
    if (id) moveTo(id, index)
    setOver(null)
    setDragging(null)
    libDrag.kind = null
  }
  const overAt = (e: React.DragEvent, index: number) => {
    if (!dragId()) return
    e.preventDefault()
    e.stopPropagation()
    if (over !== index) setOver(index)
  }

  const showEnd = active.length === 0 || libDragging

  return (
    <main className="active-page" style={{ paddingRight: libraryOpen ? 360 : 20 }}>
      <div className="active-head">
        <h2>Active SuperSources</h2>
        <span className="muted num">{active.length}</span>
      </div>
      <div className="active-grid" onDragOver={(e) => overAt(e, active.length)} onDrop={(e) => (e.preventDefault(), drop(active.length))} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}>
        {active.map((d, i) => (
          <article
            key={d.id}
            className={`card ${dragging === d.id ? 'dragging' : ''} ${over === i && dragging !== d.id ? 'drop-before' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/sds-card', d.id)
              setDragging(d.id)
            }}
            onDragOver={(e) => overAt(e, i)}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              drop(i)
            }}
            onDragEnd={() => {
              setDragging(null)
              setOver(null)
            }}
          >
            <LayoutView boxes={finalBoxes(snap, d)} background={backgroundFile(d)} labels className="card-thumb" />
            <div className="card-meta">
              <span className="muted num card-pos">{i + 1}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="card-name ellipsis" title={d.name}>
                  {d.name}
                </div>
                <div className="card-sub ellipsis" title={d.objects.map((o) => o.name).join(', ')}>
                  {d.objects.map((o) => o.name).join(', ')}
                </div>
              </div>
              <span className="muted card-mp" title="Background media player">
                {mpShort(snap, d)}
              </span>
            </div>
            <div className="card-actions">
              <button onClick={() => onEdit(d.id)}>Edit</button>
              <button onClick={() => void window.sds.setShortlist(snap.shortlist.filter((x) => x !== d.id))}>Remove</button>
            </div>
          </article>
        ))}
        {showEnd && <div className={`end-drop ${over === active.length ? 'over' : ''}`}>{active.length === 0 && !libDragging ? 'Drag layouts here from the Library.' : 'Drop to add'}</div>}
      </div>
    </main>
  )
}
