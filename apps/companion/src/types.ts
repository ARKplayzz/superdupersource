import type { CompanionVariableValues } from '@companion-module/base'

// Typed schema for this module's config, actions, feedbacks and variables (module-base v2).

export interface ModuleConfig {
  [key: string]: string | number
  host: string
  port: number
}

export type TallyState = 'pgm' | 'pvw' | 'loaded'
export type TakeKind = 'animated' | 'plain' | 'any'

export interface ModuleTypes {
  config: ModuleConfig
  secrets: undefined
  actions: {
    load: { options: { designId: string } }
    take_cut: { options: Record<string, never> }
    take_auto: { options: Record<string, never> }
  }
  feedbacks: {
    design_tally: { type: 'boolean'; options: { designId: string; state: TallyState } }
    take_ready: { type: 'boolean'; options: { kind: TakeKind } }
    busy: { type: 'boolean'; options: Record<string, never> }
  }
  // Per-SuperSource variables depend on the switcher, so the set isn't fixed.
  variables: CompanionVariableValues
}

export const DEFAULT_PORT = 8710
