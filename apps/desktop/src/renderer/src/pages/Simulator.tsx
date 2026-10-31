import { useState } from 'react'
import { isOnAir, programTree, previewTree } from '@sds/core/browser'
import type { AppSnapshot } from '../../../shared/api'
import { drawInput } from '../render'
import { backgroundFile, describeNext } from '../shared'
import { Frame } from '../ui'

// Stands in for the switcher's multiview and panel while there's no hardware.
// The panel CUT here is a take made outside the app, so it never animates.

function View({ snap, input, label, tally }: { snap: AppSnapshot; input: number; label: string; tally?: 'pgm' | 'pvw' }) {
  const bg = backgroundFile(snap.designs.find((d) => d.id === snap.slots[0]?.designId))
  return (
    <figure className={`mv-view ${tally ?? ''}`}>
      <Frame deps={[snap.switcher, input]} draw={(g, w, h) => drawInput(g, snap.switcher, input, w, h, bg)} />
      <figcaption>{label}</figcaption>
    </figure>
  )
}

export function Simulator({ snap, onMessage }: { snap: AppSnapshot; onMessage: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const st = snap.switcher
  const me = snap.settings.takeMe
  const mix = st.mixEffects[me]
  const pgmTree = programTree(st, me)
  const pvwTree = previewTree(st, me)
  const buses = Object.values(st.inputs).filter((i) => i.kind !== 'mediaplayer' && !(i.kind === 'me' && i.me === me))
  const tiles = Object.values(st.inputs).filter((i) => (i.kind === 'external' && i.id <= 4) || i.kind === 'supersource' || (i.kind === 'me' && i.me !== me))
  const tallyOf = (id: number) => (pgmTree.has(id) ? 'pgm' : pvwTree.has(id) ? 'pvw' : undefined)
  const next = describeNext(snap)

  const take = async () => {
    setBusy(true)
    try {
      const res = await window.sds.take()
      if (res.action === 'none') onMessage(res.reason)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sim">
      <div className="mv">
        <View snap={snap} input={mix.program} label={`Program · M/E ${me + 1}`} tally="pgm" />
        <View snap={snap} input={mix.preview} label={`Preview · M/E ${me + 1}`} tally="pvw" />
        <div className="mv-tiles">
          {tiles.map((i) => (
            <View key={i.id} snap={snap} input={i.id} label={i.name} tally={tallyOf(i.id)} />
          ))}
        </div>
      </div>

      <div className="panel sim-panel">
        {st.mixEffects.map((m, idx) => (
          <div key={idx} className="bus-block">
            <div className="bus-title">M/E {idx + 1}</div>
            <div className="bus">
              <span className="bus-label">Program</span>
              {buses
                .filter((i) => !(i.kind === 'me' && i.me === idx))
                .map((i) => (
                  <button key={i.id} className={`bus-btn ${m.program === i.id ? 'pgm' : ''}`} onClick={() => void window.sds.sim.setProgram(idx, i.id)}>
                    {i.short}
                  </button>
                ))}
            </div>
            {idx === me ? (
              <div className="bus">
                <span className="bus-label">Preview</span>
                {buses.map((i) => (
                  <button key={i.id} className={`bus-btn ${m.preview === i.id ? 'pvw' : ''}`} onClick={() => void window.sds.sim.setPreview(idx, i.id)}>
                    {i.short}
                  </button>
                ))}
              </div>
            ) : (
              <label className="toggle">
                <input type="checkbox" checked={m.keysOnAir} onChange={(e) => void window.sds.sim.setKeys(idx, e.target.checked)} />
                Upstream key on air (a lower third, say)
              </label>
            )}
          </div>
        ))}

        <div className="sim-takes">
          <button className="btn" onClick={() => void window.sds.sim.cut(me)} title="A panel take: the app sees it but doesn't animate">
            Panel CUT
          </button>
          <div className="take-text">
            <div className="take-headline">{next.headline}</div>
            <div className="take-detail muted">{next.detail}</div>
          </div>
          <button className="btn primary take-btn" disabled={busy || snap.next.action === 'none'} onClick={() => void take()}>
            SS CUT
          </button>
        </div>

        <div className="log">
          <h3 className="section-title">Takes</h3>
          {snap.log.length === 0 ? (
            <div className="muted">None yet.</div>
          ) : (
            snap.log.slice(0, 8).map((l) => (
              <div key={l.at} className="log-row">
                <span className="num muted">{new Date(l.at).toLocaleTimeString()}</span>
                <span>
                  {l.action.toUpperCase()} {snap.designs.find((d) => d.id === l.designId)?.name}
                </span>
                <span className="muted">{l.kind === 'animated' ? `${l.frames} frames` : 'plain cut'}</span>
              </div>
            ))
          )}
        </div>
        {snap.slots.map((s) => (
          <div key={s.ss} className="muted small-text">
            SS{s.ss + 1}: {s.phase}
            {isOnAir(st, s.ss, me) ? ' (on air)' : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
