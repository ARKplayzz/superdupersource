// Minimal --key value / --flag parser. Good enough for a spike.

export type Args = Record<string, string | boolean>

export function parseArgs(argv = process.argv.slice(2)): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

export function str(args: Args, key: string, fallback?: string): string {
  const v = args[key]
  if (typeof v === 'string') return v
  if (fallback !== undefined) return fallback
  throw new Error(`Missing --${key}`)
}

export function num(args: Args, key: string, fallback?: number): number {
  const v = args[key]
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isNaN(n)) throw new Error(`--${key} must be a number, got "${v}"`)
    return n
  }
  if (fallback !== undefined) return fallback
  throw new Error(`Missing --${key}`)
}

export function flag(args: Args, key: string): boolean {
  return args[key] === true || args[key] === 'true'
}
