import { useCallback, useEffect, useState } from 'react'
import { Library } from './Library'
import { Wizard } from './Wizard'
import { Design } from './pages/Design'
import { Setup } from './pages/Setup'
import { Sources } from './pages/Sources'
import { SuperSources } from './pages/SuperSources'
import { Toast, useSnapshot } from './ui'

export type Tab = 'layouts' | 'design' | 'sources' | 'setup'

const TABS: { id: Tab; label: string }[] = [
  { id: 'layouts', label: 'SuperSources' },
  { id: 'design', label: 'Design' },
  { id: 'sources', label: 'Sources' },
  { id: 'setup', label: 'Setup' },
]

const useWidth = () => {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

export function App() {
  const snap = useSnapshot()
  const width = useWidth()
  const [tab, setTab] = useState<Tab>('layouts')
  const [editing, setEditing] = useState<string>('slide-10')
  const [toast, setToast] = useState<string | null>(null)
  const [library, setLibrary] = useState(true)
  // null follows the window: the Design tab's Library starts hidden when the window is narrow.
  const [designLib, setDesignLib] = useState<boolean | null>(null)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [wizard, setWizard] = useState(false)
  const [libDragging, setLibDragging] = useState(false)
  const clearToast = useCallback(() => setToast(null), [])

  if (!snap) return null

  const edit = (id: string) => {
    setEditing(id)
    setTab('design')
  }
  const toggleGroup = (name: string) => setClosed({ ...closed, [name]: !closed[name] })
  const designLibShown = designLib ?? width >= 1200

  const c = snap.connection
  const status = c.status === 'simulator' ? { text: 'Simulator', cls: 'sim' } : c.status === 'connected' ? { text: 'Connected to ATEM', cls: 'ok' } : { text: 'No connection to switcher', cls: 'bad' }

  return (
    <div className="shell">
      <header className="topbar">
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <span className={`status ${status.cls}`}>{status.text}</span>
          {tab === 'layouts' && (
            <button className={`btn lib-toggle ${library ? 'on' : ''}`} onClick={() => setLibrary(!library)}>
              Library
            </button>
          )}
        </div>
      </header>

      <div className="page">
        {tab === 'layouts' && (
          <>
            <SuperSources snap={snap} libraryOpen={library} libDragging={libDragging} onEdit={edit} />
            {library && (
              <Library
                snap={snap}
                variant="layouts"
                closed={closed}
                onToggleGroup={toggleGroup}
                onHide={() => setLibrary(false)}
                onNew={() => setWizard(true)}
                onDragDesign={(id) => setLibDragging(!!id)}
              />
            )}
          </>
        )}
        {tab === 'design' && (
          <Design
            snap={snap}
            designId={editing}
            onSelect={setEditing}
            onMessage={setToast}
            onShowLibrary={() => setDesignLib(true)}
            library={
              designLibShown ? (
                <Library
                  snap={snap}
                  variant="design"
                  editingId={editing}
                  closed={closed}
                  onToggleGroup={toggleGroup}
                  onPick={setEditing}
                  onHide={() => setDesignLib(false)}
                  onNew={() => setWizard(true)}
                />
              ) : null
            }
          />
        )}
        {tab === 'sources' && <Sources snap={snap} />}
        {tab === 'setup' && <Setup snap={snap} />}
      </div>

      {wizard && (
        <Wizard
          snap={snap}
          onClose={() => setWizard(false)}
          onCreated={(id) => {
            setWizard(false)
            setLibrary(false)
            edit(id)
          }}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}
