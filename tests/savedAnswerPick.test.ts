// Saved answers in the coach (#31): reading them, what the model is asked, and the check of
// its pick.
import { describe, expect, test } from 'vitest'
import { demoAnswers } from '../src/demoSkill.ts'
import {
  answersToPick,
  MAX_PICK_ANSWERS,
  NONE_FITS,
  parsePick,
  PickAnswerError,
  pickPrompt,
  pickValues,
  savedAnswerFromDocument,
  sortAnswers,
  type SavedAnswer,
} from '../src/savedAnswerPick.ts'

const at = (ms: number) => ({ toDate: () => new Date(ms) })

const stepFour: SavedAnswer[] = demoAnswers
  .filter((a) => a.stepId === 'step-4')
  .map((a, i) => ({ id: a.id, question: a.question, answer: a.answer, expertName: 'Surtrix team', createdAt: new Date(i) }))

describe('reading a saved answer', () => {
  test('keeps a whole answer, trimmed, with its time', () => {
    expect(
      savedAnswerFromDocument('a1', {
        questionId: 'a1',
        question: ' Why? ',
        answer: 'Because. ',
        expertId: 'e1',
        expertName: 'Ada',
        createdAt: at(5),
      }),
    ).toEqual({ id: 'a1', question: 'Why?', answer: 'Because.', expertName: 'Ada', createdAt: new Date(5) })
  })

  test('drops an answer with missing or empty text', () => {
    expect(savedAnswerFromDocument('a1', { question: 'Why?', expertName: 'Ada' })).toBeNull()
    expect(savedAnswerFromDocument('a1', { question: 'Why?', answer: ' ', expertName: 'Ada' })).toBeNull()
    expect(savedAnswerFromDocument('a1', { question: 'Why?', answer: 'Because.', expertName: 7 })).toBeNull()
  })

  test('drops an answer whose id is the none value, so a pick of none is never an answer', () => {
    expect(savedAnswerFromDocument(NONE_FITS, { question: 'Why?', answer: 'Because.', expertName: 'Ada' })).toBeNull()
  })

  test('a time still being written by the server reads as no time', () => {
    expect(savedAnswerFromDocument('a1', { question: 'Why?', answer: 'Because.', expertName: 'Ada', createdAt: null })?.createdAt).toBeNull()
  })
})

describe('choosing what the model sees', () => {
  const many: SavedAnswer[] = Array.from({ length: MAX_PICK_ANSWERS + 3 }, (_, i) => ({
    id: `a${i}`,
    question: `Question ${i}`,
    answer: `Answer ${i}`,
    expertName: 'Ada',
    createdAt: new Date(1000 - i),
  }))

  test('answers read oldest first', () => {
    expect(sortAnswers(many)[0].id).toBe(`a${MAX_PICK_ANSWERS + 2}`)
  })

  test(`only the newest ${MAX_PICK_ANSWERS} answers go to the model`, () => {
    const picked = answersToPick(many)
    expect(picked).toHaveLength(MAX_PICK_ANSWERS)
    expect(picked.map((a) => a.id)).toContain('a0')
    expect(picked.map((a) => a.id)).not.toContain(`a${MAX_PICK_ANSWERS + 2}`)
  })

  test('the model may answer with an answer id or none, nothing else', () => {
    expect(pickValues(stepFour)).toEqual(['demo-led-backwards', 'demo-no-power', 'none'])
  })

  test('the prompt holds the step, the question and every answer with its id', () => {
    const prompt = pickPrompt('Connect the power', '  My LED does not light. ', stepFour)
    expect(prompt).toContain('Step: Connect the power')
    expect(prompt).toContain("Learner's question: My LED does not light.")
    for (const a of stepFour) {
      expect(prompt).toContain(`id: ${a.id}`)
      expect(prompt).toContain(a.answer)
    }
  })
})

describe("checking the model's pick", () => {
  test('a bare id picks that answer (the cloud answers this way)', () => {
    expect(parsePick('demo-no-power\n', stepFour)?.id).toBe('demo-no-power')
  })

  test('an id as a JSON string picks that answer (the device may answer this way)', () => {
    expect(parsePick('"demo-led-backwards"', stepFour)?.id).toBe('demo-led-backwards')
  })

  test('none, bare or as a JSON string, means no answer fits', () => {
    expect(parsePick('none', stepFour)).toBeNull()
    expect(parsePick(' "none" ', stepFour)).toBeNull()
  })

  test('an id that is not one of these answers is refused', () => {
    expect(() => parsePick('demo-led-in-rail', stepFour)).toThrow(PickAnswerError)
    expect(() => parsePick('', stepFour)).toThrow(PickAnswerError)
  })

  test('a malformed answer is refused', () => {
    expect(() => parsePick('"demo-no-power', stepFour)).toThrow(PickAnswerError)
    expect(() => parsePick('{"id":"demo-no-power"}', stepFour)).toThrow(PickAnswerError)
    expect(() => parsePick('"7"', stepFour)).toThrow(PickAnswerError)
  })
})
