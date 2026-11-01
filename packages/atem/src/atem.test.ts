import { EventEmitter } from 'node:events'
import { AtemState, AtemStateUtil, Commands, Enums } from 'atem-connection'
import { describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS, Engine, SLIDE_10, STARTER_DESIGNS, fromRaw, ssInput } from '@sds/core'
import { AtemSwitcher, type AtemLike, type FrameClock } from './atemSwitcher'
import { mapInfo, mapState } from './mapping'

// A switcher stand-in: a real atem-connection AtemState that commands are applied to, the way the
// ATEM would apply them and report back.
class FakeAtem extends EventEmitter implements AtemLike {
  state: AtemState = AtemStateUtil.Create()
  sent: { t: number; commands: Commands.ISerializableCommand[] }[] = []
  art: { props: object; ss?: number }[] = []

  constructor(private readonly clock: FrameClock) {
    super()
    const s = this.state as any
    s.info.productIdentifier = 'ATEM 2 M/E Production Studio 4K'
    s.info.model = Enums.Model.TwoME4K
    s.info.capabilities = { mixEffects: 2, superSources: 1, mediaPlayers: 2, DVEs: 1 }
    s.info.superSources = [{ boxCount: 4 }]
    s.info.macroPool = { macroCount: 100 }
    s.settings.videoMode = Enums.VideoMode.P1080p50
    const input = (inputId: number, shortName: string, longName: string, internalPortType: Enums.InternalPortType) =>
      (s.inputs[inputId] = { inputId, shortName, longName, internalPortType })
    input(1, 'CAM1', 'Presenter cam', Enums.InternalPortType.External)
    input(2, 'CAM2', 'Slides PC', Enums.InternalPortType.External)
    input(3, 'CAM3', 'Wide', Enums.InternalPortType.External)
    input(3010, 'MP1', 'Media Player 1', Enums.InternalPortType.MediaPlayerFill)
    input(3020, 'MP2', 'Media Player 2', Enums.InternalPortType.MediaPlayerFill)
    input(6000, 'SSRC', 'Super Source', Enums.InternalPortType.SuperSource)
    input(10010, 'M1PG', 'ME 1 PGM', Enums.InternalPortType.MEOutput)
    input(10011, 'M1PV', 'ME 1 PVW', Enums.InternalPortType.MEOutput)
    input(10020, 'M2PG', 'ME 2 PGM', Enums.InternalPortType.MEOutput)
    for (const i of [0, 1]) {
      const me = AtemStateUtil.getMixEffect(this.state, i)
      me.programInput = 1
      me.previewInput = 2
    }
    const ss = AtemStateUtil.getSuperSource(this.state, 0)
    for (const i of [0, 1, 2, 3]) AtemStateUtil.getSuperSourceBox(ss, i)
    ss.properties = { artFillSource: 3010, artCutSource: 3011, artOption: Enums.SuperSourceArtOption.Foreground, artPreMultiplied: true, artClip: 0, artGain: 0, artInvertKey: false }
    ;(s.video.auxilliaries as (number | undefined)[]).push(1)
  }

  async connect() {
    setTimeout(() => this.emit('connected'), 0)
  }
  async disconnect() {}
  async destroy() {}

  async sendCommands(commands: Commands.ISerializableCommand[]) {
    this.sent.push({ t: this.clock.now(), commands })
    const paths: string[] = []
    for (const c of commands) {
      if (c instanceof Commands.CutCommand) {
        const me = AtemStateUtil.getMixEffect(this.state, c.mixEffect)
        ;[me.programInput, me.previewInput] = [me.previewInput, me.programInput]
        paths.push(`video.mixEffects.${c.mixEffect}`)
      } else if (c instanceof Commands.PreviewInputCommand) {
        AtemStateUtil.getMixEffect(this.state, c.mixEffect).previewInput = c.properties.source
        paths.push(`video.mixEffects.${c.mixEffect}`)
      } else if (c instanceof Commands.SuperSourceBoxParametersCommand) {
        const box = AtemStateUtil.getSuperSourceBox(AtemStateUtil.getSuperSource(this.state, c.ssrcId), c.boxId)
        Object.assign(box, c.properties)
        paths.push(`video.superSources.${c.ssrcId}.boxes.${c.boxId}`)
      }
    }
    this.emit('stateChanged', this.state, paths)
  }

