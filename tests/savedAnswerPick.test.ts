// Saved answers in the coach (#31): reading them, what the model is asked, and the check of
// its pick.
import { describe, expect, test } from 'vitest'
import { demoAnswers } from '../src/demoSkill.ts'
import {
  checkSavedAnswers,
  hasSavedAnswers,
  hybridThenCloud,
  listenAgainAfterFailure,
  nanoReady,
  NONE_FITS,
  parsePick,
  PickAnswerError,
  pickPrompt,
  RESUBSCRIBE_MS,
  pickValues,
  savedAnswerFromDocument,
  sortAnswers,
  stepAnswersFromDocuments,
  warmUp,
  warmUpOnce,
  type SavedAnswer,
  type WarmUpOutcome,
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
  // A clock the attempts move on, so the time of each attempt is known.
  function attempts(hybridOk: boolean, hybridMs = 5000, cloudMs = 1200) {
    const calls: string[] = []
    let clock = 0
    return {
      calls,
      now: () => clock,
      hybrid: async () => {
        calls.push('hybrid')
        clock += hybridMs
        if (!hybridOk) throw new Error('device failed')
        return 'hybrid answer'
      },
      cloud: async () => {
        calls.push('cloud')
        clock += cloudMs
        return 'cloud answer'
      },
    }
  }

  test('a Hybrid answer is used without asking the cloud again', async () => {
    const a = attempts(true, 3300)
    expect(await hybridThenCloud(a.hybrid, a.cloud, true, a.now)).toEqual({ result: 'hybrid answer', ms: 3300 })
    expect(a.calls).toEqual(['hybrid'])
  })

  test('when Nano was ready, a failed Hybrid call is tried once in the cloud', async () => {
    const a = attempts(false)
    expect((await hybridThenCloud(a.hybrid, a.cloud, true, a.now)).result).toBe('cloud answer')
    expect(a.calls).toEqual(['hybrid', 'cloud'])
  })

  test('when Nano was not ready, Hybrid already asked the cloud, so its failure stands', async () => {
    const a = attempts(false)
    await expect(hybridThenCloud(a.hybrid, a.cloud, false, a.now)).rejects.toThrow('device failed')
    expect(a.calls).toEqual(['hybrid'])
  })

  test('the time shown is the cloud attempt that answered, not the failed one before it', async () => {
    const a = attempts(false, 5000, 1200)
    expect((await hybridThenCloud(a.hybrid, a.cloud, true, a.now)).ms).toBe(1200)
  })
})

describe('whether Nano is ready to pick', () => {
  test('it is when Chrome says Nano is available', async () => {
    expect(await nanoReady(async () => 'available')).toBe(true)
  })

  test.each(['downloadable', 'downloading', 'unavailable'])('it is not when Nano is %s', async (availability) => {
    expect(await nanoReady(async () => availability)).toBe(false)
  })

  test("it is not without Chrome's on device API", async () => {
    expect(await nanoReady(undefined)).toBe(false)
  })

  test('it is not when the check fails', async () => {
    expect(await nanoReady(() => Promise.reject(new Error('no')))).toBe(false)
  })
})

describe('saved answers that failed to load try again', () => {
  // Fake listening, timer and online event, so each step can be driven by hand.
  function fakes() {
    const failures: (() => void)[] = []
    const record = { listens: 0, stops: 0 }
    const timers: { ms: number; run: () => void; cancelled: boolean }[] = []
    const online: { run: () => void; removed: boolean }[] = []
    const stop = listenAgainAfterFailure({
      listen: (failed) => {
        record.listens++
        failures.push(failed)
        return () => record.stops++
      },
      after: (ms, run) => {
        const timer = { ms, run, cancelled: false }
        timers.push(timer)
        return () => (timer.cancelled = true)
      },
      whenOnline: (run) => {
        const wait = { run, removed: false }
        online.push(wait)
        return () => (wait.removed = true)
      },
    })
    const waiting = () => timers.filter((t) => !t.cancelled).length + online.filter((o) => !o.removed).length
    return { failures, record, timers, online, stop, waiting }
  }

  test('while listening works, nothing waits to listen again', () => {
    const f = fakes()
    expect(f.record.listens).toBe(1)
    expect(f.waiting()).toBe(0)
  })

  test('after a failure it listens again in 30 seconds', () => {
    const f = fakes()
    f.failures[0]()
    expect(f.timers.map((t) => t.ms)).toEqual([RESUBSCRIBE_MS])
    expect(RESUBSCRIBE_MS).toBe(30_000)
    f.timers[0].run()
    expect(f.record.listens).toBe(2)
    expect(f.record.stops).toBe(1)
    expect(f.online[0].removed).toBe(true)
    expect(f.waiting()).toBe(0)
  })

  test('after a failure it listens again as soon as the browser is back online', () => {
    const f = fakes()
    f.failures[0]()
    f.online[0].run()
    expect(f.record.listens).toBe(2)
    expect(f.timers[0].cancelled).toBe(true)
    expect(f.waiting()).toBe(0)
  })

  test('it keeps trying every 30 seconds while loading fails', () => {
    const f = fakes()
    f.failures[0]()
    f.timers[0].run()
    f.failures[1]()
    f.timers[1].run()
    expect(f.record.listens).toBe(3)
    expect(f.timers.map((t) => t.ms)).toEqual([RESUBSCRIBE_MS, RESUBSCRIBE_MS])
  })

  test('several failures of one listening start one wait', () => {
    const f = fakes()
    f.failures[0]()
    f.failures[0]()
    expect(f.timers.length).toBe(1)
    expect(f.online.length).toBe(1)
  })

  test('a late failure from an earlier listening is ignored', () => {
    const f = fakes()
    f.failures[0]()
    f.timers[0].run()
    f.failures[0]()
    expect(f.timers.length).toBe(1)
    expect(f.waiting()).toBe(0)
  })

  test('leaving the coach stops listening and waiting, and nothing starts again', () => {
    const f = fakes()
    f.failures[0]()
    f.stop()
    expect(f.record.stops).toBe(1)
    expect(f.waiting()).toBe(0)
    f.failures[0]()
    expect(f.record.listens).toBe(1)
    expect(f.timers.length).toBe(1)
  })
})

