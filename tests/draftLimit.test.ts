import { describe, expect, test } from 'vitest'
import { DRAFT_LIMIT_MESSAGE, nextDraftCount } from '../src/draftLimit.ts'

const noon = Date.UTC(2026, 11, 10, 12)
const yesterday = Date.UTC(2026, 11, 9, 23, 59)

describe('drafts per day (#113)', () => {
  test('the first draft of a day counts as 1', () => {
    expect(nextDraftCount(null, noon)).toBe(1)
    expect(nextDraftCount({ count: 5, atMs: yesterday }, noon)).toBe(1)
  })

  test('up to 5 a day, then none', () => {
    expect(nextDraftCount({ count: 4, atMs: noon - 1000 }, noon)).toBe(5)
    expect(nextDraftCount({ count: 5, atMs: noon - 1000 }, noon)).toBeNull()
  })

  test('says plainly when to come back', () => {
    expect(DRAFT_LIMIT_MESSAGE).toBe('You have drafted 5 skills today. You can draft again tomorrow.')
  })
})
