import { useState } from 'react'
import { ShowSettings } from '@sds/core/browser'
import type { AppSnapshot, FoundSwitcher } from '../../../shared/api'
import { Section } from '../ui'

export function Setup({ snap }: { snap: AppSnapshot }) {
  const s = snap.settings
  const [newRole, setNewRole] = useState('')
  const set = (patch: Partial<ShowSettings>) => void window.sds.setSettings({ ...s, ...patch })
  const inputs = Object.values(snap.switcher.inputs)
  const videoSources = inputs.filter((i) => i.kind === 'external' || i.kind === 'me')
  const players = inputs.filter((i) => i.kind === 'mediaplayer')
  const usedBy = (role: string) => snap.designs.filter((d) => d.objects.some((o) => 'role' in o.source && o.source.role === role)).length

  return (
    <div className="setup">
      <SwitcherSection snap={snap} />

      <Section title="Roles">
        <p className="muted small-text">Layouts use roles, not input numbers. Set them once per venue and every layout follows.</p>
        <table className="roles">
          <tbody>
            {Object.entries(s.roles).map(([role, input]) => (
              <tr key={role}>
                <td>{role}</td>
                <td>
                  <select value={input} onChange={(e) => set({ roles: { ...s.roles, [role]: Number(e.target.value) } })}>
                    {videoSources.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.short} · {i.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="muted num">{usedBy(role)} layouts</td>
                <td>
                  <button
                    className="btn ghost small"
                    disabled={usedBy(role) > 0}
                    title={usedBy(role) > 0 ? 'In use by a layout' : 'Remove this role'}
                    onClick={() => {
                      const { [role]: _gone, ...rest } = s.roles
                      set({ roles: rest })
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            const name = newRole.trim()
            if (!name || s.roles[name] !== undefined) return
            set({ roles: { ...s.roles, [name]: videoSources[0]?.id ?? 1 } })
            setNewRole('')
          }}
        >
          <input type="text" placeholder="New role, e.g. Lectern" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
          <button className="btn small" type="submit" disabled={!newRole.trim()}>
            Add role
          </button>
        </form>
      </Section>

      <Section title="Takes">
        <div className="setup-grid">
          <label className="field">
            <span>Take on</span>
            <select value={s.takeMe} onChange={(e) => set({ takeMe: Number(e.target.value) })}>
              {Array.from({ length: snap.info.meCount }, (_, i) => (
                <option key={i} value={i}>
                  M/E {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Background (Slide 01) is in</span>
            <select value={s.backgroundInput} onChange={(e) => set({ backgroundInput: Number(e.target.value) })}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={s.animateWithKeysOnAir} onChange={(e) => set({ animateWithKeysOnAir: e.target.checked })} />
          Animate when the source comes through an M/E with keys on air (the keys drop at the cut)
        </label>
        <p className="muted small-text">Takes made on the panel or in ATEM Software Control never animate. The layout goes to air as it is.</p>
      </Section>

      <Section title="Companion">
        <p className="muted small-text">
          The SuperDuperSource Companion module connects here. Its buttons load layouts and run SS CUT and SS AUTO, with tally from this app.
        </p>
        <div className="setup-grid">
          <label className="field">
            <span>Port</span>
            <input
              type="number"
              min={1024}
              max={65535}
              defaultValue={s.localApi.port}
              key={s.localApi.port}
              onBlur={(e) => {
                const port = Number(e.target.value)
                if (port >= 1024 && port <= 65535 && port !== s.localApi.port) set({ localApi: { ...s.localApi, port } })
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <div className="field">
            <span>Status</span>
            <div className={`chip ${snap.companion.listening ? (snap.companion.clients > 0 ? 'ok' : '') : 'warn'}`}>
              <span className="dot" />
              {snap.companion.listening
                ? `${snap.companion.host}:${snap.companion.port} · ${snap.companion.clients === 0 ? 'no Companion connected' : snap.companion.clients === 1 ? '1 Companion connected' : `${snap.companion.clients} connected`}`
                : (snap.companion.error ?? 'Not listening')}
            </div>
          </div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={s.localApi.allowRemote} onChange={(e) => set({ localApi: { ...s.localApi, allowRemote: e.target.checked } })} />
          Allow Companion on another computer (anyone on the network can then trigger takes)
        </label>
      </Section>

      <Section title="App">
        <label className="toggle">
          <input type="checkbox" checked={snap.app.openAtLogin} onChange={(e) => void window.sds.setOpenAtLogin(e.target.checked)} />
          Start with Windows, in the tray
        </label>
        <p className="muted small-text num">Version {snap.app.version}. Closing the window keeps it running in the tray.</p>
      </Section>
    </div>
  )
}

const STATUS_TEXT = {
  simulator: 'Simulator running',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Not connected',
}

function SwitcherSection({ snap }: { snap: AppSnapshot }) {
  const c = snap.connection
  const [mode, setMode] = useState(c.mode)
  const [address, setAddress] = useState(c.address)
  const [found, setFound] = useState<FoundSwitcher[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = mode !== c.mode || (mode === 'atem' && address.trim() !== c.address)

  const apply = async () => {
    setError(null)
    const res = await window.sds.setConnection(mode, address)
    if (!res.ok) setError(res.error)
  }

  const search = async () => {
    setSearching(true)
    setFound(null)
    try {
      setFound(await window.sds.discover())
    } finally {
      setSearching(false)
    }
  }

  const chip = c.status === 'connected' ? 'ok' : c.status === 'simulator' ? '' : 'warn'

  return (
    <Section title="Switcher">
      <div className="setup-grid">
        <div className="field">
          <span>Connection</span>
          <div className="seg">
            <button className={mode === 'simulator' ? 'on' : ''} onClick={() => setMode('simulator')}>
              Simulator
            </button>
            <button className={mode === 'atem' ? 'on' : ''} onClick={() => setMode('atem')}>
              ATEM over network
            </button>
          </div>
        </div>
        <div className="field">
          <span>Status</span>
          <div className={`chip ${chip}`}>
            <span className="dot" />
            {c.mode === 'atem' ? `${STATUS_TEXT[c.status]} · ${c.address}` : STATUS_TEXT[c.status]}
          </div>
        </div>
      </div>

      {mode === 'atem' && (
        <>
          <div className="row">
            <label className="field grow">
              <span>Switcher IP address</span>
              <input
                type="text"
                placeholder="192.168.10.240"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void apply()}
              />
            </label>
            <button className="btn small align-end" onClick={() => void search()} disabled={searching}>
              {searching ? 'Searching…' : 'Find switchers'}
            </button>
          </div>
          {found && (
            <div className="found">
              {found.length === 0 ? (
                <span className="muted small-text">None found. Check this PC is on the switcher's network, or type the address.</span>
              ) : (
                found.map((f) => (
                  <button key={f.address} className="found-row" onClick={() => setAddress(f.address)}>
                    <span>{f.name}</span>
                    <span className="muted num">
                      {f.address} · {f.via === 'bonjour' ? 'Bonjour' : 'scan'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}

      {changed && (
        <div className="row">
          <button className="btn primary small" onClick={() => void apply()}>
            {mode === 'atem' ? 'Connect' : 'Switch to the simulator'}
          </button>
          <span className="muted small-text">Layouts loaded on the current switcher will need loading again.</span>
        </div>
      )}
      {(error || c.error) && <p className="small-text warn-text">{error ?? c.error}</p>}

      <dl className="facts">
        <dt>Model</dt>
        <dd>{snap.info.model}</dd>
        <dt>Video</dt>
        <dd className="num">{snap.info.fps} fps</dd>
        <dt>M/Es</dt>
        <dd className="num">{snap.info.meCount}</dd>
        <dt>SuperSources</dt>
        <dd className="num">
          {snap.info.superSourceCount} × {snap.info.boxCount} boxes
        </dd>
        {c.lastTakeLateMs && (
          <>
            <dt title="How late this PC sent each frame of the last take">Last take</dt>
            <dd className="num">
              frames sent within {c.lastTakeLateMs.p95} ms of time (worst {c.lastTakeLateMs.max} ms)
            </dd>
          </>
        )}
      </dl>
      <p className="muted small-text">
        Takes are streamed from this PC, one batch of box moves per frame, so they need a steady network to the switcher. A wired connection on the same
        switch is best.
      </p>
    </Section>
  )
}
