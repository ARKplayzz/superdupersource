import { useEffect, useState } from 'react'
import type { Design } from '@sds/core/browser'

// Unsaved edits to layouts, kept outside React so they survive switching tabs and layouts.
// A layout is only written to the show when the user presses Save design.

const drafts = new Map<string, Design>()
const history = new Map<string, Design[]>()
const listeners = new Set<() => void>()
const HISTORY = 100
// Edits closer together than this count as one undo step (a drag, typing in a field).
const MERGE_MS = 600
let last = { id: '', at: 0 }

const notify = () => listeners.forEach((l) => l())

export function useDrafts(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
}

export const draftOf = (saved: Design): Design => drafts.get(saved.id) ?? saved
export const isDirty = (id: string): boolean => drafts.has(id)
export const canUndo = (id: string): boolean => (history.get(id)?.length ?? 0) > 0

export function edit(current: Design, next: Design): void {
  const now = Date.now()
  if (last.id !== current.id || now - last.at > MERGE_MS) {
    const h = history.get(current.id) ?? []
    h.push(current)
    if (h.length > HISTORY) h.shift()
    history.set(current.id, h)
  }
  last = { id: current.id, at: now }
  drafts.set(next.id, next)
  notify()
}

export function undo(id: string): void {
  const prev = history.get(id)?.pop()
  last = { id: '', at: 0 }
  if (!prev) return
  drafts.set(id, prev)
  notify()
}

export async function save(id: string): Promise<void> {
  const d = drafts.get(id)
  if (!d) return
  await window.sds.saveDesign(d)
  // Only clear it if nothing changed while saving.
  if (drafts.get(id) === d) drafts.delete(id)
  notify()
}

export function forget(id: string): void {
  drafts.delete(id)
  history.delete(id)
  notify()
}

// A change made outside the editor (moving a layout to another group) applies to its draft too.
export function patchDraft(id: string, patch: Partial<Design>): void {
  const d = drafts.get(id)
  if (!d) return
  drafts.set(id, { ...d, ...patch })
  notify()
}
