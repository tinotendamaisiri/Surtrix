// Which screen each address hash opens (see Contracts in the build plan).
import { expect, test } from 'vitest'
import { coachHash, screenFromHash } from '../src/screenAddress.ts'

test('no hash, or a bare #, opens home', () => {
  expect(screenFromHash('')).toEqual({ screen: 'home' })
  expect(screenFromHash('#')).toEqual({ screen: 'home' })
})

test('#coach/{skillId} opens the coach for that skill', () => {
  expect(screenFromHash('#coach/sample-led')).toEqual({ screen: 'coach', skillId: 'sample-led' })
})

test('a coach address with no skill id, or more after it, opens home', () => {
  expect(screenFromHash('#coach/')).toEqual({ screen: 'home' })
  expect(screenFromHash('#coach')).toEqual({ screen: 'home' })
  expect(screenFromHash('#coach/sample-led/2')).toEqual({ screen: 'home' })
})

test('#capture-test opens the capture test page', () => {
  expect(screenFromHash('#capture-test')).toEqual({ screen: 'capture-test' })
})

test('any other hash opens home', () => {
  expect(screenFromHash('#something-else')).toEqual({ screen: 'home' })
  expect(screenFromHash('#Capture-Test')).toEqual({ screen: 'home' })
  expect(screenFromHash('#capture-tests')).toEqual({ screen: 'home' })
})

test('coachHash makes the address screenFromHash reads back', () => {
  expect(screenFromHash(coachHash('sample-led'))).toEqual({ screen: 'coach', skillId: 'sample-led' })
})
