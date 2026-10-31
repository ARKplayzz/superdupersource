import type { NextTake } from './engine'
import type { Design } from './model'

export function objectName(design: Design | undefined, id: string): string {
  return design?.objects.find((o) => o.id === id)?.name ?? id
}

// One line for what the next take will do, in the words an operator uses.
// Shared by the app window and the Companion module, so a button and the screen agree.
export function describeNext(designs: Design[], next: NextTake): { headline: string; detail: string; animated: boolean } {
  if (next.action === 'none') return { headline: 'Nothing to take', detail: next.reason, animated: false }
  const design = designs.find((d) => d.id === next.designId)
  const name = design?.name ?? next.designId
  if (next.match.kind === 'none') {
    return {
      headline: next.action === 'in' ? `Cut to ${name}` : `Cut from ${name}`,
      detail: `No animation: ${next.match.reason}`,
      animated: false,
    }
  }
  const obj = objectName(design, next.match.objectId)
  return {
    headline: next.action === 'in' ? `${name}: in from ${obj}` : `${name}: out to ${obj}`,
    detail: next.match.detail,
    animated: true,
  }
}
