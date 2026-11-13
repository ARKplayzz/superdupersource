import { describe, expect, test } from 'vitest'
import { Engine } from './engine'
import { lerpBox, offscreen, visibleRect } from './geometry'
import { GROUP_GRID, GROUP_PRES, SLIDE_10, SLIDE_10_PUSH, STARTER_DESIGNS, TWO_PRESENTATIONS, fingerprint, freshShow, mergeNewStarters, migrateShow, upgradeShow } from './library'
import { findMatch, resolveSource } from './matching'
import { DEFAULT_SETTINGS, ShowSettings } from './model'
import { planIn, planOut } from './plan'
import { SimSwitcher } from './sim'
import { designTally, isOnAir, meProgramInput, ssInput } from './switcher'
import { buildFrames, motionFor, resolveTransition, statesAt } from './transitions'
import { FULLSCREEN, fromRaw, toRaw } from './units'

const CAM = DEFAULT_SETTINGS.roles.Static // the presenter camera
const SLIDES = DEFAULT_SETTINGS.roles.Presentation
const WIDE = DEFAULT_SETTINGS.roles.Wide
const settings: ShowSettings = { ...DEFAULT_SETTINGS }
const byId = (id: string) => STARTER_DESIGNS.find((d) => d.id === id)!
// The engine tests use the original Slides + presenter, whose hand-set motions they check.
const DESIGNS = [SLIDE_10, ...STARTER_DESIGNS]

function sim() {
  return new SimSwitcher({ fps: 50 })
}

// Tick the simulator until the promise settles (or give up).
async function drive<T>(s: SimSwitcher, p: Promise<T>, maxFrames = 500): Promise<T> {
  let done = false
  const out = p.then((v) => ((done = true), v))
  for (let i = 0; i < maxFrames && !done; i++) {
    s.tick()
    await Promise.resolve()
  }
  return out
}

describe('geometry', () => {
  test('visible edges move linearly while size and crop both change', () => {
    const to = SLIDE_10.objects[1].final
    const a = visibleRect(FULLSCREEN)
    const b = visibleRect(to)
    for (let i = 0; i <= 10; i++) {
      const k = i / 10
      const r = visibleRect(lerpBox(FULLSCREEN, to, k))
      expect(r.l).toBeCloseTo(a.l + (b.l - a.l) * k, 6)
      expect(r.t).toBeCloseTo(a.t + (b.t - a.t) * k, 6)
    }
  })

  test('an edge in the same place at both ends stays put', () => {
    // Slides full screen -> main box: the left edge sits on the frame edge the whole time.
    const to = SLIDE_10.objects[0].final
    for (let i = 0; i <= 10; i++) {
      const r = visibleRect(lerpBox(FULLSCREEN, to, i / 10))
      expect(r.l).toBeCloseTo(-16, 6)
    }
  })

  test('offscreen puts the visible edge just past the frame', () => {
    const b = SLIDE_10.objects[1].final
    expect(visibleRect(offscreen(b, 'right')).l).toBeCloseTo(16.5)
    expect(visibleRect(offscreen(b, 'left')).r).toBeCloseTo(-16.5)
    expect(visibleRect(offscreen(b, 'top')).b).toBeCloseTo(9.5)
  })

  test('raw conversion round-trips', () => {
    const b = SLIDE_10.objects[1].final
    expect(fromRaw(toRaw(b))).toEqual(b)
  })
})

