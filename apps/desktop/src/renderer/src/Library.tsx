import { useState } from 'react'
import type { Design } from '@sds/core/browser'
import type { AppSnapshot } from '../../shared/api'
import { patchDraft } from './drafts'
import { backgroundFile, finalBoxes, groupNames, libraryGroups } from './shared'
import { LayoutView } from './ui'

// What's being dragged out of the Library. dragover handlers can't read dataTransfer, so it's kept here.
export const libDrag: { kind: 'design' | 'group' | null; id: string } = { kind: null, id: '' }

const boxCount = (d: Design) => `${d.objects.length} ${d.objects.length === 1 ? 'box' : 'boxes'}`

export function Library({
  snap,
  variant,
  editingId,
  closed,
  onToggleGroup,
  onPick,
  onHide,
  onNew,
  onDragDesign,
}: {
  snap: AppSnapshot
  variant: 'layouts' | 'design'
  editingId?: string
  closed: Record<string, boolean>
  onToggleGroup: (name: string) => void
  onPick?: (id: string) => void
  onHide: () => void
  onNew: () => void
  onDragDesign?: (id: string | null) => void
}) {
  const [editGroups, setEditGroups] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [over, setOver] = useState<string | null>(null)
  const settings = snap.settings
  const groups = libraryGroups(snap)

  const setGroups = (list: string[]) => void window.sds.setSettings({ ...settings, groups: list })
  const moveDesigns = (ids: string[], group: string) => {
    for (const id of ids) {
      const d = snap.designs.find((x) => x.id === id)
      if (!d || d.group === group) continue
      void window.sds.saveDesign({ ...d, group })
      patchDraft(id, { group })
    }
  }
  const inGroup = (name: string) => snap.designs.filter((d) => d.group === name).map((d) => d.id)

  const rename = (from: string, to: string) => {
    const name = to.trim()
    if (!name || name === from || groupNames(snap).includes(name)) return
    setGroups(groupNames(snap).map((g) => (g === from ? name : g)))
    moveDesigns(inGroup(from), name)
  }
  const remove = (name: string) => {
    moveDesigns(inGroup(name), '')
    setGroups(groupNames(snap).filter((g) => g !== name))
  }
  const add = () => {
    const name = newGroup.trim()
    if (!name || groupNames(snap).includes(name)) return
    setGroups([...groupNames(snap), name])
    setNewGroup('')
  }

  const endDrag = () => {
    libDrag.kind = null
    setOver(null)
    onDragDesign?.(null)
  }
  const dropOn = (name: string) => {
    if (libDrag.kind === 'group' && name && libDrag.id !== name) {
      const list = groupNames(snap).filter((g) => g !== libDrag.id)
      list.splice(list.indexOf(name), 0, libDrag.id)
      setGroups(list)
    } else if (libDrag.kind === 'design') {
      moveDesigns([libDrag.id], name)
    }
    endDrag()
  }

  const dragDesign = (e: React.DragEvent, d: Design) => {
    libDrag.kind = 'design'
    libDrag.id = d.id
    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setData('text/sds-design', d.id)
    onDragDesign?.(d.id)
  }

  const isDesign = variant === 'design'

  return (
    <aside className={`library lib-${variant}`}>
      <div className="library-head">
        {isDesign ? <h3 className="grow">Library</h3> : <h2 className="grow">Library</h2>}
        <button className="link" onClick={onHide}>
          Hide
        </button>
        {isDesign && (
          <button className="btn" onClick={onNew}>
            New
          </button>
        )}
      </div>

      <div className="library-list">
        {groups.map((g) => {
          const open = g.name === '' || !closed[g.name]
          return (
            <div
              key={g.name || '(ungrouped)'}
              className={`lib-group ${over === g.name ? 'over' : ''}`}
              onDragOver={(e) => {
                if (!libDrag.kind || editGroups) return
                e.preventDefault()
                if (over !== g.name) setOver(g.name)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                dropOn(g.name)
              }}
            >
              {g.name && !editGroups && (
                <button
                  className="lib-group-head"
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation()
                    libDrag.kind = 'group'
                    libDrag.id = g.name
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/sds-group', g.name)
                  }}
                  onDragEnd={endDrag}
                  onClick={() => onToggleGroup(g.name)}
                >
                  <span className={`arrow ${open ? 'open' : ''}`}>›</span>
                  <span className="grow ellipsis">{g.name}</span>
                </button>
              )}
              {g.name && editGroups && (
                <div className="lib-group-edit">
                  <input
                    type="text"
                    defaultValue={g.name}
                    onBlur={(e) => rename(g.name, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  <button className="link danger" onClick={() => remove(g.name)}>
                    Delete
                  </button>
                </div>
              )}
              {open &&
                g.designs.map((d) => {
                  const active = snap.shortlist.includes(d.id)
                  if (isDesign) {
                    const on = d.id === editingId
                    return (
                      <button
                        key={d.id}
                        className={`lib-row compact ${on ? 'on' : ''}`}
                        draggable={!editGroups}
                        onDragStart={(e) => dragDesign(e, d)}
                        onDragEnd={endDrag}
                        onClick={() => onPick?.(d.id)}
                        title={d.name}
                      >
                        <LayoutView boxes={finalBoxes(null, d)} background={backgroundFile(d)} />
                        <span className="lib-text">
                          <span className={`ellipsis lib-name ${active ? 'active' : ''} ${on ? 'current' : ''}`}>{d.name}</span>
                          <span className={`lib-tag ${active ? 'active' : ''}`}>{active ? 'Active' : boxCount(d)}</span>
                        </span>
                      </button>
                    )
                  }
                  return (
                    <div
                      key={d.id}
                      className={`lib-row ${active ? 'listed' : ''}`}
                      draggable={!active && !editGroups}
                      onDragStart={(e) => (active ? e.preventDefault() : dragDesign(e, d))}
                      onDragEnd={endDrag}
                    >
                      <LayoutView boxes={finalBoxes(null, d)} background={backgroundFile(d)} />
                      <div className="lib-text">
                        <div className="ellipsis" title={d.name}>
                          {d.name}
                        </div>
                        <div className="muted lib-count">{boxCount(d)}</div>
                      </div>
                      <button className="btn add" disabled={active} onClick={() => void window.sds.setShortlist([...snap.shortlist, d.id])}>
                        {active ? 'Added' : 'Add'}
                      </button>
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>

      <div className="library-foot">
        {editGroups && (
          <div className="row">
            <input type="text" className="grow" placeholder="New group" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn" onClick={add}>
              Add
            </button>
          </div>
        )}
        <button className={`btn wide ${editGroups ? 'on' : ''}`} onClick={() => setEditGroups(!editGroups)}>
          {editGroups ? 'Done' : 'Edit groups'}
        </button>
        {!isDesign && (
          <button className="btn wide tall" onClick={onNew}>
            New layout
          </button>
        )}
      </div>
    </aside>
  )
}
