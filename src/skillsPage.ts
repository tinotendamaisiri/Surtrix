// The Skills page and the landing carousel (#83): the trade chips, search, the pinned
// card, the two landing rows and the card text, from the skills catalog. Pure, so the
// tests can use it without a browser.
import type { CatalogSkill } from './skillCatalog.ts'

export const ALL_TRADES = 'All'

// The chips: All, Electronics (where the pinned LED card is), then every trade in the
// order the catalog first names it.
export function tradeChips(skills: readonly CatalogSkill[]): string[] {
  return [...new Set([ALL_TRADES, 'Electronics', ...skills.map((s) => s.trade)])]
}

// A skill matches when the chip is All or its trade, and the search words appear in its
// title, trade, description or expert's name.
export function skillMatches(skill: CatalogSkill, search: string, trade: string): boolean {
  if (trade !== ALL_TRADES && skill.trade !== trade) return false
  const words = search.trim().toLowerCase()
  if (words === '') return true
  return `${skill.title} ${skill.trade} ${skill.description} ${skill.expert}`.toLowerCase().includes(words)
}

export function countText(count: number): string {
  return `${count} ${count === 1 ? 'skill' : 'skills'}`
}

// "9 steps · 60 min" on the Skills page.
export function stepsAndTime(skill: Pick<CatalogSkill, 'steps' | 'time'>): string {
  return `${skill.steps} ${skill.steps === 1 ? 'step' : 'steps'} · ${skill.time}`
}

// The muted line at the bottom of every example card (settled g, j and k).
export function exampleLine(skill: Pick<CatalogSkill, 'trainingOnly'>): string {
  return skill.trainingOnly ? 'Example skill · Not for real emergencies' : 'Example skill'
}

// The tag on the photo: TRAINING ONLY for practice skills, VERIFIED for the rest.
export function cardTag(skill: Pick<CatalogSkill, 'trainingOnly'>): string {
  return skill.trainingOnly ? 'TRAINING ONLY' : '✓ VERIFIED'
}

// The landing's two rows: the 1st, 3rd, 5th skill and on in the top row, the 2nd, 4th
// and on in the bottom row, so each row mixes trades.
export function landingRows<T>(skills: readonly T[]): [T[], T[]] {
  return [skills.filter((_, i) => i % 2 === 0), skills.filter((_, i) => i % 2 === 1)]
}

export const PLACEHOLDER_NOTE =
  'Example skills: expert names, steps and times are placeholders until experts publish real skills.'

// The trade chip row's slide (#83, p): pixels a second, about as slow as the landing rows.
export const CHIP_SLIDE_SPEED = 24

// Where the sliding chip row is after `seconds`. The row holds the chips twice, so when it
// has moved one copy's width it starts that copy again and the loop never shows a seam.
export function chipRowPosition(position: number, seconds: number, loopWidth: number, speed = CHIP_SLIDE_SPEED): number {
  if (loopWidth <= 0) return position
  const next = position + seconds * speed
  return next >= loopWidth ? next - loopWidth : next
}
