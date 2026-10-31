// Minimal typed event emitter, so the core runs in Node, Electron and a plain browser alike.
type Listener = (...args: any[]) => void

export class Emitter {
  private listeners = new Map<string, Set<Listener>>()

  on(event: string, fn: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return this
  }

  off(event: string, fn: Listener): this {
    this.listeners.get(event)?.delete(fn)
    return this
  }

  once(event: string, fn: Listener): this {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped)
      fn(...args)
    }
    return this.on(event, wrapped)
  }

  emit(event: string, ...args: unknown[]): boolean {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return false
    for (const fn of [...set]) fn(...args)
    return true
  }
}