  async setSuperSourceProperties(props: object, ss = 0) {
    this.art.push({ props, ss })
    Object.assign(AtemStateUtil.getSuperSource(this.state, ss).properties!, props)
    this.emit('stateChanged', this.state, [`video.superSources.${ss}.properties`])
  }
}

// Virtual time: waiting jumps the clock, so frame timing is exact and tests are instant.
function virtualClock(): FrameClock & { t: number } {
  const c = {
    t: 0,
    now: () => c.t,
    async until(t: number) {
      c.t = Math.max(c.t, t)
      await Promise.resolve()
    },
  }
  return c
}

async function connected() {
  const clock = virtualClock()
  const fake = new FakeAtem(clock)
  const sw = new AtemSwitcher('192.168.10.240', { atem: fake, clock })
  const statuses: string[] = []
  sw.on('status', (s: string) => statuses.push(s))
  sw.connect()
  await new Promise((r) => setTimeout(r, 5))
  return { clock, fake, sw, statuses }
}

// The fake switcher has the presenter camera on input 1 and the slides on 2.
const VENUE = { ...DEFAULT_SETTINGS, roles: { ...DEFAULT_SETTINGS.roles, Static: 1, Presentation: 2, Wide: 3 } }

describe('mapping', () => {
  test('info comes from the switcher, not assumptions', () => {
    const fake = new FakeAtem(virtualClock())
    expect(mapInfo(fake.state, 'x')).toEqual({
      model: 'ATEM 2 M/E Production Studio 4K',
      fps: 50,
      meCount: 2,
      superSourceCount: 1,
      boxCount: 4,
      macroCount: 100,
      mediaPlayers: 2,
      simulated: false,
    })
  })

  test('inputs, M/Es and SuperSource map to the core shape', () => {
    const fake = new FakeAtem(virtualClock())
    const s = mapState(fake.state)
    expect(s.mixEffects[0]).toEqual({ program: 1, preview: 2, inTransition: false, keysOnAir: false })
    expect(s.inputs[10010]).toMatchObject({ kind: 'me', me: 0 })
    expect(s.inputs[10020]).toMatchObject({ kind: 'me', me: 1 })
    expect(s.inputs[10011]).toMatchObject({ kind: 'other' }) // a preview output isn't a program feed
    expect(s.inputs[6000]).toMatchObject({ kind: 'supersource', ss: 0 })
    expect(s.inputs[3020]).toMatchObject({ kind: 'mediaplayer', name: 'Media Player 2' })
    expect(s.superSources[0]).toMatchObject({ artFill: 3010, artBehind: false })
    expect(s.superSources[0].boxes).toHaveLength(4)
    expect(s.auxes).toEqual([1])
  })
})

