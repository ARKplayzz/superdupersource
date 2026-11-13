import { Emitter } from './emitter'
import { MatchResult, findMatch, inputFor } from './matching'
import { MACRO_PREFIX, encodeMacro, macroHash, macroable } from './macro'
import { Design, ShowSettings, TransitionKey, backgroundFor, parseTransitionKey } from './model'
import { PlainTake, Plan, PlanContext, armOps, planIn, planOut } from './plan'
import { Op, Switcher, SwitcherState, isOnAir, isOnPreview, ssInput } from './switcher'

// Owns the SuperSource engines on a switcher: loads designs into them, works out what the next
// take should do, and runs it (project.md §5).

export type Phase = 'idle' | 'armed' | 'animating-in' | 'on-air' | 'animating-out'

export interface Slot {
  ss: number
  designId: string | null
  phase: Phase
  macros: MacroStatus
}

// Whether a loaded layout's takes are on the switcher as macros.
export interface MacroStatus {
  ready: number // takes whose macro is on the switcher and current
  total: number // takes that can animate
  writing: boolean
  problem: string | null // why some or all couldn't be written
}

const NO_MACROS: MacroStatus = { ready: 0, total: 0, writing: false, problem: null }

// Each SuperSource gets a block of macro slots: an IN and an OUT for up to four boxes.
const MACROS_PER_SS = 8
// How long a take waits for its macro to finish being written before falling back.
const MACRO_WAIT_MS = 5000

export type NextTake =
  | { action: 'in' | 'out'; ss: number; designId: string; match: MatchResult }
  | { action: 'none'; reason: string }

export interface TakeRecord {
  at: number
  action: 'in' | 'out'
  ss: number
  designId: string
  // 'elsewhere': the layout went on or off air from the switcher panel or ATEM Software Control,
  // which can't animate because the switcher has already cut by the time the app hears of it.
  kind: Plan['kind'] | 'elsewhere'
  transition?: string
  frames: number
  detail: string
  // How an animated take ran: as a macro on the switcher, or streamed frame by frame from this PC.
  via?: 'macro' | 'stream'
}

export class Engine extends Emitter {
  readonly slots: Slot[]
  private designs = new Map<string, Design>()
  readonly log: TakeRecord[] = []
  // When this engine last started a take, so a change on air without one reads as a switcher take.
  private lastTakeAt = -Infinity
  // Macro writes in progress, per SuperSource. Takes wait on these.
  private writing = new Map<number, Promise<void>>()

  constructor(
    private readonly switcher: Switcher,
    public settings: ShowSettings,
    designs: Design[] = [],
  ) {
    super()
    this.slots = Array.from({ length: switcher.info.superSourceCount }, (_, ss) => ({ ss, designId: null, phase: 'idle' as Phase, macros: { ...NO_MACROS } }))
    this.setDesigns(designs)
    switcher.on('state', this.stateListener)
  }

  private readonly stateListener = (s: SwitcherState) => this.onState(s)

  // Stop following the switcher (when the app swaps switchers or rebuilds the engine).
  dispose(): void {
    this.switcher.off('state', this.stateListener)
  }

  // Carry loaded layouts over from a previous engine (after a reconnect). Sends nothing to the
  // switcher: the phases are worked out from what's on air right now.
  restore(designIds: (string | null)[]): void {
    const state = this.switcher.getState()
    this.slots.forEach((slot, i) => {
      const id = designIds[i] ?? null
      slot.designId = id && this.designs.has(id) ? id : null
      slot.phase = !slot.designId ? 'idle' : isOnAir(state, slot.ss, this.settings.takeMe) ? 'on-air' : 'armed'
    })
    this.changed()
    this.slots.forEach((slot) => void this.writeMacros(slot))
  }

  setDesigns(designs: Design[]): void {
    this.designs = new Map(designs.map((d) => [d.id, d]))
    this.changed()
    // A saved edit changes the takes, so loaded layouts get their macros rewritten.
    this.slots?.forEach((slot) => void this.writeMacros(slot))
  }

  setSettings(settings: ShowSettings): void {
    this.settings = settings
    this.changed()
    this.slots.forEach((slot) => void this.writeMacros(slot))
  }

  design(id: string | null): Design | undefined {
    return id ? this.designs.get(id) : undefined
  }

  private context(ss: number, design: Design): PlanContext {
    const sources: Record<string, number> = {}
    for (const o of design.objects) {
      const input = inputFor(o.source, this.settings.roles)
      if (input !== undefined) sources[o.id] = input
    }
    return { ss, me: this.settings.takeMe, fps: this.switcher.info.fps, boxCount: this.switcher.info.boxCount, sources }
  }

