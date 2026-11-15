// Saved answers in the coach (#31): reading them, what the model is asked, and the check of
// its pick.
import { describe, expect, test } from 'vitest'
import { demoAnswers } from '../src/demoSkill.ts'
import {
  checkSavedAnswers,
  hybridThenCloud,
  NONE_FITS,
  parsePick,
  PickAnswerError,
  pickPrompt,
  pickValues,
  savedAnswerFromDocument,
  sortAnswers,
  stepAnswersFromDocuments,
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

describe("loading a skill's saved answers", () => {
  const doc = (id: string, ms: number) => ({
    id,
    data: { questionId: id, question: `Question ${id}`, answer: `Answer ${id}`, expertName: 'Ada', createdAt: at(ms) },
  })

  test('each step gets only its own answers, oldest first, and a step without answers an empty list', () => {
    const byStep = stepAnswersFromDocuments([
      { stepId: 'step-1', documents: [] },
      { stepId: 'step-2', documents: [doc('b', 20), doc('a', 10)] },
      { stepId: 'step-3', documents: [doc('c', 5)] },
    ])
    expect(Object.keys(byStep)).toEqual(['step-1', 'step-2', 'step-3'])
    expect(byStep['step-1']).toEqual([])
    expect(byStep['step-2'].map((a) => a.id)).toEqual(['a', 'b'])
    expect(byStep['step-3'].map((a) => a.id)).toEqual(['c'])
  })

  test('a document that is not a whole answer is left out of its step', () => {
    const byStep = stepAnswersFromDocuments([
      { stepId: 'step-2', documents: [doc('a', 1), { id: 'broken', data: { question: 'Why?' } }] },
    ])
    expect(byStep['step-2'].map((a) => a.id)).toEqual(['a'])
  })

  test('answers with the same time read in id order', () => {
    const answers = sortAnswers([
      { id: 'b', question: 'Q', answer: 'A', expertName: 'Ada', createdAt: null },
      { id: 'a', question: 'Q', answer: 'A', expertName: 'Ada', createdAt: null },
    ])
    expect(answers.map((a) => a.id)).toEqual(['a', 'b'])
  })
})

describe('what the model sees', () => {
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

describe('what Check saved answers shows', () => {
  test('a pick, or none fits, is shown as the model gave it', async () => {
    expect(await checkSavedAnswers(async () => ({ answer: stepFour[0] }))).toEqual({
      kind: 'picked',
      pick: { answer: stepFour[0] },
    })
    expect(await checkSavedAnswers(async () => ({ answer: null }))).toEqual({ kind: 'picked', pick: { answer: null } })
  })

  test('when no model can answer, every saved answer is listed, never "none fits"', async () => {
    expect(await checkSavedAnswers(() => Promise.reject(new Error('Failed to fetch')))).toEqual({ kind: 'list' })
  })

  test('a refused pick lists every saved answer too', async () => {
    const result = await checkSavedAnswers(async () => ({ answer: parsePick('demo-led-in-rail', stepFour) }))
    expect(result).toEqual({ kind: 'list' })
  })
})

describe('trying the cloud when the device fails', () => {
  const calls: string[] = []
  const hybrid = (ok: boolean) => async () => {
    calls.push('hybrid')
    if (!ok) throw new Error('device failed')
    return 'hybrid answer'
  }
  const cloud = async () => {
    calls.push('cloud')
    return 'cloud answer'
  }

  test('a Hybrid answer is used without asking the cloud again', async () => {
    calls.length = 0
    expect(await hybridThenCloud(hybrid(true), cloud, true)).toBe('hybrid answer')
    expect(calls).toEqual(['hybrid'])
  })

  test('with Nano in Chrome, a failed Hybrid call is tried once in the cloud', async () => {
    calls.length = 0
    expect(await hybridThenCloud(hybrid(false), cloud, true)).toBe('cloud answer')
    expect(calls).toEqual(['hybrid', 'cloud'])
  })

  test('without Nano, Hybrid already asked the cloud, so its failure stands', async () => {
    calls.length = 0
    await expect(hybridThenCloud(hybrid(false), cloud, false)).rejects.toThrow('device failed')
    expect(calls).toEqual(['hybrid'])
  })
})
