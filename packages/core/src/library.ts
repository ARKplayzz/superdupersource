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

// Which set of starter layouts a show was last brought up to. Set 2 (Default Pres and Default Grid)
// renamed and regrouped the starters and dropped the original Slides + presenter.
export const STARTER_SET = 2
const GROUP_RENAMES: Record<string, string> = { 'Main + side column': GROUP_PRES, Grid: GROUP_GRID }

// One-time update of a saved show to the current starter set: starter layouts are replaced with
// this version's (by id), the old Slides + presenter goes (its pushed copy takes its place in the
// shortlist), and layouts in the old groups move to the new ones. Layouts the user made are kept.
export function refreshStarters(
  show: { designs: Design[]; shortlist: string[]; settings: ShowSettings },
  set = 1,
): { designs: Design[]; shortlist: string[]; settings: ShowSettings; set: number } {
  if (set >= STARTER_SET) return { ...show, set }
  const starters = new Map(STARTER_DESIGNS.map((d) => [d.id, d]))
  const designs = show.designs
    .filter((d) => d.id !== 'slide-10')
    .map((d) => starters.get(d.id) ?? { ...d, group: GROUP_RENAMES[d.group] ?? d.group })
  let shortlist = show.shortlist.map((id) => (id === 'slide-10' ? 'slide-10-push' : id))
  shortlist = shortlist.filter((id, i) => shortlist.indexOf(id) === i)
  const groups = [GROUP_PRES, GROUP_GRID, ...show.settings.groups.map((g) => GROUP_RENAMES[g] ?? g).filter((g) => g !== GROUP_PRES && g !== GROUP_GRID)]
  return { designs, shortlist, settings: { ...show.settings, groups }, set: STARTER_SET }
}

// A show as saved, from any version. Older saves miss some fields.
export interface SavedShow {
  designs?: Design[]
  shortlist?: string[]
  settings?: Partial<ShowSettings>
  knownStarters?: string[]
  starterSet?: number
}

export interface CurrentShow {
  designs: Design[]
  shortlist: string[]
  settings: ShowSettings
  knownStarters: string[]
  starterSet: number
}

export const freshShow = (): CurrentShow => ({
  designs: STARTER_DESIGNS,
  shortlist: DEFAULT_SHORTLIST,
  settings: DEFAULT_SETTINGS,
  knownStarters: STARTER_DESIGNS.map((d) => d.id),
  starterSet: STARTER_SET,
})

// Brings any saved show up to date: the starter set, starters new in this version, then renamed roles.
export function upgradeShow(saved: SavedShow): CurrentShow {
  if (!saved.designs?.length) return { ...freshShow(), shortlist: saved.shortlist ?? DEFAULT_SHORTLIST }
  const settings = { ...DEFAULT_SETTINGS, ...saved.settings }
  const refreshed = refreshStarters({ designs: saved.designs, shortlist: saved.shortlist ?? DEFAULT_SHORTLIST, settings }, saved.starterSet ?? 1)
  const merged = mergeNewStarters(refreshed.designs, saved.knownStarters)
  const current = migrateShow(merged.designs, refreshed.settings)
  return { designs: current.designs, shortlist: refreshed.shortlist, settings: current.settings, knownStarters: merged.known, starterSet: refreshed.set }
}
