// Talking to the Workspace (#80): what a spoken phrase does.
import { expect, test, vi } from 'vitest'
import { chatHistory, type ChatItem } from '../src/chat.ts'
import {
  aboutTheTask,
  DROPPED_NOTE,
  isDoneCommand,
  joinPhrases,
  LEFT_STEP_NOTE,
  listeningOn,
  listeningProblem,
  NO_CHECK_LINE,
  spokenAction,
  spokenMessageDueIn,
  topicCheckInstruction,
  topicCheckQuestion,
  topicVerdict,
  UNCHECKED_NOTE,
  VOICE_LANG,
  VOICE_MAX_WAIT_MS,
  VOICE_SILENCE_MS,
  voiceNoteText,
} from '../src/voice.ts'

test('only "done" said on its own finishes the step, in any case and with any punctuation', () => {
  for (const said of ['done', 'Done.', "I'm done", 'im done', 'I am done!', 'Step done', 'finished', '  DONE  ']) {
    expect(isDoneCommand(said)).toBe(true)
  }
  for (const said of ["I'm not done yet", 'done with the resistor', 'are we done', 'is it finished', 'well done everyone', '']) {
    expect(isDoneCommand(said)).toBe(false)
  }
})

test('"done" acts only as the whole message; everything else is checked on the device first', () => {
  expect(spokenAction('done')).toBe('done')
  expect(spokenAction('Step done.')).toBe('done')
  expect(spokenAction("I'm not done yet")).toBe('check')
  expect(spokenAction("I'm done which way does the wire go")).toBe('check')
  expect(spokenAction('Which leg is positive?')).toBe('check')
  expect(spokenAction('um')).toBe('check')
})

test('phrases join into one message that goes after 5 s of silence, 30 s after the first phrase, or at the length limit', () => {
  expect(VOICE_SILENCE_MS).toBe(5000)
  expect(VOICE_MAX_WAIT_MS).toBe(30000)
  expect(joinPhrases(['Which leg of the resistor goes to', ' the long leg ', ''])).toBe(
    'Which leg of the resistor goes to the long leg',
  )
  const heard = { firstAt: 0, lastHeardAt: 0, text: 'Which leg' }
  // Silence counts from the last words heard, finished or not.
  expect(spokenMessageDueIn(heard, 1000, 500)).toBe(4000)
  expect(spokenMessageDueIn({ ...heard, lastHeardAt: 3000 }, 4000, 500)).toBe(4000)
  expect(spokenMessageDueIn(heard, 5000, 500)).toBe(0)
  expect(spokenMessageDueIn(heard, 9000, 500)).toBe(0)
  // Talk that never stops: due 30 s after the first phrase however recent the last words.
  expect(spokenMessageDueIn({ ...heard, lastHeardAt: 28000 }, 28500, 500)).toBe(1500)
  expect(spokenMessageDueIn({ ...heard, lastHeardAt: 29900 }, 30000, 500)).toBe(0)
  // At the chat's length limit it goes at once.
  expect(spokenMessageDueIn({ ...heard, text: 'a'.repeat(500) }, 1, 500)).toBe(0)
})

test('Nano is asked about the step, its parts and the last answer, and only a YES lets a message go', () => {
  const instruction = topicCheckInstruction({
    skillTitle: 'Light an LED with a resistor',
    step: { title: 'Add the resistor', instruction: 'Put one leg in the red rail.', parts: ['resistor', ' ', 'LED'] },
    lastReply: 'Resistors work either way round.',
  })
  expect(instruction).toContain('"Light an LED with a resistor"')
  expect(instruction).toContain('"Add the resistor": Put one leg in the red rail.')
  expect(instruction).toContain('The parts are: resistor, LED.')
  expect(instruction).toContain('The coach last said: "Resistors work either way round."')
  expect(instruction).toContain('"not done yet", "almost there", "hang on"')
  expect(instruction).toContain('If part of the sentence is about something other than the task, answer NO.')
  expect(topicCheckQuestion('Long long leg')).toBe('Sentence: "Long long leg"')
  const first = topicCheckInstruction({ skillTitle: 'S', step: { title: 'T', instruction: 'I', parts: [] }, lastReply: null })
  expect(first).not.toContain('coach last said')
  expect(first).not.toContain('parts are')
  for (const yes of ['YES', 'Yes.', ' yes', '**YES**']) expect(aboutTheTask(yes)).toBe(true)
  for (const no of ['NO', 'No.', '', 'Maybe', 'yesterday', 'The answer is YES']) expect(aboutTheTask(no)).toBe(false)
})

test('the quiet notes and the no check line, with no dashes', () => {
  expect(voiceNoteText('dropped')).toBe(DROPPED_NOTE)
  expect(voiceNoteText('unchecked')).toBe("Couldn't check that on this device. Type it instead.")
  expect(voiceNoteText('left')).toBe('That was about the step you just left. Ask again if you still need it.')
  expect(DROPPED_NOTE).toBe("Heard you, but that didn't sound like it was about this step. Try again or type it.")
  for (const line of [DROPPED_NOTE, UNCHECKED_NOTE, LEFT_STEP_NOTE, NO_CHECK_LINE]) expect(line).not.toMatch(/[\u2013\u2014]| - /)
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

test('the voice check: only a YES goes on, and where Nano cannot run it is never asked', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const yes = vi.fn(async () => 'YES')
  // No Nano on this device: unchecked, and Nano (so firebase/ai) is never called.
  expect(await topicVerdict(async () => false, yes, 1000)).toBe('unchecked')
  expect(yes).not.toHaveBeenCalled()
  // Reading the device's status fails: the same.
  expect(await topicVerdict(async () => Promise.reject(new Error('no status')), yes, 1000)).toBe('unchecked')
  expect(yes).not.toHaveBeenCalled()
  // Nano answers.
  expect(await topicVerdict(async () => true, yes, 1000)).toBe('about the task')
  expect(await topicVerdict(async () => true, async () => 'NO', 1000)).toBe('other talk')
  expect(await topicVerdict(async () => true, async () => 'Sure, maybe', 1000)).toBe('other talk')
  // Nano fails, or takes longer than the limit (the status call included): unchecked.
  expect(await topicVerdict(async () => true, async () => Promise.reject(new Error('model failed')), 1000)).toBe('unchecked')
  const never = () => new Promise<never>(() => {})
  expect(await topicVerdict(async () => true, never, 20)).toBe('unchecked')
  expect(await topicVerdict(never, yes, 20)).toBe('unchecked')
  expect(yes).toHaveBeenCalledTimes(1)
  vi.restoreAllMocks()
})