  private busy(): boolean {
    return this.switcher.busy || this.slots.some((s) => s.phase === 'animating-in' || s.phase === 'animating-out')
  }

  // A slot that isn't on air, preferring one that already holds this design.
  freeSlot(designId: string): Slot | undefined {
    const state = this.switcher.getState()
    const free = this.slots.filter((s) => !isOnAir(state, s.ss, this.settings.takeMe) && !s.phase.startsWith('animating'))
    return free.find((s) => s.designId === designId) ?? free.find((s) => s.phase === 'idle') ?? free[0]
  }

  // Load a design into a free SuperSource and put it on preview.
  async load(designId: string): Promise<Slot> {
    const design = this.designs.get(designId)
    if (!design) throw new Error(`Unknown design ${designId}`)
    if (this.busy()) throw new Error('A take is running')
    if (this.slots.length === 0) throw new Error("The switcher isn't connected, or it has no SuperSource")
    const slot = this.freeSlot(designId)
    if (!slot) throw new Error('No free SuperSource: the only one is on air')
    const ops: Op[] = [
      { op: 'art', ss: slot.ss, fill: backgroundFor(design, this.settings), behind: true },
      ...armOps(design, this.context(slot.ss, design)),
      { op: 'preview', me: this.settings.takeMe, input: ssInput(slot.ss) },
    ]
    const before = { designId: slot.designId, phase: slot.phase }
    slot.designId = designId
    slot.phase = 'armed'
    this.changed()
    try {
      await this.switcher.run(ops)
    } catch (e) {
      Object.assign(slot, before)
      this.changed()
      throw e
    }
    // The layout is on preview now; its takes are written to the switcher in the background.
    void this.writeMacros(slot)
    return slot
  }

  // ----- takes as switcher macros -----

  private macrosOn(): boolean {
    return this.settings.macros.enabled && !!this.switcher.uploadMacro
  }

  // 0-based macro slot for take k of a SuperSource, or null when it's outside the reserved range.
  private macroIndex(ss: number, k: number): number | null {
    const { first, last } = this.settings.macros
    const i = first - 1 + ss * MACROS_PER_SS + k
    return k < MACROS_PER_SS && i <= last - 1 && i < this.switcher.info.macroCount ? i : null
  }

  // The last reserved slot, for Test on preview, when the take blocks don't reach it.
  private testMacroIndex(): number | null {
    const { first, last } = this.settings.macros
    const i = last - 1
    return i >= first - 1 + this.slots.length * MACROS_PER_SS && i < this.switcher.info.macroCount ? i : null
  }

  // Free, or one of ours. Slots holding anyone else's macro are never written.
  private mayWrite(index: number): boolean {
    const name = this.switcher.getState().macros[index]
    return name === undefined || name.startsWith(MACRO_PREFIX)
  }

  // The macro a take needs: where it goes, its name (with a fingerprint of its content) and bytes.
  private takeMacro(ss: number, design: Design, key: TransitionKey, plan: Plan): { index: number; name: string; bytes: Uint8Array } | null {
    if (plan.kind !== 'animated' || !macroable(plan.ops)) return null
    const { direction, objectId } = parseTransitionKey(key)
    const i = design.objects.findIndex((o) => o.id === objectId)
    const index = this.macroIndex(ss, direction === 'in' ? i : design.objects.length + i)
    if (index === null || i < 0) return null
    const bytes = encodeMacro(plan.ops)
    return { index, name: `${MACRO_PREFIX}${ss + 1} ${key} ${macroHash(bytes)}`, bytes }
  }

  // Writes every take of the layout loaded in a slot, skipping macros already there and current.
  // Runs one SuperSource at a time; a take started meanwhile waits for it (see macroForTake).
  private writeMacros(slot: Slot): Promise<void> {
    const prev = this.writing.get(slot.ss) ?? Promise.resolve()
    const job = prev.then(() => this.writeMacrosNow(slot)).catch(() => {})
    this.writing.set(slot.ss, job)
    return job
  }

