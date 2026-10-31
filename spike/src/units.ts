import { Enums, VideoState } from 'atem-connection'

type SuperSourceBox = VideoState.SuperSource.SuperSourceBox

// Box values in the units ATEM Software Control shows:
// x -48..48, y -27..27, size 0.07..1.00, crop 0..18 (top/bottom), 0..32 (left/right).
// The frame is 32 units wide and 18 tall, centred on 0,0, y up.
export interface BoxState {
  x: number
  y: number
  size: number
  cropT: number
  cropB: number
  cropL: number
  cropR: number
}

// atem-connection sends raw integers. Assumed scale, which test-ranges confirms:
// x/y in hundredths, size and crop in thousandths.
export const RAW_SCALE = { pos: 100, size: 1000, crop: 1000 }

export const FULLSCREEN: BoxState = { x: 0, y: 0, size: 1, cropT: 0, cropB: 0, cropL: 0, cropR: 0 }

export function box(partial: Partial<BoxState>): BoxState {
  return { ...FULLSCREEN, ...partial }
}

export function toRaw(b: BoxState): Partial<SuperSourceBox> {
  const crops = [b.cropT, b.cropB, b.cropL, b.cropR].map((c) => Math.round(c * RAW_SCALE.crop))
  return {
    x: Math.round(b.x * RAW_SCALE.pos),
    y: Math.round(b.y * RAW_SCALE.pos),
    size: Math.round(b.size * RAW_SCALE.size),
    cropped: crops.some((c) => c > 0),
    cropTop: crops[0],
    cropBottom: crops[1],
    cropLeft: crops[2],
    cropRight: crops[3],
  }
}

export function fromRaw(r: SuperSourceBox): BoxState {
  const c = r.cropped ? 1 / RAW_SCALE.crop : 0
  return {
    x: r.x / RAW_SCALE.pos,
    y: r.y / RAW_SCALE.pos,
    size: r.size / RAW_SCALE.size,
    cropT: r.cropTop * c,
    cropB: r.cropBottom * c,
    cropL: r.cropLeft * c,
    cropR: r.cropRight * c,
  }
}

// Frames per second as the switcher counts them for macro waits.
// Interlaced modes count frames, not fields.
const FPS: Partial<Record<Enums.VideoMode, number>> = {
  [Enums.VideoMode.N525i5994NTSC]: 29.97,
  [Enums.VideoMode.P625i50PAL]: 25,
  [Enums.VideoMode.N525i5994169]: 29.97,
  [Enums.VideoMode.P625i50169]: 25,
  [Enums.VideoMode.P720p50]: 50,
  [Enums.VideoMode.N720p5994]: 59.94,
  [Enums.VideoMode.P1080i50]: 25,
  [Enums.VideoMode.N1080i5994]: 29.97,
  [Enums.VideoMode.N1080p2398]: 23.976,
  [Enums.VideoMode.N1080p24]: 24,
  [Enums.VideoMode.P1080p25]: 25,
  [Enums.VideoMode.N1080p2997]: 29.97,
  [Enums.VideoMode.P1080p50]: 50,
  [Enums.VideoMode.N1080p5994]: 59.94,
  [Enums.VideoMode.N1080p30]: 30,
  [Enums.VideoMode.N1080p60]: 60,
  [Enums.VideoMode.N4KHDp2398]: 23.976,
  [Enums.VideoMode.N4KHDp24]: 24,
  [Enums.VideoMode.P4KHDp25]: 25,
  [Enums.VideoMode.N4KHDp2997]: 29.97,
  [Enums.VideoMode.P4KHDp5000]: 50,
  [Enums.VideoMode.N4KHDp5994]: 59.94,
  [Enums.VideoMode.N8KHDp2398]: 23.976,
  [Enums.VideoMode.N8KHDp24]: 24,
  [Enums.VideoMode.P8KHDp25]: 25,
  [Enums.VideoMode.N8KHDp2997]: 29.97,
  [Enums.VideoMode.P8KHDp50]: 50,
  [Enums.VideoMode.N8KHDp5994]: 59.94,
}

export function fpsFor(mode: Enums.VideoMode): number {
  const fps = FPS[mode]
  if (!fps) throw new Error(`Unknown video mode ${mode}`)
  return fps
}
