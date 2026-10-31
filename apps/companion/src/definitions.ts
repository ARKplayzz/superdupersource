import {
  combineRgb,
  type CompanionActionDefinitions,
  type CompanionFeedbackDefinitions,
  type CompanionPresetDefinitions,
  type CompanionPresetSection,
  type CompanionSimplePresetDefinition,
  type CompanionVariableDefinitions,
  type CompanionVariableValues,
} from '@companion-module/base'
import type { RemoteState } from '@sds/protocol'
import type { AppConnection } from './connection.js'
import type { ModuleTypes } from './types.js'

// Colours match the app: red is program, green is preview, orange is an animated take ready.
export const COLOR = {
  pgm: combineRgb(229, 72, 77),
  pvw: combineRgb(48, 164, 108),
  accent: combineRgb(232, 100, 42),
  dark: combineRgb(24, 25, 28),
  grey: combineRgb(64, 66, 72),
  white: combineRgb(255, 255, 255),
  black: combineRgb(0, 0, 0),
}

type GetState = () => RemoteState | null
type Log = (message: string) => void

// Rebuild definitions only when what they list changes, not on every tally update.
export function signature(state: RemoteState | null): string {
  if (!state) return ''
  return JSON.stringify([state.designs.map((d) => [d.id, d.name, d.group, d.listed]), state.slots.length])
}

export function actions(state: GetState, conn: () => AppConnection | null, log: Log): CompanionActionDefinitions<ModuleTypes['actions']> {
  const designs = state()?.designs ?? []
  const report = (what: string) => (r: { ok: boolean; message?: string }) => {
    if (!r.ok) log(`${what}: ${r.message ?? 'failed'}`)
  }
  return {
    load: {
      name: 'Load layout to preview',
      description: 'Loads the layout into a free SuperSource and puts it on preview',
      options: [
        {
          id: 'designId',
          type: 'dropdown',
          label: 'Layout',
          choices: designs.map((d) => ({ id: d.id, label: d.listed ? d.name : `${d.name} (not on shortlist)` })),
          default: designs[0]?.id ?? '',
        },
      ],
      callback: async (action) => {
        const r = await (conn()?.request({ type: 'load', designId: String(action.options.designId) }) ?? Promise.resolve({ ok: false, message: 'Not connected' }))
        report('Load')(r)
      },
    },
    take_cut: {
      name: 'SS CUT',
      description: 'Animated take in or out. Cuts when nothing on the bus matches a box',
      options: [],
      callback: async () => report('SS CUT')(await (conn()?.request({ type: 'take', fallback: 'cut' }) ?? Promise.resolve({ ok: false, message: 'Not connected' }))),
    },
    take_auto: {
      name: 'SS AUTO',
      description: 'Animated take in or out. Mixes when nothing on the bus matches a box',
      options: [],
      callback: async () => report('SS AUTO')(await (conn()?.request({ type: 'take', fallback: 'auto' }) ?? Promise.resolve({ ok: false, message: 'Not connected' }))),
    },
  }
}

export function feedbacks(state: GetState): CompanionFeedbackDefinitions<ModuleTypes['feedbacks']> {
  const designs = state()?.designs ?? []
  return {
    design_tally: {
      type: 'boolean',
      name: 'Layout tally',
      description: 'On when the layout is on program, on preview, or loaded in a SuperSource',
      defaultStyle: { bgcolor: COLOR.pgm, color: COLOR.white },
      options: [
        { id: 'designId', type: 'dropdown', label: 'Layout', choices: designs.map((d) => ({ id: d.id, label: d.name })), default: designs[0]?.id ?? '' },
        {
          id: 'state',
          type: 'dropdown',
          label: 'When',
          choices: [
            { id: 'pgm', label: 'On program' },
            { id: 'pvw', label: 'On preview' },
            { id: 'loaded', label: 'Loaded (not on program or preview)' },
          ],
          default: 'pgm',
        },
      ],
      callback: (fb) => state()?.designs.find((d) => d.id === fb.options.designId)?.tally === fb.options.state,
    },
    take_ready: {
      type: 'boolean',
      name: 'Take ready',
      description: 'On when SS CUT / SS AUTO would do something',
      defaultStyle: { bgcolor: COLOR.accent, color: COLOR.black },
      options: [
        {
          id: 'kind',
          type: 'dropdown',
          label: 'Kind of take',
          choices: [
            { id: 'animated', label: 'Animated (a box matches the source)' },
            { id: 'plain', label: 'Plain cut or mix (nothing matches)' },
            { id: 'any', label: 'Either' },
          ],
          default: 'animated',
        },
      ],
      callback: (fb) => {
        const next = state()?.next
        if (!next || next.action === 'none') return false
        return fb.options.kind === 'any' || (fb.options.kind === 'animated') === next.animated
      },
    },
    busy: {
      type: 'boolean',
      name: 'Take running',
      description: 'On while a layout is animating in or out',
      defaultStyle: { bgcolor: COLOR.white, color: COLOR.black },
      options: [],
      callback: () => !!state()?.busy,
    },
  }
}

