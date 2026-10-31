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

// Box values as the ATEM protocol carries them (the shape atem-connection uses).
export interface BoxRaw {
  enabled: boolean
  source: number
  x: number
  y: number
  size: number
  cropped: boolean
  cropTop: number
  cropBottom: number
  cropLeft: number
  cropRight: number
}

// Assumed scale, to be confirmed by spike/test-ranges: x/y in hundredths, size and crop in thousandths.
export const RAW_SCALE = { pos: 100, size: 1000, crop: 1000 }

export const LIMITS = { x: 48, y: 27, minSize: 0.07, maxSize: 1, cropTB: 18, cropLR: 32 }

export const FULLSCREEN: BoxState = { x: 0, y: 0, size: 1, cropT: 0, cropB: 0, cropL: 0, cropR: 0 }

export function box(partial: Partial<BoxState>): BoxState {
  return { ...FULLSCREEN, ...partial }
}

export function toRaw(b: BoxState): Omit<BoxRaw, 'enabled' | 'source'> {
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

export function fromRaw(r: Omit<BoxRaw, 'enabled' | 'source'>): BoxState {
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

// Template pixels (1920x1080) to ATEM units: 60 px per unit.
export const PX_PER_UNIT = 60