describe('starter designs', () => {
  test('two presentations sit side by side at 49%, mirrored about the centre', () => {
    const [l, r] = TWO_PRESENTATIONS.objects.map((o) => visibleRect(o.final))
    expect(l.l).toBeCloseTo(-r.r, 6)
    expect(l.r).toBeCloseTo(-r.l, 6)
    expect(r.l - l.r).toBeGreaterThan(0) // they don't overlap
    expect(l.l).toBeGreaterThan(-16) // and stay inside the frame
  })

  test('the shipped layouts are grouped into Default Pres and Default Grid', () => {
    expect(new Set(STARTER_DESIGNS.map((d) => d.group))).toEqual(new Set([GROUP_PRES, GROUP_GRID]))
    expect(STARTER_DESIGNS.map((d) => d.name)).toEqual([
      'Slides + Presenter',
      'Slides + Two Presenters',
      'Slides + Three Presenters',
      'Two Presentations',
      'Two Presenters',
      'Two Presenters Push',
      'Three Presenters',
      'Three Presenters Push',
      'Four Grid',
    ])
  })

  test('Four Grid and the regular presenter layouts leave the other boxes in place', () => {
    for (const id of ['slide-04', 'slide-02', 'slide-03']) {
      const rt = resolveTransition(byId(id), 'in', 'A')
      expect(rt.tracks.slice(1).every((t) => t.motion.placement === 'in-place' && !t.follow)).toBe(true)
    }
    for (const id of ['slide-02-push', 'slide-03-push']) {
      const rt = resolveTransition(byId(id), 'in', 'A')
      expect(rt.tracks.slice(1).some((t) => t.follow)).toBe(true)
    }
  })

  test('Slides + Two Presenters pushes for the slides, and leaves boxes in place for the cameras', () => {
    const slides = resolveTransition(byId('slide-11'), 'out', 'A')
    expect(slides.tracks.slice(1).every((t) => t.follow)).toBe(true)
    const camera = resolveTransition(byId('slide-11'), 'out', 'B')
    expect(camera.tracks.slice(1).every((t) => t.motion.placement === 'in-place' && !t.follow)).toBe(true)
  })


  test.each(STARTER_DESIGNS)('$name: every transition stays inside ATEM ranges', (design) => {
    for (const obj of design.objects) {
      for (const dir of ['in', 'out'] as const) {
        for (const frame of buildFrames(resolveTransition(design, dir, obj.id), 50)) {
          for (const b of frame) {
            const raw = toRaw(b)
            expect(raw.size).toBeGreaterThanOrEqual(70)
            expect(raw.size).toBeLessThanOrEqual(1000)
            expect(Math.abs(raw.x)).toBeLessThanOrEqual(4800)
            expect(Math.abs(raw.y)).toBeLessThanOrEqual(2700)
          }
        }
      }
    }
  })

  test('Slide 10 boxes land on the template cutouts (within the outline)', () => {
    const px = (b: (typeof SLIDE_10.objects)[number]['final']) => {
      const r = visibleRect(b)
      return [960 + r.l * 60, 960 + r.r * 60, 540 - r.t * 60, 540 - r.b * 60]
    }
    const want = { A: [4, 1438, 136, 942], B: [1444, 1916, 273, 807] }
    for (const o of SLIDE_10.objects) {
      px(o.final).forEach((v, i) => expect(Math.abs(v - want[o.id as 'A' | 'B'][i])).toBeLessThanOrEqual(4))
    }
  })
})

describe('transitions', () => {
  test('matched object goes in box 1 and starts full screen', () => {
    const rt = resolveTransition(SLIDE_10, 'in', 'B')
    expect(rt.boxOrder).toEqual(['B', 'A'])
    expect(rt.tracks[0].from).toEqual(FULLSCREEN)
    expect(buildFrames(rt, 50).length - 1).toBe(35) // 700 ms at 1080p50
  })

  test('an OUT with nothing custom reverses the custom IN', () => {
    const design = { ...SLIDE_10, transitions: { 'in:A': SLIDE_10.transitions['in:A'] } }
    const { motion, origin } = motionFor(design, 'out', 'A', 'B')
    expect(origin).toBe('reversed')
    expect(motion).toEqual({ placement: 'offscreen-right', durationMs: 600, delayMs: 0, easing: 'easeInCubic' })
  })

  test('no custom motion means pushed', () => {
    const { motion, origin } = motionFor({ ...byId('slide-11'), transitions: {} }, 'in', 'B', 'A')
    expect(origin).toBe('default')
    expect(motion.placement).toBe('pushed')
  })
})

