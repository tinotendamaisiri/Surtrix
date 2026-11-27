// The Surtrix Workspace's pieces (#62): the top bar, the tools list, the parts list with
// its picture modal, the step list, and the From live experts card. Coach.tsx lays them out.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import SafetyBadges from './SafetyBadges.tsx'
import { knownBadges } from './safety.ts'
import BackToSkills from './BackToSkills.tsx'
import type { CoachProgress, CoachStep } from './coach.ts'
import type { DeviceModelStatus } from './firebase.ts'
import type { SkillsTab } from './landingIntent.ts'
import Wordmark from './Wordmark.tsx'
import { partInfo, type ExpertCard } from './workspace.ts'
import './Workspace.css'

// The page shell: the dark Workspace with its top bar, for the coach and for its
// loading, not found and failed screens.
export function WorkspaceShell({ top, children }: { top: ReactNode; children: ReactNode }) {
  return (
    <main className="workspace">
      {top}
      {children}
    </main>
  )
}

type TopBarProps = {
  exitTab: SkillsTab
  skillTitle?: string
  progress?: CoachProgress
  deviceStatus?: DeviceModelStatus | null
  downloadPercent?: number | null
}

export function WorkspaceTopBar({ exitTab, skillTitle, progress, deviceStatus, downloadPercent = null }: TopBarProps) {
  const total = progress?.done.length ?? 0
  const doneCount = progress?.done.filter(Boolean).length ?? 0
  return (
    <header className="ws-top">
      <div className="ws-brand">
        <Wordmark white />
        <span className="ws-divider" aria-hidden="true" />
        <span className="ws-mono ws-brand-name">WORKSPACE</span>
      </div>
      {skillTitle && progress && (
        <div className="ws-progress">
          <h1>{skillTitle}</h1>
          <div className="ws-progress-row">
            <span className="ws-bar" role="progressbar" aria-label="Steps done" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}>
              <i style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
            </span>
            <span className="ws-mono">
              {progress.finished ? 'ALL STEPS DONE' : `STEP ${progress.stepIndex + 1} / ${total}`}
            </span>
          </div>
        </div>
      )}
      <div className="ws-top-right">
        {deviceStatus !== undefined && <NanoStatus status={deviceStatus} downloadPercent={downloadPercent} />}
        <BackToSkills tab={exitTab} className="ws-pill">
          Exit
        </BackToSkills>
      </div>
    </header>
  )
}

// The device model's real state, from the same check that watching the bench uses.
function NanoStatus({ status, downloadPercent }: { status: DeviceModelStatus | null; downloadPercent: number | null }) {
  const text =
    status === 'available'
      ? 'GEMINI NANO READY'
      : status === 'downloading'
        ? `GEMINI NANO DOWNLOADING${downloadPercent === null ? '' : ` ${downloadPercent}%`}`
        : status === 'downloadable'
          ? 'GEMINI NANO NOT DOWNLOADED'
          : status === 'unavailable'
            ? 'GEMINI NANO NOT AVAILABLE'
            : 'CHECKING GEMINI NANO'
  return (
    <span className={`ws-tag ${status === 'available' ? '' : 'ws-tag-off'}`}>
      <i className="ws-dot" aria-hidden="true" />
      {text}
    </span>
  )
}

// SAFETY (#104): every badge of the skill, what to wear and what to watch out for, above
// the tools. Hidden for a skill with none.
export function SafetyList({ badges }: { badges: readonly string[] | undefined }) {
  if (knownBadges(badges).length === 0) return null
  return (
    <section className="ws-section" aria-labelledby="ws-safety-heading">
      <h2 id="ws-safety-heading" className="ws-mono ws-heading">
        SAFETY
      </h2>
      <SafetyBadges badges={badges} />
    </section>
  )
}

