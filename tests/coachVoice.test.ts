import { afterEach, describe, expect, it, vi } from 'vitest'
import { InferenceSource } from 'firebase/ai'
import {
  ALL_DONE_SPEECH,
  chatQuestionIds,
  entrySpeech,
  maySpeakNow,
  newExpertReply,
  speechTimeoutMs,
  expertSpeech,
  keepForStep,
  pickVoice,
  readCoachMuted,
  replyFailedText,
  speechKey,
  stepSpeech,
  wiringLine,
  writeCoachMuted,
  type Speech,
} from '../src/coachVoice.ts'
import { COULD_NOT_ANSWER_TEXT, LIMITED_TEXT, ON_DEVICE_NOTE, type ChatEntry } from '../src/chat.ts'
import type { AutoAsk } from '../src/autoAsk.ts'

const voice = (name: string, lang: string, localService: boolean, isDefault = false) => ({
  name,
  lang,
  localService,
  default: isDefault,
})

describe('pickVoice', () => {
  it('never picks a voice that runs on a server', () => {
    expect(pickVoice([voice('Google US English', 'en-US', false, true)])).toBeNull()
    expect(pickVoice([])).toBeNull()
  })

  it('takes the default voice when it is on the device and English', () => {
    const samantha = voice('Samantha', 'en-US', true)
    const daniel = voice('Daniel', 'en-GB', true, true)
    expect(pickVoice([samantha, daniel])).toBe(daniel)
  })

  it('otherwise the first on device US English voice, then any on device English voice', () => {
    const thomas = voice('Thomas', 'fr-FR', true, true)
    const daniel = voice('Daniel', 'en-GB', true)
    const samantha = voice('Samantha', 'en_US', true)
    expect(pickVoice([thomas, daniel, samantha])).toBe(samantha)
    expect(pickVoice([thomas, daniel])).toBe(daniel)
    expect(pickVoice([thomas, voice('Google UK', 'en-GB', false)])).toBeNull()
  })
})

describe('the queue on a step change', () => {
  it('drops what waits from other steps and keeps what belongs to no step', () => {
    const queue: Speech[] = [
      { id: '1', stepId: 's1', text: 'old step' },
      { id: '2', stepId: null, text: 'a note' },
      { id: '3', stepId: 's2', text: 'new step' },
    ]
    expect(keepForStep(queue, 's2').map((s) => s.id)).toEqual(['2', '3'])
  })
})

describe('what the coach says', () => {
  it('reads a step with its number, title and instruction', () => {
    expect(stepSpeech(2, 4, 'Add the resistor', 'Take a 220 or 330 ohm resistor.')).toBe(
      'Step 2 of 4, Add the resistor. Take a 220 or 330 ohm resistor.',
    )
    expect(ALL_DONE_SPEECH).toBe('All steps done.')
  })

  const saved = { id: 'a1', question: 'Which leg?', answer: 'The long leg.', expertName: 'Tino', createdAt: new Date(1) }
  const reply = (source: string, savedAnswer: typeof saved | null = null): ChatEntry => ({
    id: 'r1',
    at: 1,
    kind: 'reply',
    stepId: 's1',
    question: 'Which leg?',
    source,
    answer: { text: 'The long leg is positive.', savedAnswer, unsure: false },
  })

  it('reads a reply, with an expert answer it used and the on device note', () => {
    expect(entrySpeech(reply(InferenceSource.IN_CLOUD))).toBe('The long leg is positive.')
    expect(entrySpeech(reply(InferenceSource.ON_DEVICE))).toBe(`The long leg is positive. ${ON_DEVICE_NOTE}`)
    expect(entrySpeech(reply(InferenceSource.IN_CLOUD, saved))).toBe('The long leg is positive. An expert answered: The long leg.')
  })

  it('reads failed replies as the chat shows them', () => {
    const failed = (reason: 'limited' | 'unanswered' | 'error'): ChatEntry => ({ id: 'f', at: 1, kind: 'reply-failed', stepId: 's1', question: 'x', reason })
    expect(entrySpeech(failed('limited'))).toBe(LIMITED_TEXT)
    expect(entrySpeech(failed('unanswered'))).toBe(COULD_NOT_ANSWER_TEXT)
    expect(entrySpeech(failed('error'))).toBe(replyFailedText('error'))
  })

  it("reads the can't see warning and an expert's reply", () => {
    const bench: ChatEntry = { id: 'b', at: 1, kind: 'bench', stepId: 's1', said: 'cant-see', text: "I can't see the LED yet. Point the camera at your bench." }
    expect(entrySpeech(bench)).toBe(bench.text)
    const question = { id: 'q1', stepId: 's1', question: 'Which leg?', status: 'answered', reply: { text: 'The long one.', expertName: 'Tino', answeredAt: new Date(2) } }
    expect(entrySpeech({ id: 'e', at: 2, kind: 'expert-reply', question } as unknown as ChatEntry)).toBe(expertSpeech('The long one.'))
    expect(expertSpeech('The long one.')).toBe('An expert answered: The long one.')
  })

  it("reads a saved expert answer picked for the learner, but no status of asking an expert, and never the learner's own words", () => {
    const pick = { kind: 'saved', id: 'auto1', stepId: 's1', said: 'Not sure.', pick: { answer: saved } } as unknown as AutoAsk
    expect(entrySpeech({ id: 'auto1', at: 1, kind: 'auto', auto: pick })).toBe('An expert answered: The long leg.')
    for (const kind of ['notice', 'picking', 'panel-open', 'still-waiting', 'limit', 'failed', 'asking', 'queued']) {
      const auto = { id: 'auto1', stepId: 's1', said: 'Not sure.', kind, questionId: null } as unknown as AutoAsk
      expect(entrySpeech({ id: 'auto1', at: 1, kind: 'auto', auto })).toBeNull()
    }
    expect(entrySpeech({ id: 't', at: 1, kind: 'typed', stepId: 's1', text: 'Which leg?' })).toBeNull()
    expect(entrySpeech({ id: 'th', at: 1, kind: 'thinking', stepId: 's1' })).toBeNull()
  })

  it('says each state of an entry once: thinking that becomes a reply is said, an asking run that moves on is keyed again', () => {
    expect(speechKey({ id: 'c1', at: 1, kind: 'thinking', stepId: 's1' })).not.toBe(speechKey({ ...reply(InferenceSource.IN_CLOUD), id: 'c1' } as ChatEntry))
    const a = { id: 'auto1', stepId: 's1', said: 'x', kind: 'asking', questionId: null } as unknown as AutoAsk
    const b = { ...a, kind: 'saved' } as unknown as AutoAsk
    expect(speechKey({ id: 'auto1', at: 1, kind: 'auto', auto: a })).not.toBe(speechKey({ id: 'auto1', at: 1, kind: 'auto', auto: b }))
  })

  it('reads the wiring verdict as the Last wiring check card shows it', () => {
    expect(wiringLine(1, { verdict: 'correct', whatIsWrong: '', whatToMove: '' })).toMatch(/^Step 1: /)
    expect(wiringLine(2, { verdict: 'not yet', whatIsWrong: 'The resistor is in the wrong row.', whatToMove: 'Move it one row down.' })).toMatch(
      /^Step 2, not yet: .*wrong row.*one row down/,
    )
    expect(wiringLine(3, { verdict: 'unsure', whatIsWrong: 'The photo is dark.', whatToMove: '' })).toMatch(/^Step 3, not sure: /)
  })
})

