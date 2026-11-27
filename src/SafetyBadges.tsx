// Safety badge pills (#104), as in the expert design: blue for what to wear, yellow for
// what to watch out for, each with its icon. Icons from the design's badges folder.
import type { ReactNode } from 'react'
import { badgeInfo, cardBadges, knownBadges, type BadgeId } from './safety.ts'
import './SafetyBadges.css'

const ICONS: Record<BadgeId, ReactNode> = {
  'safety-glasses': (
    <>
      <circle cx="7" cy="13" r="3.5" />
      <circle cx="17" cy="13" r="3.5" />
      <path d="M10.5 13h3M3.5 12l-1-3M20.5 12l1-3" />
    </>
  ),
  gloves: <path d="M7 21v-6l-2-3a1.5 1.5 0 0 1 2.5-1.6L9 12V5a1.3 1.3 0 0 1 2.6 0v5V4a1.3 1.3 0 0 1 2.6 0v6V5a1.3 1.3 0 0 1 2.6 0v6V7a1.3 1.3 0 0 1 2.6 0v8l-2 6z" />,
  respirator: (
    <>
      <path d="M4 9c3-2 13-2 16 0v3c0 5-4 8-8 8s-8-3-8-8z" />
      <path d="M8 13h8M9 16h6M4 9 2 6M20 9l2-3" />
    </>
  ),
  helmet: <path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 7V4M9 8.5 8 6M15 8.5 16 6" />,
  'ear-protection': (
    <>
      <path d="M5 14V11a7 7 0 0 1 14 0v3" />
      <rect x="3" y="13" width="4" height="7" rx="2" />
      <rect x="17" y="13" width="4" height="7" rx="2" />
    </>
  ),
  electricity: <path d="M13 2 5 13h6l-1 9 8-11h-6z" />,
  'heat-burns': <path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8 0 4 3 7 7 7z" />,
  'chemical-burns': (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  fumes: <path d="M6 20c-2-3 2-5 0-8s2-5 0-8M12 20c-2-3 2-5 0-8s2-5 0-8M18 20c-2-3 2-5 0-8s2-5 0-8" />,
  'sharp-edges': <path d="M3 21 15 9l3 3L6 21zM15 9l3-6 3 3-6 3" />,
}

export function BadgeIcon({ id, size = 15 }: { id: BadgeId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id]}
    </svg>
  )
}

export function SafetyBadge({ id }: { id: BadgeId }) {
  const { kind, label } = badgeInfo(id)
  return (
    <li className={`sb sb-${kind}`}>
      <BadgeIcon id={id} />
      <span>
        <span className="sb-hidden">{kind === 'wear' ? 'Wear ' : 'Watch out: '}</span>
        {label}
      </span>
    </li>
  )
}

// All of the badges, or for a card (max) the first few and "+N" for the rest. Nothing
// at all when there are none.
export default function SafetyBadges({ badges, max, className = '' }: { badges: readonly unknown[] | undefined; max?: number; className?: string }) {
  const { shown, more } = max === undefined ? { shown: knownBadges(badges), more: 0 } : cardBadges(badges, max)
  if (shown.length === 0) return null
  return (
    <ul className={`sbrow ${className}`} aria-label="Safety">
      {shown.map((id) => (
        <SafetyBadge key={id} id={id} />
      ))}
      {more > 0 && (
        <li className="sb sb-more">
          +{more}
          <span className="sb-hidden"> more safety badges</span>
        </li>
      )}
    </ul>
  )
}