  private async writeMacrosNow(slot: Slot): Promise<void> {
    const design = this.design(slot.designId)
    if (!design || !this.macrosOn()) {
      slot.macros = { ...NO_MACROS }
      this.changed()
      return
    }
    const ctx = this.context(slot.ss, design)
    const wanted = design.objects.flatMap((o) =>
      (['in', 'out'] as const).flatMap((dir) => {
        const key: TransitionKey = `${dir}:${o.id}`
        try {
          const m = this.takeMacro(slot.ss, design, key, dir === 'in' ? planIn(design, o.id, ctx) : planOut(design, o.id, ctx))
          return m ? [m] : []
        } catch {
          return [] // the layout doesn't fit this switcher; load reports that
        }
      }),
    )
    slot.macros = { ready: 0, total: wanted.length, writing: true, problem: null }
    this.changed()
    const problems: string[] = []
    if (wanted.length < design.objects.length * 2) problems.push(`Macro slots ${this.settings.macros.first} to ${this.settings.macros.last} don't fit every take`)
    for (const m of wanted) {
      if (slot.designId !== design.id) return // another layout was loaded meanwhile
      if (this.switcher.getState().macros[m.index] === m.name) {
        slot.macros.ready++
        continue
      }
      if (!this.mayWrite(m.index)) {
        problems.push(`Macro ${m.index + 1} holds "${this.switcher.getState().macros[m.index]}", so it was left alone`)
        continue
      }
      try {
        await this.switcher.uploadMacro!(m.index, m.name, m.bytes)
        slot.macros.ready++
      } catch (e) {
        problems.push(`Couldn't write macro ${m.index + 1}: ${e instanceof Error ? e.message : String(e)}`)
      }
      this.changed()
    }
    slot.macros = { ...slot.macros, writing: false, problem: problems[0] ?? null }
    this.changed()
  }

  // The macro slot to run for this take, once any write in progress has finished, if it's on the
  // switcher and matches what the take should do now. Null means it isn't.
  private async macroForTake(slot: Slot, design: Design, plan: Plan): Promise<number | null> {
    if (!this.macrosOn() || !plan.transition) return null
    const m = this.takeMacro(slot.ss, design, plan.transition.key, plan)
    if (!m) return null
    const pending = this.writing.get(slot.ss)
    if (pending) await Promise.race([pending, new Promise((r) => setTimeout(r, MACRO_WAIT_MS))])
    if (this.switcher.getState().macros[m.index] === m.name) return m.index
    void this.writeMacros(slot) // put it right for next time
    return null
  }

  // Plays a take on the layout while it's on preview, without the cut: Test on preview in the
  // Design tab. Loads the layout to preview first if it isn't there. Runs as a macro when it can.
  async rehearse(designId: string, key: TransitionKey): Promise<{ via: 'macro' | 'stream' }> {
    if (this.busy()) throw new Error('A take is running')
    const me = this.settings.takeMe
    let slot = this.slots.find((s) => s.designId === designId && isOnPreview(this.switcher.getState(), s.ss, me))
    if (!slot) slot = await this.load(designId)
    if (isOnAir(this.switcher.getState(), slot.ss, me)) throw new Error("It's on air. Test it while it's only on preview.")
    const design = this.design(designId)!
    const ctx = this.context(slot.ss, design)
    const { direction, objectId } = parseTransitionKey(key)
    const plan = direction === 'in' ? planIn(design, objectId, ctx) : planOut(design, objectId, ctx)
    // No cut: it stays on preview. Going out, hold the full-screen box for a moment so it can be seen.
    const ops = plan.ops.flatMap((o): Op[] => (o.op !== 'cut' ? [o] : direction === 'out' ? [{ op: 'wait', frames: Math.round(this.switcher.info.fps) }] : []))
    const index = this.testMacroIndex()
    if (this.macrosOn() && index !== null && this.mayWrite(index)) {
      await this.switcher.uploadMacro!(index, `${MACRO_PREFIX} test`, encodeMacro(ops))
      await this.switcher.run([{ op: 'macro', index }, { op: 'wait', frames: frameCount(ops) + 1 }])
      return { via: 'macro' }
    }
    await this.switcher.run(ops)
    return { via: 'stream' }
  }

  // What SS CUT would do right now. Companion uses this for button feedback.
  nextTake(): NextTake {
    const state = this.switcher.getState()
    const me = this.settings.takeMe
    const mix = state.mixEffects[me]
    for (const slot of this.slots) {
      const design = this.design(slot.designId)
      if (!design || !isOnAir(state, slot.ss, me)) continue
      if (isOnPreview(state, slot.ss, me)) return { action: 'none', reason: 'The layout is on both program and preview' }
      return { action: 'out', ss: slot.ss, designId: design.id, match: findMatch(design, this.settings, mix.preview, state) }
    }
    for (const slot of this.slots) {
      const design = this.design(slot.designId)
      if (!design || !isOnPreview(state, slot.ss, me)) continue
      return { action: 'in', ss: slot.ss, designId: design.id, match: findMatch(design, this.settings, mix.program, state) }
    }
    return { action: 'none', reason: 'No loaded layout on program or preview' }
  }

