import { Design, DesignObject } from './model'
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
    obj('A', 'Slides', 'Slides', MAIN, 2),
    obj('B', 'Presenter', 'Presenter', box({ x: 12, y: 0, size: 0.5, cropL: 8, cropR: 8 }), 1),
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

const SIDE = (y: number) => box({ x: 12, y, size: 0.25 })

export const SLIDE_11: Design = {
  id: 'slide-11',
  name: 'Slides + two side boxes',
  group: 'Main + side column',
  background: BACKGROUND,
  guide: 'Slide_11.PNG',
  objects: [obj('A', 'Slides', 'Slides', MAIN, 3), obj('B', 'Presenter', 'Presenter', SIDE(3), 1), obj('C', 'Wide', 'Wide', SIDE(-3), 2)],
  transitions: {},
}

export const SLIDE_12: Design = {
  id: 'slide-12',
  name: 'Slides + three side boxes',
  group: 'Main + side column',
  background: BACKGROUND,
  guide: 'Slide_12.PNG',
  objects: [
    obj('A', 'Slides', 'Slides', MAIN, 4),
    obj('B', 'Presenter', 'Presenter', SIDE(4.5), 1),
    obj('C', 'Wide', 'Wide', SIDE(0), 2),
    obj('D', 'Guest', 'Guest', SIDE(-4.5), 3),
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
    obj('A', 'Presenter', 'Presenter', box({ x: -7.5, y: 0, size: 0.75, cropL: 6, cropR: 6 }), 1),
    obj('B', 'Slides', 'Slides', box({ x: 7.5, y: 0, size: 0.75, cropL: 6, cropR: 6 }), 2),
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
  objects: [obj('A', 'Wide', 'Wide', PORTRAIT(-10.5), 2), obj('B', 'Presenter', 'Presenter', PORTRAIT(0), 1), obj('C', 'Guest', 'Guest', PORTRAIT(10.5), 3)],
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
    obj('A', 'Presenter', 'Presenter', QUAD(-6.4, 3.6), 1),
    obj('B', 'Slides', 'Slides', QUAD(6.4, 3.6), 2),
    obj('C', 'Wide', 'Wide', QUAD(-6.4, -3.55), 3),
    obj('D', 'Guest', 'Guest', QUAD(6.4, -3.55), 4),
  ],
  transitions: {},
}

// Slides 05 and 06 need 5 and 6 boxes, more than one SuperSource has. Static only in v1 (project.md §4.4).
export const STARTER_DESIGNS: Design[] = [SLIDE_10, SLIDE_11, SLIDE_12, SLIDE_02, SLIDE_03, SLIDE_04]

export const DEFAULT_ROLES = ['Presenter', 'Slides', 'Wide', 'Guest']
