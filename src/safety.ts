// Safety badges (#104): what to wear and what to watch out for, on a skill and on its steps.
// The 10 badges and their icons are from the expert design handoff (Nov 26). A badge is
// stored by its id, so more can be added here later; an id this list does not know is
// left out wherever badges are read.

export type BadgeKind = 'wear' | 'hazard'

type Badge = {
  kind: BadgeKind
  // On the pill: "Safety glasses".
  label: string
  // Said by the coach: "Wear safety glasses." or "Watch out for heat and burns."
  spoken: string
}

// In this order everywhere: what to wear first, then what to watch out for.
export const BADGES = {
  'safety-glasses': { kind: 'wear', label: 'Safety glasses', spoken: 'safety glasses' },
  gloves: { kind: 'wear', label: 'Gloves', spoken: 'gloves' },
  respirator: { kind: 'wear', label: 'Respirator', spoken: 'a respirator' },
  helmet: { kind: 'wear', label: 'Helmet', spoken: 'a helmet' },
  'ear-protection': { kind: 'wear', label: 'Ear protection', spoken: 'ear protection' },
  electricity: { kind: 'hazard', label: 'Electricity', spoken: 'electricity' },
  'heat-burns': { kind: 'hazard', label: 'Heat and burns', spoken: 'heat and burns' },
  'chemical-burns': { kind: 'hazard', label: 'Chemical burns', spoken: 'chemical burns' },
  fumes: { kind: 'hazard', label: 'Fumes', spoken: 'fumes' },
  'sharp-edges': { kind: 'hazard', label: 'Sharp edges', spoken: 'sharp edges' },
} as const satisfies Record<string, Badge>

export type BadgeId = keyof typeof BADGES

const ORDER = Object.keys(BADGES) as BadgeId[]

export function isBadgeId(id: unknown): id is BadgeId {
  return typeof id === 'string' && Object.hasOwn(BADGES, id)
}

// Known badges only, each once, wear first then hazards, in the list's order.
export function knownBadges(ids: readonly unknown[] | undefined): BadgeId[] {
  const set = new Set((ids ?? []).filter(isBadgeId))
  return ORDER.filter((id) => set.has(id))
}

// A skill's badges: its own, plus every badge of its steps.
export function skillBadges(own: readonly unknown[] | undefined, steps: readonly { badges?: readonly unknown[] }[]): BadgeId[] {
  return knownBadges([...(own ?? []), ...steps.flatMap((s) => s.badges ?? [])])
}

export function badgeInfo(id: BadgeId): Badge {
  return BADGES[id]
}

function list(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

// What the coach says before a step: "Wear safety glasses and gloves. Watch out for
// electricity." Empty when the step has no badges.
export function badgeSpeech(ids: readonly unknown[] | undefined): string {
  const known = knownBadges(ids)
  const wear = known.filter((id) => BADGES[id].kind === 'wear').map((id) => BADGES[id].spoken)
  const hazards = known.filter((id) => BADGES[id].kind === 'hazard').map((id) => BADGES[id].spoken)
  return [wear.length ? `Wear ${list(wear)}.` : '', hazards.length ? `Watch out for ${list(hazards)}.` : ''].filter(Boolean).join(' ')
}

// A card shows at most this many, then "+N" for the rest (settled in #104).
export const CARD_BADGES = 3

export function cardBadges(ids: readonly unknown[] | undefined, max = CARD_BADGES): { shown: BadgeId[]; more: number } {
  const known = knownBadges(ids)
  return { shown: known.slice(0, max), more: Math.max(0, known.length - max) }
}
