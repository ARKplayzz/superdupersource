import { WebSocket, WebSocketServer } from 'ws'
import { Design, Engine, ShowSettings, Switcher, describeNext, designTally } from '@sds/core'
import type { ClientMessage, RemoteState, ServerMessage } from '@sds/protocol'

// The local API the Companion module connects to (packages/protocol). No Electron in here, so it
// runs under plain Node for tests.

export interface LocalApiSource {
  engine: Engine
  switcher: Switcher
  designs(): Design[]
  shortlist(): string[]
  settings(): ShowSettings
  version: string
}

export interface LocalApiStatus {
  listening: boolean
  host: string
  port: number
  clients: number
  error: string | null
}

export function remoteState(src: LocalApiSource): RemoteState {
  const designs = src.designs()
  const shortlist = src.shortlist()
  const state = src.switcher.getState()
  const me = src.settings().takeMe
  const ordered = [...shortlist.map((id) => designs.find((d) => d.id === id)).filter((d): d is Design => !!d), ...designs.filter((d) => !shortlist.includes(d.id))]
  const nextTake = src.engine.nextTake()
  const next = describeNext(designs, nextTake)
  return {
    app: { name: 'SuperDuperSource', version: src.version },
    switcher: { model: src.switcher.info.model, simulated: src.switcher.info.simulated, fps: src.switcher.info.fps },
    designs: ordered.map((d) => {
      const t = designTally(state, src.engine.slots, d.id, me)
      return { id: d.id, name: d.name, group: d.group, boxes: d.objects.length, listed: shortlist.includes(d.id), tally: t.tally, ss: t.ss }
    }),
    slots: src.engine.slots.map((s) => ({ ss: s.ss, designId: s.designId, designName: designs.find((d) => d.id === s.designId)?.name ?? null, phase: s.phase })),
    next: { action: nextTake.action, animated: next.animated, headline: next.headline, detail: next.detail },
    busy: src.switcher.busy || src.engine.slots.some((s) => s.phase.startsWith('animating')),
  }
}

export class LocalApi {
  private wss: WebSocketServer | null = null
  private queued = false
  private last = ''
  status: LocalApiStatus = { listening: false, host: '127.0.0.1', port: 0, clients: 0, error: null }
  onStatus: (s: LocalApiStatus) => void = () => {}

  private readonly onChange = () => this.changed()
  private bound: { engine: Engine; switcher: Switcher } | null = null

  constructor(private readonly src: LocalApiSource) {
    this.rebind()
  }

  // Follow whatever switcher and engine the source has now (the app can swap them at runtime).
  rebind(): void {
    if (this.bound) {
      this.bound.switcher.off('state', this.onChange)
      this.bound.engine.off('change', this.onChange)
    }
    this.bound = { engine: this.src.engine, switcher: this.src.switcher }
    this.bound.switcher.on('state', this.onChange)
    this.bound.engine.on('change', this.onChange)
    this.changed()
  }

  async listen(port: number, allowRemote: boolean): Promise<void> {
    await this.close()
    const host = allowRemote ? '0.0.0.0' : '127.0.0.1'
    await new Promise<void>((resolve) => {
      const wss = new WebSocketServer({ host, port })
      wss.once('listening', () => {
        this.wss = wss
        this.setStatus({ listening: true, host, port, clients: 0, error: null })
        resolve()
      })
      wss.once('error', (e: NodeJS.ErrnoException) => {
        const error = e.code === 'EADDRINUSE' ? `Port ${port} is already in use` : e.message
        this.setStatus({ listening: false, host, port, clients: 0, error })
        resolve()
      })
      wss.on('connection', (ws) => this.accept(ws))
    })
  }

  async close(): Promise<void> {
    const wss = this.wss
    this.wss = null
    if (!wss) return
    for (const c of wss.clients) c.terminate()
    await new Promise<void>((r) => wss.close(() => r()))
    this.setStatus({ ...this.status, listening: false, clients: 0 })
  }

  private accept(ws: WebSocket) {
    this.setStatus({ ...this.status, clients: this.wss?.clients.size ?? 0 })
    send(ws, { type: 'state', state: remoteState(this.src) })
    ws.on('message', (raw) => void this.handle(ws, raw.toString()))
    ws.on('close', () => this.setStatus({ ...this.status, clients: this.wss?.clients.size ?? 0 }))
  }

  private async handle(ws: WebSocket, raw: string) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw) as ClientMessage
    } catch {
      return
    }
    switch (msg.type) {
      case 'hello':
        return
      case 'load':
        try {
          await this.src.engine.load(msg.designId)
          this.flush()
          send(ws, { type: 'result', id: msg.id, ok: true })
        } catch (e) {
          send(ws, { type: 'result', id: msg.id, ok: false, message: e instanceof Error ? e.message : String(e) })
        }
        return
      case 'take': {
        const res = await this.src.engine.take({ fallback: msg.fallback })
        // State first, so a client reading state on the result sees the finished take.
        this.flush()
        send(ws, res.action === 'none' ? { type: 'result', id: msg.id, ok: false, message: res.reason } : { type: 'result', id: msg.id, ok: true })
        return
      }
    }
  }

  // State changes every frame during a take; send at most one update per event-loop turn,
  // and only when something a button shows has changed.
  changed(): void {
    if (this.queued || !this.wss) return
    this.queued = true
    setImmediate(() => {
      if (this.queued) this.flush()
    })
  }

  // Send the current state now, if it differs from what clients last got.
  private flush(): void {
    this.queued = false
    if (!this.wss || this.wss.clients.size === 0) return
    const state = remoteState(this.src)
    const json = JSON.stringify(state)
    if (json === this.last) return
    this.last = json
    for (const c of this.wss.clients) send(c, { type: 'state', state })
  }

  private setStatus(s: LocalApiStatus) {
    this.status = s
    this.onStatus(s)
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}
