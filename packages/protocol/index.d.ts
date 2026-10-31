// The local API between the SuperDuperSource app and its Companion module.
// JSON over a WebSocket. The app is the server; Companion connects as a client.
// A declaration file: types only, nothing ships at runtime, and it never affects either side's build output.
//
// Default port: 8710. The app listens on 127.0.0.1 unless "Allow Companion on another computer"
// is switched on in Setup.

export type Tally = 'pgm' | 'pvw' | 'loaded' | 'none'

export interface RemoteDesign {
  id: string
  name: string
  group: string
  boxes: number
  listed: boolean // on today's shortlist
  tally: Tally
  ss?: number // SuperSource it's loaded in, 0-based
}

export interface RemoteSlot {
  ss: number
  designId: string | null
  designName: string | null
  phase: 'idle' | 'armed' | 'animating-in' | 'on-air' | 'animating-out'
}

export interface RemoteNextTake {
  action: 'in' | 'out' | 'none'
  animated: boolean
  headline: string // "Slides + presenter: in from Presenter"
  detail: string
}

export interface RemoteState {
  app: { name: 'SuperDuperSource'; version: string }
  switcher: { model: string; simulated: boolean; fps: number }
  designs: RemoteDesign[] // shortlist order first, then the rest of the library
  slots: RemoteSlot[]
  next: RemoteNextTake
  busy: boolean
}

// Client -> app. `id` is echoed back in the matching result.
export type ClientMessage =
  | { type: 'hello'; client: string; version: string }
  | { type: 'load'; id: number; designId: string }
  // fallback: what to do when nothing on the bus matches a box (no animation possible)
  | { type: 'take'; id: number; fallback: 'cut' | 'auto' }

// App -> client
export type ServerMessage =
  | { type: 'state'; state: RemoteState }
  | { type: 'result'; id: number; ok: boolean; message?: string }
