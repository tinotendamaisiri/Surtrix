import { describe, expect, test } from 'vitest'
import { learnersHelped, skillsInTab, stepsLine, tabCounts, timeAgo, tradeLine } from '../src/expertDashboard.ts'
import { photoUrlOf, savedAnswerFromDocument } from '../src/savedAnswerPick.ts'
const skill = (id: string, published: boolean) => ({ id, published })
const skills = [skill('a', true), skill('b', false), skill('c', true)]

describe('your skills', () => {
  test('All, Published and Drafts, with their counts', () => {
    expect(skillsInTab(skills, 'all').map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(skillsInTab(skills, 'published').map((s) => s.id)).toEqual(['a', 'c'])
    expect(skillsInTab(skills, 'drafts').map((s) => s.id)).toEqual(['b'])
    expect(tabCounts(skills)).toEqual({ all: 3, published: 2, drafts: 1 })
  })

  test('the card lines leave out what is not known', () => {
    expect(stepsLine(6, 20)).toBe('6 steps · 20 min')
    expect(stepsLine(1)).toBe('1 step')
    expect(tradeLine('Soldering', 'Beginner')).toBe('Soldering · Beginner')
    expect(tradeLine(undefined, 'Beginner')).toBe('Beginner')
    expect(tradeLine()).toBe('')
  })
})

describe('stats and times', () => {
  test('learners helped counts each learner once', () => {
    expect(learnersHelped([{ learnerId: 'l1' }, { learnerId: 'l2' }, { learnerId: 'l1' }, { learnerId: '' }])).toBe(2)
  })

  test('time ago', () => {
    const now = new Date('2026-11-26T12:00:00Z')
    const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now)
    expect(ago(20_000)).toBe('just now')
    expect(ago(2 * 60_000)).toBe('2 min ago')
    expect(ago(3 * 3_600_000)).toBe('3 h ago')
    expect(ago(26 * 3_600_000)).toBe('1 day ago')
    expect(ago(3 * 86_400_000)).toBe('3 days ago')
    expect(timeAgo(null, now)).toBe('')
  })
})

describe('answer photos for learners', () => {
  const bytes = { toBase64: () => 'AAEC' }

  test('a saved answer with a photo carries it as a JPEG data URL', () => {
    const answer = savedAnswerFromDocument('q1', { question: 'Which row?', answer: 'Row 10.', expertName: 'Tino', photo: bytes })
    expect(answer?.photoUrl).toBe('data:image/jpeg;base64,AAEC')
  })

  test('a saved answer without one has no photo', () => {
    const answer = savedAnswerFromDocument('q1', { question: 'Which row?', answer: 'Row 10.', expertName: 'Tino', photo: 'not bytes' })
    expect(answer).not.toHaveProperty('photoUrl')
    expect(photoUrlOf(undefined)).toBeUndefined()
  })
})