  // SS CUT (fallback 'cut') or SS AUTO (fallback 'auto'). The fallback only applies when nothing
  // matches; an animated take always ends in a cut, because the pictures are identical by then.
  async take(opts: { fallback?: PlainTake } = {}): Promise<NextTake> {
    if (this.busy()) return { action: 'none', reason: 'A take is already running' }
    if (this.switcher.getState().mixEffects[this.settings.takeMe].inTransition) return { action: 'none', reason: 'A transition is already running' }
    const next = this.nextTake()
    if (next.action === 'none') return next

    const slot = this.slots[next.ss]
    const design = this.design(next.designId)!
    const matchedId = next.match.kind === 'match' ? next.match.objectId : null
    const ctx = this.context(slot.ss, design)
    const fallback = opts.fallback ?? 'cut'
    let plan = next.action === 'in' ? planIn(design, matchedId, ctx, fallback) : planOut(design, matchedId, ctx, fallback)

    // An animated take runs as a macro on the switcher when its macro is there; this PC only
    // starts it. Otherwise it streams from this PC, or cuts, as set in Setup.
    let ops = plan.ops
    let via: TakeRecord['via']
    let note = ''
    if (plan.kind === 'animated') {
      const index = await this.macroForTake(slot, design, plan)
      if (index !== null) {
        ops = [{ op: 'macro', index }, { op: 'wait', frames: frameCount(plan.ops) + 1 }]
        via = 'macro'
      } else if (this.macrosOn() && this.settings.macros.fallback === 'cut') {
        plan = next.action === 'in' ? planIn(design, null, ctx, fallback) : planOut(design, null, ctx, fallback)
        ops = plan.ops
        note = "No animation: this take's macro isn't on the switcher yet, and Setup says to cut rather than stream it"
      } else {
        via = 'stream'
      }
    }

    // Plain takes leave the phase to onState, which follows the switcher (a mix takes a while).
    const phaseBefore = slot.phase
    this.lastTakeAt = Date.now()
    if (plan.kind === 'animated') {
      slot.phase = next.action === 'in' ? 'animating-in' : 'animating-out'
      this.changed()
    }
    try {
      await this.switcher.run(ops)
    } catch (e) {
      // The take didn't finish (connection lost, say). Go back to following the switcher.
      const state = this.switcher.getState()
      slot.phase = isOnAir(state, slot.ss, this.settings.takeMe) ? 'on-air' : phaseBefore === 'on-air' ? 'armed' : phaseBefore
      this.changed()
      return { action: 'none', reason: `The take stopped: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (plan.kind === 'animated') slot.phase = next.action === 'in' ? 'on-air' : 'armed'
    this.lastTakeAt = Date.now()

    this.record({
      at: Date.now(),
      action: next.action,
      ss: slot.ss,
      designId: design.id,
      kind: plan.kind,
      transition: plan.transition?.key,
      frames: plan.frames,
      detail: note || (next.match.kind === 'match' ? next.match.detail : next.match.reason),
      via,
    })
    this.changed()
    return next
  }

  private record(r: TakeRecord): void {
    this.log.unshift(r)
    this.log.length = Math.min(this.log.length, 50)
  }

  // A take this engine didn't make: on or off air with no SS CUT or SS AUTO in the last few seconds
  // (a mix from SS AUTO can take a while to land).
  private takenElsewhere(): boolean {
    return Date.now() - this.lastTakeAt > 5000
  }

  // Takes made elsewhere (panel, ATEM Software Control) never animate (project.md §4.1).
  // Just keep the phase honest, and put the layout back to final form once it's off air.
  private onState(state: SwitcherState): void {
    for (const slot of this.slots) {
      const design = this.design(slot.designId)
      if (!design) continue
      const onAir = isOnAir(state, slot.ss, this.settings.takeMe)
      if (slot.phase === 'armed' && onAir) {
        slot.phase = 'on-air'
        if (this.takenElsewhere()) this.recordElsewhere('in', slot.ss, design.id)
        this.changed()
      } else if (slot.phase === 'on-air' && !onAir) {
        slot.phase = 'armed'
        if (this.takenElsewhere()) this.recordElsewhere('out', slot.ss, design.id)
        this.changed()
        if (!this.switcher.busy) void this.switcher.run(armOps(design, this.context(slot.ss, design)))
      }
    }
    this.emit('next', this.nextTake())
  }

  private recordElsewhere(action: 'in' | 'out', ss: number, designId: string): void {
    this.record({
      at: Date.now(),
      action,
      ss,
      designId,
      kind: 'elsewhere',
      frames: 0,
      detail: "Taken on the switcher, not with SS CUT or SS AUTO in Companion, so it couldn't animate",
    })
  }

  private changed(): void {
    this.emit('change', this.slots)
  }
}

// Frames an op list takes to play: the sum of its waits.
function frameCount(ops: Op[]): number {
  return ops.reduce((n, o) => (o.op === 'wait' ? n + o.frames : n), 0)
}
