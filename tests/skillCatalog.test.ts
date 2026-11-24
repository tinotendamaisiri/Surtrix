// The skills catalog the Skills page and the landing both read (#83).
import { readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { demoSkill } from '../src/demoSkill.ts'
import { HERO_IMAGE, HERO_SMALL_IMAGE } from '../src/landingImages.ts'
import { exampleSkills, pinnedSkill } from '../src/skillCatalog.ts'
import {
  ALL_TRADES,
  allSkillsShown,
  CHIP_SLIDE_SPEED,
  chipRowPosition,
  cardTag,
  countText,
  exampleLine,
  landingRows,
  PLACEHOLDER_NOTE,
  publishedNewestFirst,
  publishedSkillMatches,
  skillMatches,
  stepsAndTime,
  stepsText,
  tradeChips,
  type PublishedSkill,
} from '../src/skillsPage.ts'

const landingFolder = new URL('../public/landing/', import.meta.url)

test('the catalog has the 44 designed example skills and the pinned LED card, which is the only link', () => {
  expect(exampleSkills).toHaveLength(44)
  expect(new Set(exampleSkills.map((s) => s.title)).size).toBe(44)
  expect(exampleSkills.some((s) => 'href' in s)).toBe(false)
  expect(exampleSkills.some((s) => s.title === pinnedSkill.title)).toBe(false)
  expect(pinnedSkill.href).toBe('#coach/sample-led')
})

test("the pinned LED card's text is the design's, and its step count is the demo skill's", () => {
  expect(pinnedSkill).toMatchObject({
    trade: 'Electronics',
    level: 'Beginner',
    title: 'Light an LED with a resistor',
    description: 'Place an LED, add a resistor and a wire, then power it on safely.',
    expert: 'Surtrix team',
  })
  expect(pinnedSkill.steps).toBe(demoSkill.steps.length)
  expect(stepsAndTime(pinnedSkill)).toBe('4 steps · 10 min')
})

test('the three first aid cards, and only they, are training only, from a field in the data', () => {
  const training = exampleSkills.filter((s) => s.trainingOnly)
  expect(training.map((s) => s.title)).toEqual(['Practice CPR on a manikin', 'Wrap a sprained ankle', 'Apply a tourniquet'])
  for (const s of training) {
    expect(cardTag(s)).toBe('TRAINING ONLY')
    expect(exampleLine(s)).toBe('Example skill · Not for real emergencies')
  }
  const other = exampleSkills.find((s) => !s.trainingOnly)!
  expect(cardTag(other)).toBe('✓ VERIFIED')
  expect(exampleLine(other)).toBe('Example skill')
})

test('public/landing holds exactly the photos the pages use, each card its own', () => {
  const used = [HERO_IMAGE, HERO_SMALL_IMAGE, pinnedSkill.image, ...exampleSkills.map((s) => s.image)]
  expect(new Set(used).size).toBe(used.length)
  expect(readdirSync(landingFolder).sort()).toEqual([...used].sort())
})

test('the landing rows hold all 44 skills once, alternating, so each row mixes trades', () => {
  const [top, bottom] = landingRows(exampleSkills)
  expect(top).toHaveLength(22)
  expect(bottom).toHaveLength(22)
  expect(new Set([...top, ...bottom]).size).toBe(44)
  expect(top[0]).toBe(exampleSkills[0])
  expect(bottom[0]).toBe(exampleSkills[1])
  expect(new Set(top.slice(0, 6).map((s) => s.trade)).size).toBeGreaterThan(3)
})

test('the chips are All, Electronics, then every trade once, in the order the catalog names them', () => {
  const chips = tradeChips(exampleSkills)
  expect(chips.slice(0, 4)).toEqual([ALL_TRADES, 'Electronics', 'Auto mechanics', 'Phone repair'])
  expect(new Set(chips).size).toBe(chips.length)
  expect(chips).toHaveLength(2 + new Set(exampleSkills.map((s) => s.trade)).size - 1)
})

test('search matches the title, trade, description and expert, in any case; a chip keeps its trade only', () => {
  const brakes = exampleSkills[0]
  for (const words of ['brake', 'AUTO mechanics', 'caliper', 'okafor', '  pads ']) expect(skillMatches(brakes, words, ALL_TRADES)).toBe(true)
  expect(skillMatches(brakes, 'pottery', ALL_TRADES)).toBe(false)
  expect(skillMatches(brakes, '', 'Auto mechanics')).toBe(true)
  expect(skillMatches(brakes, '', 'Welding')).toBe(false)
  expect(exampleSkills.filter((s) => skillMatches(s, '', 'Cooking'))).toHaveLength(5)
})

test('the pinned LED card shows for All and Electronics and its own words, and hides otherwise', () => {
  expect(skillMatches(pinnedSkill, '', ALL_TRADES)).toBe(true)
  expect(skillMatches(pinnedSkill, '', 'Electronics')).toBe(true)
  expect(skillMatches(pinnedSkill, 'resistor', ALL_TRADES)).toBe(true)
  expect(skillMatches(pinnedSkill, '', 'Cooking')).toBe(false)
  expect(skillMatches(pinnedSkill, 'pasta', ALL_TRADES)).toBe(false)
})

test('the count, the step text and the placeholder note read as designed, with no dashes', () => {
  expect(countText(44)).toBe('44 skills')
  expect(countText(1)).toBe('1 skill')
  expect(stepsAndTime(exampleSkills[0])).toBe('9 steps · 60 min')
  expect(PLACEHOLDER_NOTE).toBe('Example skills: expert names, steps and times are placeholders until experts publish real skills.')
  for (const s of [pinnedSkill, ...exampleSkills]) {
    for (const text of [s.trade, s.title, s.description, s.expert, s.time]) expect(text).not.toMatch(/[\u2013\u2014]| - /)
  }
})

test('the chip row slides slowly and loops without a seam', () => {
  expect(CHIP_SLIDE_SPEED).toBeGreaterThan(0)
  expect(CHIP_SLIDE_SPEED).toBeLessThan(60)
  expect(chipRowPosition(100, 1, 1000, 24)).toBe(124)
  // Past one copy's width it starts that copy again, at the same point in it.
  expect(chipRowPosition(990, 1, 1000, 24)).toBe(14)
  // Nothing to loop over yet: it stays where it is.
  expect(chipRowPosition(50, 1, 0, 24)).toBe(50)
})

// Skills experts published (#52), shown under From experts in All skills.
const brakes: PublishedSkill = { id: 'a', title: 'Bleed the brakes', stepCount: 6, expertName: 'Ada Expert', publishedAt: 2000 }
const solder: PublishedSkill = { id: 'b', title: 'Solder a header', stepCount: 1, expertName: 'Ben Smith', publishedAt: 3000 }
const unknownTime: PublishedSkill = { id: 'c', title: 'Wire a plug', stepCount: 4, expertName: 'Cy Lee', publishedAt: 0 }

test('published skills are newest publish first, an unknown time last, and the list given is not changed', () => {
  const given = [brakes, unknownTime, solder]
  expect(publishedNewestFirst(given).map((s) => s.id)).toEqual(['b', 'a', 'c'])
  expect(given.map((s) => s.id)).toEqual(['a', 'c', 'b'])
})

test("search matches a published skill's title and expert name, in any case, under the All chip only", () => {
  expect(publishedSkillMatches(brakes, '', ALL_TRADES)).toBe(true)
  expect(publishedSkillMatches(brakes, 'BLEED', ALL_TRADES)).toBe(true)
  expect(publishedSkillMatches(brakes, 'ada exp', ALL_TRADES)).toBe(true)
  expect(publishedSkillMatches(brakes, 'solder', ALL_TRADES)).toBe(false)
  expect(publishedSkillMatches(brakes, '', 'Auto mechanics')).toBe(false)
  expect(publishedSkillMatches(brakes, 'bleed', 'Electronics')).toBe(false)
})

test('the count line includes the published skills shown', () => {
  const all = allSkillsShown([brakes, solder], exampleSkills, '', ALL_TRADES)
  expect(all.published).toEqual([brakes, solder])
  expect(all.examples).toHaveLength(exampleSkills.length)
  expect(all.count).toBe(countText(exampleSkills.length + 2))

  const searched = allSkillsShown([brakes, solder], exampleSkills, 'ben smith', ALL_TRADES)
  expect(searched.published).toEqual([solder])
  expect(searched.examples).toEqual([])
  expect(searched.count).toBe('1 skill')

  const chip = allSkillsShown([brakes, solder], exampleSkills, '', 'Auto mechanics')
  expect(chip.published).toEqual([])
  expect(chip.count).toBe(countText(chip.examples.length))
  expect(chip.examples.length).toBeGreaterThan(0)
})

test('a published card says its step count in words', () => {
  expect(stepsText(1)).toBe('1 step')
  expect(stepsText(6)).toBe('6 steps')
})
