// Where "Back to skills" opens home (#59).
import { expect, test } from 'vitest'
import { nextSkillsTab, openSkillsNext, skillsTabFor, takeSkillsTab } from '../src/landingIntent.ts'

test('the demo skill goes back to All skills, any other skill to My skills', () => {
  expect(skillsTabFor('sample-led')).toBe('all')
  expect(skillsTabFor('h0mqHrOwc1uVUcZzG2yQ')).toBe('mine')
})

test('home takes the tab once: reading it does not clear it, taking it does', () => {
  expect(takeSkillsTab()).toBeNull()
  openSkillsNext('mine')
  expect(nextSkillsTab()).toBe('mine')
  expect(nextSkillsTab()).toBe('mine')
  expect(takeSkillsTab()).toBe('mine')
  expect(nextSkillsTab()).toBeNull()
  expect(takeSkillsTab()).toBeNull()
})