describe('the mute is remembered on this browser', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is on until muted, and remembers a mute', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    expect(readCoachMuted()).toBe(false)
    writeCoachMuted(true)
    expect(readCoachMuted()).toBe(true)
    writeCoachMuted(false)
    expect(readCoachMuted()).toBe(false)
  })

  it('keeps the voice on when storage is refused', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readCoachMuted()).toBe(false)
    expect(() => writeCoachMuted(true)).not.toThrow()
  })
})

describe('when the coach may speak', () => {
  const ready = { hasVoice: true, muted: false, speaking: false, learnerTalking: false }
  it('speaks only with a voice, unmuted, with nothing else being said and the learner quiet', () => {
    expect(maySpeakNow(ready)).toBe(true)
    expect(maySpeakNow({ ...ready, hasVoice: false })).toBe(false)
    expect(maySpeakNow({ ...ready, muted: true })).toBe(false)
    expect(maySpeakNow({ ...ready, speaking: true })).toBe(false)
    expect(maySpeakNow({ ...ready, learnerTalking: true })).toBe(false)
  })

  it('never stays stuck on a message: it counts as said after its time, which grows with its length', () => {
    const step1 = 'Step 1 of 4, Place the LED. Push the LED into the middle of the breadboard with its long leg and its short leg in two different rows. The long leg is the positive side.'
    // Samantha took 13.8 s for this on Nov 25.
    expect(speechTimeoutMs(step1)).toBeGreaterThan(13_800)
    expect(speechTimeoutMs(step1)).toBeLessThan(40_000)
    expect(speechTimeoutMs('Done.')).toBeLessThan(speechTimeoutMs(step1))
  })
})

describe("which experts' replies are read", () => {
  const question = (id: string) => ({ id, stepId: 's1', question: 'Which leg?', status: 'open' })
  it('reads a reply only when its question was in the chat before it', () => {
    expect(newExpertReply('q1', new Set(['q1']))).toBe(true)
    expect(newExpertReply('q1', new Set())).toBe(false)
  })

  it("knows the learner's questions, the AI's own and the ones an asking run tracks", () => {
    const entries = [
      { id: 'asked-q1', at: 1, kind: 'asked', question: question('q1') },
      { id: 'judge-q2', at: 2, kind: 'judge-asked', question: question('q2') },
      { id: 'auto1', at: 3, kind: 'auto', auto: { id: 'auto1', stepId: 's1', said: 'x', kind: 'asking', questionId: 'q3' } },
      { id: 'auto2', at: 4, kind: 'auto', auto: { id: 'auto2', stepId: 's1', said: 'x', kind: 'asking', questionId: null } },
      { id: 'reply-q4', at: 5, kind: 'expert-reply', question: question('q4') },
    ] as unknown as ChatEntry[]
    expect([...chatQuestionIds(entries)].sort()).toEqual(['q1', 'q2', 'q3'])
  })
})
