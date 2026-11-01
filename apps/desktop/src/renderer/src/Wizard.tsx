import { useState } from 'react'
import { BoxState, Design, DesignObject, STARTER_DESIGNS, box } from '@sds/core/browser'
import type { AppSnapshot } from '../../shared/api'
import { backgroundFile, finalBoxes, groupNames, mediaPlayers } from './shared'
import { LayoutView } from './ui'

// Where boxes go when starting from blank, or when a starter has fewer boxes than chosen.
const DEFAULT_PLACES: BoxState[] = [
  box({ x: -4, y: 0, size: 0.75 }),
  box({ x: 12, y: 0, size: 0.5, cropL: 8, cropR: 8 }),
  box({ x: -6.4, y: -3.55, size: 0.4 }),
  box({ x: 6.4, y: -3.55, size: 0.4 }),
]
const IDS = 'ABCD'
// Push variants start from the same boxes as their regular layout, so they aren't offered twice.
const BASES = STARTER_DESIGNS.filter((d) => !d.name.endsWith(' Push'))

export function Wizard({ snap, onClose, onCreated }: { snap: AppSnapshot; onClose: () => void; onCreated: (id: string) => void }) {
  const roles = Object.keys(snap.settings.roles)
  const [step, setStep] = useState(1)
  const [base, setBase] = useState<string>('blank')
  const [boxes, setBoxes] = useState<string[]>([roles[0], roles[4] ?? roles[1]].filter(Boolean))
  const [name, setName] = useState('New layout')
  const [group, setGroup] = useState('My layouts')
  const [mp, setMp] = useState(snap.settings.backgroundInput)
  const starter = BASES.find((d) => d.id === base)
  const max = Math.min(4, snap.info.boxCount)

  const objects = (): DesignObject[] =>
    boxes.map((role, i) => ({
      id: IDS[i],
      name: role,
      source: { role },
      final: starter?.objects[i]?.final ?? DEFAULT_PLACES[i],
      matchPriority: i + 1,
    }))

  const pick = (id: string) => {
    setBase(id)
    const d = BASES.find((x) => x.id === id)
    setBoxes(d ? d.objects.map((o) => ('role' in o.source ? o.source.role : roles[0])) : [roles[0], roles[4] ?? roles[1]].filter(Boolean))
    setName(d ? `${d.name} copy` : 'New layout')
  }

  const create = async () => {
    const objs = objects()
    const ids = new Set(objs.map((o) => o.id))
    // Keep the starter's motion for the boxes that are still there.
    const transitions = Object.fromEntries(
      Object.entries(starter?.transitions ?? {})
        .filter(([k]) => ids.has(k.split(':')[1]))
        .map(([k, v]) => [k, Object.fromEntries(Object.entries(v ?? {}).filter(([oid]) => ids.has(oid)))]),
    )
    const design: Design = {
      id: `custom-${Date.now().toString(36)}`,
      name: name.trim() || 'New layout',
      group: group.trim(),
      background: { file: 'Slide_01.PNG' },
      guide: starter?.guide,
      mp,
      objects: objs,
      transitions,
    }
    await window.sds.saveDesign(design)
    await window.sds.setShortlist([...snap.shortlist, design.id])
    onCreated(design.id)
  }

  const preview: Design = { id: 'preview', name, group, background: { file: 'Slide_01.PNG' }, objects: objects(), transitions: {} }

  return (
    <div className="modal-back">
      <div className="modal">
        <div className="modal-head">
          <h2 className="grow">New layout</h2>
          {['1 Start', '2 Boxes', '3 Name'].map((s, i) => (
            <span key={s} className={`wiz-step ${step === i + 1 ? 'on' : ''}`}>
              {s}
            </span>
          ))}
        </div>
        <div className="modal-body">
          {step === 1 && (
            <>
              <div className="muted wiz-label">Start from</div>
              <div className="wiz-bases">
                {[{ id: 'blank', name: 'Blank', objects: [] as DesignObject[] }, ...BASES].map((b) => (
                  <button key={b.id} className={`wiz-base ${base === b.id ? 'on' : ''}`} onClick={() => pick(b.id)}>
                    <LayoutView boxes={b.objects.map((o) => ({ object: o, state: o.final }))} background="Slide_01.PNG" />
                    <div className="wiz-base-name">{b.name}</div>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <div className="wiz-boxes">
              <LayoutView boxes={finalBoxes(snap, preview)} background={backgroundFile(preview)} labels subSize="9px" fontSize="12px" />
              <div className="wiz-list">
                <div className="muted">Boxes and their sources</div>
                {boxes.map((role, i) => (
                  <div key={i} className="row">
                    <select className="grow" value={role} onChange={(e) => setBoxes(boxes.map((r, j) => (j === i ? e.target.value : r)))}>
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button className="link" onClick={() => setBoxes(boxes.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </div>
                ))}
                <button className="dashed" disabled={boxes.length >= max} onClick={() => setBoxes([...boxes, roles.find((r) => !boxes.includes(r)) ?? roles[0]])}>
                  Add box
                </button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="wiz-name">
              <label className="field">
                <span>Name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="field">
                <span>Group</span>
                <input type="text" list="wiz-groups" value={group} onChange={(e) => setGroup(e.target.value)} />
                <datalist id="wiz-groups">
                  {groupNames(snap).map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>Background media player</span>
                <select value={mp} onChange={(e) => setMp(Number(e.target.value))}>
                  {mediaPlayers(snap).map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="muted">Next you'll fine-tune positions and set the transitions in the editor.</div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="link" onClick={onClose}>
            Cancel
          </button>
          <div className="grow" />
          {step > 1 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="btn main" disabled={step === 2 && boxes.length === 0} onClick={() => (step === 3 ? void create() : setStep(step + 1))}>
            {step === 3 ? 'Create and edit' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