describe('pushed boxes', () => {
  test('the presenter stays against the slides edge on every frame, both ways', () => {
    for (const key of ['in:A', 'out:A'] as const) {
      const dir = key.startsWith('in') ? 'in' : 'out'
      const rt = resolveTransition(SLIDE_10_PUSH, dir, 'A')
      expect(rt.tracks[1].follow).toMatchObject({ side: 'right' })
      const gap = rt.tracks[1].follow!.gap
      for (const [a, b] of buildFrames(rt, 50)) {
        expect(visibleRect(b).l).toBeCloseTo(visibleRect(a).r + gap, 6)
        expect(b.size).toBe(SLIDE_10.objects[1].final.size) // pushed, not scaled
      }
    }
  })

  test('the slides stay against the presenter edge when the presenter goes full screen', () => {
    const rt = resolveTransition(SLIDE_10_PUSH, 'out', 'B')
    expect(rt.tracks[1].follow).toMatchObject({ side: 'left' })
    for (const [b, a] of buildFrames(rt, 50)) expect(visibleRect(a).r).toBeCloseTo(visibleRect(b).l - rt.tracks[1].follow!.gap, 6)
  })

  test('IN from slides starts with the presenter just off screen and ends in the layout', () => {
    const frames = buildFrames(resolveTransition(SLIDE_10_PUSH, 'in', 'A'), 50)
    expect(visibleRect(frames[0][1]).l).toBeGreaterThanOrEqual(16 - 1e-6)
    expect(frames.at(-1)![1]).toEqual(SLIDE_10.objects[1].final)
    expect(frames.at(-1)![0]).toEqual(SLIDE_10.objects[0].final)
  })

  test('a pushed box takes the full-screen box timing', () => {
    const rt = resolveTransition(SLIDE_10_PUSH, 'out', 'A')
    expect(rt.tracks[1].motion).toMatchObject({ placement: 'pushed', durationMs: 750, delayMs: 0 })
  })

  test('a few pixels of overlap (boxes covering a template outline) still count as touching', () => {
    // Four Grid's rows overlap by 0.05 units so the boxes cover the outline between them.
    const rt = resolveTransition({ ...byId('slide-04'), transitions: {} }, 'in', 'A')
    const wide = rt.tracks.find((t) => t.objectId === 'C')!
    expect(wide.follow).toMatchObject({ side: 'below' })
    expect(wide.follow!.gap).toBeCloseTo(-0.05, 6)
  })

  test('boxes that overlap both ways fall back to in place', () => {
    const overlap = { ...SLIDE_10_PUSH, objects: [SLIDE_10.objects[0], { ...SLIDE_10.objects[1], final: { ...SLIDE_10.objects[1].final, x: 0 } }] }
    const rt = resolveTransition(overlap, 'in', 'A')
    expect(rt.tracks[1].follow).toBeUndefined()
    expect(statesAt(rt, 0)[1]).toEqual(overlap.objects[1].final)
  })
})

describe('starter layouts in saved shows', () => {
  test('an older save gets the new layout once, and deleted ones stay deleted', () => {
    const saved = STARTER_DESIGNS.filter((d) => d.id !== 'slide-10-push' && d.id !== 'slide-12')
    const first = mergeNewStarters(saved)
    expect(first.added).toEqual(['slide-10-push'])
    // The user deletes the new one; it doesn't come back next time.
    const again = mergeNewStarters(first.designs.filter((d) => d.id !== 'slide-10-push'), first.known)
    expect(again.added).toEqual([])
  })
})

