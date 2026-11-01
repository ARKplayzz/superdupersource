import { DEFAULT_SETTINGS, Design, DesignObject, Motion, Placement, ShowSettings } from './model'
import { DEFAULT_MATCHED_MOTION } from './transitions'
import { box } from './units'

// Starter designs built from the cutout templates in Supersources-templates/.
// Geometry measured from each template's alpha channel (project.md §3). Boxes are sized to cover
// the cutout plus its ~3 px outline. Animated designs sit on the plain Slide 01 background; the
// cutout slide is only a guide in the designer.

const BACKGROUND = { file: 'Slide_01.PNG' }

const obj = (id: string, name: string, role: string, final: DesignObject['final'], matchPriority: number): DesignObject => ({
  id,
  name,
  source: { role },
  final,
  matchPriority,
})

// Default motion times, a little slower than the switcher-panel feel: IN and OUT for the box going
// full screen. Boxes riding against it take the same timing.
const IN_MS = DEFAULT_MATCHED_MOTION.in.durationMs
const OUT_MS = DEFAULT_MATCHED_MOTION.out.durationMs

// Every IN and OUT for a layout. `others` picks what the boxes not going full screen do:
// 'pushed' rides against the full-screen box; 'in-place' stays put and is revealed or covered.
function transitions(ids: string[], others: (matched: string) => Placement): Design['transitions'] {
  const out: Design['transitions'] = {}
  for (const dir of ['in', 'out'] as const) {
    const ms = dir === 'in' ? IN_MS : OUT_MS
    for (const matched of ids) {
      const placement = others(matched)
      out[`${dir}:${matched}`] = Object.fromEntries(
        ids.map((id): [string, Motion] =>
          id === matched
            ? [id, { delayMs: 0, durationMs: ms, easing: 'easeInOutCubic' }]
            : [id, placement === 'pushed' ? { placement, delayMs: 0, durationMs: ms, easing: 'easeInOutCubic' } : { placement, delayMs: 0, durationMs: 0, easing: 'linear' }],
        ),
      )
    }
  }
  return out
}
const PUSHED = () => 'pushed' as const
const IN_PLACE = () => 'in-place' as const

export const GROUP_PRES = 'Default Pres'
export const GROUP_GRID = 'Default Grid'

// The slides family share the big presentation box.
const MAIN = box({ x: -4, y: 0, size: 0.75 })
const PRESENTER = box({ x: 12, y: 0, size: 0.5, cropL: 8, cropR: 8 })

