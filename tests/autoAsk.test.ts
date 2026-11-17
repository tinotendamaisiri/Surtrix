// The AI asking an expert by itself (#65): the choice and what happens when no saved answer fits.
import { expect, test } from 'vitest'
import {
  AUTO_ASK_LIMIT,
  AUTO_QUESTION,
  afterNoFit,
  manualSendBlocked,
  readAutoAskChoice,
  writeAutoAskChoice,
} from '../src/autoAsk.ts'

function fakeStore() {
  const values = new Map<string, string>()
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v) }
}

test('no choice until the learner makes one, then it is remembered', () => {
  const store = fakeStore()
  expect(readAutoAskChoice(store)).toBeNull()
  writeAutoAskChoice('on', store)
  expect(readAutoAskChoice(store)).toBe('on')
  writeAutoAskChoice('off', store)
  expect(readAutoAskChoice(store)).toBe('off')
})

test('storage that is missing, unreadable or holds something else counts as no choice', () => {
  expect(readAutoAskChoice(null)).toBeNull()
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  expect(readAutoAskChoice(broken)).toBeNull()
  expect(() => writeAutoAskChoice('on', broken)).not.toThrow()
  const odd = fakeStore()
  odd.setItem('surtrix.askExpertsForMe', 'yes')
  expect(readAutoAskChoice(odd)).toBeNull()
})

test('an open question on the step blocks a new one, even under the limit', () => {
  expect(afterNoFit({ openOnStep: true, asked: 0 })).toBe('still-waiting')
  expect(afterNoFit({ openOnStep: true, asked: AUTO_ASK_LIMIT })).toBe('still-waiting')
})

test('at most 3 automatic questions per session', () => {
  expect(AUTO_ASK_LIMIT).toBe(3)
  expect(afterNoFit({ openOnStep: false, asked: 0 })).toBe('ask')
  expect(afterNoFit({ openOnStep: false, asked: 2 })).toBe('ask')
  expect(afterNoFit({ openOnStep: false, asked: 3 })).toBe('limit')
})

test('the automatic question fits the question rules and has no dashes', () => {
  expect(AUTO_QUESTION.length).toBeLessThanOrEqual(500)
  expect(AUTO_QUESTION).not.toMatch(/[\u2013\u2014]| - /)
})

test('an open manual panel stops the automatic question; an open question on the step still comes first (#69)', () => {
  expect(afterNoFit({ panelOpen: true, openOnStep: false, asked: 0 })).toBe('panel-open')
  expect(afterNoFit({ panelOpen: true, openOnStep: false, asked: 3 })).toBe('panel-open')
  expect(afterNoFit({ panelOpen: true, openOnStep: true, asked: 0 })).toBe('still-waiting')
  expect(afterNoFit({ panelOpen: false, openOnStep: false, asked: 0 })).toBe('ask')
})

test("the manual Send is off only while the AI's own question on the step is open and asking is on (#69)", () => {
  const judgeOpen = { origin: 'judge', status: 'open' }
  expect(manualSendBlocked('on', [judgeOpen])).toBe(true)
  expect(manualSendBlocked('off', [judgeOpen])).toBe(false)
  expect(manualSendBlocked(null, [judgeOpen])).toBe(false)
  expect(manualSendBlocked('on', [{ origin: 'judge', status: 'answered' }])).toBe(false)
  expect(manualSendBlocked('on', [{ origin: 'learner', status: 'open' }])).toBe(false)
  expect(manualSendBlocked('on', [])).toBe(false)
})
