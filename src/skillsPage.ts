// The Skills page and the landing carousel (#83): the trade chips, search, the pinned
// card, the two landing rows and the card text, from the skills catalog. Pure, so the
// tests can use it without a browser.
import type { BadgeId } from './safety.ts'
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

// A skill an expert published (#52), for From experts in All skills. publishedAt is in
// milliseconds, 0 when unknown.
export type PublishedSkill = { id: string; title: string; stepCount: number; expertName: string; publishedAt: number; badges?: BadgeId[] }

export function publishedNewestFirst(skills: readonly PublishedSkill[]): PublishedSkill[] {
  return [...skills].sort((a, b) => b.publishedAt - a.publishedAt)
}

// A published skill has no trade yet, so it shows only under the All chip, and the search
// words must appear in its title or expert's name.
export function publishedSkillMatches(skill: PublishedSkill, search: string, trade: string): boolean {
  if (trade !== ALL_TRADES) return false
  const words = search.trim().toLowerCase()
  if (words === '') return true
  return `${skill.title} ${skill.expertName}`.toLowerCase().includes(words)
}

// What All skills shows below the pinned card for this search and chip: the published
// skills, the example skills, and the count line for both together.
export function allSkillsShown(
  published: readonly PublishedSkill[],
  examples: readonly CatalogSkill[],
  search: string,
  trade: string,
): { published: PublishedSkill[]; examples: CatalogSkill[]; count: string } {
  const publishedShown = published.filter((s) => publishedSkillMatches(s, search, trade))
  const examplesShown = examples.filter((s) => skillMatches(s, search, trade))
  return { published: publishedShown, examples: examplesShown, count: countText(publishedShown.length + examplesShown.length) }
}

// "4 steps" on a published skill's card.
export function stepsText(count: number): string {
  return `${count} ${count === 1 ? 'step' : 'steps'}`
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