describe('AtemSwitcher', () => {
  test('connect emits status, info and state', async () => {
    const { sw, statuses } = await connected()
    expect(statuses).toEqual(['connecting', 'connected'])
    expect(sw.info.model).toBe('ATEM 2 M/E Production Studio 4K')
    expect(sw.getState().inputs[1].name).toBe('Presenter cam')
  })

  test('refuses to run before it is connected', async () => {
    const sw = new AtemSwitcher('192.168.10.240', { atem: new FakeAtem(virtualClock()), clock: virtualClock() })
    await expect(sw.run([{ op: 'cut', me: 0 }])).rejects.toThrow(/Not connected/)
  })

  test('a load sets art behind, arms the layout and selects it on preview', async () => {
    const { sw, fake } = await connected()
    const engine = new Engine(sw, VENUE, [SLIDE_10, ...STARTER_DESIGNS])
    await engine.load('slide-10')
    expect(fake.art).toEqual([{ props: { artFillSource: 3010, artOption: Enums.SuperSourceArtOption.Background }, ss: 0 }])
    expect(sw.getState().mixEffects[0].preview).toBe(ssInput(0))
    expect(fromRaw(sw.getState().superSources[0].boxes[0])).toEqual(SLIDE_10.objects[0].final)
  })

  test('an animated take streams one batch per frame, 20 ms apart at 1080p50', async () => {
    const { sw, fake, clock } = await connected()
    const engine = new Engine(sw, VENUE, [SLIDE_10, ...STARTER_DESIGNS])
    await engine.load('slide-10')
    fake.sent = []
    const t0 = clock.now()
    const res = await engine.take()
    expect(res).toMatchObject({ action: 'in', match: { objectId: 'B' } })

    // Frame 0: snap (boxes 1-2 set, 3-4 off). Frame 1: the cut. Then 35 frames of movement.
    const times = fake.sent.map((b) => b.t - t0)
    expect(times[0]).toBe(0)
    expect(fake.sent[1].commands.map((c) => c.constructor.name)).toEqual(['CutCommand'])
    expect(times[1]).toBe(20)
    expect(fake.sent.length).toBeGreaterThanOrEqual(30)
    for (let i = 2; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(20)
    expect(times.at(-1)).toBe(20 * 36)

    // On air, in final form, presenter in box 1.
    expect(sw.getState().mixEffects[0].program).toBe(ssInput(0))
    expect(fromRaw(sw.getState().superSources[0].boxes[0])).toEqual(SLIDE_10.objects[1].final)
    expect(engine.slots[0].phase).toBe('on-air')
    expect(sw.lastTakeLateMs.every((ms) => ms === 0)).toBe(true)
  })

  test('OUT ends with a cut to the source on preview, then restores the layout', async () => {
    const { sw, fake } = await connected()
    const engine = new Engine(sw, VENUE, [SLIDE_10, ...STARTER_DESIGNS])
    await engine.load('slide-10')
    await engine.take()
    await fake.sendCommands([new Commands.PreviewInputCommand(0, 2)]) // operator puts the slides on preview
    expect(engine.nextTake()).toMatchObject({ action: 'out', match: { objectId: 'A' } })
    await engine.take()
    expect(sw.getState().mixEffects[0]).toMatchObject({ program: 2, preview: ssInput(0) })
    expect(fromRaw(sw.getState().superSources[0].boxes[0])).toEqual(SLIDE_10.objects[0].final)
  })

  test('losing the connection: status goes back to connecting and takes are refused', async () => {
    const { sw, fake, statuses } = await connected()
    fake.emit('disconnected')
    expect(statuses.at(-1)).toBe('connecting')
    await expect(sw.run([{ op: 'cut', me: 0 }])).rejects.toThrow(/Not connected/)
    fake.emit('connected')
    expect(sw.status).toBe('connected')
  })

  test('the real clock keeps frames on time (send lateness under 4 ms here)', async () => {
    const fake = new FakeAtem({ now: () => performance.now(), until: async () => {} })
    const sw = new AtemSwitcher('x', { atem: fake })
    sw.connect()
    await new Promise((r) => setTimeout(r, 5))
    const ops = Array.from({ length: 25 }, (_, i) => [{ op: 'wait' as const, frames: 1 }, { op: 'box' as const, ss: 0, box: 0, props: { x: i * 10 } }]).flat()
    await sw.run(ops)
    const late = [...sw.lastTakeLateMs].sort((a, b) => a - b)
    expect(late.length).toBe(25)
    expect(late[Math.floor(late.length * 0.95)]).toBeLessThan(4)
  })
})
