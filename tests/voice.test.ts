// Talking to the Workspace (#80): what a spoken phrase does.
import { expect, test } from 'vitest'
import { chatHistory, type ChatItem } from '../src/chat.ts'
import { isDoneCommand, listeningOn, listeningProblem, MIN_SPOKEN_WORDS, spokenAction, VOICE_LANG } from '../src/voice.ts'

test('only "done" said on its own finishes the step, in any case and with any punctuation', () => {
  for (const said of ['done', 'Done.', "I'm done", 'im done', 'I am done!', 'Step done', 'finished', '  DONE  ']) {
    expect(isDoneCommand(said)).toBe(true)
  }
  for (const said of ["I'm not done yet", 'done with the resistor', 'are we done', 'is it finished', 'well done everyone', '']) {
    expect(isDoneCommand(said)).toBe(false)
  }
})

test('a phrase of 3 words or more goes to the chat, a shorter one is let go, "done" always acts', () => {
  expect(MIN_SPOKEN_WORDS).toBe(3)
  expect(spokenAction('Which leg is positive?')).toBe('send')
  expect(spokenAction("I'm not done yet")).toBe('send')
  expect(spokenAction('okay then')).toBe('ignore')
  expect(spokenAction('um')).toBe('ignore')
  expect(spokenAction('done')).toBe('done')
  expect(spokenAction('Step done.')).toBe('done')
})

test('voice is English, on is on while listening, getting ready or paused, and each problem has its line', () => {
  expect(VOICE_LANG).toBe('en-US')
  expect(['listening', 'preparing', 'paused'].every((s) => listeningOn(s as never))).toBe(true)
  expect(['off', 'unsupported', 'blocked', 'failed'].some((s) => listeningOn(s as never))).toBe(false)
  expect(listeningProblem('unsupported')).toBe('Voice needs Chrome on a computer.')
  expect(listeningProblem('blocked')).toBe('Allow the microphone to talk to Surtrix.')
  expect(listeningProblem('failed')).toBe('Voice could not get ready. Try again later.')
  expect(listeningProblem('listening')).toBeNull()
  for (const s of ['unsupported', 'blocked', 'failed'] as const) expect(listeningProblem(s)).not.toMatch(/[\u2013\u2014]| - /)
})

test('a spoken "done" is not sent to the model as a question; spoken questions are', () => {
  const items: ChatItem[] = [
    { id: 't1', at: 1, kind: 'typed', stepId: 's1', text: 'Which leg is positive?', spoken: true },
    { id: 't2', at: 2, kind: 'typed', stepId: 's1', text: 'done', spoken: true, command: true },
  ]
  expect(chatHistory(items)).toEqual([{ from: 'learner', text: 'Which leg is positive?' }])
})
