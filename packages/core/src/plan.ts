import { Design } from './model'
import { Op } from './switcher'
import { buildFrames, resolveTransition, ResolvedTransition } from './transitions'
import { BoxRaw, BoxState, toRaw } from './units'

// Turns a design + match into the frame-by-frame ops for a take. The same op list can be run by
// the simulator, streamed to an ATEM, or (later) encoded into a switcher macro.

export interface PlanContext {
  ss: number
  me: number
  fps: number
  boxCount: number
  sources: Record<string, number> // objectId -> input
}

// What a take does when nothing matches and there's nothing to animate from.
export type PlainTake = 'cut' | 'auto'

export interface Plan {
  kind: 'animated' | 'plain'
  direction: 'in' | 'out'
  transition?: ResolvedTransition
  frames: number
  ops: Op[]
}

function boxOps(ctx: PlanContext, order: string[], states: BoxState[], prev?: Partial<BoxRaw>[]): { ops: Op[]; raws: Partial<BoxRaw>[] } {
  const ops: Op[] = []
  const raws = states.map((s, i) => ({ enabled: true, source: ctx.sources[order[i]], ...toRaw(s) }))
  raws.forEach((raw, i) => {
    const before = prev?.[i]
    // After the first frame, only send boxes that changed. Keeps macros short.
    if (before && sameBox(before, raw)) return
    ops.push({ op: 'box', ss: ctx.ss, box: i, props: before ? withoutSource(raw) : raw })
  })
  return { ops, raws }
}

function disableUnused(ctx: PlanContext, used: number): Op[] {
  const ops: Op[] = []
  for (let i = used; i < ctx.boxCount; i++) ops.push({ op: 'box', ss: ctx.ss, box: i, props: { enabled: false } })
  return ops
}

const sameBox = (a: Partial<BoxRaw>, b: Partial<BoxRaw>) =>
  a.x === b.x && a.y === b.y && a.size === b.size && a.cropTop === b.cropTop && a.cropBottom === b.cropBottom && a.cropLeft === b.cropLeft && a.cropRight === b.cropRight

function withoutSource(raw: Partial<BoxRaw>): Partial<BoxRaw> {
  const { enabled: _e, source: _s, ...rest } = raw
  return rest
}

function checkFits(design: Design, ctx: PlanContext) {
  if (design.objects.length > ctx.boxCount) {
    throw new Error(`"${design.name}" has ${design.objects.length} boxes; this SuperSource has ${ctx.boxCount}`)
  }
  for (const o of design.objects) {
    if (ctx.sources[o.id] === undefined) throw new Error(`"${design.name}": no input set for ${o.name}`)
  }
}

// Final form in design order: what the layout shows while armed on preview.
export function armOps(design: Design, ctx: PlanContext): Op[] {
  checkFits(design, ctx)
  const order = design.objects.map((o) => o.id)
  return [...boxOps(ctx, order, design.objects.map((o) => o.final)).ops, ...disableUnused(ctx, order.length)]
}

// Ops for every frame after frame 0, one frame wait apart.
function motionOps(ctx: PlanContext, order: string[], frames: BoxState[][], start: Partial<BoxRaw>[]): Op[] {
  const ops: Op[] = []
  let prev = start
  for (let f = 1; f < frames.length; f++) {
    const step = boxOps(ctx, order, frames[f], prev)
    ops.push({ op: 'wait', frames: 1 }, ...step.ops)
    prev = step.raws
  }
  return ops
}

// IN: snap to the start state (looks identical to program), cut, then animate to final form.
export function planIn(design: Design, matchedId: string | null, ctx: PlanContext, plain: PlainTake = 'cut'): Plan {
  checkFits(design, ctx)
  if (!matchedId) return { kind: 'plain', direction: 'in', frames: 0, ops: [{ op: plain, me: ctx.me }] }

  const rt = resolveTransition(design, 'in', matchedId)
  const frames = buildFrames(rt, ctx.fps)
  const snap = boxOps(ctx, rt.boxOrder, frames[0])
  const ops: Op[] = [
    ...snap.ops,
    ...disableUnused(ctx, rt.boxOrder.length),
    { op: 'wait', frames: 1 }, // let the snap land while still on preview
    { op: 'cut', me: ctx.me },
    ...motionOps(ctx, rt.boxOrder, frames, snap.raws),
  ]
  return { kind: 'animated', direction: 'in', transition: rt, frames: frames.length - 1, ops }
}

// OUT: animate until the matched object fills the frame, cut to that source (invisible), then put
// the layout back to final form now that it's off air.
//
// Frame 0 re-allocates boxes so the matched object is box 1. That swap is invisible as long as
// the boxes don't overlap in final form.
export function planOut(design: Design, matchedId: string | null, ctx: PlanContext, plain: PlainTake = 'cut'): Plan {
  checkFits(design, ctx)
  if (!matchedId) return { kind: 'plain', direction: 'out', frames: 0, ops: [{ op: plain, me: ctx.me }] }

  const rt = resolveTransition(design, 'out', matchedId)
  const frames = buildFrames(rt, ctx.fps)
  const snap = boxOps(ctx, rt.boxOrder, frames[0])
  const ops: Op[] = [
    ...snap.ops,
    ...motionOps(ctx, rt.boxOrder, frames, snap.raws),
    { op: 'wait', frames: 1 },
    { op: 'cut', me: ctx.me },
    { op: 'wait', frames: 1 },
    ...armOps(design, ctx),
  ]
  return { kind: 'animated', direction: 'out', transition: rt, frames: frames.length - 1, ops }
}
