import { join } from 'node:path'
import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage } from 'electron'
import { AtemSwitcher, discoverSwitchers } from '@sds/atem'
import { Design, Engine, ShowSettings, SimSwitcher } from '@sds/core'
import { AppSnapshot, CHANNEL, ConnectionInfo, Result } from '../shared/api'
import { LocalApi } from './localApi'
import { loadShow, saveShow } from './store'
import { Updates } from './updates'

// One copy only: a second launch just brings the window back.
if (!app.requestSingleInstanceLock()) app.quit()

const icon = (size: 16 | 32 | 256) => nativeImage.createFromPath(join(__dirname, `../../resources/icon-${size}.png`))

const show = loadShow()

// The app drives either the simulator or a real ATEM. Both implement the core Switcher interface,
// so the engine, the window and the Companion API don't care which.
let switcher: SimSwitcher | AtemSwitcher = new SimSwitcher({ fps: 50 })
let engine = new Engine(switcher, show.settings, show.designs)

const localApi = new LocalApi({
  get engine() {
    return engine
  },
  get switcher() {
    return switcher
  },
  designs: () => show.designs,
  shortlist: () => show.shortlist,
  settings: () => show.settings,
  version: app.getVersion(),
})

const updates = new Updates()

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function connectionInfo(): ConnectionInfo {
  const { mode, address } = show.settings.connection
  if (!(switcher instanceof AtemSwitcher)) return { mode, address, status: 'simulator', error: null, lastTakeLateMs: null }
  const late = [...switcher.lastTakeLateMs].sort((a, b) => a - b)
  return {
    mode,
    address,
    status: switcher.status,
    error: switcher.status === 'connected' ? null : switcher.lastError,
    lastTakeLateMs: late.length ? { p95: round(late[Math.floor(late.length * 0.95)]), max: round(late[late.length - 1]) } : null,
  }
}

const round = (v: number) => Math.round(v * 100) / 100

function snapshot(): AppSnapshot {
  return {
    info: switcher.info,
    switcher: switcher.getState(),
    slots: engine.slots,
    next: engine.nextTake(),
    log: engine.log,
    designs: show.designs,
    shortlist: show.shortlist,
    settings: show.settings,
    app: { version: app.getVersion(), openAtLogin: app.getLoginItemSettings().openAtLogin, update: updates.state },
    companion: localApi.status,
    connection: connectionInfo(),
  }
}

// Coalesce bursts (a take changes state every frame) into one push per event-loop turn.
let pushQueued = false
function push() {
  if (pushQueued) return
  pushQueued = true
  setImmediate(() => {
    pushQueued = false
    win?.webContents.send(CHANNEL.snapshot, snapshot())
  })
}
localApi.onStatus = push
updates.onChange = push

// A new engine for the current switcher, keeping any loaded layouts (nothing is sent to the
// switcher; phases come from what's on air).
function rebuildEngine() {
  const loaded = engine.slots.map((s) => s.designId)
  engine.off('change', push)
  engine.dispose()
  engine = new Engine(switcher, show.settings, show.designs)
  engine.restore(loaded)
  engine.on('change', push)
  localApi.rebind()
  push()
}

async function useConnection(mode: 'simulator' | 'atem', address: string) {
  const old = switcher
  old.off('state', push)
  if (old instanceof SimSwitcher) old.stop()
  else await old.close()

  if (mode === 'atem' && address) {
    const atem = new AtemSwitcher(address)
    atem.on('status', push)
    atem.on('error', push)
    // On (re)connect the switcher's real capabilities arrive; rebuild if the SuperSource count changed.
    atem.on('info', () => {
      if (switcher === atem && engine.slots.length !== atem.info.superSourceCount) rebuildEngine()
    })
    switcher = atem
    atem.connect()
  } else {
    const sim = new SimSwitcher({ fps: 50 })
    sim.start()
    switcher = sim
  }
  switcher.on('state', push)
  // Layouts loaded on another switcher don't carry over.
  engine.slots.forEach((s) => (s.designId = null))
  rebuildEngine()
}

