import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Atem, Commands } from 'atem-connection'
import { BoxState, toRaw } from './units'

// One command per box. Pass sources to also set enabled + source (the "snap" at the start).
export function boxCommands(ss: number, frame: BoxState[], sources?: number[]): Commands.ISerializableCommand[] {
  return frame.map((b, i) => {
    const cmd = new Commands.SuperSourceBoxParametersCommand(ss, i)
    cmd.updateProps({ ...toRaw(b), ...(sources ? { enabled: true, source: sources[i] } : {}) })
    return cmd
  })
}

export function disableBoxes(ss: number, from: number, boxCount: number): Commands.ISerializableCommand[] {
  const cmds: Commands.ISerializableCommand[] = []
  for (let i = from; i < boxCount; i++) {
    const cmd = new Commands.SuperSourceBoxParametersCommand(ss, i)
    cmd.updateProps({ enabled: false })
    cmds.push(cmd)
  }
  return cmds
}

// Records when the switcher reports a SuperSource box change. The switcher sends box state back
// after applying a change, so the spacing of these reports is our best view of what it rendered
// short of recording the output.
export class EchoRecorder {
  readonly events: { t: number; box: number }[] = []
  private readonly prefix: string
  private readonly handler = (_state: unknown, paths: string[]) => {
    const t = performance.now()
    for (const p of paths) {
      if (p.startsWith(this.prefix)) this.events.push({ t, box: Number(p.slice(this.prefix.length)) })
    }
  }

  constructor(
    private readonly atem: Atem,
    ss: number,
  ) {
    this.prefix = `video.superSources.${ss}.boxes.`
  }

  start(): void {
    this.events.length = 0
    this.atem.on('stateChanged', this.handler)
  }

  stop(): void {
    this.atem.off('stateChanged', this.handler)
  }

  timesFor(box: number, since = 0): number[] {
    return this.events.filter((e) => e.box === box && e.t >= since).map((e) => e.t)
  }
}

export function stats(values: number[]) {
  if (values.length === 0) return { n: 0, mean: 0, p95: 0, max: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return {
    n: values.length,
    mean: round(mean),
    p95: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
    max: round(sorted[sorted.length - 1]),
  }
}

// Spacing between consecutive reports, counted in frames.
// "1" is the goal. "0" means two updates landed in one frame, "2+" means a frame was skipped.
export function frameSpacing(times: number[], periodMs: number) {
  const buckets = { '0': 0, '1': 0, '2+': 0 }
  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1]
    gaps.push(dt)
    const frames = Math.round(dt / periodMs)
    if (frames <= 0) buckets['0']++
    else if (frames === 1) buckets['1']++
    else buckets['2+']++
  }
  return { buckets, gapMs: stats(gaps) }
}

export function round(v: number, dp = 2): number {
  const m = 10 ** dp
  return Math.round(v * m) / m
}

export function writeResults(name: string, data: unknown): string {
  const dir = join(__dirname, '..', 'results')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify(data, null, 2))
  return file
}
