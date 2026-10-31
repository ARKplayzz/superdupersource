import type { Design, NextTake, ShowSettings, Slot, SwitcherInfo, SwitcherState, TakeRecord } from '@sds/core'

// Everything the window shows, pushed from the main process whenever it changes.
export interface AppSnapshot {
  info: SwitcherInfo
  switcher: SwitcherState
  slots: Slot[]
  next: NextTake
  log: TakeRecord[]
  designs: Design[]
  shortlist: string[]
  settings: ShowSettings
  app: { version: string; openAtLogin: boolean }
  // The local API the Companion module connects to.
  companion: { listening: boolean; host: string; port: number; clients: number; error: string | null }
}

export type Result = { ok: true } | { ok: false; error: string }

export interface SdsApi {
  getSnapshot(): Promise<AppSnapshot>
  onSnapshot(listener: (s: AppSnapshot) => void): () => void
  load(designId: string): Promise<Result>
  take(): Promise<NextTake>
  saveDesign(design: Design): Promise<void>
  deleteDesign(id: string): Promise<void>
  setShortlist(ids: string[]): Promise<void>
  setSettings(settings: ShowSettings): Promise<void>
  setOpenAtLogin(on: boolean): Promise<void>
  // Simulator panel controls: play the operator at a switcher panel.
  sim: {
    cut(me: number): Promise<void>
    setPreview(me: number, input: number): Promise<void>
    setProgram(me: number, input: number): Promise<void>
    setKeys(me: number, onAir: boolean): Promise<void>
  }
}

export const CHANNEL = {
  snapshot: 'sds:snapshot',
  getSnapshot: 'sds:get-snapshot',
  load: 'sds:load',
  take: 'sds:take',
  saveDesign: 'sds:save-design',
  deleteDesign: 'sds:delete-design',
  setShortlist: 'sds:set-shortlist',
  setSettings: 'sds:set-settings',
  setOpenAtLogin: 'sds:set-open-at-login',
  simCut: 'sds:sim-cut',
  simPreview: 'sds:sim-preview',
  simProgram: 'sds:sim-program',
  simKeys: 'sds:sim-keys',
} as const
