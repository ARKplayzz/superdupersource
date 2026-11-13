import type { Op } from './switcher'
import { RAW_SCALE } from './units'

// ATEM macro bytes, so a whole take can be written to the switcher and run there.
//
// A macro is a list of operations, each laid out little-endian as:
//   [u16 length of the whole op][u16 op id][fields...]
// Ids and layouts follow LibAtem (github.com/LibAtem/LibAtem, MIT): MacroOperations/ and
// Common/MacroOperationType.cs. Checked against the bytes LibAtem's test fixtures recorded from a
// real switcher (TestMacroFiles/ssrc-v2.macros and macros1-v8.macros); see core.test.ts.
// SuperSource ops are the V2 ones (protocol 8.0 and later), which carry the SuperSource number.

const OP = {
  cut: 0x0004,
  sleep: 0x0007,
  boxEnable: 0x01a0,
  boxInput: 0x01a1,
  boxX: 0x01a2,
  boxY: 0x01a3,
  boxSize: 0x01a4,
  boxMaskEnable: 0x01a5,
  boxMaskTop: 0x01a6,
  boxMaskBottom: 0x01a7,
  boxMaskLeft: 0x01a8,
  boxMaskRight: 0x01a9,
} as const

// Positions, size and crop travel as 16.16 fixed point.
const FIXED = 65536

class Writer {
  private bytes: number[] = []

  op(id: number, length: number, fill: (o: DataView) => void): void {
    const buf = new DataView(new ArrayBuffer(length))
    buf.setUint16(0, length, true)
    buf.setUint16(2, id, true)
    fill(buf)
    for (let i = 0; i < length; i++) this.bytes.push(buf.getUint8(i))
  }

  box(id: number, ss: number, box: number, fill: (o: DataView) => void): void {
    this.op(id, 12, (o) => {
      o.setUint8(4, ss)
      o.setUint8(6, box)
      fill(o)
    })
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

const fixed = (o: DataView, v: number) => o.setInt32(8, Math.round(v * FIXED), true)

// The ops a take macro can hold: box changes, frame waits and cuts. Anything else is refused,
// so a plan that needs the PC (a mix, a preview change) is never half-written into a macro.
// Fields that didn't change since they were last written in this macro are left out, which keeps
// a take to a few kilobytes: most frames only move a box or two.
export function encodeMacro(ops: Op[]): Uint8Array {
  const w = new Writer()
  const last = new Map<string, unknown>()
  for (const raw of ops) {
    let op = raw
    if (raw.op === 'box') {
      const props = Object.fromEntries(
        Object.entries(raw.props).filter(([k, v]) => {
          const key = `${raw.ss}.${raw.box}.${k}`
          if (last.get(key) === v) return false
          last.set(key, v)
          return true
        }),
      )
      if (Object.keys(props).length === 0) continue
      op = { ...raw, props }
    }
    switch (op.op) {
      case 'wait':
        w.op(OP.sleep, 8, (o) => o.setUint16(4, op.frames, true))
        break
      case 'cut':
        w.op(OP.cut, 8, (o) => o.setUint8(4, op.me))
        break
      case 'box': {
        const { ss, box, props: p } = op
        if (p.enabled !== undefined) w.box(OP.boxEnable, ss, box, (o) => o.setUint8(8, p.enabled ? 1 : 0))
        if (p.source !== undefined) w.box(OP.boxInput, ss, box, (o) => o.setUint16(8, p.source!, true))
        if (p.x !== undefined) w.box(OP.boxX, ss, box, (o) => fixed(o, p.x! / RAW_SCALE.pos))
        if (p.y !== undefined) w.box(OP.boxY, ss, box, (o) => fixed(o, p.y! / RAW_SCALE.pos))
        if (p.size !== undefined) w.box(OP.boxSize, ss, box, (o) => fixed(o, p.size! / RAW_SCALE.size))
        if (p.cropped !== undefined) w.box(OP.boxMaskEnable, ss, box, (o) => o.setUint8(8, p.cropped ? 1 : 0))
        if (p.cropTop !== undefined) w.box(OP.boxMaskTop, ss, box, (o) => fixed(o, p.cropTop! / RAW_SCALE.crop))
        if (p.cropBottom !== undefined) w.box(OP.boxMaskBottom, ss, box, (o) => fixed(o, p.cropBottom! / RAW_SCALE.crop))
        if (p.cropLeft !== undefined) w.box(OP.boxMaskLeft, ss, box, (o) => fixed(o, p.cropLeft! / RAW_SCALE.crop))
        if (p.cropRight !== undefined) w.box(OP.boxMaskRight, ss, box, (o) => fixed(o, p.cropRight! / RAW_SCALE.crop))
        break
      }
      default:
        throw new Error(`A macro can't hold a "${op.op}" step`)
    }
  }
  return w.done()
}

// Ops back out of macro bytes: what the switcher will run. Used by the simulator and the tests.
export function decodeMacro(bytes: Uint8Array): Op[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ops: Op[] = []
  for (let pos = 0; pos < bytes.length; ) {
    const len = v.getUint16(pos, true)
    const id = v.getUint16(pos + 2, true)
    if (len < 4) throw new Error(`Bad macro op length ${len} at byte ${pos}`)
    const fx = () => v.getInt32(pos + 8, true) / FIXED
    const box = (props: Record<string, unknown>) => ops.push({ op: 'box', ss: v.getUint8(pos + 4), box: v.getUint8(pos + 6), props })
    switch (id) {
      case OP.sleep:
        ops.push({ op: 'wait', frames: v.getUint16(pos + 4, true) })
        break
      case OP.cut:
        ops.push({ op: 'cut', me: v.getUint8(pos + 4) })
        break
      case OP.boxEnable:
        box({ enabled: v.getUint8(pos + 8) === 1 })
        break
      case OP.boxInput:
        box({ source: v.getUint16(pos + 8, true) })
        break
      case OP.boxX:
        box({ x: Math.round(fx() * RAW_SCALE.pos) })
        break
      case OP.boxY:
        box({ y: Math.round(fx() * RAW_SCALE.pos) })
        break
      case OP.boxSize:
        box({ size: Math.round(fx() * RAW_SCALE.size) })
        break
      case OP.boxMaskEnable:
        box({ cropped: v.getUint8(pos + 8) === 1 })
        break
      case OP.boxMaskTop:
        box({ cropTop: Math.round(fx() * RAW_SCALE.crop) })
        break
      case OP.boxMaskBottom:
        box({ cropBottom: Math.round(fx() * RAW_SCALE.crop) })
        break
      case OP.boxMaskLeft:
        box({ cropLeft: Math.round(fx() * RAW_SCALE.crop) })
        break
      case OP.boxMaskRight:
        box({ cropRight: Math.round(fx() * RAW_SCALE.crop) })
        break
      default:
        throw new Error(`Unknown macro op 0x${id.toString(16)} at byte ${pos}`)
    }
    pos += len
  }
  return ops
}

// Whether an op list can be written as a macro (no PC-only steps).
export const macroable = (ops: Op[]): boolean => ops.every((o) => o.op === 'wait' || o.op === 'cut' || o.op === 'box')

// A short fingerprint of macro bytes. It goes in the macro's name, so the app can tell whether
// what's on the switcher is still current, even after a restart.
export function macroHash(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// Every macro the app writes is named with this prefix; slots named otherwise are never touched.
export const MACRO_PREFIX = 'SDS'
