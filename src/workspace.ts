// What the Surtrix Workspace (#62) shows beside the steps: the skill's parts, the demo
// parts' pictures and notes, and the expert answers in the From live experts card.
import type { CoachStep } from './coach.ts'
import { DEMO_SKILL_ID } from './demoSkill.ts'
import type { SavedAnswer } from './savedAnswerPick.ts'

export type PartInfo = { image: string; note: string }

// Pictures (files in public/workspace) and notes only for the demo skill's six parts,
// approved by Tino on Nov 17. Keyed by the part name in lower case.
const demoParts: Record<string, PartInfo> = {
  breadboard: {
    image: 'part-breadboard.jpg',
    note: 'Holds the parts without solder. The red and blue rails along the sides carry the power.',
  },
  led: {
    image: 'part-led.jpg',
    note: 'Lights up when current flows through it the right way. The long leg is the positive side.',
  },
  '220 or 330 ohm resistor': {
    image: 'part-resistor.jpg',
    note: 'Limits the current so the LED does not burn out. Either value works here.',
  },
  'jumper wire': {
    image: 'part-jumper.jpg',
    note: 'Joins one row of the breadboard to another row or to a rail.',
  },
  'power module': {
    image: 'part-power.jpg',
    note: 'Sits on the end of the breadboard and gives the rails 5 V. Keep it switched off while you wire.',
  },
  'usb cable': {
    image: 'part-usb.jpg',
    note: 'Powers the power module from a computer or a USB charger.',
  },
}

export const DEMO_PART_IMAGES = Object.values(demoParts).map((p) => p.image)

// Every step's parts combined, each once (ignoring case), in the order they first appear.
export function skillParts(steps: readonly { parts: string[] }[]): string[] {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const step of steps) {
    for (const part of step.parts) {
      const key = part.trim().toLowerCase()
      if (key === '' || seen.has(key)) continue
      seen.add(key)
      parts.push(part.trim())
    }
  }
  return parts
}

// A part's picture and note: only for the demo skill's own parts.
export function partInfo(skillId: string, part: string): PartInfo | null {
  if (skillId !== DEMO_SKILL_ID) return null
  return demoParts[part.trim().toLowerCase()] ?? null
}

export type ExpertCard = { id: string; initials: string; stepTitle: string; expertName: string }

// The whole skill's saved expert answers for the From live experts card: the current
// step's first, then the other steps in order.
export function expertCards(
  steps: readonly CoachStep[],
  byStep: Readonly<Record<string, SavedAnswer[]>>,
  currentStepId: string,
): ExpertCard[] {
  const ordered = [
    ...steps.filter((s) => s.id === currentStepId),
    ...steps.filter((s) => s.id !== currentStepId),
  ]
  return ordered.flatMap((step) =>
    (byStep[step.id] ?? []).map((a) => ({
      id: `${step.id}/${a.id}`,
      initials: initials(a.expertName),
      stepTitle: step.title,
      expertName: a.expertName,
    })),
  )
}

// Up to two capital letters from a name: "Surtrix team" is "ST", "Tino" is "T".
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
  return letters.slice(0, 2).join('') || '?'
}
