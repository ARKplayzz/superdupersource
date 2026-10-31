import WebSocket from 'ws'
import type { ClientMessage, RemoteState, ServerMessage } from '@sds/protocol'

type Request = { type: 'load'; designId: string } | { type: 'take'; fallback: 'cut' | 'auto' }
export type ConnectionStatus = 'connecting' | 'ok' | 'failed'

// WebSocket client for the SuperDuperSource app's local API. Reconnects until closed.
export class AppConnection {
  state: RemoteState | null = null
  onState: (state: RemoteState) => void = () => {}
  onStatus: (status: ConnectionStatus, message?: string) => void = () => {}

  private ws: WebSocket | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private nextId = 1
  private pending = new Map<number, (r: { ok: boolean; message?: string }) => void>()

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly version: string,
  ) {}

  connect(): void {
    this.closed = false
    this.onStatus('connecting')
    const ws = new WebSocket(`ws://${this.host}:${this.port}`)
    this.ws = ws
    ws.on('open', () => {
      this.send({ type: 'hello', client: 'companion', version: this.version })
      this.onStatus('ok')
    })
    ws.on('message', (raw) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(raw.toString()) as ServerMessage
      } catch {
        return
      }
      if (msg.type === 'state') {
        this.state = msg.state
        this.onState(msg.state)
      } else if (msg.type === 'result') {
        this.pending.get(msg.id)?.({ ok: msg.ok, message: msg.message })
        this.pending.delete(msg.id)
      }
    })
    ws.on('error', (e) => this.onStatus('failed', `Can't reach SuperDuperSource at ${this.host}:${this.port} (${e.message})`))
    ws.on('close', () => {
      if (this.ws !== ws) return
      this.ws = null
      for (const resolve of this.pending.values()) resolve({ ok: false, message: 'Connection closed' })
      this.pending.clear()
      if (this.closed) return
      this.onStatus('failed', `Lost connection to SuperDuperSource at ${this.host}:${this.port}`)
      this.retry = setTimeout(() => this.connect(), 2000)
    })
  }

  close(): void {
    this.closed = true
    if (this.retry) clearTimeout(this.retry)
    this.ws?.close()
    this.ws = null
  }

  request(req: Request, timeoutMs = 5000): Promise<{ ok: boolean; message?: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.resolve({ ok: false, message: 'Not connected to SuperDuperSource' })
    const id = this.nextId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ ok: false, message: 'SuperDuperSource did not answer' })
      }, timeoutMs)
      this.pending.set(id, (r) => {
        clearTimeout(timer)
        resolve(r)
      })
      this.send({ ...req, id } as ClientMessage)
    })
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }
}
