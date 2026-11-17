// The landing page's skill cards and photos (#51).
import { readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { demoSkill } from '../src/demoSkill.ts'
import { HERO_IMAGE, HERO_SMALL_IMAGE, landingSkills } from '../src/landingSkills.ts'

const landingFolder = new URL('../public/landing/', import.meta.url)

test('the carousel has the 14 designed cards, and only the LED card is a link: to the demo skill', () => {
  expect(landingSkills).toHaveLength(14)
  const links = landingSkills.filter((s) => s.href)
  expect(links.map((s) => [s.title, s.href])).toEqual([['Light an LED with a resistor', '#coach/sample-led']])
})

test("the LED card's step count matches the demo skill", () => {
  const led = landingSkills.find((s) => s.href)
  expect(led?.stepCount).toBe(demoSkill.steps.length)
})

test('public/landing holds exactly the photos the page uses, each card its own', () => {
  const used = [HERO_IMAGE, HERO_SMALL_IMAGE, ...landingSkills.map((s) => s.image)]
  expect(new Set(used).size).toBe(used.length)
  expect(readdirSync(landingFolder).sort()).toEqual([...used].sort())
})

test('the card copy has no dashes as punctuation', () => {
  for (const s of landingSkills) {
    for (const text of [s.trade, s.title, s.text, s.verifiedBy]) {
      expect(text).not.toMatch(/[\u2013\u2014]| - /)
    }
  }
})
