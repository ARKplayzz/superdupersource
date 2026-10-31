import { DEFAULT_SETTINGS, Design, Engine, STARTER_DESIGNS, ShowSettings, SimSwitcher } from '@sds/core/browser'
import type { AppSnapshot, Result, SdsApi } from '../../shared/api'

// The same API the Electron preload provides, running entirely in the page: simulator + engine,
// with the show kept in localStorage. Used when the renderer is opened in a plain browser
// (development, and a possible try-it-online demo).

interface Saved {
  designs: Design[]
  shortlist: string[]
  settings: ShowSettings
}

const KEY = 'sds-show'

function read(): Saved {
  const fresh: Saved = { designs: STARTER_DESIGNS, shortlist: ['slide-10', 'slide-11'], settings: DEFAULT_SETTINGS }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fresh
    const s = JSON.parse(raw) as Partial<Saved>
    return { designs: s.designs?.length ? s.designs : fresh.designs, shortlist: s.shortlist ?? fresh.shortlist, settings: { ...DEFAULT_SETTINGS, ...s.settings } }
  } catch {
    return fresh
  }
}

export function createBrowserApi(): SdsApi {
  const show = read()
  const switcher = new SimSwitcher({ fps: 50 })
  switcher.start()
  const engine = new Engine(switcher, show.settings, show.designs)
  const listeners = new Set<(s: AppSnapshot) => void>()

  const snapshot = (): AppSnapshot =>
    structuredClone({
      info: switcher.info,
      switcher: switcher.getState(),
      slots: engine.slots,
      next: engine.nextTake(),
      log: engine.log,
      designs: show.designs,
      shortlist: show.shortlist,
      settings: show.settings,
      app: { version: 'browser', openAtLogin: false, update: { status: 'dev' } },
      companion: { listening: false, host: '', port: show.settings.localApi.port, clients: 0, error: 'Not available in the browser version' },
      connection: { mode: 'simulator', address: '', status: 'simulator', error: null, lastTakeLateMs: null },
    })

  let queued = false
  const push = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const s = snapshot()
      listeners.forEach((l) => l(s))
    })
  }
  switcher.on('state', push)
  engine.on('change', push)

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(show))
    } catch {
      // Storage can be unavailable (private window); the show just won't persist.
    }
    push()
  }

  const ok = async (fn: () => Promise<unknown>): Promise<Result> => {
    try {
      await fn()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return {
    getSnapshot: async () => snapshot(),
    onSnapshot: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    load: (id) => ok(() => engine.load(id)),
    take: () => engine.take(),
    saveDesign: async (d) => {
      const i = show.designs.findIndex((x) => x.id === d.id)
      if (i >= 0) show.designs[i] = d
      else show.designs.push(d)
      engine.setDesigns(show.designs)
      persist()
    },
    deleteDesign: async (id) => {
      show.designs = show.designs.filter((d) => d.id !== id)
      show.shortlist = show.shortlist.filter((s) => s !== id)
      engine.setDesigns(show.designs)
      persist()
    },
    setShortlist: async (ids) => {
      show.shortlist = ids
      persist()
    },
    setSettings: async (s) => {
      show.settings = s
      engine.setSettings(s)
      persist()
    },
    setOpenAtLogin: async () => {},
    setConnection: async (mode) =>
      mode === 'atem' ? { ok: false, error: 'The browser version only runs the simulator. Install the Windows app to connect to an ATEM.' } : { ok: true },
    discover: async () => [],
    checkForUpdates: async () => {},
    installUpdate: async () => false,
    sim: {
      cut: async (me) => switcher.cut(me),
      setPreview: async (me, input) => switcher.setPreview(me, input),
      setProgram: async (me, input) => switcher.setProgram(me, input),
      setKeys: async (me, on) => switcher.setKeysOnAir(me, on),
    },
  }
}
