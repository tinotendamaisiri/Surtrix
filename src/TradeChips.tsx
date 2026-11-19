// The Skills page's trade chips (#83, settled p): "All" fixed at the left, and every other
// chip in one row that slides slowly sideways like the landing carousel, looping, with
// faded edges. The row pauses under the mouse, a finger or keyboard focus, and can be
// dragged or scrolled by hand. A picked chip stops it and stays in view until All is
// picked. With reduced motion the row stands still and scrolls by hand only.
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
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
// After a hand scroll (a swipe, a trackpad, a drag) the slide waits this long, so it never
// fights the hand or a flick that is still moving.
const HAND_PAUSE_MS = 1500

export default function TradeChips({ trades, picked, onPick }: Props) {
  const [still] = useState(reducedMotion)
  const rowRef = useRef<HTMLDivElement>(null)
  // The two copies of the chips; the second is there only while the row can slide.
  const firstRef = useRef<HTMLSpanElement>(null)
  const copyRef = useRef<HTMLSpanElement>(null)
  // Each reason to pause is kept apart, so the end of one never restarts the row while
  // another still holds it.
  const hover = useRef(false)
  const finger = useRef(false)
  const focus = useRef(false)
  const handUntil = useRef(0)
  // Where the slide last put the row, to tell its own moves from a hand scroll.
  const written = useRef(0)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const sliding = !still && picked === ALL_TRADES

  // The slide: a little further each frame, unless something holds it.
  useEffect(() => {
    const row = rowRef.current
    if (!sliding || !row) return
    let frame = 0
    let last = performance.now()
    written.current = row.scrollLeft
    const step = (now: number) => {
      const seconds = Math.min((now - last) / 1000, 0.1)
      last = now
      // One copy's width: the distance from the first copy to the second.
      const loopWidth = (copyRef.current?.offsetLeft ?? 0) - (firstRef.current?.offsetLeft ?? 0)
      // Only when the row can scroll a whole copy is there a loop to show.
      const canLoop = loopWidth > 0 && row.scrollWidth - row.clientWidth >= loopWidth
      const held = hover.current || finger.current || focus.current || now < handUntil.current
      if (canLoop && !held) {
        written.current = chipRowPosition(row.scrollLeft, seconds, loopWidth)
        row.scrollLeft = written.current
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [sliding])

  // A picked chip stops the row and stays in view: whichever copy of it is nearest.
  useEffect(() => {
    const row = rowRef.current
    if (!row || picked === ALL_TRADES) return
    const center = row.scrollLeft + row.clientWidth / 2
    const chips = [...row.querySelectorAll<HTMLElement>(`[data-trade="${CSS.escape(picked)}"]`)]
    const chip = chips.sort(
      (a, b) =>
        Math.abs(a.offsetLeft + a.offsetWidth / 2 - center) - Math.abs(b.offsetLeft + b.offsetWidth / 2 - center),
    )[0]
    if (!chip) return
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: still ? 'auto' : 'smooth' })
  }, [picked, still])

  // Any scroll the slide did not make is a hand scroll.
  function onScroll() {
    const row = rowRef.current
    if (row && Math.abs(row.scrollLeft - written.current) > 2) handUntil.current = performance.now() + HAND_PAUSE_MS
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
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

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    // Focus moving to another chip in the row keeps it held.
    focus.current = event.currentTarget.contains(event.relatedTarget as Node | null)
  }

  function pick(trade: string) {
    if (drag.current?.moved) return
    onPick(trade)
  }

  const chip = (trade: string, copy: boolean) => (
    <button
      key={`${copy ? 'copy-' : ''}${trade}`}
      type="button"
      data-trade={trade}
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
      {/* All is outside the row, so there is always a quick way back. */}
      <button
        type="button"
        className={`skills-chip${picked === ALL_TRADES ? ' skills-chip-on' : ''}`}
        aria-pressed={picked === ALL_TRADES}
        onClick={() => onPick(ALL_TRADES)}
      >
        {ALL_TRADES}
      </button>
      <div
        ref={rowRef}
        className="skills-chip-row"
        onScroll={onScroll}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') hover.current = true
        }}
        onPointerLeave={(e) => {
          endDrag()
          if (e.pointerType === 'mouse') hover.current = false
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        // A finger on the row holds it until it lifts, even while the browser pans.
        onTouchStart={() => {
          finger.current = true
        }}
        onTouchEnd={() => {
          finger.current = false
          handUntil.current = performance.now() + HAND_PAUSE_MS
        }}
        onTouchCancel={() => {
          finger.current = false
        }}
        // Keyboard focus holds the row; a mouse click on a chip also focuses it, which
        // must not stop the row for good.
        onFocus={(e) => {
          focus.current = e.target.matches(':focus-visible')
        }}
        onBlur={onBlur}
      >
        <span ref={firstRef} className="skills-chip-copy">
          {trades.map((t) => chip(t, false))}
        </span>
        {!still && (
          <span ref={copyRef} className="skills-chip-copy" aria-hidden="true">
            {trades.map((t) => chip(t, true))}
          </span>
        )}
      </div>
    </div>
  )
}