// REQUIRED TOOLS: the skill's tools as pills, or a line when it needs none. Hidden for a
// skill saved before tools existed (tools is null).
export function ToolsList({ tools }: { tools: string[] | null }) {
  if (tools === null) return null
  return (
    <section className="ws-section" aria-labelledby="ws-tools-heading">
      <h2 id="ws-tools-heading" className="ws-mono ws-heading">
        REQUIRED TOOLS
      </h2>
      {tools.length === 0 ? (
        <p className="ws-none">No tools needed for this skill.</p>
      ) : (
        <ul className="ws-parts ws-tools">
          {tools.map((tool) => (
            <li key={tool}>
              <span className="ws-chip">{tool}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// REQUIRED PARTS: the skill's parts as pills. A part with a picture (the demo skill's)
// shows it on hover or focus, and opens a modal with a large picture and a note.
export function PartsList({ skillId, parts }: { skillId: string; parts: string[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  if (parts.length === 0) return null
  return (
    <section className="ws-section" aria-labelledby="ws-parts-heading">
      <h2 id="ws-parts-heading" className="ws-mono ws-heading">
        REQUIRED PARTS
      </h2>
      <ul className="ws-parts">
        {parts.map((part) => {
          const info = partInfo(skillId, part)
          if (!info) {
            return (
              <li key={part}>
                <span className="ws-chip">{part}</span>
              </li>
            )
          }
          return (
            <li key={part} className="ws-partwrap">
              <button
                type="button"
                className="ws-chip ws-partbtn"
                onClick={(e) => {
                  openerRef.current = e.currentTarget
                  setOpen(part)
                }}
              >
                {part}
              </button>
              <img className="ws-thumb" src={`/workspace/${info.image}`} alt="" aria-hidden="true" />
            </li>
          )
        })}
      </ul>
      {open && (
        <PartModal
          skillId={skillId}
          part={open}
          onClose={() => {
            setOpen(null)
            openerRef.current?.focus()
          }}
        />
      )}
    </section>
  )
}

function PartModal({ skillId, part, onClose }: { skillId: string; part: string; onClose: () => void }) {
  const info = partInfo(skillId, part)
  const closeRef = useRef<HTMLButtonElement>(null)
  // The latest onClose, so the Escape listener is added once, not on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!info) return null
  return (
    <div className="ws-modal-bg" onClick={onClose}>
      <div
        className="ws-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ws-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={`/workspace/${info.image}`} alt={part} />
        <div className="ws-modal-body">
          <h2 id="ws-modal-title">{part}</h2>
          <p>{info.note}</p>
        </div>
        <button ref={closeRef} type="button" className="ws-modal-close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  )
}

// STEPS: done steps show a tick, the current one is highlighted, the rest are numbered.
// disabled: off at the same times as Back and Next (while a wiring check is within its
// time limit), so a check already paid for is never cancelled by a step change.
export function StepList({
  steps,
  progress,
  onGo,
  disabled = false,
}: {
  steps: CoachStep[]
  progress: CoachProgress
  onGo: (index: number) => void
  disabled?: boolean
}) {
  return (
    <section className="ws-section" aria-labelledby="ws-steps-heading">
      <h2 id="ws-steps-heading" className="ws-mono ws-heading">
        STEPS
      </h2>
      <ol className="ws-steps">
        {steps.map((step, index) => {
          const current = !progress.finished && index === progress.stepIndex
          const done = progress.done[index]
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`ws-step ${current ? 'ws-step-current' : ''} ${done ? 'ws-step-done' : ''}`}
                aria-current={current ? 'step' : undefined}
                disabled={disabled}
                // The step already on screen: nothing to do, and its verdict stays.
                onClick={() => !current && onGo(index)}
              >
                <span className="ws-step-mark" aria-hidden="true">
                  {done && !current ? '✓' : index + 1}
                </span>
                <span>
                  {step.title}
                  {done && <span className="ws-visually-hidden"> (done)</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const ROTATE_MS = 4000

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// From live experts: the skill's saved expert answers, one at a time, every 4 seconds.
// Hovering pauses it, and it stays still with reduced motion.
export function ExpertsCard({ state }: { state: { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; cards: ExpertCard[] } }) {
  const cards = state.kind === 'loaded' ? state.cards : []
  const [shown, setShown] = useState(0)
  const [paused, setPaused] = useState(false)
  const index = cards.length ? shown % cards.length : 0

  useEffect(() => {
    if (cards.length < 2 || paused || prefersReducedMotion()) return
    const timer = setInterval(() => setShown((n) => n + 1), ROTATE_MS)
    return () => clearInterval(timer)
  }, [cards.length, paused])

  const card = cards[index]
  return (
    <section className="ws-panel ws-experts" aria-labelledby="ws-experts-heading">
      <div className="ws-card-head">
        <h2 id="ws-experts-heading">
          From live experts <span className="ws-badge">{state.kind === 'loaded' ? cards.length : '…'}</span>
        </h2>
        <span className="ws-tag">REAL EXPERT</span>
      </div>
      {state.kind === 'loading' && <p className="ws-quiet">Loading expert answers.</p>}
      {state.kind === 'failed' && <p className="ws-quiet">Expert answers could not be loaded.</p>}
      {state.kind === 'loaded' && !card && (
        <div className="ws-expert ws-expert-empty">
          <span className="ws-avatar">0</span>
          <p>No expert answers yet. Experts you contact show up here.</p>
        </div>
      )}
      {card && (
        <div
          className="ws-ticker"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div key={`${card.id}-${shown}`} className="ws-expert ws-expert-in">
            <span className="ws-avatar" aria-hidden="true">
              {card.initials}
            </span>
            <p>
              Answer on {card.stepTitle}, from <b>{card.expertName}</b>{' '}
              <span className="ws-verified" title="Verified expert">
                <span aria-hidden="true">✓</span>
                <span className="ws-visually-hidden">verified expert</span>
              </span>
            </p>
          </div>
        </div>
      )}
      {cards.length > 1 && (
        <div className="ws-dots" aria-hidden="true">
          {cards.map((c, i) => (
            <i key={c.id} className={i === index ? 'ws-dot-on' : ''} />
          ))}
        </div>
      )}
    </section>
  )
}
