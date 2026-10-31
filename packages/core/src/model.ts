import type { EasingName } from './geometry'
import type { BoxState } from './units'

// A design refers to sources by role ("Presenter", "Slides") so it works at any venue.
// Setup maps roles to switcher inputs. A raw input is allowed for one-off designs.
export type SourceRef = { role: string } | { input: number }

export interface DesignObject {
  id: string
  name: string
  source: SourceRef
  final: BoxState
  // Lower wins when more than one object matches the source on air.
  matchPriority: number
}

// Where a non-matched object starts (IN) or ends (OUT).
export type Placement =
  | 'in-place' // already at its final position; revealed or covered by the matched object
  | 'offscreen-nearest'
  | 'offscreen-left'
  | 'offscreen-right'
  | 'offscreen-top'
  | 'offscreen-bottom'
  | 'shrunk' // minimum size at its own centre

export interface Motion {
  placement?: Placement // ignored for the matched object, which is always full screen
  delayMs: number
  durationMs: number
  easing: EasingName
}

export type Direction = 'in' | 'out'

// "in:B" = IN from object B full screen. "out:A" = OUT to object A full screen.
export type TransitionKey = `${Direction}:${string}`

export interface Design {
  id: string
  name: string
  group: string
  background: { file: string; still?: number }
  // Cutout template shown in the designer for alignment only. Never sent to the switcher.
  guide?: string
  objects: DesignObject[]
  // Per transition, per object. Anything missing falls back to defaults (see transitions.ts).
  transitions: Partial<Record<TransitionKey, Record<string, Motion>>>
}

export interface ShowSettings {
  roles: Record<string, number>
  // Animate when the matched source reaches program through an M/E with upstream keys on air.
  animateWithKeysOnAir: boolean
  // M/E that takes run on (0 = ME1).
  takeMe: number
  // Art fill for animated layouts: the media player holding the Slide 01 background.
  backgroundInput: number
  // Local API for the Companion module. allowRemote listens on every interface, not just 127.0.0.1.
  localApi: { port: number; allowRemote: boolean }
}

export const DEFAULT_SETTINGS: ShowSettings = {
  roles: { Presenter: 1, Slides: 2, Wide: 3, Guest: 4 },
  animateWithKeysOnAir: false,
  takeMe: 0,
  backgroundInput: 3020,
  localApi: { port: 8710, allowRemote: false },
}

export const transitionKey = (dir: Direction, objectId: string): TransitionKey => `${dir}:${objectId}`

export function parseTransitionKey(key: TransitionKey): { direction: Direction; objectId: string } {
  const [direction, objectId] = key.split(':') as [Direction, string]
  return { direction, objectId }
}
