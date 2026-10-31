import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AppSnapshot } from '../../shared/api'
import { onImagesLoaded } from './render'

export function useSnapshot(): AppSnapshot | null {
  const [snap, setSnap] = useState<AppSnapshot | null>(null)
  useEffect(() => {
    void window.sds.getSnapshot().then(setSnap)
    return window.sds.onSnapshot(setSnap)
  }, [])
  return snap
}

// A 16:9 canvas sized to its box at device resolution. draw() runs whenever `deps` change,
// when the canvas resizes, and when template images finish loading.
export function Frame({
  draw,
  deps,
  className,
  onPointerDown,
  canvasRef,
}: {
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void
  deps: unknown[]
  className?: string
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
}) {
  const own = useRef<HTMLCanvasElement | null>(null)
  const ref = canvasRef ?? own
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [imgTick, setImgTick] = useState(0)

  useLayoutEffect(() => {
    const c = ref.current
    if (!c) return
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      setSize({ w: Math.round(r.width * dpr), h: Math.round(r.height * dpr) })
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [ref])

  useEffect(() => onImagesLoaded(() => setImgTick((t) => t + 1)), [])

  useEffect(() => {
    const c = ref.current
    if (!c || size.w === 0) return
    if (c.width !== size.w) c.width = size.w
    if (c.height !== size.h) c.height = size.h
    const g = c.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    draw(g, size.w, size.h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, size, imgTick])

  return <canvas ref={ref} className={`frame ${className ?? ''}`} onPointerDown={onPointerDown} />
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [message, onDone])
  return message ? <div className="toast">{message}</div> : null
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="panel setup-section">
      <header>
        <h2 className="section-title">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

// Icons: simple strokes, drawn for this app.
const svg = (children: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export const Icon = {
  layouts: () =>
    svg(
      <>
        <rect x="2.5" y="4.5" width="10" height="11" rx="1" />
        <rect x="14" y="7" width="3.5" height="6" rx="1" />
      </>,
    ),
  design: () =>
    svg(
      <>
        <path d="M4 15.5 13.5 6l1.8 1.8L5.8 17.3H4z" />
        <path d="M12 4.5l1.5-1.5 3.5 3.5L15.5 8" />
      </>,
    ),
  setup: () =>
    svg(
      <>
        <path d="M3 6h9M15 6h2M3 14h2M8 14h9" />
        <circle cx="13.5" cy="6" r="1.8" />
        <circle cx="6.5" cy="14" r="1.8" />
      </>,
    ),
  monitor: () =>
    svg(
      <>
        <rect x="2.5" y="3.5" width="15" height="10" rx="1" />
        <path d="M10 3.5v10M2.5 8.5h7.5M7 17h6M10 13.5V17" />
      </>,
    ),
  play: () => svg(<path d="M6.5 4.5v11l9-5.5z" />),
  plus: () => svg(<path d="M10 4v12M4 10h12" />),
  close: () => svg(<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />),
  chevron: (open: boolean) => svg(<path d={open ? 'M5 8l5 5 5-5' : 'M8 5l5 5-5 5'} />),
}
