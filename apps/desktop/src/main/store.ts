import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { Design, SavedShow, ShowSettings, freshShow, upgradeShow } from '@sds/core'

// The show file: designs, the shortlist and settings. One JSON file in the user data folder.
export interface ShowFile {
  version: 1
  designs: Design[]
  shortlist: string[]
  settings: ShowSettings
  // Starter layouts this show has seen, so new ones get added once and deleted ones stay gone.
  knownStarters?: string[]
  // Which set of starter layouts the show was last updated to (see refreshStarters).
  starterSet?: number
}

const file = () => join(app.getPath('userData'), 'show.json')

export function loadShow(): ShowFile {
  const fresh: ShowFile = { version: 1, ...freshShow() }
  if (!existsSync(file())) return fresh
  try {
    return { version: 1, ...upgradeShow(JSON.parse(readFileSync(file(), 'utf8')) as SavedShow) }
  } catch (e) {
    console.error('Could not read show.json, starting fresh:', e)
    return fresh
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let pending: ShowFile | null = null

// Writes a temp file and renames it over show.json, so a crash mid-write can't leave half a file.
function write(show: ShowFile) {
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(show, null, 2))
  renameSync(`${file()}.tmp`, file())
}

// Bursts of edits are written once, 300 ms after the last. `now` writes straight away: used for the
// switcher address, so a restart mid-show reconnects to the same switcher.
export function saveShow(show: ShowFile, now = false): void {
  if (timer) clearTimeout(timer)
  timer = null
  pending = show
  if (now) return flushShow()
  timer = setTimeout(flushShow, 300)
}

// Writes anything still waiting. Called on quit.
export function flushShow(): void {
  if (timer) clearTimeout(timer)
  timer = null
  if (!pending) return
  const show = pending
  pending = null
  try {
    write(show)
  } catch (e) {
    console.error('Could not save show.json:', e)
  }
}
