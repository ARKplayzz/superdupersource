import { CSSProperties, ReactNode, useEffect, useState } from 'react'
import { BoxState, DesignObject, visibleRect } from '@sds/core/browser'
import type { AppSnapshot } from '../../shared/api'
import { tone } from './tones'

export { tone }

export function useSnapshot(): AppSnapshot | null {
  const [snap, setSnap] = useState<AppSnapshot | null>(null)
  useEffect(() => {
    void window.sds.getSnapshot().then(setSnap)
    return window.sds.onSnapshot(setSnap)
  }, [])
  return snap
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [message, onDone])
  return message ? <div className="toast">{message}</div> : null
}

// Closes a popover on a pointer down anywhere outside elements marked data-pop={name}.
export function useOutside(name: string, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-pop]')
      if (el?.getAttribute('data-pop') !== name) close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [name, open, close])
}

// Where a box's visible rectangle sits, as percentages of the frame.
export function boxRect(s: BoxState): CSSProperties {
  const r = visibleRect(s)
  return {
    left: `${((r.l + 16) / 32) * 100}%`,
    top: `${((9 - r.t) / 18) * 100}%`,
    width: `${((r.r - r.l) / 32) * 100}%`,
    height: `${((r.t - r.b) / 18) * 100}%`,
  }
}

export interface ViewBox {
  object: DesignObject
  state: BoxState
  sub?: string
}

// A layout drawn as flat boxes on its background. boxes[0] draws on top.
export function LayoutView({
  boxes,
  background,
  labels,
  subSize = '8.5px',
  fontSize,
  className,
  style,
  children,
  boxProps,
}: {
  boxes: ViewBox[]
  background: string
  labels?: boolean
  subSize?: string
  fontSize?: string
  className?: string
  style?: CSSProperties
  children?: ReactNode
  boxProps?: (b: ViewBox, i: number) => { style?: CSSProperties; onPointerDown?: (e: React.PointerEvent) => void }
}) {
  return (
    <div className={`layout ${className ?? ''}`} style={{ backgroundImage: `url(./${background})`, ...style }}>
      {boxes.map((b, i) => {
        const [bg, fg] = tone(b.object)
        const extra = boxProps?.(b, i)
        return (
          <div
            key={b.object.id}
            className="lbox"
            onPointerDown={extra?.onPointerDown}
            style={{ ...boxRect(b.state), background: bg, color: fg, zIndex: 10 - i, fontSize, ...extra?.style }}
          >
            {labels && (
              <div className="lbox-text">
                <span>{b.object.name}</span>
                {b.sub && <span style={{ fontSize: subSize }}>{b.sub}</span>}
              </div>
            )}
          </div>
        )
      })}
      {children}
    </div>
  )
}

// A settings row that toggles: the label, then a square check.
export function CheckRow({ label, on, onChange, disabled }: { label: ReactNode; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button className="row check-row" disabled={disabled} onClick={() => onChange(!on)}>
      <span className="grow">{label}</span>
      <span className={`check ${on ? 'on' : ''}`} />
    </button>
  )
}
