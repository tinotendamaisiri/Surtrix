// Moving through a skill's steps on the coach screen.
import { describe, expect, test } from 'vitest'
import { followWiringCheck, goBack, goNext, markStepDone, startProgress } from '../src/coach.ts'

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

describe('the Done mark follows the latest wiring check', () => {
  // Step 1 marked done earlier, then the learner went back to it.
  const step1DoneAndBack = goBack(markStepDone(startProgress(3)))

  test('"not yet" on a step marked done earlier clears its mark and stays on the step', () => {
    expect(step1DoneAndBack.done).toEqual([true, false, false])
    expect(followWiringCheck(step1DoneAndBack, 0, 'not yet')).toEqual({ stepIndex: 0, done: [false, false, false], finished: false })
  })

  test('"unsure" on a step marked done earlier clears its mark too', () => {
    expect(followWiringCheck(step1DoneAndBack, 0, 'unsure').done).toEqual([false, false, false])
  })

  test('a correct check marks the step done again and moves to the next', () => {
    const notYet = followWiringCheck(step1DoneAndBack, 0, 'not yet')
    expect(followWiringCheck(notYet, 0, 'correct')).toEqual({ stepIndex: 1, done: [true, false, false], finished: false })
  })

  test('Mark done anyway after "not yet" brings the mark back', () => {
    const notYet = followWiringCheck(step1DoneAndBack, 0, 'not yet')
    expect(markStepDone(notYet).done).toEqual([true, false, false])
  })

  test('a check that failed without a verdict leaves the mark as it is', () => {
    expect(followWiringCheck(step1DoneAndBack, 0, null)).toEqual(step1DoneAndBack)
    const notYet = followWiringCheck(step1DoneAndBack, 0, 'not yet')
    expect(followWiringCheck(notYet, 0, null).done).toEqual([false, false, false])
  })

  test('a verdict clears the mark of the step that was checked, not the step on screen', () => {
    const twoDoneOnStep3 = markStepDone(markStepDone(startProgress(3)))
    expect(twoDoneOnStep3.stepIndex).toBe(2)
    const after = followWiringCheck(twoDoneOnStep3, 0, 'not yet')
    expect(after).toEqual({ stepIndex: 2, done: [false, true, false], finished: false })
  })

  test('a correct verdict for a step no longer on screen marks it without moving', () => {
    const onStep3 = goNext(goNext(startProgress(3)))
    expect(followWiringCheck(onStep3, 0, 'correct')).toEqual({ stepIndex: 2, done: [true, false, false], finished: false })
  })
})
