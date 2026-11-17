// The Surtrix Workspace's parts, part pictures, expert cards and step list (#62).
import { readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { goToStep, markStepDone, startProgress, type CoachStep } from '../src/coach.ts'
import { demoSkill } from '../src/demoSkill.ts'
import { DEMO_PART_IMAGES, expertCards, initials, partInfo, skillParts } from '../src/workspace.ts'

const demoSteps: CoachStep[] = demoSkill.steps.map((s, i) => ({ ...s, id: `step-${i + 1}` }))

test("the demo skill's parts are every step's parts combined, each once, in order", () => {
  expect(skillParts(demoSteps)).toEqual(['breadboard', 'LED', '220 or 330 ohm resistor', 'jumper wire', 'power module', 'USB cable'])
  expect(skillParts([{ parts: ['LED', ' led ', 'Wire'] }, { parts: ['wire', ''] }])).toEqual(['LED', 'Wire'])
})

test('every demo part has a picture and a note, and only the demo skill gets them', () => {
  for (const part of skillParts(demoSteps)) {
    const info = partInfo('sample-led', part)
    expect(info?.note.length).toBeGreaterThan(10)
    expect(info?.note).not.toMatch(/[\u2013\u2014]| - /)
  }
  expect(partInfo('h0mqHrOwc1uVUcZzG2yQ', 'LED')).toBeNull()
  expect(partInfo('sample-led', 'soldering iron')).toBeNull()
})

test('public/workspace holds exactly the demo part pictures', () => {
  expect(readdirSync(new URL('../public/workspace/', import.meta.url)).sort()).toEqual([...DEMO_PART_IMAGES].sort())
})

test("expert cards list the whole skill's answers, the current step's first", () => {
  const answer = (id: string, expertName: string) => ({ id, question: 'q', answer: 'a', expertName, createdAt: null })
  const byStep = { 'step-2': [answer('a1', 'Surtrix team')], 'step-4': [answer('a2', 'Surtrix team'), answer('a3', 'Tino')] }
  expect(expertCards(demoSteps, byStep, 'step-4').map((c) => [c.stepTitle, c.expertName, c.initials])).toEqual([
    ['Connect the power', 'Surtrix team', 'ST'],
    ['Connect the power', 'Tino', 'T'],
    ['Add the resistor', 'Surtrix team', 'ST'],
  ])
  expect(expertCards(demoSteps, {}, 'step-1')).toEqual([])
})

test('initials take up to two words', () => {
  expect(initials('T. Jones')).toBe('TJ')
  expect(initials('Ada Lovelace King')).toBe('AL')
  expect(initials('  ')).toBe('?')
})

test('the step list goes straight to a step without marking anything done', () => {
  const start = startProgress(4)
  expect(goToStep(start, 2)).toEqual({ stepIndex: 2, done: [false, false, false, false], finished: false })
  expect(goToStep(start, 4)).toBe(start)
  expect(goToStep(start, -1)).toBe(start)
  let finished = start
  for (let i = 0; i < 4; i++) finished = markStepDone(finished)
  expect(goToStep(finished, 1)).toEqual({ stepIndex: 1, done: [true, true, true, true], finished: false })
})
