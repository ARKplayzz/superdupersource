import { join } from 'node:path'
import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage } from 'electron'
import { Design, Engine, ShowSettings, SimSwitcher } from '@sds/core'
import { AppSnapshot, CHANNEL, Result } from '../shared/api'
import { LocalApi } from './localApi'
import { loadShow, saveShow } from './store'

// One copy only: a second launch just brings the window back.
if (!app.requestSingleInstanceLock()) app.quit()

const icon = (size: 16 | 32 | 256) => nativeImage.createFromPath(join(__dirname, `../../resources/icon-${size}.png`))

// Until the ATEM adapter exists (it needs hardware to test), the app runs on the simulator.
const switcher = new SimSwitcher({ fps: 50 })
switcher.start()

const show = loadShow()
const engine = new Engine(switcher, show.settings, show.designs)

const localApi = new LocalApi({
  engine,
  switcher,
  designs: () => show.designs,
  shortlist: () => show.shortlist,
  settings: () => show.settings,
  version: app.getVersion(),
})

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

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
    app: { version: app.getVersion(), openAtLogin: app.getLoginItemSettings().openAtLogin },
    companion: localApi.status,
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
switcher.on('state', push)
engine.on('change', push)
localApi.onStatus = push

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
ipcMain.handle(CHANNEL.simCut, (_e, me: number) => switcher.cut(me))
ipcMain.handle(CHANNEL.simPreview, (_e, me: number, input: number) => switcher.setPreview(me, input))
ipcMain.handle(CHANNEL.simProgram, (_e, me: number, input: number) => switcher.setProgram(me, input))
ipcMain.handle(CHANNEL.simKeys, (_e, me: number, on: boolean) => switcher.setKeysOnAir(me, on))

app.on('second-instance', () => win?.show())
app.on('before-quit', () => (quitting = true))

void app.whenReady().then(() => {
  void localApi.listen(show.settings.localApi.port, show.settings.localApi.allowRemote)
  createWindow()
  createTray()
  // Started at login: stay in the tray until clicked.
  if (process.argv.includes('--hidden')) win?.once('ready-to-show', () => win?.hide())
})
