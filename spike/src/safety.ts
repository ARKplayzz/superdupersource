import { Atem, VideoState, listVisibleInputs } from 'atem-connection'

type SuperSourceBox = VideoState.SuperSource.SuperSourceBox

export const ssInput = (ss: number) => 6000 + ss

// Why this SuperSource counts as on air, or null if it doesn't.
// Checks ME1 program (which follows nested MEs and SuperSources) and every aux output.
export function onAirReason(atem: Atem, ss: number): string | null {
  const state = atem.state
  if (!state) return 'no switcher state yet'
  const id = ssInput(ss)
  if (listVisibleInputs('program', state, 0).includes(id)) return 'visible on ME1 program'
  const auxes = state.video.auxilliaries ?? []
  for (let i = 0; i < auxes.length; i++) {
    if (auxes[i] === id) return `routed to aux ${i + 1}`
  }
  return null
}

export function assertOffAir(atem: Atem, ss: number): void {
  const reason = onAirReason(atem, ss)
  if (reason) throw new Error(`SuperSource ${ss + 1} is ${reason}. Take it off air before running this test.`)
}

interface Snapshot {
  boxes: (SuperSourceBox | undefined)[]
  properties?: VideoState.SuperSource.SuperSourceProperties
}

function snapshot(atem: Atem, ss: number): Snapshot {
  const src = atem.state?.video.superSources[ss]
  if (!src) throw new Error(`Switcher has no SuperSource ${ss + 1}`)
  return structuredClone({ boxes: [...src.boxes], properties: src.properties })
}

async function restore(atem: Atem, ss: number, snap: Snapshot): Promise<void> {
  for (let i = 0; i < snap.boxes.length; i++) {
    const b = snap.boxes[i]
    if (!b) continue
    const { border: _border, ...props } = b
    await atem.setSuperSourceBoxSettings(props, i, ss)
  }
  if (snap.properties) await atem.setSuperSourceProperties(snap.properties, ss)
}

export interface Session {
  // Becomes true if the SuperSource goes on air or the user presses Ctrl+C. Tests should stop.
  readonly aborted: boolean
  readonly abortReason: string | null
}

// Runs fn with the SuperSource snapshotted, guarded against going on air, and restored afterwards
// (also on Ctrl+C).
export async function withSuperSource<T>(atem: Atem, ss: number, fn: (session: Session) => Promise<T>): Promise<T> {
  assertOffAir(atem, ss)
  const snap = snapshot(atem, ss)
  const session = { aborted: false, abortReason: null as string | null }
  const abort = (reason: string) => {
    if (session.aborted) return
    session.aborted = true
    session.abortReason = reason
    console.error(`\nStopping: ${reason}`)
  }
  const onState = () => {
    const reason = onAirReason(atem, ss)
    if (reason) abort(`SuperSource ${ss + 1} went on air (${reason})`)
  }
  const onSigint = () => abort('Ctrl+C')
  atem.on('stateChanged', onState)
  process.on('SIGINT', onSigint)
  try {
    return await fn(session)
  } finally {
    atem.off('stateChanged', onState)
    process.off('SIGINT', onSigint)
    console.log('Restoring SuperSource to how it was before the test...')
    await restore(atem, ss, snap)
  }
}

// Our macros are named with this prefix so we never overwrite someone else's.
export const MACRO_PREFIX = 'SDS '

export function assertMacroSlotFree(atem: Atem, index: number, force: boolean): void {
  const pool = atem.state?.info.macroPool?.macroCount ?? 0
  if (index < 0 || index >= pool) throw new Error(`Macro slot ${index + 1} doesn't exist (switcher has ${pool})`)
  const props = atem.state?.macro.macroProperties[index]
  if (props?.isUsed && !props.name.startsWith(MACRO_PREFIX) && !force) {
    throw new Error(`Macro slot ${index + 1} holds "${props.name}". Pick a free slot, or pass --force to overwrite it.`)
  }
}
