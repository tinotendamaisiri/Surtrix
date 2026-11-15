// Moving through a skill's steps on the coach screen, and the hard coded sample skill.
import { describe, expect, test } from 'vitest'
import { goBack, goNext, markStepDone, startProgress } from '../src/coach.ts'
import { sampleSkill, skills } from '../src/sampleSkill.ts'

describe('step moves', () => {
  // Start again on the coach is a fresh start, so this also covers Start again.
  test('a skill starts at step 1 with nothing done', () => {
    expect(startProgress(4)).toEqual({ stepIndex: 0, done: [false, false, false, false], finished: false })
  })

  test('Back on step 1 stays on step 1', () => {
    expect(goBack(startProgress(4)).stepIndex).toBe(0)
  })

  test('Back and Next move one step without marking anything done', () => {
    const onStep3 = goNext(goNext(startProgress(4)))
    expect(onStep3.stepIndex).toBe(2)
    expect(goBack(onStep3).stepIndex).toBe(1)
    expect(goBack(onStep3).done).toEqual([false, false, false, false])
  })

  test('Next on the last step stays on the last step', () => {
    const onLast = { ...startProgress(4), stepIndex: 3 }
    expect(goNext(onLast).stepIndex).toBe(3)
  })

  test('Mark step done marks the current step and moves to the next', () => {
    const onStep2 = goNext(startProgress(4))
    const after = markStepDone(onStep2)
    expect(after).toEqual({ stepIndex: 2, done: [false, true, false, false], finished: false })
  })

  test('Mark step done keeps steps marked earlier', () => {
    const after = markStepDone(goBack(markStepDone(startProgress(3))))
    expect(after.done).toEqual([true, false, false])
    expect(after.stepIndex).toBe(1)
  })

  test('Mark step done on the last step finishes the skill', () => {
    const onLast = { ...startProgress(4), stepIndex: 3 }
    expect(markStepDone(onLast)).toEqual({ stepIndex: 3, done: [false, false, false, true], finished: true })
  })

  test('a one step skill finishes on its first Mark step done', () => {
    expect(markStepDone(startProgress(1)).finished).toBe(true)
  })
})

describe('sample skill', () => {
  test('uses the ids fixed in the Contracts', () => {
    expect(sampleSkill.id).toBe('sample-led')
    expect(sampleSkill.steps.map((step) => step.id)).toEqual(['step-1', 'step-2', 'step-3', 'step-4'])
  })

  test('every step has trimmed, non empty text', () => {
    for (const step of sampleSkill.steps) {
      for (const text of [step.title, step.instruction, step.doneWhen, ...step.parts]) {
        expect(text).toBe(text.trim())
        expect(text).not.toBe('')
      }
    }
  })

  test('has no em or en dashes in its text', () => {
    expect(JSON.stringify(sampleSkill)).not.toMatch(/[–—]/)
  })

  test('is on the home list', () => {
    expect(skills.map((skill) => skill.id)).toContain('sample-led')
  })
})