// The original Slides + presenter, with hand-set motions (camera revealed, slides sliding in).
// No longer shipped: the pushed version replaced it. Kept for the tests of custom and reversed motion.
export const SLIDE_10: Design = {
  id: 'slide-10',
  name: 'Slides + presenter',
  group: GROUP_PRES,
  background: BACKGROUND,
  guide: 'Slide_10.PNG',
  objects: [obj('A', 'Presentation', 'Presentation', MAIN, 2), obj('B', 'Static', 'Static', PRESENTER, 1)],
  transitions: {
    'in:B': {
      B: { delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
      A: { placement: 'in-place', delayMs: 0, durationMs: 0, easing: 'linear' },
    },
    'in:A': {
      A: { delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
      B: { placement: 'offscreen-right', delayMs: 120, durationMs: 600, easing: 'easeOutCubic' },
    },
    'out:B': {
      B: { delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
      A: { placement: 'offscreen-left', delayMs: 0, durationMs: 500, easing: 'easeInCubic' },
    },
    'out:A': {
      A: { delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
      B: { placement: 'offscreen-right', delayMs: 0, durationMs: 400, easing: 'easeInCubic' },
    },
  },
}

// Slides and the presenter camera. Each box rides against the other: the slides push the camera off
// (and pull it back in), and the camera pushes the slides. Keeps the id of the old push copy so
// shortlists and Companion buttons carry on.
export const SLIDE_10_PUSH: Design = {
  id: 'slide-10-push',
  name: 'Slides + Presenter',
  group: GROUP_PRES,
  background: BACKGROUND,
  guide: 'Slide_10.PNG',
  objects: [obj('A', 'Presentation', 'Presentation', MAIN, 2), obj('B', 'Static', 'Static', PRESENTER, 1)],
  transitions: transitions(['A', 'B'], PUSHED),
}

const SIDE = (y: number) => box({ x: 12, y, size: 0.25 })

// The slides push the cameras; a camera going full screen grows over the others, which stay put.
export const SLIDE_11: Design = {
  id: 'slide-11',
  name: 'Slides + Two Presenters',
  group: GROUP_PRES,
  background: BACKGROUND,
  guide: 'Slide_11.PNG',
  objects: [obj('A', 'Presentation', 'Presentation', MAIN, 3), obj('B', 'Static', 'Static', SIDE(3), 1), obj('C', 'Wide', 'Wide', SIDE(-3), 2)],
  transitions: transitions(['A', 'B', 'C'], (m) => (m === 'A' ? 'pushed' : 'in-place')),
}

export const SLIDE_12: Design = {
  id: 'slide-12',
  name: 'Slides + Three Presenters',
  group: GROUP_PRES,
  background: BACKGROUND,
  guide: 'Slide_12.PNG',
  objects: [
    obj('A', 'Presentation', 'Presentation', MAIN, 4),
    obj('B', 'Static', 'Static', SIDE(4.5), 1),
    obj('C', 'Wide', 'Wide', SIDE(0), 2),
    obj('D', 'Camera 3', 'Camera 3', SIDE(-4.5), 3),
  ],
  transitions: transitions(['A', 'B', 'C', 'D'], PUSHED),
}

// Two 16:9 presentations side by side, at 49% each.
export const TWO_PRESENTATIONS: Design = {
  id: 'two-presentations',
  name: 'Two Presentations',
  group: GROUP_PRES,
  background: BACKGROUND,
  objects: [
    obj('A', 'Presentation', 'Presentation', box({ x: -7.9, y: 0, size: 0.49 }), 1),
    obj('B', 'Presentation 2', 'Presentation 2', box({ x: 7.9, y: 0, size: 0.49 }), 2),
  ],
  transitions: transitions(['A', 'B'], PUSHED),
}

const TWO = [
  obj('A', 'Static', 'Static', box({ x: -7.5, y: 0, size: 0.75, cropL: 6, cropR: 6 }), 1),
  obj('B', 'Camera 3', 'Camera 3', box({ x: 7.5, y: 0, size: 0.75, cropL: 6, cropR: 6 }), 2),
]

export const SLIDE_02: Design = {
  id: 'slide-02',
  name: 'Two Presenters',
  group: GROUP_GRID,
  background: BACKGROUND,
  guide: 'Slide_02.PNG',
  objects: TWO,
  transitions: transitions(['A', 'B'], IN_PLACE),
}

export const SLIDE_02_PUSH: Design = { ...SLIDE_02, id: 'slide-02-push', name: 'Two Presenters Push', transitions: transitions(['A', 'B'], PUSHED) }

const PORTRAIT = (x: number) => box({ x, y: 0, size: 0.7, cropL: 8.5, cropR: 8.5 })
const THREE = [obj('A', 'Wide', 'Wide', PORTRAIT(-10.5), 2), obj('B', 'Static', 'Static', PORTRAIT(0), 1), obj('C', 'Camera 3', 'Camera 3', PORTRAIT(10.5), 3)]

export const SLIDE_03: Design = {
  id: 'slide-03',
  name: 'Three Presenters',
  group: GROUP_GRID,
  background: BACKGROUND,
  guide: 'Slide_03.PNG',
  objects: THREE,
  transitions: transitions(['A', 'B', 'C'], IN_PLACE),
}

export const SLIDE_03_PUSH: Design = { ...SLIDE_03, id: 'slide-03-push', name: 'Three Presenters Push', transitions: transitions(['A', 'B', 'C'], PUSHED) }

const QUAD = (x: number, y: number) => box({ x, y, size: 0.4 })

// Not pushed: the box going full screen grows over the other three, which stay where they are.
export const SLIDE_04: Design = {
  id: 'slide-04',
  name: 'Four Grid',
  group: GROUP_GRID,
  background: BACKGROUND,
  guide: 'Slide_04.PNG',
  objects: [
    obj('A', 'Static', 'Static', QUAD(-6.4, 3.6), 1),
    obj('B', 'Presentation', 'Presentation', QUAD(6.4, 3.6), 2),
    obj('C', 'Wide', 'Wide', QUAD(-6.4, -3.55), 3),
    obj('D', 'Camera 3', 'Camera 3', QUAD(6.4, -3.55), 4),
  ],
  transitions: transitions(['A', 'B', 'C', 'D'], IN_PLACE),
}

// Slides 05 and 06 need 5 and 6 boxes, more than one SuperSource has. Static only in v1 (project.md §4.4).
export const STARTER_DESIGNS: Design[] = [SLIDE_10_PUSH, SLIDE_11, SLIDE_12, TWO_PRESENTATIONS, SLIDE_02, SLIDE_02_PUSH, SLIDE_03, SLIDE_03_PUSH, SLIDE_04]

export const DEFAULT_SHORTLIST = ['slide-10-push', 'slide-11', 'slide-02', 'slide-04']

// The sources a show has, in the order the Sources page lists them.
export const DEFAULT_ROLES = Object.keys(DEFAULT_SETTINGS.roles)

// Roles renamed in 0.2: shows saved before then used the old names.
const ROLE_RENAMES: Record<string, string> = { Slides: 'Presentation', Presenter: 'Static', Guest: 'Camera 3' }

// Brings a saved show up to date: renamed roles (keeping their inputs), any new default roles,
// and a group order. Safe to run on a show that's already current.
export function migrateShow(designs: Design[], settings: ShowSettings): { designs: Design[]; settings: ShowSettings } {
  const roles: Record<string, number> = {}
  for (const [role, input] of Object.entries(settings.roles)) if (!ROLE_RENAMES[role]) roles[role] = input
  for (const [role, input] of Object.entries(settings.roles)) if (ROLE_RENAMES[role] && roles[ROLE_RENAMES[role]] === undefined) roles[ROLE_RENAMES[role]] = input
  for (const [role, input] of Object.entries(DEFAULT_SETTINGS.roles)) if (roles[role] === undefined) roles[role] = input
  // Default roles first, in their order, then any the user added.
  const ordered = Object.fromEntries([...DEFAULT_ROLES.map((r) => [r, roles[r]] as const), ...Object.entries(roles).filter(([r]) => !DEFAULT_ROLES.includes(r))])

  const migrated = designs.map((d) => ({
    ...d,
    objects: d.objects.map((o) => {
      if (!('role' in o.source) || !ROLE_RENAMES[o.source.role]) return o
      const old = o.source.role
      return { ...o, name: o.name === old ? ROLE_RENAMES[old] : o.name, source: { role: ROLE_RENAMES[old] } }
    }),
  }))
  const seen = [...new Set(migrated.map((d) => d.group).filter((g) => g))]
  const groups = settings.groups ? [...settings.groups, ...seen.filter((g) => !settings.groups.includes(g))] : seen
  return { designs: migrated, settings: { ...settings, roles: ordered, groups } }
}

// Starter layouts that shipped before shows remembered which ones they'd seen.
const FIRST_STARTERS = ['slide-10', 'slide-11', 'slide-12', 'slide-02', 'slide-03', 'slide-04']

// Adds starter layouts a saved show has never seen (new in this version), without bringing back
// ones the user deleted. `known` is what the show has seen before; older saves don't have it.
export function mergeNewStarters(designs: Design[], known?: string[]): { designs: Design[]; known: string[]; added: string[] } {
  const seen = new Set(known ?? [...FIRST_STARTERS, ...designs.map((d) => d.id)])
  const have = new Set(designs.map((d) => d.id))
  const added = STARTER_DESIGNS.filter((d) => !seen.has(d.id) && !have.has(d.id))
  return { designs: [...designs, ...added], known: [...new Set([...seen, ...STARTER_DESIGNS.map((d) => d.id)])], added: added.map((d) => d.id) }
}

// A short fingerprint of a layout's content (everything but its id), so an update can tell whether
// the user has changed a starter layout since it was shipped. Key order and JSON round trips don't
// change it.
export function fingerprint(design: Design): string {
  const { id: _id, ...content } = JSON.parse(JSON.stringify(design)) as Design
  const stable = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(stable).join(',')}]`
      : v && typeof v === 'object'
        ? `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
            .join(',')}}`
        : JSON.stringify(v)
  // FNV-1a, 32 bit. Plenty to spot an edit; this isn't security.
  let h = 0x811c9dc5
  for (const ch of stable(content)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// Fingerprints of the starter layouts that 0.1.0 to 0.1.2 shipped. Shows from those versions didn't
// record what they were given, so these tell an untouched old starter from one the user changed.
const LEGACY_PRINTS: Record<string, string> = {
  'slide-10': 'cd1252cf',
  'slide-10-push': '22148c3f',
  'slide-11': '1544eb20',
  'slide-12': '664106f9',
  'slide-02': '0d0a1fbc',
  'two-presentations': '60dc1897',
  'slide-03': '6bfed192',
  'slide-04': '0ded8f4b',
}

// Starters that no longer ship. An untouched copy is still updated (to its new group), never deleted.
const RETIRED: Design[] = [SLIDE_10]

// Group names the starters used before 0.1.3.
const OLD_GROUPS = ['Main + side column', 'Grid']

// Updates the starter layouts in a saved show without touching anything the user changed.
// A starter is replaced with this version's only when it's exactly as shipped: it matches the
// fingerprint recorded when the show was given it (or, for shows from before fingerprints, the
// version that release shipped). Edited starters, the user's own layouts, the Active list and
// settings are left alone. `prints` records what each starter looked like when shipped.
export function updateStarters(designs: Design[], prints: Record<string, string> = {}): { designs: Design[]; prints: Record<string, string> } {
  const current = new Map([...RETIRED, ...STARTER_DESIGNS].map((d) => [d.id, d]))
  const next = { ...prints }
  const updated = designs.map((d) => {
    const starter = current.get(d.id)
    if (!starter) return d
    const print = fingerprint(d)
    const untouched = print === prints[d.id] || (!prints[d.id] && (print === LEGACY_PRINTS[d.id] || print === fingerprint(starter)))
    if (!untouched) return d
    next[d.id] = fingerprint(starter)
    return starter
  })
  return { designs: updated, prints: next }
}

// A show as saved, from any version. Older saves miss some fields.
export interface SavedShow {
  designs?: Design[]
  shortlist?: string[]
  settings?: Partial<ShowSettings>
  knownStarters?: string[]
  starterPrints?: Record<string, string>
}

export interface CurrentShow {
  designs: Design[]
  shortlist: string[]
  settings: ShowSettings
  knownStarters: string[]
  starterPrints: Record<string, string>
}

export const freshShow = (): CurrentShow => ({
  designs: STARTER_DESIGNS,
  shortlist: DEFAULT_SHORTLIST,
  settings: DEFAULT_SETTINGS,
  knownStarters: STARTER_DESIGNS.map((d) => d.id),
  starterPrints: Object.fromEntries(STARTER_DESIGNS.map((d) => [d.id, fingerprint(d)])),
})

// Brings any saved show up to date. It only ever adds or refreshes untouched starters, adds roles
// and groups that are missing, and renames old role names; the Active list, settings, the user's own
// layouts and any edited layout come through exactly as saved.
export function upgradeShow(saved: SavedShow): CurrentShow {
  if (!saved.designs?.length) return { ...freshShow(), shortlist: saved.shortlist ?? DEFAULT_SHORTLIST }
  const refreshed = updateStarters(saved.designs, saved.starterPrints)
  const merged = mergeNewStarters(refreshed.designs, saved.knownStarters)
  const prints = { ...refreshed.prints }
  for (const id of merged.added) prints[id] = fingerprint(STARTER_DESIGNS.find((d) => d.id === id)!)

  // The starters' groups come first; an old starter group stays only while something is still in it.
  const settings = { ...DEFAULT_SETTINGS, ...saved.settings }
  const used = new Set(merged.designs.map((d) => d.group))
  const groups = [GROUP_PRES, GROUP_GRID, ...settings.groups.filter((g) => g !== GROUP_PRES && g !== GROUP_GRID && (used.has(g) || !OLD_GROUPS.includes(g)))]
  const current = migrateShow(merged.designs, { ...settings, groups })
  return { designs: current.designs, shortlist: saved.shortlist ?? DEFAULT_SHORTLIST, settings: current.settings, knownStarters: merged.known, starterPrints: prints }
}
