import { contextBridge, ipcRenderer } from 'electron'
import { AppSnapshot, CHANNEL, SdsApi } from '../shared/api'

const api: SdsApi = {
  getSnapshot: () => ipcRenderer.invoke(CHANNEL.getSnapshot),
  onSnapshot: (listener) => {
    const handler = (_e: unknown, s: AppSnapshot) => listener(s)
    ipcRenderer.on(CHANNEL.snapshot, handler)
    return () => ipcRenderer.off(CHANNEL.snapshot, handler)
  },
  load: (id) => ipcRenderer.invoke(CHANNEL.load, id),
  take: () => ipcRenderer.invoke(CHANNEL.take),
  rehearse: (id, key) => ipcRenderer.invoke(CHANNEL.rehearse, id, key),
  saveDesign: (d) => ipcRenderer.invoke(CHANNEL.saveDesign, d),
  deleteDesign: (id) => ipcRenderer.invoke(CHANNEL.deleteDesign, id),
  setShortlist: (ids) => ipcRenderer.invoke(CHANNEL.setShortlist, ids),
  setSettings: (s) => ipcRenderer.invoke(CHANNEL.setSettings, s),
  setOpenAtLogin: (on) => ipcRenderer.invoke(CHANNEL.setOpenAtLogin, on),
  setConnection: (mode, address) => ipcRenderer.invoke(CHANNEL.setConnection, mode, address),
  discover: () => ipcRenderer.invoke(CHANNEL.discover),
  downloadModule: () => ipcRenderer.invoke(CHANNEL.downloadModule),
  checkForUpdates: () => ipcRenderer.invoke(CHANNEL.checkForUpdates),
  installUpdate: () => ipcRenderer.invoke(CHANNEL.installUpdate),
  sim: {
    cut: (me) => ipcRenderer.invoke(CHANNEL.simCut, me),
    setPreview: (me, input) => ipcRenderer.invoke(CHANNEL.simPreview, me, input),
    setProgram: (me, input) => ipcRenderer.invoke(CHANNEL.simProgram, me, input),
    setKeys: (me, on) => ipcRenderer.invoke(CHANNEL.simKeys, me, on),
  },
}

contextBridge.exposeInMainWorld('sds', api)
