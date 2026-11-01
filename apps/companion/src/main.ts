import { InstanceBase, InstanceStatus, type CompanionStaticUpgradeScript, type SomeCompanionConfigField } from '@companion-module/base'
import { AppConnection } from './connection.js'
import { actions, feedbacks, presets, signature, variableDefinitions, variableValues } from './definitions.js'
import { DEFAULT_PORT, type ModuleConfig, type ModuleTypes } from './types.js'

const VERSION = '0.1.2'

// Companion module for SuperDuperSource. It talks to the app, not the switcher: the app owns
// timing and state, and this module is a remote with tally.
export default class SuperDuperSourceInstance extends InstanceBase<ModuleTypes> {
  private config: ModuleConfig = { host: '127.0.0.1', port: DEFAULT_PORT }
  private conn: AppConnection | null = null
  private defined = ''

  async init(config: ModuleConfig): Promise<void> {
    this.config = config
    this.define()
    this.start()
  }

  async destroy(): Promise<void> {
    this.conn?.close()
    this.conn = null
  }

  async configUpdated(config: ModuleConfig): Promise<void> {
    this.config = config
    this.start()
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return [
      {
        type: 'static-text',
        id: 'info',
        label: 'SuperDuperSource',
        value: 'Connects to the SuperDuperSource app. If it runs on this computer, leave the address as 127.0.0.1. On another computer, switch on "Allow Companion on another computer" in the app\'s Setup tab.',
        width: 12,
      },
      { type: 'textinput', id: 'host', label: 'App address', default: '127.0.0.1', width: 8 },
      { type: 'number', id: 'port', label: 'Port', default: DEFAULT_PORT, min: 1, max: 65535, width: 4 },
    ]
  }

  private start(): void {
    this.conn?.close()
    const conn = new AppConnection(this.config.host || '127.0.0.1', Number(this.config.port) || DEFAULT_PORT, VERSION)
    this.conn = conn
    conn.onStatus = (status, message) => {
      if (this.conn !== conn) return
      if (status === 'ok') this.updateStatus(InstanceStatus.Ok)
      else if (status === 'connecting') this.updateStatus(InstanceStatus.Connecting)
      else this.updateStatus(InstanceStatus.ConnectionFailure, message ?? null)
    }
    conn.onState = (state) => {
      if (this.conn !== conn) return
      if (signature(state) !== this.defined) this.define()
      this.setVariableValues(variableValues(state))
      this.checkAllFeedbacks()
    }
    conn.connect()
  }

  // (Re)declare everything that lists layouts: dropdown choices, presets, per-SuperSource variables.
  private define(): void {
    const state = this.conn?.state ?? null
    this.defined = signature(state)
    const get = () => this.conn?.state ?? null
    this.setActionDefinitions(actions(get, () => this.conn, (m) => this.log('warn', m)))
    this.setFeedbackDefinitions(feedbacks(get))
    this.setVariableDefinitions(variableDefinitions(state))
    const p = presets(state, this.label)
    this.setPresetDefinitions(p.structure, p.presets)
  }
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = []
