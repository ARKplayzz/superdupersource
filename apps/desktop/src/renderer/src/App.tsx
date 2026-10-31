import { ReactNode, useState } from 'react'
import iconUrl from '../../../resources/icon-32.png'
import { Design } from './pages/Design'
import { Setup } from './pages/Setup'
import { Simulator } from './pages/Simulator'
import { SuperSources } from './pages/SuperSources'
import { tallyFor } from './shared'
import { Icon, Toast, useSnapshot } from './ui'

export type Tab = 'layouts' | 'design' | 'setup' | 'simulator'

export function App() {
  const snap = useSnapshot()
  const [tab, setTab] = useState<Tab>('layouts')
  const [editing, setEditing] = useState<string>('slide-10')
  const [toast, setToast] = useState<string | null>(null)

  if (!snap) return null

  const openDesign = (id: string) => {
    setEditing(id)
    setTab('design')
  }

  const rail: { id: Tab; label: string; icon: () => ReactNode }[] = [
    { id: 'layouts', label: 'SuperSources', icon: Icon.layouts },
    { id: 'design', label: 'Design', icon: Icon.design },
    { id: 'setup', label: 'Setup', icon: Icon.setup },
  ]

  return (
    <div className="shell">
      <header className="titlebar">
        <div className="brand">
          <img src={iconUrl} alt="" />
          SuperDuperSource <small>.kennedys</small>
        </div>
        <div className="status">
          <span className={`chip ${snap.info.simulated ? 'sim' : ''}`}>
            <span className="dot" />
            {snap.info.model} · {snap.info.fps} fps
          </span>
          {snap.slots.map((slot) => {
            const design = snap.designs.find((d) => d.id === slot.designId)
            const tally = design ? tallyFor(snap, design.id).tally : 'none'
            return (
              <span key={slot.ss} className={`chip ${tally === 'pgm' ? 'pgm' : tally === 'pvw' ? 'pvw' : ''}`} title={`SuperSource ${slot.ss + 1}: ${slot.phase}`}>
                <span className="dot" />
                SS{slot.ss + 1} {design ? design.name : 'empty'}
              </span>
            )
          })}
        </div>
      </header>

      <nav className="rail">
        {rail.map((r) => (
          <button key={r.id} className={tab === r.id ? 'active' : ''} onClick={() => setTab(r.id)}>
            {r.icon()}
            {r.label}
          </button>
        ))}
        <div className="spacer" />
        {snap.info.simulated && (
          <button className={tab === 'simulator' ? 'active' : ''} onClick={() => setTab('simulator')} title="Stand-in for the switcher's multiview and panel">
            {Icon.monitor()}
            Simulator
          </button>
        )}
      </nav>

      <main className="page">
        {tab === 'layouts' && <SuperSources snap={snap} onEdit={openDesign} onMessage={setToast} />}
        {tab === 'design' && <Design snap={snap} designId={editing} onSelect={setEditing} onMessage={setToast} />}
        {tab === 'setup' && <Setup snap={snap} />}
        {tab === 'simulator' && <Simulator snap={snap} onMessage={setToast} />}
      </main>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
