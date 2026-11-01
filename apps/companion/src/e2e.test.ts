// The module's client against the app's real local API server, with the simulator underneath.
import { afterEach, describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS, Engine, STARTER_DESIGNS, SimSwitcher } from '@sds/core'
import type { RemoteState } from '@sds/protocol'
import { LocalApi } from '../../desktop/src/main/localApi'
import { AppConnection } from './connection.js'
import { feedbacks, presets, signature, variableValues } from './definitions.js'

const PORT = 18710

function until(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const check = () => {
      if (pred()) return resolve()
      if (Date.now() - t0 > timeoutMs) return reject(new Error('timed out'))
      setTimeout(check, 10)
    }
    check()
  })
}

function setup() {
  const switcher = new SimSwitcher({ fps: 50, mixFrames: 10 })
  switcher.start()
  const designs = structuredClone(STARTER_DESIGNS)
  const shortlist = ['slide-10', 'slide-11']
  const engine = new Engine(switcher, DEFAULT_SETTINGS, designs)
  const api = new LocalApi({ engine, switcher, designs: () => designs, shortlist: () => shortlist, settings: () => DEFAULT_SETTINGS, version: 'test' })
  const conn = new AppConnection('127.0.0.1', PORT, 'test')
  const statuses: string[] = []
  conn.onStatus = (s) => statuses.push(s)
  return { switcher, engine, api, conn, statuses, designs, shortlist }
}

let cleanup: (() => Promise<void>) | null = null
afterEach(async () => {
  await cleanup?.()
  cleanup = null
})

describe('Companion module <-> app', () => {
  test('load, tally, animated take in and out', async () => {
    const t = setup()
    cleanup = async () => {
      t.conn.close()
      await t.api.close()
      t.switcher.stop()
    }
    await t.api.listen(PORT, false)
    expect(t.api.status).toMatchObject({ listening: true, host: '127.0.0.1' })
    t.conn.connect()
    await until(() => t.conn.state !== null)
    expect(t.statuses).toContain('ok')
    await until(() => t.api.status.clients === 1)

    const state = () => t.conn.state as RemoteState
    // Shortlist first, in shortlist order.
    expect(state().designs.slice(0, 2).map((d) => d.id)).toEqual(['slide-10', 'slide-11'])
    expect(state().next.action).toBe('none')

    // Feedback callbacks read the live state.
    const fb = feedbacks(() => t.conn.state)
    const tally = (designId: string, s: 'pgm' | 'pvw' | 'loaded') =>
      (fb.design_tally as any).callback({ options: { designId, state: s } }, {}) as boolean
    const ready = (kind: 'animated' | 'plain' | 'any') => (fb.take_ready as any).callback({ options: { kind } }, {}) as boolean

    expect(await t.conn.request({ type: 'load', designId: 'slide-10' })).toEqual({ ok: true })
    await until(() => tally('slide-10', 'pvw'))
    expect(ready('animated')).toBe(true) // presenter cam is on program, and it's in the layout
    expect(variableValues(state())).toMatchObject({ next_take: 'Slides + presenter: in from Static', next_animated: true, ss1_layout: 'Slides + presenter' })

    // SS CUT: animated IN. The result comes back once the take has finished.
    expect(await t.conn.request({ type: 'take', fallback: 'cut' })).toEqual({ ok: true })
    await until(() => tally('slide-10', 'pgm'))
    expect(state().slots[0].phase).toBe('on-air')

    // After the IN, the presenter cam is back on preview, so OUT would go to the presenter.
    expect(state().next.headline).toBe('Slides + presenter: out to Static')
    // Put the slides on preview instead.
    t.switcher.setPreview(0, 2)
    await until(() => state().next.headline === 'Slides + presenter: out to Presentation')
    expect(await t.conn.request({ type: 'take', fallback: 'cut' })).toEqual({ ok: true })
    await until(() => tally('slide-10', 'pvw'))
    expect(t.switcher.getState().mixEffects[0].program).toBe(2)
    expect(t.engine.log.map((l) => l.transition)).toEqual(['out:A', 'in:B'])
  })

  test('errors come back as messages, not exceptions', async () => {
    const t = setup()
    cleanup = async () => {
      t.conn.close()
      await t.api.close()
      t.switcher.stop()
    }
    await t.api.listen(PORT, false)
    t.conn.connect()
    await until(() => t.conn.state !== null)
    expect(await t.conn.request({ type: 'take', fallback: 'cut' })).toEqual({ ok: false, message: 'No loaded layout on program or preview' })
    expect(await t.conn.request({ type: 'load', designId: 'nope' })).toMatchObject({ ok: false, message: 'Unknown design nope' })
  })

  test('SS AUTO mixes when nothing matches', async () => {
    const t = setup()
    cleanup = async () => {
      t.conn.close()
      await t.api.close()
      t.switcher.stop()
    }
    await t.api.listen(PORT, false)
    t.conn.connect()
    await until(() => t.conn.state !== null)
    t.switcher.setProgram(0, 3) // wide shot: not in Slide 10
    await t.conn.request({ type: 'load', designId: 'slide-10' })
    await until(() => t.conn.state?.next.action === 'in')
    expect(t.conn.state?.next.animated).toBe(false)
    expect(await t.conn.request({ type: 'take', fallback: 'auto' })).toEqual({ ok: true })
    expect(t.switcher.getState().mixEffects[0].inTransition).toBe(true)
    await until(() => t.conn.state?.designs.find((d) => d.id === 'slide-10')?.tally === 'pgm')
  })

  test('reconnects after the app restarts', async () => {
    const t = setup()
    cleanup = async () => {
      t.conn.close()
      await t.api.close()
      t.switcher.stop()
    }
    await t.api.listen(PORT, false)
    t.conn.connect()
    await until(() => t.conn.state !== null)
    await t.api.close()
    await until(() => t.statuses.at(-1) === 'failed')
    await t.api.listen(PORT, false)
    await until(() => t.statuses.at(-1) === 'ok', 5000)
  })

  test('port already in use is reported, not thrown', async () => {
    const a = setup()
    const b = setup()
    cleanup = async () => {
      await a.api.close()
      await b.api.close()
      a.switcher.stop()
      b.switcher.stop()
    }
    await a.api.listen(PORT, false)
    await b.api.listen(PORT, false)
    expect(b.api.status).toMatchObject({ listening: false, error: `Port ${PORT} is already in use` })
  })
})

describe('definitions', () => {
  test('presets group layouts by library group, shortlisted first, plus the take buttons', async () => {
    const t = setup()
    cleanup = async () => {
      t.conn.close()
      await t.api.close()
      t.switcher.stop()
    }
    await t.api.listen(PORT, false)
    t.conn.connect()
    await until(() => t.conn.state !== null)
    const p = presets(t.conn.state, 'sds')
    expect(p.structure.map((s) => s.id)).toEqual(['takes', 'layouts'])
    const groups = p.structure[1].definitions as { name: string; presets: string[] }[]
    expect(groups.map((g) => g.name)).toEqual(['Main + side column', 'Grid'])
    expect(groups[0].presets.slice(0, 2)).toEqual(['layout-slide-10', 'layout-slide-11'])
    expect(p.presets['next-take']).toMatchObject({ style: { text: '$(sds:next_take)' } })

    // Renaming a layout changes the signature, so the module redefines its presets.
    const before = signature(t.conn.state)
    t.designs[0].name = 'Renamed'
    t.api.changed()
    await until(() => signature(t.conn.state) !== before)
  })
})
