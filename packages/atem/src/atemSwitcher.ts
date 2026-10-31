import { Atem, AtemState, Commands, Enums } from 'atem-connection'
import { Emitter, type Op, type Switcher, type SwitcherInfo, type SwitcherState } from '@sds/core'
import { DISCONNECTED_STATE, mapInfo, mapState, placeholderInfo } from './mapping'

// A real ATEM behind the core's Switcher interface.
//
// Takes are streamed: the PC sends each frame's box changes on its own clock, scheduled against
// absolute times so late frames don't push later ones back. Baking takes into switcher macros
// (project.md §5.2) replaces this once the macro format is known.

// The part of atem-connection's Atem this class uses, so tests can stand in a fake switcher.
export interface AtemLike {
  readonly state: AtemState | undefined
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
  connect(address: string, port?: number): Promise<void>
  disconnect(): Promise<void>
  destroy(): Promise<void>
  sendCommands(commands: Commands.ISerializableCommand[]): Promise<void>
  setSuperSourceProperties(props: { artFillSource?: number; artOption?: Enums.SuperSourceArtOption }, ssrcId?: number): Promise<void>
}

export interface FrameClock {
  now(): number
  until(t: number): Promise<void>
}

// Windows timers tick every ~15.6 ms, so setTimeout can wake a whole frame late at 50 fps.
// Sleep only while more than a tick remains, then yield with setImmediate until the frame is due:
// accurate to well under a millisecond, and incoming state updates still get handled meanwhile.
const TIMER_SLACK_MS = 17
export const realClock: FrameClock = {
  now: () => performance.now(),
  async until(t) {
    const sleep = t - performance.now() - TIMER_SLACK_MS
    if (sleep > 0) await new Promise((r) => setTimeout(r, sleep))
    while (performance.now() < t) await new Promise((r) => setImmediate(r))
  },
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export class AtemSwitcher extends Emitter implements Switcher {
  info: SwitcherInfo
  status: ConnectionStatus = 'disconnected'
  lastError: string | null = null
  // How late each streamed frame went out, for diagnostics (last take only).
  lastTakeLateMs: number[] = []

  private state: SwitcherState = DISCONNECTED_STATE
  private queue: { ops: Op[]; resolve: () => void; reject: (e: unknown) => void }[] = []
  private running = false
  private readonly atem: AtemLike
  private readonly clock: FrameClock

  constructor(
    readonly address: string,
    opts: { atem?: AtemLike; clock?: FrameClock } = {},
  ) {
    super()
    this.info = placeholderInfo(address)
    this.atem = opts.atem ?? new Atem()
    this.clock = opts.clock ?? realClock
    this.atem.on('connected', this.onConnected)
    this.atem.on('disconnected', this.onDisconnected)
    this.atem.on('stateChanged', this.onStateChanged)
    this.atem.on('error', this.onError)
  }

  connect(): void {
    this.setStatus('connecting')
    this.atem.connect(this.address).catch((e) => this.onError(String(e)))
  }

  async close(): Promise<void> {
    this.atem.off('connected', this.onConnected)
    this.atem.off('disconnected', this.onDisconnected)
    this.atem.off('stateChanged', this.onStateChanged)
    this.atem.off('error', this.onError)
    for (const job of this.queue.splice(0)) job.reject(new Error('Switcher closed'))
    await this.atem.destroy().catch(() => {})
    this.setStatus('disconnected')
  }

  getState(): SwitcherState {
    return this.state
  }

  get busy(): boolean {
    return this.running || this.queue.length > 0
  }

  run(ops: Op[]): Promise<void> {
    if (this.status !== 'connected') return Promise.reject(new Error(`Not connected to the switcher at ${this.address}`))
    return new Promise((resolve, reject) => {
      this.queue.push({ ops, resolve, reject })
      void this.drain()
    })
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!
        try {
          await this.execute(job.ops)
          job.resolve()
        } catch (e) {
          job.reject(e)
        }
      }
    } finally {
      this.running = false
    }
  }

  // Everything up to a wait goes out together in one packet; a wait of n holds for n frames,
  // measured from when the take started.
  private async execute(ops: Op[]): Promise<void> {
    const period = 1000 / this.info.fps
    const start = this.clock.now()
    let due = start
    let batch: Commands.ISerializableCommand[] = []
    const late: number[] = []

    const flush = async () => {
      if (!batch.length) return
      const commands = batch
      batch = []
      late.push(this.clock.now() - due)
      // Don't wait for the switcher's acknowledgement: the next frame is scheduled by the clock.
      this.atem.sendCommands(commands).catch((e) => this.onError(`Send failed: ${e}`))
    }

    for (const op of ops) {
      switch (op.op) {
        case 'wait':
          await flush()
          due += op.frames * period
          await this.clock.until(due)
          break
        case 'box': {
          const cmd = new Commands.SuperSourceBoxParametersCommand(op.ss, op.box)
          cmd.updateProps(op.props)
          batch.push(cmd)
          break
        }
        case 'cut':
          batch.push(new Commands.CutCommand(op.me))
          break
        case 'auto':
          batch.push(new Commands.AutoTransitionCommand(op.me))
          break
        case 'preview':
          batch.push(new Commands.PreviewInputCommand(op.me, op.input))
          break
        case 'art':
          // Its command differs by protocol version; atem-connection picks the right one.
          // Send what's queued first so the order holds.
          await flush()
          await this.atem.setSuperSourceProperties(
            { artFillSource: op.fill, artOption: op.behind ? Enums.SuperSourceArtOption.Background : Enums.SuperSourceArtOption.Foreground },
            op.ss,
          )
          break
      }
    }
    await flush()
    this.lastTakeLateMs = late
  }

  private onConnected = () => {
    const s = this.atem.state
    if (s) {
      this.info = mapInfo(s, this.address)
      this.state = mapState(s)
    }
    this.lastError = null
    this.setStatus('connected')
    this.emit('info', this.info)
    this.emit('state', this.state)
  }

  private onDisconnected = () => {
    // atem-connection keeps trying to reconnect on its own.
    this.setStatus('connecting')
  }

  private onStateChanged = (s: AtemState) => {
    if (this.status !== 'connected') return
    this.state = mapState(s)
    this.emit('state', this.state)
  }

  private onError = (e: string) => {
    this.lastError = e
    this.emit('error', e)
  }

  private setStatus(status: ConnectionStatus) {
    if (status === this.status) return
    this.status = status
    this.emit('status', status)
  }
}
