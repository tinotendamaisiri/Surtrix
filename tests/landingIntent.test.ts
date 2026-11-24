// Where "Back to skills" and the Workspace's Exit go (#59, #83).
import { expect, test } from 'vitest'
import { skillsTabFor } from '../src/landingIntent.ts'
import { screenFromHash, skillsHash } from '../src/screenAddress.ts'

test('the demo skill goes back to All skills, any other skill to My skills', () => {
  expect(skillsTabFor('sample-led')).toBe('all')
  expect(skillsTabFor('h0mqHrOwc1uVUcZzG2yQ')).toBe('mine')
})

test('a published skill goes back to All skills, and the demo stays there either way', () => {
  expect(skillsTabFor('h0mqHrOwc1uVUcZzG2yQ', true)).toBe('all')
  expect(skillsTabFor('h0mqHrOwc1uVUcZzG2yQ', false)).toBe('mine')
  expect(skillsTabFor('sample-led', false)).toBe('all')
})

test('each tab has its own Skills page address, which opens that tab', () => {
  expect(skillsHash('all')).toBe('#skills')
  expect(skillsHash('mine')).toBe('#skills/mine')
  expect(screenFromHash(skillsHash(skillsTabFor('sample-led')))).toEqual({ screen: 'skills', tab: 'all' })
  expect(screenFromHash(skillsHash(skillsTabFor('h0mqHrOwc1uVUcZzG2yQ')))).toEqual({ screen: 'skills', tab: 'mine' })
})
