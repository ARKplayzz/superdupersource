import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

// Updates come from GitHub releases. They download in the background and install when the app
// quits, or when the operator presses Restart in Setup. The app never restarts on its own: in the
// middle of a show that would take the Companion buttons away.

export interface UpdateState {
  status: 'dev' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  error?: string
  checkedAt?: number
}

const SIX_HOURS = 6 * 60 * 60 * 1000

export class Updates {
  state: UpdateState = app.isPackaged ? { status: 'idle' } : { status: 'dev' }
  onChange: () => void = () => {}

  constructor() {
    if (!app.isPackaged) return
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'none', checkedAt: Date.now() }))
    autoUpdater.on('update-available', (info) => this.set({ status: 'downloading', version: info.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) => this.set({ ...this.state, status: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info) => this.set({ status: 'ready', version: info.version, checkedAt: Date.now() }))
    autoUpdater.on('error', (e) => this.set({ status: 'error', error: e?.message ?? String(e), checkedAt: Date.now() }))
  }

  start(): void {
    if (!app.isPackaged) return
    setTimeout(() => this.check(), 15_000)
    setInterval(() => this.check(), SIX_HOURS)
  }

  check(): void {
    if (!app.isPackaged || this.state.status === 'downloading' || this.state.status === 'ready') return
    autoUpdater.checkForUpdates().catch((e) => this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) }))
  }

  // Only when the operator asks. `beforeQuit` lets the window stop hiding itself to the tray.
  install(beforeQuit: () => void): boolean {
    if (this.state.status !== 'ready') return false
    beforeQuit()
    autoUpdater.quitAndInstall(false, true)
    return true
  }

  private set(state: UpdateState) {
    this.state = state
    this.onChange()
  }
}
