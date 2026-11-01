import { Design, DesignObject, backgroundFor, inputFor } from '@sds/core/browser'
import type { AppSnapshot } from '../../shared/api'
import type { ViewBox } from './ui'

export { objectName } from '@sds/core/browser'

export interface InputChoice {
  id: number
  name: string
  kind: 'external' | 'me'
}

// Inputs a source can use. With no ATEM connected there are no names to read, so it falls back to
// the switcher's default names.
export function inputChoices(snap: AppSnapshot): InputChoice[] {
  const live = Object.values(snap.switcher.inputs).filter((i) => i.kind === 'external' || i.kind === 'me')
  if (live.length) return live.map((i) => ({ id: i.id, name: i.name, kind: i.kind as InputChoice['kind'] }))
  return [
    ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Camera ${i + 1}`, kind: 'external' as const })),
    ...[0, 1].map((m) => ({ id: 10010 + m * 10, name: `ME ${m + 1} Program`, kind: 'me' as const })),
  ]
}

export function inputLabel(snap: AppSnapshot, id: number | undefined): string {
  if (id === undefined) return ''
  const name = snap.switcher.inputs[id]?.name ?? inputChoices(snap).find((i) => i.id === id)?.name
  return name ? `${id} ${name}` : `${id}`
}

export function sourceText(snap: AppSnapshot, o: DesignObject): string {
  return inputLabel(snap, inputFor(o.source, snap.settings.roles))
}

export function roleOf(o: DesignObject): string {
  return 'role' in o.source ? o.source.role : `Input ${o.source.input}`
}

export interface MediaPlayer {
  value: number
  label: string
  short: string
}

export function mediaPlayers(snap: AppSnapshot): MediaPlayer[] {
  const n = Math.max(1, Math.min(4, snap.info.mediaPlayers || 2))
  return Array.from({ length: n }, (_, i) => ({ value: 3010 + i * 10, label: `Media Player ${i + 1}`, short: `MP${i + 1}` }))
}

export function mpShort(snap: AppSnapshot, design: Design): string {
  const v = backgroundFor(design, snap.settings)
  return v >= 3010 && v < 3050 ? `MP${(v - 3000) / 10}` : `${v}`
}

// Boxes in final form, design order (first on top), with their source under the name.
export function finalBoxes(snap: AppSnapshot | null, design: Design): ViewBox[] {
  return design.objects.map((o) => ({ object: o, state: o.final, sub: snap ? sourceText(snap, o) : undefined }))
}

export function backgroundFile(design: Design | undefined): string {
  return design?.background.file ?? 'Slide_01.PNG'
}

// Library groups in their saved order, including empty ones, with ungrouped layouts first.
export function libraryGroups(snap: AppSnapshot): { name: string; designs: Design[] }[] {
  const order = [...snap.settings.groups]
  for (const d of snap.designs) if (d.group && !order.includes(d.group)) order.push(d.group)
  const ungrouped = snap.designs.filter((d) => !d.group)
  return [...(ungrouped.length ? [{ name: '', designs: ungrouped }] : []), ...order.map((name) => ({ name, designs: snap.designs.filter((d) => d.group === name) }))]
}

export function groupNames(snap: AppSnapshot): string[] {
  return libraryGroups(snap)
    .map((g) => g.name)
    .filter((n) => n)
}
