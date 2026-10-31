import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_SETTINGS, Design, STARTER_DESIGNS, ShowSettings, mergeNewStarters } from '@sds/core'

// The show file: designs, the shortlist and settings. One JSON file in the user data folder.
export interface ShowFile {
  version: 1
  designs: Design[]
  shortlist: string[]
  settings: ShowSettings
  // Starter layouts this show has seen, so new ones get added once and deleted ones stay gone.
  knownStarters?: string[]
}

const file = () => join(app.getPath('userData'), 'show.json')

export function loadShow(): ShowFile {
  const fresh: ShowFile = { version: 1, designs: STARTER_DESIGNS, shortlist: ['slide-10', 'slide-10-push', 'slide-11'], settings: DEFAULT_SETTINGS, knownStarters: STARTER_DESIGNS.map((d) => d.id) }
  if (!existsSync(file())) return fresh
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<ShowFile>
    const merged = saved.designs?.length ? mergeNewStarters(saved.designs, saved.knownStarters) : { designs: fresh.designs, known: STARTER_DESIGNS.map((d) => d.id) }
    return {
      version: 1,
      designs: merged.designs,
      knownStarters: merged.known,
      shortlist: saved.shortlist ?? fresh.shortlist,
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    }
  } catch (e) {
    console.error('Could not read show.json, starting fresh:', e)
    return fresh
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

export function saveShow(show: ShowFile): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify(show, null, 2))
  }, 300)
}
