import { useEffect, useState } from 'react'
import { ShowSettings, TakeRecord, describeNext } from '@sds/core/browser'
import type { AppSnapshot, FoundSwitcher, ModuleDownload } from '../../../shared/api'
import { mediaPlayers } from '../shared'
import { CheckRow } from '../ui'

export function Setup({ snap }: { snap: AppSnapshot }) {
  const s = snap.settings
  const c = snap.connection
  const set = (patch: Partial<ShowSettings>) => void window.sds.setSettings({ ...s, ...patch })
  const [debug, setDebug] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async (mode: 'simulator' | 'atem', address: string) => {
    setError(null)
    const res = await window.sds.setConnection(mode, address)
    if (!res.ok) setError(res.error)
  }

  const players = mediaPlayers(snap)
  const live = c.status === 'connected' || c.status === 'simulator'
  const late = c.lastTakeLateMs
  const next = describeNext(snap.designs, snap.next)

  return (
    <main className="column-page">
      <div className="column">
        <h3 className="col-title">Switcher</h3>
        <div className="rows">
          {c.mode === 'atem' && <AddressRow snap={snap} onConnect={(a) => void connect('atem', a)} />}
          {(error || (c.mode === 'atem' && c.error)) && <div className="row-note bad">{error ?? c.error}</div>}
          <div className="row setting">
            <span className="grow">Model</span>
            <span className="muted">{live ? snap.info.model : c.status === 'connecting' ? 'Connecting…' : 'Not connected'}</span>
          </div>
          <div className="row setting">
            <span className="grow">Frame rate</span>
            <span className="muted num">{live ? `${snap.info.fps} fps` : 'Not connected'}</span>
          </div>
        </div>

        <h3 className="col-title">Takes</h3>
        <div className="rows">
          <div className="row setting">
            <span className="grow">Take on</span>
            <select className="setting-select" value={s.takeMe} onChange={(e) => set({ takeMe: Number(e.target.value) })}>
              {Array.from({ length: Math.max(snap.info.meCount, s.takeMe + 1) }, (_, i) => (
                <option key={i} value={i}>
                  M/E {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div className="row setting">
            <span className="grow">Default background for new layouts</span>
            <select className="setting-select" value={s.backgroundInput} onChange={(e) => set({ backgroundInput: Number(e.target.value) })}>
              {players.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              {!players.some((p) => p.value === s.backgroundInput) && <option value={s.backgroundInput}>Input {s.backgroundInput}</option>}
            </select>
          </div>
          <CheckRow label="Animate when keys are on air" on={s.animateWithKeysOnAir} onChange={(on) => set({ animateWithKeysOnAir: on })} />
        </div>

        <h3 className="col-title">Companion</h3>
        <div className="rows">
          <div className="row setting">
            <span className="grow">Port</span>
            <input
              type="number"
              className="port"
              min={1024}
              max={65535}
              defaultValue={s.localApi.port}
              key={s.localApi.port}
              onBlur={(e) => {
                const port = Number(e.target.value)
                if (port >= 1024 && port <= 65535 && port !== s.localApi.port) set({ localApi: { ...s.localApi, port } })
                else e.target.value = String(s.localApi.port)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>
          <CheckRow label="Allow Companion on another computer" on={s.localApi.allowRemote} onChange={(on) => set({ localApi: { ...s.localApi, allowRemote: on } })} />
          <div className="row setting">
            <span className="grow">Status</span>
            {snap.companion.listening ? (
              snap.companion.clients > 0 ? (
                <span className="ok-text">{snap.companion.clients === 1 ? '1 Companion connected' : `${snap.companion.clients} Companions connected`}</span>
              ) : (
                <span className="muted">Waiting for Companion</span>
              )
            ) : (
              <span className="bad-text">{snap.companion.error ?? 'Not listening'}</span>
            )}
          </div>
          <ModuleRow />
        </div>

        <h3 className="col-title">App</h3>
        <div className="rows">
          <CheckRow label="Start with Windows" on={snap.app.openAtLogin} onChange={(on) => void window.sds.setOpenAtLogin(on)} />
          <UpdateRow snap={snap} />
        </div>

        <div className="debug-head">
          <h3 className="grow muted">Debug</h3>
          <button className="link" onClick={() => setDebug(!debug)}>
            {debug ? 'Hide' : 'Show'}
          </button>
        </div>
        {debug && (
          <div className="rows">
            <CheckRow label="Use simulator instead of ATEM" on={c.mode === 'simulator'} onChange={(on) => void connect(on ? 'simulator' : 'atem', s.connection.address)} />
            <div className="row setting">
              <span className="grow two-line">
                <span>Next take</span>
                <span className="small muted">{next.detail}</span>
              </span>
              <span className={next.animated ? 'ok-text' : 'muted'}>{next.headline}</span>
            </div>
            <div className="row setting">
              <span className="grow">Last take timing</span>
              <span className="muted num">{late ? `Within ${late.p95} ms, worst ${late.max} ms` : 'No takes yet'}</span>
            </div>
          </div>
        )}
        {debug && (
          <>
            <h3 className="col-title muted">Recent takes</h3>
            <div className="rows">
              {snap.log.length === 0 && <div className="row-note muted">No takes since the app started.</div>}
              {snap.log.slice(0, 8).map((t, i) => (
                <TakeRow key={`${t.at}-${i}`} take={t} name={snap.designs.find((d) => d.id === t.designId)?.name ?? t.designId} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

const KIND: Record<TakeRecord['kind'], string> = { animated: 'Animated', plain: 'No animation', elsewhere: 'Switcher take' }

// One take: when, which layout and which way, whether it animated, and why not.
function TakeRow({ take, name }: { take: TakeRecord; name: string }) {
  const time = new Date(take.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <div className="row setting">
      <span className="grow two-line">
        <span>
          <span className="muted num">{time}</span> {name} {take.action === 'in' ? 'in' : 'out'}
        </span>
        <span className="small muted">{take.detail}</span>
      </span>
      <span className={take.kind === 'animated' ? 'ok-text' : 'muted'}>{take.kind === 'animated' ? `${KIND.animated}, ${take.frames} frames` : KIND[take.kind]}</span>
    </div>
  )
}

function AddressRow({ snap, onConnect }: { snap: AppSnapshot; onConnect: (address: string) => void }) {
  const saved = snap.connection.address
  const [address, setAddress] = useState(saved)
  const [found, setFound] = useState<FoundSwitcher[] | null>(null)
  const [searching, setSearching] = useState(false)
  useEffect(() => setAddress(saved), [saved])

  const apply = (a: string) => {
    if (a.trim() !== saved) onConnect(a.trim())
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

  return (
    <>
      <div className="row setting">
        <span className="grow">IP address</span>
        <input
          type="text"
          className="ip"
          placeholder="192.168.10.240"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onBlur={() => apply(address)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button className="btn" disabled={searching} onClick={() => void search()}>
          {searching ? 'Searching…' : 'Find'}
        </button>
      </div>
      {found && found.length === 0 && <div className="row-note muted">None found. Check this PC is on the switcher's network, or type the address.</div>}
      {found?.map((f) => (
        <button
          key={f.address}
          className="found-row"
          onClick={() => {
            setAddress(f.address)
            setFound(null)
            onConnect(f.address)
          }}
        >
          <span className="grow">{f.name}</span>
          <span className="muted num">{f.address}</span>
        </button>
      ))}
    </>
  )
}

function ModuleRow() {
  const [state, setState] = useState<'idle' | 'busy' | ModuleDownload>('idle')
  const done = typeof state === 'object' && state.ok
  const run = async () => {
    setState('busy')
    setState(await window.sds.downloadModule())
  }
  return (
    <div className="row setting">
      <span className="grow two-line">
        <span>Install Companion module on this PC</span>
        {typeof state === 'object' &&
          (state.ok ? (
            <span className="small ok-text">Version {state.version} saved to Downloads. In Companion, open Modules and use Import module package.</span>
          ) : (
            <span className="small bad-text">{state.error}</span>
          ))}
      </span>
      <button className="btn" disabled={state === 'busy'} onClick={() => void run()}>
        {state === 'busy' ? 'Installing…' : done ? 'Reinstall' : 'Install'}
      </button>
    </div>
  )
}

function UpdateRow({ snap }: { snap: AppSnapshot }) {
  const u = snap.app.update
  const when = u.checkedAt ? new Date(u.checkedAt).toLocaleTimeString() : null
  const text: Record<typeof u.status, string> = {
    dev: 'Updates are off in development builds',
    idle: 'Checks shortly after starting, then every 6 hours',
    checking: 'Checking…',
    none: when ? `Up to date, checked ${when}` : 'Up to date',
    downloading: `Downloading ${u.version ?? 'an update'}${u.percent ? `, ${u.percent}%` : '…'}`,
    ready: `Version ${u.version} is ready. It installs when the app quits, or restart now.`,
    error: `Couldn't check for updates: ${u.error ?? 'unknown error'}`,
  }
  return (
    <div className="row setting">
      <span className="grow two-line">
        <span className="num">Version {snap.app.version}</span>
        <span className={`small ${u.status === 'error' ? 'bad-text' : 'muted'}`}>{text[u.status]}</span>
      </span>
      {u.status === 'ready' ? (
        <button className="btn main" title="The switcher keeps its picture. Companion buttons pause until the app is back." onClick={() => void window.sds.installUpdate()}>
          Restart and update
        </button>
      ) : (
        <button className="btn" disabled={u.status === 'dev' || u.status === 'checking' || u.status === 'downloading'} onClick={() => void window.sds.checkForUpdates()}>
          Check now
        </button>
      )}
    </div>
  )
}