describe('matching', () => {
  test('direct match', () => {
    const s = sim()
    const m = findMatch(SLIDE_10, settings, CAM, s.getState())
    expect(m).toMatchObject({ kind: 'match', objectId: 'B', how: 'direct' })
  })

  test('program is ME2 showing the presenter: matches through the M/E', () => {
    const s = sim()
    s.setProgram(1, CAM)
    expect(resolveSource(meProgramInput(1), s.getState()).input).toBe(CAM)
    expect(findMatch(SLIDE_10, settings, meProgramInput(1), s.getState())).toMatchObject({ kind: 'match', objectId: 'B', how: 'via-me' })
  })

  test('box source is ME2 and program is the camera itself', () => {
    const s = sim()
    s.setProgram(1, CAM)
    const viaMe = { ...settings, roles: { ...settings.roles, Static: meProgramInput(1) } }
    expect(findMatch(SLIDE_10, viaMe, CAM, s.getState())).toMatchObject({ kind: 'match', objectId: 'B', how: 'via-me' })
  })

  test('keys on air in the M/E block the match unless allowed', () => {
    const s = sim()
    s.setProgram(1, CAM)
    s.setKeysOnAir(1, true)
    expect(findMatch(SLIDE_10, settings, meProgramInput(1), s.getState()).kind).toBe('none')
    expect(findMatch(SLIDE_10, { ...settings, animateWithKeysOnAir: true }, meProgramInput(1), s.getState()).kind).toBe('match')
  })

  test('same source id always matches, keys or not', () => {
    const s = sim()
    s.setKeysOnAir(1, true)
    const viaMe = { ...settings, roles: { ...settings.roles, Static: meProgramInput(1) } }
    expect(findMatch(SLIDE_10, viaMe, meProgramInput(1), s.getState())).toMatchObject({ kind: 'match', how: 'direct' })
  })

  test('unrelated source: no match', () => {
    expect(findMatch(SLIDE_10, settings, WIDE, sim().getState())).toMatchObject({ kind: 'none' })
  })

  test('two objects match: priority decides', () => {
    const both = { ...settings, roles: { ...settings.roles, Presentation: CAM } }
    expect(findMatch(SLIDE_10, both, CAM, sim().getState())).toMatchObject({ kind: 'match', objectId: 'B' })
  })
})

describe('plans', () => {
  const ctx = { ss: 0, me: 0, fps: 50, boxCount: 4, sources: { A: SLIDES, B: CAM } }

  test('IN: snap, wait, cut, then one frame per step', () => {
    const plan = planIn(SLIDE_10, 'B', ctx)
    const cutAt = plan.ops.findIndex((o) => o.op === 'cut')
    expect(plan.ops.slice(0, cutAt).filter((o) => o.op === 'wait')).toHaveLength(1)
    expect(plan.ops.filter((o) => o.op === 'wait')).toHaveLength(1 + 35)
    // Box 1 snaps to the presenter at full screen.
    expect(plan.ops[0]).toMatchObject({ op: 'box', box: 0, props: { enabled: true, source: CAM, size: 1000, x: 0 } })
  })

  test('IN with no match is a plain cut', () => {
    expect(planIn(SLIDE_10, null, ctx).ops).toEqual([{ op: 'cut', me: 0 }])
  })

  test('OUT ends with cut then restore to final form', () => {
    const ops = planOut(SLIDE_10, 'A', ctx).ops
    const cutAt = ops.findIndex((o) => o.op === 'cut')
    expect(cutAt).toBeGreaterThan(0)
    expect(ops.slice(cutAt + 2)).toContainEqual({ op: 'box', ss: 0, box: 0, props: expect.objectContaining({ source: SLIDES, size: 750 }) })
  })

  test('too many objects for the SuperSource is an error', () => {
    expect(() => planIn(byId('slide-12'), 'B', { ...ctx, boxCount: 3 })).toThrow(/4 boxes/)
  })
})

