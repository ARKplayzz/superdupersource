import { AtemState, Enums } from 'atem-connection'
import type { BoxRaw, InputInfo, InputKind, MeState, SuperSourceState, SwitcherInfo, SwitcherState } from '@sds/core'

// Turns atem-connection's state into the core's SwitcherState, which is all the engine reads.

// Frames per second as the switcher counts them for timing. Interlaced modes count frames, not fields.
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
  return FPS[mode] ?? 50
}

const EMPTY_ME: MeState = { program: 0, preview: 0, inTransition: false, keysOnAir: false }

const emptyBox = (): BoxRaw => ({
  enabled: false,
  source: 0,
  x: 0,
  y: 0,
  size: 500,
  cropped: false,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
})

// Before the first connection there is no state. One empty M/E keeps every reader safe.
export const DISCONNECTED_STATE: SwitcherState = { mixEffects: [EMPTY_ME], superSources: [], auxes: [], inputs: {} }

export function placeholderInfo(address: string): SwitcherInfo {
  return { model: `ATEM at ${address}`, fps: 50, meCount: 1, superSourceCount: 0, boxCount: 4, macroCount: 0, mediaPlayers: 2, simulated: false }
}

export function mapInfo(s: AtemState, address: string): SwitcherInfo {
  const caps = s.info.capabilities
  const model = s.info.productIdentifier?.trim() || Enums.Model[s.info.model] || `ATEM at ${address}`
  return {
    model,
    fps: fpsFor(s.settings.videoMode),
    meCount: caps?.mixEffects ?? s.video.mixEffects.length,
    superSourceCount: caps?.superSources ?? s.video.superSources.length,
    boxCount: s.info.superSources.find((x) => x)?.boxCount ?? 4,
    macroCount: s.info.macroPool?.macroCount ?? 0,
    mediaPlayers: Math.min(4, caps?.mediaPlayers ?? s.media.players.length ?? 2),
    simulated: false,
  }
}

function inputKind(id: number, port: Enums.InternalPortType): { kind: InputKind; me?: number; ss?: number } {
  switch (port) {
    case Enums.InternalPortType.External:
      return { kind: 'external' }
    case Enums.InternalPortType.MediaPlayerFill:
      return { kind: 'mediaplayer' }
    case Enums.InternalPortType.SuperSource:
      return { kind: 'supersource', ss: id - 6000 }
    case Enums.InternalPortType.MEOutput:
      // 10010 = ME1 program, 10011 = ME1 preview, 10020 = ME2 program, ...
      return id % 10 === 0 ? { kind: 'me', me: (id - 10010) / 10 } : { kind: 'other' }
    default:
      return { kind: 'other' }
  }
}

export function mapState(s: AtemState): SwitcherState {
  const mixEffects = s.video.mixEffects.map((me): MeState =>
    me
      ? {
          program: me.programInput,
          preview: me.previewInput,
          inTransition: me.transitionPosition?.inTransition ?? false,
          keysOnAir: me.upstreamKeyers.some((k) => k?.onAir),
        }
      : EMPTY_ME,
  )

  const superSources = s.video.superSources.map((ss): SuperSourceState => ({
    boxes: [0, 1, 2, 3].map((i) => {
      const b = ss?.boxes[i]
      if (!b) return emptyBox()
      const { border: _border, ...raw } = b
      return raw
    }),
    artFill: ss?.properties?.artFillSource ?? 0,
    artBehind: ss?.properties ? ss.properties.artOption === Enums.SuperSourceArtOption.Background : true,
  }))

  const inputs: Record<number, InputInfo> = {}
  for (const inp of Object.values(s.inputs)) {
    if (!inp) continue
    inputs[inp.inputId] = { id: inp.inputId, short: inp.shortName, name: inp.longName, ...inputKind(inp.inputId, inp.internalPortType) }
  }

  return {
    mixEffects: mixEffects.length ? mixEffects : [EMPTY_ME],
    superSources,
    auxes: s.video.auxilliaries.filter((a): a is number => typeof a === 'number'),
    inputs,
  }
}
