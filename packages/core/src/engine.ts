import { Emitter } from './emitter'
import { MatchResult, findMatch, inputFor } from './matching'
import { Design, ShowSettings } from './model'
import { PlainTake, Plan, PlanContext, armOps, planIn, planOut } from './plan'
import { Op, Switcher, SwitcherState, isOnAir, isOnPreview, ssInput } from './switcher'

// Owns the SuperSource engines on a switcher: loads designs into them, works out what the next
// take should do, and runs it (project.md §5).

export type Phase = 'idle' | 'armed' | 'animating-in' | 'on-air' | 'animating-out'

export interface Slot {
  ss: number
  designId: string | null
  phase: Phase
}

export type NextTake =
  | { action: 'in' | 'out'; ss: number; designId: string; match: MatchResult }
  | { action: 'none'; reason: string }

export interface TakeRecord {
  at: number
  action: 'in' | 'out'
  ss: number
  designId: string
  kind: Plan['kind']
  transition?: string
  frames: number
  detail: string
}

export class Engine extends Emitter {
  readonly slots: Slot[]
  private designs = new Map<string, Design>()
  readonly log: TakeRecord[] = []

  constructor(
    private readonly switcher: Switcher,
    public settings: ShowSettings,
    designs: Design[] = [],
  ) {
    super()
    this.slots = Array.from({ length: switcher.info.superSourceCount }, (_, ss) => ({ ss, designId: null, phase: 'idle' as Phase }))
    this.setDesigns(designs)
    switcher.on('state', (s) => this.onState(s))
  }

  setDesigns(designs: Design[]): void {
    this.designs = new Map(designs.map((d) => [d.id, d]))
    this.changed()
  }

  setSettings(settings: ShowSettings): void {
    this.settings = settings
    this.changed()
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
    const slot = this.freeSlot(designId)
    if (!slot) throw new Error('No free SuperSource: the only one is on air')
    const ops: Op[] = [
      { op: 'art', ss: slot.ss, fill: this.settings.backgroundInput, behind: true },
      ...armOps(design, this.context(slot.ss, design)),
      { op: 'preview', me: this.settings.takeMe, input: ssInput(slot.ss) },
    ]
    slot.designId = designId
    slot.phase = 'armed'
    this.changed()
    await this.switcher.run(ops)
    return slot
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
    const plan = next.action === 'in' ? planIn(design, matchedId, ctx, fallback) : planOut(design, matchedId, ctx, fallback)

    // Plain takes leave the phase to onState, which follows the switcher (a mix takes a while).
    if (plan.kind === 'animated') {
      slot.phase = next.action === 'in' ? 'animating-in' : 'animating-out'
      this.changed()
    }
    await this.switcher.run(plan.ops)
    if (plan.kind === 'animated') slot.phase = next.action === 'in' ? 'on-air' : 'armed'

    this.log.unshift({
      at: Date.now(),
      action: next.action,
      ss: slot.ss,
      designId: design.id,
      kind: plan.kind,
      transition: plan.transition?.key,
      frames: plan.frames,
      detail: next.match.kind === 'match' ? next.match.detail : next.match.reason,
    })
    this.log.length = Math.min(this.log.length, 50)
    this.changed()
    return next
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
        this.changed()
      } else if (slot.phase === 'on-air' && !onAir) {
        slot.phase = 'armed'
        this.changed()
        if (!this.switcher.busy) void this.switcher.run(armOps(design, this.context(slot.ss, design)))
      }
    }
    this.emit('next', this.nextTake())
  }

  private changed(): void {
    this.emit('change', this.slots)
  }
}