describe('engine with the simulator', () => {
  test('full show: load, IN from presenter, OUT to slides', async () => {
    const s = sim()
    const engine = new Engine(s, settings, DESIGNS)
    s.setProgram(0, CAM)
    s.setPreview(0, WIDE)

    await drive(s, engine.load('slide-10'))
    expect(s.getState().mixEffects[0].preview).toBe(ssInput(0))
    expect(engine.nextTake()).toMatchObject({ action: 'in', match: { objectId: 'B' } })

    // IN: on the cut frame, program shows the presenter box full screen.
    const take = engine.take()
    const seenOnCut: number[] = []
    s.on('state', (st) => {
      if (st.mixEffects[0].program === ssInput(0) && seenOnCut.length === 0) seenOnCut.push(st.superSources[0].boxes[0].size)
    })
    await drive(s, take)
    expect(seenOnCut[0]).toBe(1000)
    expect(isOnAir(s.getState(), 0)).toBe(true)
    expect(engine.slots[0].phase).toBe('on-air')
    expect(fromRaw(s.getState().superSources[0].boxes[0])).toEqual(SLIDE_10.objects[1].final)

    // OUT to the slides on preview.
    s.setPreview(0, SLIDES)
    expect(engine.nextTake()).toMatchObject({ action: 'out', match: { objectId: 'A' } })
    await drive(s, engine.take())
    expect(s.getState().mixEffects[0].program).toBe(SLIDES)
    expect(s.getState().mixEffects[0].preview).toBe(ssInput(0))
    expect(engine.slots[0].phase).toBe('armed')
    // Back in final form, design order, ready on preview.
    expect(fromRaw(s.getState().superSources[0].boxes[0])).toEqual(SLIDE_10.objects[0].final)
    expect(engine.log.map((l) => `${l.action}:${l.kind}:${l.transition}`)).toEqual(['out:animated:out:A', 'in:animated:in:B'])
  })

  test('a take made on the panel never animates', async () => {
    const s = sim()
    const engine = new Engine(s, settings, DESIGNS)
    await drive(s, engine.load('slide-10'))
    const before = structuredClone(s.getState().superSources[0].boxes)
    s.cut(0)
    expect(engine.slots[0].phase).toBe('on-air')
    expect(s.getState().superSources[0].boxes).toEqual(before)
    // It's logged, so the app can say why nothing moved.
    expect(engine.log[0]).toMatchObject({ action: 'in', kind: 'elsewhere', designId: 'slide-10' })
  })

  test('a plain SS CUT from Companion is logged as a cut with its reason, not as a switcher take', async () => {
    const s = sim()
    const engine = new Engine(s, settings, DESIGNS)
    await drive(s, engine.load('slide-10'))
    s.setProgram(0, WIDE) // nothing in the layout shows the wide shot
    await drive(s, engine.take())
    expect(engine.log.map((l) => l.kind)).toEqual(['plain'])
    expect(engine.log[0].detail).toMatch(/Nothing in/)
  })

  test('loading is refused while the only SuperSource is on air', async () => {
    const s = sim()
    const engine = new Engine(s, settings, DESIGNS)
    await drive(s, engine.load('slide-10'))
    s.cut(0)
    await expect(engine.load('slide-11')).rejects.toThrow(/No free SuperSource/)
  })

  test('SS AUTO with no match mixes instead of cutting', async () => {
    const s = new SimSwitcher({ mixFrames: 10 })
    const engine = new Engine(s, settings, DESIGNS)
    s.setProgram(0, WIDE) // nothing in Slide 10 shows the wide shot
    await drive(s, engine.load('slide-10'))
    expect(engine.nextTake()).toMatchObject({ action: 'in', match: { kind: 'none' } })
    await engine.take({ fallback: 'auto' })
    expect(s.getState().mixEffects[0].inTransition).toBe(true)
    expect((await engine.take()).action).toBe('none') // refused mid-mix
    for (let i = 0; i < 10; i++) s.tick()
    expect(s.getState().mixEffects[0]).toMatchObject({ program: ssInput(0), inTransition: false })
    expect(engine.slots[0].phase).toBe('on-air')
  })

  test('designTally follows the switcher', async () => {
    const s = sim()
    const engine = new Engine(s, settings, DESIGNS)
    expect(designTally(s.getState(), engine.slots, 'slide-10').tally).toBe('none')
    await drive(s, engine.load('slide-10'))
    expect(designTally(s.getState(), engine.slots, 'slide-10')).toEqual({ tally: 'pvw', ss: 0 })
    s.cut(0)
    expect(designTally(s.getState(), engine.slots, 'slide-10').tally).toBe('pgm')
  })

  test('restore carries loaded layouts over without sending anything', async () => {
    const s = sim()
    const first = new Engine(s, settings, DESIGNS)
    await drive(s, first.load('slide-10'))
    s.cut(0)
    first.dispose()
    const before = structuredClone(s.getState())
    const second = new Engine(s, settings, DESIGNS)
    second.restore(first.slots.map((x) => x.designId))
    expect(second.slots[0]).toMatchObject({ designId: 'slide-10', phase: 'on-air' })
    expect(s.getState()).toEqual(before)
    // The old engine no longer reacts.
    s.cut(0)
    expect(first.slots[0].phase).toBe('on-air')
    expect(second.slots[0].phase).toBe('armed')
  })

  test('a take that fails partway reports why and leaves no stuck phase', async () => {
    const s = sim()
    const engine = new Engine(s, settings, DESIGNS)
    await drive(s, engine.load('slide-10'))
    const run = s.run.bind(s)
    s.run = () => Promise.reject(new Error('Not connected to the switcher'))
    const res = await engine.take()
    expect(res).toEqual({ action: 'none', reason: 'The take stopped: Not connected to the switcher' })
    expect(engine.slots[0].phase).toBe('armed')
    s.run = run
  })

  test('load with no SuperSource says why', async () => {
    const s = new SimSwitcher({ superSourceCount: 0 })
    const engine = new Engine(s, settings, DESIGNS)
    await expect(engine.load('slide-10')).rejects.toThrow(/isn't connected, or it has no SuperSource/)
  })

  test('4 M/E with two SuperSources loads into the idle one', async () => {
    const s = new SimSwitcher({ superSourceCount: 2 })
    const engine = new Engine(s, settings, DESIGNS)
    await drive(s, engine.load('slide-10'))
    s.cut(0)
    const slot = await drive(s, engine.load('slide-11'))
    expect(slot.ss).toBe(1)
  })

  test('4 M/E: an animated take works on the second SuperSource too', async () => {
    const s = new SimSwitcher({ meCount: 4, superSourceCount: 2 })
    const engine = new Engine(s, settings, DESIGNS)
    s.setProgram(0, CAM)
    // SS1 goes in and out again, so it's loaded but free.
    await drive(s, engine.load('slide-10'))
    await drive(s, engine.take())
    s.setPreview(0, CAM)
    await drive(s, engine.take())
    // The next layout goes to SS2, the idle one, and animates in from the camera.
    const slot = await drive(s, engine.load('slide-11'))
    expect(slot.ss).toBe(1)
    expect(engine.nextTake()).toMatchObject({ action: 'in', ss: 1, match: { kind: 'match' } })
    await drive(s, engine.take())
    expect(engine.log[0]).toMatchObject({ kind: 'animated', ss: 1, designId: 'slide-11' })
    expect(s.getState().mixEffects[0].program).toBe(ssInput(1))
  })

  test('taking one layout straight over another cuts, because a SuperSource is on the bus', async () => {
    const s = new SimSwitcher({ meCount: 4, superSourceCount: 2 })
    const engine = new Engine(s, settings, DESIGNS)
    s.setProgram(0, CAM)
    await drive(s, engine.load('slide-10'))
    await drive(s, engine.take())
    await drive(s, engine.load('slide-11'))
    // It takes SS1 out to SS2 on preview, which is a plain cut: there's no camera to animate to.
    expect(engine.nextTake()).toMatchObject({ action: 'out', ss: 0, match: { kind: 'none', reason: expect.stringMatching(/SuperSource is on the bus/) } })
  })
})

describe('saved shows', () => {
  const old: ShowSettings = { ...DEFAULT_SETTINGS, roles: { Presenter: 7, Slides: 8, Wide: 3, Guest: 4, Lectern: 9 }, groups: undefined as unknown as string[] }
  const oldDesign = {
    ...SLIDE_10,
    objects: SLIDE_10.objects.map((o) => ({ ...o, name: o.id === 'A' ? 'Slides' : 'My cam', source: { role: o.id === 'A' ? 'Slides' : 'Presenter' } })),
  }

  test('old role names move to the new ones and keep their inputs', () => {
    const { designs, settings } = migrateShow([oldDesign], old)
    expect(settings.roles).toMatchObject({ Presentation: 8, Static: 7, 'Camera 3': 4, Wide: 3, Lectern: 9, 'Presentation 2': 2 })
    expect(settings.roles.Slides).toBeUndefined()
    expect(designs[0].objects.map((o) => [o.name, o.source])).toEqual([
      ['Presentation', { role: 'Presentation' }],
      ['My cam', { role: 'Static' }],
    ])
    expect(settings.groups).toEqual([GROUP_PRES])
  })

  test('running it twice changes nothing', () => {
    const once = migrateShow([oldDesign], old)
    expect(migrateShow(once.designs, once.settings)).toEqual(once)
  })
})

describe('updating a saved show', () => {
  // A show saved by 0.1.2, exactly as that version shipped it, plus a layout of the user's own.
  const old02 = { ...byId('slide-04'), name: 'Four up', group: 'Grid', transitions: {} }
  const mine = { ...SLIDE_10_PUSH, id: 'custom-1', name: 'My layout', group: 'Grid' }
  const saved = {
    designs: [{ ...SLIDE_10, group: 'Main + side column' }, old02, mine],
    shortlist: ['slide-10', 'custom-1', 'slide-04'],
    settings: { ...DEFAULT_SETTINGS, groups: ['Main + side column', 'Grid'], takeMe: 1, roles: { ...DEFAULT_SETTINGS.roles, Static: 12 } },
    knownStarters: ['slide-10', 'slide-10-push', 'slide-11', 'slide-12', 'slide-02', 'slide-03', 'slide-04', 'two-presentations'],
  }

  test('an untouched old starter is updated to this version', () => {
    expect(fingerprint(old02)).toBe('0ded8f4b') // what 0.1.0 to 0.1.2 shipped
    const show = upgradeShow(saved)
    expect(show.designs.find((d) => d.id === 'slide-04')).toEqual(byId('slide-04'))
    expect(show.starterPrints['slide-04']).toBe(fingerprint(byId('slide-04')))
  })

  test('the Active list, settings and your own layouts come through exactly as saved', () => {
    const show = upgradeShow(saved)
    expect(show.shortlist).toEqual(saved.shortlist)
    expect(show.settings.takeMe).toBe(1)
    expect(show.settings.roles.Static).toBe(12)
    expect(show.designs.find((d) => d.id === 'custom-1')).toEqual(mine)
    // Its group is still there, because it's still in use.
    expect(show.settings.groups).toEqual([GROUP_PRES, GROUP_GRID, 'Grid'])
  })

  test('a starter you changed is never replaced, by any later update', () => {
    const edited = { ...old02, transitions: { 'in:A': { A: { delayMs: 0, durationMs: 1200, easing: 'linear' as const } } } }
    const first = upgradeShow({ ...saved, designs: [edited, mine] })
    expect(first.designs.find((d) => d.id === 'slide-04')).toEqual(edited)
    const again = upgradeShow(first)
    expect(again.designs.find((d) => d.id === 'slide-04')).toEqual(edited)
  })

  test('edits made after an update survive the next update', () => {
    const show = upgradeShow(saved)
    const renamed = show.designs.map((d) => (d.id === 'slide-04' ? { ...d, name: 'My grid' } : d))
    const again = upgradeShow({ ...show, designs: renamed })
    expect(again.designs.find((d) => d.id === 'slide-04')!.name).toBe('My grid')
  })

  test('nothing is deleted: the old Slides + presenter stays, moved to the new group', () => {
    const show = upgradeShow(saved)
    expect(show.designs.find((d) => d.id === 'slide-10')).toEqual(SLIDE_10)
    // A starter you deleted doesn't come back.
    const without = upgradeShow({ ...show, designs: show.designs.filter((d) => d.id !== 'slide-12') })
    expect(without.designs.some((d) => d.id === 'slide-12')).toBe(false)
  })

  test('a show from 0.1.3 (no fingerprints yet) keeps its edits too', () => {
    const fromV013 = { ...freshShow(), starterPrints: undefined, designs: freshShow().designs.map((d) => (d.id === 'slide-02' ? { ...d, name: 'Interview' } : d)) }
    const show = upgradeShow(fromV013)
    expect(show.designs.find((d) => d.id === 'slide-02')!.name).toBe('Interview')
    expect(show.starterPrints['slide-02']).toBeUndefined()
    expect(show.starterPrints['slide-04']).toBe(fingerprint(byId('slide-04')))
  })
})
