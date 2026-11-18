// The Skills page's trade chips (#83, settled p): "All" fixed at the left, and every other
// chip in one row that slides slowly sideways like the landing carousel, looping, with
// faded edges. The row pauses under the mouse, a finger or keyboard focus, and can be
// dragged or scrolled by hand. A picked chip stops it and stays in view until All is
// picked. With reduced motion the row stands still and scrolls by hand only.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ALL_TRADES, chipRowPosition } from './skillsPage.ts'

type Props = {
  // Every trade except All, in order.
  trades: string[]
  picked: string
  onPick: (trade: string) => void
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// A drag that moved further than this is a drag, not a click on a chip.
const DRAG_PX = 6

export default function TradeChips({ trades, picked, onPick }: Props) {
  const [still] = useState(reducedMotion)
  const rowRef = useRef<HTMLDivElement>(null)
  // The second copy of the chips, for a seamless loop; not there with reduced motion.
  const copyRef = useRef<HTMLSpanElement>(null)
  const pausedRef = useRef(false)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const sliding = !still && picked === ALL_TRADES

  // The slide: a little further each frame, unless paused, picked or still.
  useEffect(() => {
    const row = rowRef.current
    if (!sliding || !row) return
    let frame = 0
    let last = performance.now()
    let position = row.scrollLeft
    const step = (now: number) => {
      const seconds = Math.min((now - last) / 1000, 0.1)
      last = now
      const loopWidth = copyRef.current?.offsetLeft ?? 0
      if (!pausedRef.current) {
        // A hand scroll moves the row too; carry on from where it is.
        if (Math.abs(row.scrollLeft - position) > 2) position = row.scrollLeft
        position = chipRowPosition(position, seconds, loopWidth)
        row.scrollLeft = position
      } else position = row.scrollLeft
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [sliding])

  // A picked chip stops the row and stays in view (the first copy's chip).
  useEffect(() => {
    const row = rowRef.current
    if (!row || picked === ALL_TRADES) return
    const chip = row.querySelector<HTMLElement>(`[data-trade="${CSS.escape(picked)}"]`)
    if (!chip) return
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: still ? 'auto' : 'smooth' })
  }, [picked, still])

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pausedRef.current = true
    if (event.pointerType === 'mouse') drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const dx = event.clientX - d.x
    if (Math.abs(dx) > DRAG_PX) d.moved = true
    if (d.moved) event.currentTarget.scrollLeft = d.left - dx
  }

  function endDrag() {
    // A click right after a drag is not a pick.
    setTimeout(() => {
      drag.current = null
    }, 0)
  }

  function pick(trade: string) {
    if (drag.current?.moved) return
    onPick(trade)
  }

  const chip = (trade: string, copy: boolean) => (
    <button
      key={`${copy ? 'copy-' : ''}${trade}`}
      type="button"
      data-trade={copy ? undefined : trade}
      className={`skills-chip${trade === picked ? ' skills-chip-on' : ''}`}
      aria-pressed={copy ? undefined : trade === picked}
      tabIndex={copy ? -1 : undefined}
      onClick={() => pick(trade)}
    >
      {trade}
    </button>
  )

  return (
    <div className="skills-chips" role="group" aria-label="Trades">
      {chip(ALL_TRADES, false)}
      <div
        ref={rowRef}
        className="skills-chip-row"
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') pausedRef.current = true
        }}
        onPointerLeave={(e) => {
          endDrag()
          if (e.pointerType === 'mouse') pausedRef.current = false
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          endDrag()
          // A finger lifts: the row slides on again.
          if (e.pointerType !== 'mouse') pausedRef.current = false
        }}
        onPointerCancel={() => {
          endDrag()
          pausedRef.current = false
        }}
        onFocus={() => {
          pausedRef.current = true
        }}
        onBlur={() => {
          pausedRef.current = false
        }}
      >
        {trades.map((t) => chip(t, false))}
        {!still && (
          <span ref={copyRef} className="skills-chip-copy" aria-hidden="true">
            {trades.map((t) => chip(t, true))}
          </span>
        )}
      </div>
    </div>
  )
}
