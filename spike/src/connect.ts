import { Atem } from 'atem-connection'

export async function connect(ip: string, timeoutMs = 5000): Promise<Atem> {
  const atem = new Atem()
  atem.on('error', (e) => console.error('[atem]', e))
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No response from ${ip} within ${timeoutMs} ms`)), timeoutMs)
    atem.once('connected', () => {
      clearTimeout(timer)
      resolve()
    })
    atem.connect(ip).catch((e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
  return atem
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// Resolves once the predicate holds on the current state, or rejects after timeoutMs.
export function waitForState(atem: Atem, predicate: () => boolean, timeoutMs = 3000, what = 'state change'): Promise<void> {
  if (predicate()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onChange = () => {
      if (!predicate()) return
      cleanup()
      resolve()
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${what}`))
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      atem.off('stateChanged', onChange)
    }
    atem.on('stateChanged', onChange)
  })
}

// Wait until `at` (performance.now() ms). setTimeout gets close, then spin for the last 2 ms,
// because Windows timers are only accurate to a few ms.
export async function waitUntil(at: number): Promise<void> {
  const early = at - performance.now() - 2
  if (early > 0) await sleep(early)
  while (performance.now() < at) {
    // spin
  }
}
