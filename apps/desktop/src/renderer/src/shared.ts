import { Design, DesignTally, describeNext as coreDescribeNext, designTally, inputFor } from '@sds/core/browser'
import type { NextTake } from '@sds/core'
import type { AppSnapshot } from '../../shared/api'

export type Tally = DesignTally
export { objectName } from '@sds/core/browser'

export function tallyFor(snap: AppSnapshot, designId: string): { tally: Tally; ss?: number } {
  return designTally(snap.switcher, snap.slots, designId, snap.settings.takeMe)
}

// One line for what SS CUT will do. Same wording as the Companion buttons.
export function describeNext(snap: AppSnapshot, next: NextTake = snap.next): { headline: string; detail: string } {
  return coreDescribeNext(snap.designs, next)
}

export function inputName(snap: AppSnapshot, id: number | undefined): string {
  if (id === undefined) return 'not set'
  return snap.switcher.inputs[id]?.name ?? `Input ${id}`
}

export function sourcesFor(snap: AppSnapshot, design: Design): number[] {
  return design.objects.map((o) => inputFor(o.source, snap.settings.roles) ?? 0)
}

export function backgroundFile(design: Design | undefined): string {
  return design?.background.file ?? 'Slide_01.PNG'
}