export function variableDefinitions(state: RemoteState | null): CompanionVariableDefinitions<ModuleTypes['variables']> {
  const defs: Record<string, { name: string }> = {
    next_take: { name: 'What SS CUT will do next' },
    next_detail: { name: 'Why (which box matches, or why nothing does)' },
    next_animated: { name: 'Next take animates (true/false)' },
    switcher: { name: 'Switcher model' },
  }
  for (const s of state?.slots ?? []) {
    defs[`ss${s.ss + 1}_layout`] = { name: `Layout loaded in SuperSource ${s.ss + 1}` }
    defs[`ss${s.ss + 1}_state`] = { name: `SuperSource ${s.ss + 1} state (idle, armed, on-air, animating-in, animating-out)` }
  }
  return defs
}

export function variableValues(state: RemoteState): CompanionVariableValues {
  const values: CompanionVariableValues = {
    next_take: state.next.headline,
    next_detail: state.next.detail,
    next_animated: state.next.animated,
    switcher: state.switcher.simulated ? `${state.switcher.model} (simulator)` : state.switcher.model,
  }
  for (const s of state.slots) {
    values[`ss${s.ss + 1}_layout`] = s.designName ?? ''
    values[`ss${s.ss + 1}_state`] = s.phase
  }
  return values
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'

// Presets: one group of layout buttons per library group (shortlisted layouts first), plus the
// take buttons. Layout buttons go green on preview and red on program.
export function presets(state: RemoteState | null, label: string): { structure: CompanionPresetSection<ModuleTypes>[]; presets: CompanionPresetDefinitions<ModuleTypes> } {
  const defs: CompanionPresetDefinitions<ModuleTypes> = {}
  const designs = state?.designs ?? []
  const groups = new Map<string, string[]>()

  const sorted = [...designs].sort((a, b) => Number(b.listed) - Number(a.listed))
  for (const d of sorted) {
    const id = `layout-${d.id}`
    defs[id] = {
      type: 'simple',
      name: d.name,
      style: { text: d.name, size: 'auto', color: COLOR.white, bgcolor: COLOR.dark },
      steps: [{ down: [{ actionId: 'load', options: { designId: d.id } }], up: [] }],
      feedbacks: [
        { feedbackId: 'design_tally', options: { designId: d.id, state: 'loaded' }, style: { bgcolor: COLOR.grey } },
        { feedbackId: 'design_tally', options: { designId: d.id, state: 'pvw' }, style: { bgcolor: COLOR.pvw, color: COLOR.white } },
        { feedbackId: 'design_tally', options: { designId: d.id, state: 'pgm' }, style: { bgcolor: COLOR.pgm, color: COLOR.white } },
      ],
    }
    groups.set(d.group, [...(groups.get(d.group) ?? []), id])
  }

  const takeButton = (actionId: 'take_cut' | 'take_auto', text: string): CompanionSimplePresetDefinition<ModuleTypes> => ({
    type: 'simple',
    name: text,
    style: { text, size: '18', color: COLOR.white, bgcolor: COLOR.dark },
    steps: [{ down: [{ actionId, options: {} }], up: [] }],
    feedbacks: [
      { feedbackId: 'take_ready', options: { kind: 'plain' }, style: { bgcolor: COLOR.grey, color: COLOR.white } },
      { feedbackId: 'take_ready', options: { kind: 'animated' }, style: { bgcolor: COLOR.accent, color: COLOR.black } },
      { feedbackId: 'busy', options: {}, style: { bgcolor: COLOR.white, color: COLOR.black } },
    ],
  })
  defs['take-cut'] = takeButton('take_cut', 'SS CUT')
  defs['take-auto'] = takeButton('take_auto', 'SS AUTO')
  defs['next-take'] = {
    type: 'simple',
    name: 'Next take (display)',
    style: { text: `$(${label}:next_take)`, size: '7', color: COLOR.white, bgcolor: COLOR.black, alignment: 'left:top' },
    steps: [{ down: [], up: [] }],
    feedbacks: [],
  }

  const structure: CompanionPresetSection<ModuleTypes>[] = [
    {
      id: 'takes',
      name: 'Takes',
      description: 'SS CUT and SS AUTO run the animated take in or out of the layout on program or preview',
      definitions: ['take-cut', 'take-auto', 'next-take'],
    },
    {
      id: 'layouts',
      name: 'Layouts',
      description: 'Press to load a layout into a free SuperSource and put it on preview',
      definitions: [...groups.entries()].map(([group, ids]) => ({ id: `group-${slug(group)}`, type: 'simple' as const, name: group, presets: ids })),
    },
  ]
  return { structure, presets: defs }
}