describe('warming up Nano', () => {
  function steps(hasNano: boolean, availability: string, warmFails = false) {
    const calls: string[] = []
    return {
      calls,
      steps: {
        hasNano,
        availability: async () => {
          calls.push('availability')
          return availability
        },
        warm: async () => {
          calls.push('warm')
          if (warmFails) throw new Error('device failed')
        },
      },
    }
  }

  test('where Nano is available, it makes the device only call', async () => {
    const { calls, steps: s } = steps(true, 'available')
    expect(await warmUp(s)).toBe('warmed')
    expect(calls).toEqual(['availability', 'warm'])
  })

  test("without Chrome's on device API it does nothing, so no call can reach the cloud", async () => {
    const { calls, steps: s } = steps(false, 'available')
    expect(await warmUp(s)).toBe('no-nano')
    expect(calls).toEqual([])
  })

  test.each(['downloadable', 'downloading', 'unavailable'])(
    'when Nano is %s it does not call the model, so it never starts a download',
    async (availability) => {
      const { calls, steps: s } = steps(true, availability)
      expect(await warmUp(s)).toBe('not-available')
      expect(calls).toEqual(['availability'])
    },
  )

  test('a failed warm up is reported, not thrown', async () => {
    const { steps: s } = steps(true, 'available', true)
    expect(await warmUp(s)).toBe('failed')
  })

  test('a failed availability check is reported, not thrown', async () => {
    const s = { hasNano: true, availability: () => Promise.reject(new Error('no')), warm: async () => {} }
    expect(await warmUp(s)).toBe('failed')
  })
})

describe('warming up once per visit', () => {
  function counted(outcome: WarmUpOutcome) {
    const run = { count: 0, fn: async (): Promise<WarmUpOutcome> => (run.count++, outcome) }
    return run
  }

  test('opening a skill again does not warm up again', async () => {
    const holder = {}
    const run = counted('warmed')
    expect(await warmUpOnce(holder, run.fn)).toBe('warmed')
    expect(await warmUpOnce(holder, run.fn)).toBe('warmed')
    expect(run.count).toBe(1)
  })

  test('opening it twice while the first warm up runs starts only one', async () => {
    const holder = {}
    const run = counted('warmed')
    const [a, b] = await Promise.all([warmUpOnce(holder, run.fn), warmUpOnce(holder, run.fn)])
    expect([a, b, run.count]).toEqual(['warmed', 'warmed', 1])
  })

  test('each holder warms up on its own', async () => {
    const run = counted('warmed')
    await warmUpOnce({}, run.fn)
    await warmUpOnce({}, run.fn)
    expect(run.count).toBe(2)
  })

  test.each<WarmUpOutcome>(['no-nano', 'not-available', 'failed'])(
    'after %s, the next opening tries again',
    async (outcome) => {
      const holder = {}
      const run = counted(outcome)
      expect(await warmUpOnce(holder, run.fn)).toBe(outcome)
      await warmUpOnce(holder, run.fn)
      expect(run.count).toBe(2)
    },
  )

  test('a warm up that throws counts as failed', async () => {
    expect(await warmUpOnce({}, () => Promise.reject(new Error('no')))).toBe('failed')
  })
})

describe('which skills warm up Nano', () => {
  test('a skill with a saved answer on any step does', () => {
    expect(hasSavedAnswers({ 'step-1': [], 'step-4': stepFour })).toBe(true)
  })

  test('a skill without saved answers does not', () => {
    expect(hasSavedAnswers({ 'step-1': [], 'step-2': [] })).toBe(false)
    expect(hasSavedAnswers({})).toBe(false)
  })
})
