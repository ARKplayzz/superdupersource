import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lerpBox, visibleRect } from './geometry'
import { FINAL, TRANSITIONS, buildFrames } from './slide10'
import { BoxState, FULLSCREEN, toRaw } from './units'

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

function assertSameBox(a: BoxState, b: BoxState) {
  for (const k of Object.keys(a) as (keyof BoxState)[]) close(a[k], b[k])
}

test('lerpBox hits both endpoints exactly', () => {
  assertSameBox(lerpBox(FULLSCREEN, FINAL.B, 0), FULLSCREEN)
  assertSameBox(lerpBox(FULLSCREEN, FINAL.B, 1), FINAL.B)
})

test('visible edges move linearly while size and crop both change', () => {
  const a = visibleRect(FULLSCREEN)
  const b = visibleRect(FINAL.B)
  for (let i = 0; i <= 20; i++) {
    const k = i / 20
    const r = visibleRect(lerpBox(FULLSCREEN, FINAL.B, k))
    close(r.l, a.l + (b.l - a.l) * k, 1e-6)
    close(r.r, a.r + (b.r - a.r) * k, 1e-6)
    close(r.t, a.t + (b.t - a.t) * k, 1e-6)
    close(r.b, a.b + (b.b - a.b) * k, 1e-6)
  }
})

test('every frame of every transition stays inside ATEM ranges', () => {
  for (const tr of Object.values(TRANSITIONS)) {
    for (const fps of [25, 50, 59.94]) {
      for (const frame of buildFrames(tr, fps)) {
        for (const b of frame) {
          const raw = toRaw(b)
          assert.ok(raw.size! >= 70 && raw.size! <= 1000, `${tr.name}: size ${raw.size}`)
          assert.ok(Math.abs(raw.x!) <= 4800 && Math.abs(raw.y!) <= 2700, `${tr.name}: pos ${raw.x},${raw.y}`)
          for (const c of [raw.cropTop!, raw.cropBottom!]) assert.ok(c >= 0 && c <= 18000)
          for (const c of [raw.cropLeft!, raw.cropRight!]) assert.ok(c >= 0 && c <= 32000)
        }
      }
    }
  }
})

test('in-from-cam is 35 frames at 1080p50 and starts with the camera full screen on top', () => {
  const frames = buildFrames(TRANSITIONS['in-from-cam'], 50)
  assert.equal(frames.length - 1, 35)
  assert.deepEqual(TRANSITIONS['in-from-cam'].boxOrder[0], 'B')
  assertSameBox(frames[0][0], FULLSCREEN)
  assertSameBox(frames[frames.length - 1][0], FINAL.B)
})

test('Slide 10 boxes match the measured template cutouts (within the 3 px outline)', () => {
  const px = (r: ReturnType<typeof visibleRect>) => ({
    l: 960 + r.l * 60,
    r: 960 + r.r * 60,
    t: 540 - r.t * 60,
    b: 540 - r.b * 60,
  })
  // Cutouts measured from Slide_10.PNG: A x4-1437 y136-941, B x1444-1915 y273-806.
  const a = px(visibleRect(FINAL.A))
  const b = px(visibleRect(FINAL.B))
  for (const [got, want] of [
    [a.l, 4], [a.r, 1438], [a.t, 136], [a.b, 942],
    [b.l, 1444], [b.r, 1916], [b.t, 273], [b.b, 807],
  ]) {
    assert.ok(Math.abs(got - want) <= 4, `edge at ${got}px, cutout at ${want}px`)
  }
})
