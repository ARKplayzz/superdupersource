import { Emitter } from './emitter'
import { InputInfo, Op, SuperSourceState, Switcher, SwitcherInfo, SwitcherState, meProgramInput, ssInput } from './switcher'
import type { BoxRaw } from './units'

// A switcher that lives in memory, for building and testing without hardware.
// It runs ops on its own frame clock exactly the way a switcher macro would: everything up to a
// wait happens in the current frame, a wait of n holds for n frames.

export interface SimOptions {
  fps?: number
  model?: string
  meCount?: number
  superSourceCount?: number
  cameras?: string[]
  mixFrames?: number // auto transition length
}

const DEFAULT_CAMERAS = ['Presenter cam', 'Slides PC', 'Wide', 'Guest', 'Slides PC 2', 'Camera 6', 'Slides PC 3', 'Slides PC 4', 'Camera 9', 'Camera 10', 'Camera 11', 'Camera 12']

const emptyBox = (i: number): BoxRaw => ({
  enabled: false,
  source: i + 1,
  x: 0,
  y: 0,
  size: 500,
  cropped: false,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
})

export class SimSwitcher extends Emitter implements Switcher {
  readonly info: SwitcherInfo
  private state: SwitcherState
  private queue: { ops: Op[]; resolve: () => void }[] = []
  private waitFrames = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private mixing = new Map<number, number>() // me -> frames left in an auto transition
  private readonly mixFrames: number
  frame = 0

  constructor(opts: SimOptions = {}) {
    super()
    const meCount = opts.meCount ?? 2
    const superSourceCount = opts.superSourceCount ?? 1
    const cameras = opts.cameras ?? DEFAULT_CAMERAS
    this.mixFrames = opts.mixFrames ?? 25
    this.info = {
      model: opts.model ?? 'Simulated 2 M/E',
      fps: opts.fps ?? 50,
      meCount,
      superSourceCount,
      boxCount: 4,
      macroCount: 100,
      mediaPlayers: 2,
      simulated: true,
    }

    const inputs: Record<number, InputInfo> = {}
    cameras.forEach((name, i) => (inputs[i + 1] = { id: i + 1, kind: 'external', short: `CAM${i + 1}`, name }))
    inputs[3010] = { id: 3010, kind: 'mediaplayer', short: 'MP1', name: 'Media Player 1' }
    inputs[3020] = { id: 3020, kind: 'mediaplayer', short: 'MP2', name: 'Media Player 2' }
    for (let s = 0; s < superSourceCount; s++) inputs[ssInput(s)] = { id: ssInput(s), kind: 'supersource', ss: s, short: `SSC${s + 1}`, name: `SuperSource ${s + 1}` }
    for (let m = 0; m < meCount; m++) inputs[meProgramInput(m)] = { id: meProgramInput(m), kind: 'me', me: m, short: `ME${m + 1}`, name: `ME ${m + 1} Program` }

    this.state = {
      mixEffects: Array.from({ length: meCount }, () => ({ program: 1, preview: 2, inTransition: false, keysOnAir: false })),
      superSources: Array.from({ length: superSourceCount }, (): SuperSourceState => ({
        boxes: [0, 1, 2, 3].map(emptyBox),
        artFill: 3020,
        artBehind: true,
      })),
      auxes: [1],
      inputs,
    }
  }

  getState(): SwitcherState {
    return this.state
  }

  get busy(): boolean {
    return this.queue.length > 0
  }

  run(ops: Op[]): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ ops: [...ops], resolve })
      // Like a macro: the first ops run in the current frame, not the next one.
      if (this.queue.length === 1 && this.waitFrames === 0) this.process()
    })
  }

  // Real-time frame clock. Tests call tick() directly instead.
  // Counts frames from elapsed time, so a throttled timer (hidden browser tab) catches up
  // rather than slowing the animation down.
  start(): void {
    if (this.timer) return
    const t0 = performance.now()
    const f0 = this.frame
    this.timer = setInterval(() => {
      const due = f0 + Math.floor(((performance.now() - t0) * this.info.fps) / 1000)
      for (let n = 0; this.frame < due && n < 250; n++) this.tick()
    }, 1000 / this.info.fps)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  tick(): void {
    this.frame++
    for (const [me, left] of this.mixing) {
      if (left > 1) {
        this.mixing.set(me, left - 1)
        continue
      }
      this.mixing.delete(me)
      const m = this.state.mixEffects[me]
      this.state = this.withMe(me, { program: m.preview, preview: m.program, inTransition: false })
      this.changed()
    }
    if (this.waitFrames > 0) this.waitFrames--
    if (this.waitFrames === 0) this.process()
    this.emit('frame', this.frame)
  }

  // Panel-style controls, so the UI can play the operator and test bypass takes.
  cut(me = 0): void {
    this.apply({ op: 'cut', me })
    this.changed()
  }

  auto(me = 0): void {
    this.apply({ op: 'auto', me })
    this.changed()
  }

  setPreview(me: number, input: number): void {
    this.apply({ op: 'preview', me, input })
    this.changed()
  }

  setProgram(me: number, input: number): void {
    this.state = this.withMe(me, { program: input })
    this.changed()
  }

  setKeysOnAir(me: number, onAir: boolean): void {
    this.state = this.withMe(me, { keysOnAir: onAir })
    this.changed()
  }

  setAux(aux: number, input: number): void {
    const auxes = [...this.state.auxes]
    auxes[aux] = input
    this.state = { ...this.state, auxes }
    this.changed()
  }

  private process(): void {
    let changed = false
    while (this.queue.length > 0 && this.waitFrames === 0) {
      const job = this.queue[0]
      const op = job.ops.shift()
      if (!op) {
        this.queue.shift()
        job.resolve()
        continue
      }
      if (op.op === 'wait') {
        this.waitFrames = op.frames
        continue
      }
      this.apply(op)
      changed = true
    }
    if (changed) this.changed()
  }

  private apply(op: Exclude<Op, { op: 'wait' }>): void {
    switch (op.op) {
      case 'box': {
        const superSources = this.state.superSources.map((s, i) =>
          i === op.ss ? { ...s, boxes: s.boxes.map((b, j) => (j === op.box ? { ...b, ...op.props } : b)) } : s,
        )
        this.state = { ...this.state, superSources }
        break
      }
      case 'cut': {
        const me = this.state.mixEffects[op.me]
        this.state = this.withMe(op.me, { program: me.preview, preview: me.program })
        break
      }
      case 'auto':
        if (!this.mixing.has(op.me)) {
          this.mixing.set(op.me, this.mixFrames)
          this.state = this.withMe(op.me, { inTransition: true })
        }
        break
      case 'preview':
        this.state = this.withMe(op.me, { preview: op.input })
        break
      case 'art': {
        const superSources = this.state.superSources.map((s, i) => (i === op.ss ? { ...s, artFill: op.fill, artBehind: op.behind } : s))
        this.state = { ...this.state, superSources }
        break
      }
    }
  }

  private withMe(me: number, patch: Partial<SwitcherState['mixEffects'][number]>): SwitcherState {
    return { ...this.state, mixEffects: this.state.mixEffects.map((m, i) => (i === me ? { ...m, ...patch } : m)) }
  }

  private changed(): void {
    this.emit('state', this.state)
  }
}
