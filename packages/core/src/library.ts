import { DEFAULT_SETTINGS, Design, DesignObject, ShowSettings } from './model'
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

// Main + side column family share the big slides box.
const MAIN = box({ x: -4, y: 0, size: 0.75 })

export const SLIDE_10: Design = {
  id: 'slide-10',
  name: 'Slides + presenter',
  group: 'Main + side column',
  background: BACKGROUND,
  guide: 'Slide_10.PNG',
  objects: [
    obj('A', 'Presentation', 'Presentation', MAIN, 2),
    obj('B', 'Static', 'Static', box({ x: 12, y: 0, size: 0.5, cropL: 8, cropR: 8 }), 1),
  ],
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

// The same layout, but the box that isn't going full screen rides against the other one's edge:
// the slides push the static camera off (and pull it back in), and the camera pushes the slides.
export const SLIDE_10_PUSH: Design = {
  ...SLIDE_10,
  id: 'slide-10-push',
  name: 'Slides + presenter (push)',
  transitions: {
    'in:B': {
      B: { delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
      A: { placement: 'pushed', delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
    },
    'in:A': {
      A: { delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
      B: { placement: 'pushed', delayMs: 0, durationMs: 700, easing: 'easeInOutCubic' },
    },
    'out:B': {
      B: { delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
      A: { placement: 'pushed', delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
    },
    'out:A': {
      A: { delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
      B: { placement: 'pushed', delayMs: 0, durationMs: 600, easing: 'easeInOutCubic' },
    },
  },
}

const SIDE = (y: number) => box({ x: 12, y, size: 0.25 })

export const SLIDE_11: Design = {
  id: 'slide-11',
  name: 'Slides + two side boxes',
  group: 'Main + side column',
  background: BACKGROUND,
  guide: 'Slide_11.PNG',
  objects: [obj('A', 'Presentation', 'Presentation', MAIN, 3), obj('B', 'Static', 'Static', SIDE(3), 1), obj('C', 'Wide', 'Wide', SIDE(-3), 2)],
  transitions: {},
}

export const SLIDE_12: Design = {
  id: 'slide-12',
  name: 'Slides + three side boxes',
  group: 'Main + side column',
  background: BACKGROUND,
  guide: 'Slide_12.PNG',
  objects: [
    obj('A', 'Presentation', 'Presentation', MAIN, 4),
    obj('B', 'Static', 'Static', SIDE(4.5), 1),
    obj('C', 'Wide', 'Wide', SIDE(0), 2),
    obj('D', 'Camera 3', 'Camera 3', SIDE(-4.5), 3),
  ],
  transitions: {},
}

export const SLIDE_02: Design = {
  id: 'slide-02',
  name: 'Two up',
  group: 'Grid',
  background: BACKGROUND,
  guide: 'Slide_02.PNG',
  objects: [
    obj('A', 'Static', 'Static', box({ x: -7.5, y: 0, size: 0.75, cropL: 6, cropR: 6 }), 1),
    obj('B', 'Presentation', 'Presentation', box({ x: 7.5, y: 0, size: 0.75, cropL: 6, cropR: 6 }), 2),
  ],
  transitions: {},
}

const PORTRAIT = (x: number) => box({ x, y: 0, size: 0.7, cropL: 8.5, cropR: 8.5 })

export const SLIDE_03: Design = {
  id: 'slide-03',
  name: 'Three portrait',
  group: 'Grid',
  background: BACKGROUND,
  guide: 'Slide_03.PNG',
  objects: [obj('A', 'Wide', 'Wide', PORTRAIT(-10.5), 2), obj('B', 'Static', 'Static', PORTRAIT(0), 1), obj('C', 'Camera 3', 'Camera 3', PORTRAIT(10.5), 3)],
  transitions: {},
}

const QUAD = (x: number, y: number) => box({ x, y, size: 0.4 })

export const SLIDE_04: Design = {
  id: 'slide-04',
  name: 'Four up',
  group: 'Grid',
  background: BACKGROUND,
  guide: 'Slide_04.PNG',
  objects: [
    obj('A', 'Static', 'Static', QUAD(-6.4, 3.6), 1),
    obj('B', 'Presentation', 'Presentation', QUAD(6.4, 3.6), 2),
    obj('C', 'Wide', 'Wide', QUAD(-6.4, -3.55), 3),
    obj('D', 'Camera 3', 'Camera 3', QUAD(6.4, -3.55), 4),
  ],
  transitions: {},
}

// Two 16:9 boxes with the same 0.8 unit margin at the edges and between them.
export const TWO_PRESENTATIONS: Design = {
  id: 'two-presentations',
  name: 'Two presentations',
  group: 'Grid',
  background: BACKGROUND,
  objects: [
    obj('A', 'Presentation', 'Presentation', box({ x: -7.8, y: 0, size: 0.4625 }), 1),
    obj('B', 'Presentation 2', 'Presentation 2', box({ x: 7.8, y: 0, size: 0.4625 }), 2),
  ],
  transitions: {},
}

// Slides 05 and 06 need 5 and 6 boxes, more than one SuperSource has. Static only in v1 (project.md §4.4).
export const STARTER_DESIGNS: Design[] = [SLIDE_10, SLIDE_10_PUSH, SLIDE_11, SLIDE_12, SLIDE_02, TWO_PRESENTATIONS, SLIDE_03, SLIDE_04]

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