function persist() {
  saveShow(show)
  localApi.changed()
  push()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#121315',
    title: 'SuperDuperSource',
    icon: icon(256),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#121315', symbolColor: '#b8bcc4', height: 38 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })
  win.once('ready-to-show', () => win?.show())
  // Closing hides to the tray. Quit from the tray menu.
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win?.hide()
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function createTray() {
  tray = new Tray(icon(16))
  tray.setToolTip('SuperDuperSource')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show SuperDuperSource', click: () => win?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => ((quitting = true), app.quit()) },
    ]),
  )
  tray.on('click', () => win?.show())
}

const ok = async (fn: () => Promise<unknown> | unknown): Promise<Result> => {
  try {
    await fn()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

ipcMain.handle(CHANNEL.getSnapshot, () => snapshot())
ipcMain.handle(CHANNEL.load, (_e, id: string) => ok(() => engine.load(id)))
ipcMain.handle(CHANNEL.take, () => engine.take())
ipcMain.handle(CHANNEL.saveDesign, (_e, design: Design) => {
  const i = show.designs.findIndex((d) => d.id === design.id)
  if (i >= 0) show.designs[i] = design
  else show.designs.push(design)
  engine.setDesigns(show.designs)
  persist()
})
ipcMain.handle(CHANNEL.deleteDesign, (_e, id: string) => {
  show.designs = show.designs.filter((d) => d.id !== id)
  show.shortlist = show.shortlist.filter((s) => s !== id)
  engine.setDesigns(show.designs)
  persist()
})
ipcMain.handle(CHANNEL.setShortlist, (_e, ids: string[]) => {
  show.shortlist = ids
  persist()
})
ipcMain.handle(CHANNEL.setSettings, async (_e, settings: ShowSettings) => {
  const before = show.settings.localApi
  show.settings = settings
  engine.setSettings(settings)
  persist()
  if (before.port !== settings.localApi.port || before.allowRemote !== settings.localApi.allowRemote) {
    await localApi.listen(settings.localApi.port, settings.localApi.allowRemote)
  }
})
ipcMain.handle(CHANNEL.setOpenAtLogin, (_e, on: boolean) => {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
  push()
})
ipcMain.handle(CHANNEL.setConnection, (_e, mode: 'simulator' | 'atem', address: string) =>
  ok(async () => {
    const addr = address.trim()
    if (mode === 'atem' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) throw new Error("Enter the switcher's IP address, for example 192.168.10.240")
    show.settings = { ...show.settings, connection: { mode, address: mode === 'atem' ? addr : show.settings.connection.address } }
    saveShow(show)
    await useConnection(mode, addr)
  }),
)
ipcMain.handle(CHANNEL.discover, () => discoverSwitchers(3))
ipcMain.handle(CHANNEL.checkForUpdates, () => updates.check())
ipcMain.handle(CHANNEL.installUpdate, () => updates.install(() => (quitting = true)))

// Simulator panel controls only apply in simulator mode.
const sim = () => (switcher instanceof SimSwitcher ? switcher : null)
ipcMain.handle(CHANNEL.simCut, (_e, me: number) => sim()?.cut(me))
ipcMain.handle(CHANNEL.simPreview, (_e, me: number, input: number) => sim()?.setPreview(me, input))
ipcMain.handle(CHANNEL.simProgram, (_e, me: number, input: number) => sim()?.setProgram(me, input))
ipcMain.handle(CHANNEL.simKeys, (_e, me: number, on: boolean) => sim()?.setKeysOnAir(me, on))

app.on('second-instance', () => win?.show())
app.on('before-quit', () => (quitting = true))

void app.whenReady().then(() => {
  void useConnection(show.settings.connection.mode, show.settings.connection.address)
  updates.start()
  void localApi.listen(show.settings.localApi.port, show.settings.localApi.allowRemote)
  createWindow()
  createTray()
  // Started at login: stay in the tray until clicked.
  if (process.argv.includes('--hidden')) win?.once('ready-to-show', () => win?.hide())
})
