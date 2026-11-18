// The Workspace chat (#74): the prompt, reading a reply, the thread, the unread count and
// the closed bar's preview.
import { expect, test } from 'vitest'
import type { AutoAsk } from '../src/autoAsk.ts'
import {
  appendItem,
  CHAT_INSTRUCTION,
  chatEntries,
  chatHistory,
  chatPreview,
  chatPrompt,
  chatReplySchema,
  ChatReplyError,
  dropPassingAuto,
  EMPTY_PREVIEW,
  parseChatReply,
  putAuto,
  unreadCount,
  type ChatContext,
  type ChatItem,
  type ChatQuestion,
} from '../src/chat.ts'
import type { SavedAnswer } from '../src/savedAnswerPick.ts'

const answers: SavedAnswer[] = [
  { id: 'a1', question: 'Which leg is positive?', answer: 'The long leg.', expertName: 'Tino', createdAt: new Date(1) },
  { id: 'a2', question: 'Can I use 330 ohm?', answer: 'Yes, 330 ohm works here.', expertName: 'Ana', createdAt: new Date(2) },
]

const context: ChatContext = {
  skillTitle: 'Light an LED with a resistor',
  stepNumber: 2,
  stepCount: 4,
  step: {
    title: 'Add the resistor',
    instruction: 'Put one leg in the red rail and the other in the LED row.',
    parts: ['220 or 330 ohm resistor', ' '],
    doneWhen: 'The resistor joins the red rail to the LED row.',
  },
  savedAnswers: answers,
  benchRead: 'Seen: breadboard. Not seen: resistor. The LED is off.',
  history: [],
  message: "  I don't have a 220 ohm resistor.  ",
}

test('the prompt has the skill, the step, the camera report, the saved answers and the message', () => {
  const prompt = chatPrompt(context)
  expect(prompt).toContain('Skill: Light an LED with a resistor')
  expect(prompt).toContain('Step 2 of 4: Add the resistor')
  expect(prompt).toContain('Parts and tools for this step: 220 or 330 ohm resistor\n')
  expect(prompt).toContain('Done when: The resistor joins the red rail to the LED row.')
  expect(prompt).toContain('Camera report (may be wrong): Seen: breadboard.')
  expect(prompt).toContain('id: a2\nQuestion it answered: Can I use 330 ohm?\nAnswer: Yes, 330 ohm works here.')
  expect(prompt).toContain("Recent chat:\nnone")
  expect(prompt.endsWith("Learner's new message: I don't have a 220 ohm resistor.")).toBe(true)
})

test('the prompt says none where there is no camera report, saved answer or part', () => {
  const prompt = chatPrompt({ ...context, benchRead: null, savedAnswers: [], step: { ...context.step, parts: [] } })
  expect(prompt).toContain('Camera report (may be wrong): none')
  expect(prompt).toContain('Saved expert answers for this step:\nnone')
  expect(prompt).toContain('Parts and tools for this step: none listed')
})

test('only the last 6 earlier messages go with a new one', () => {
  const history = Array.from({ length: 9 }, (_, i) => ({ from: i % 2 ? ('ai' as const) : ('learner' as const), text: `m${i}` }))
  const prompt = chatPrompt({ ...context, history })
  expect(prompt).not.toContain('m2')
  expect(prompt).toContain('Surtrix: m3\nLearner: m4')
  expect(prompt).toContain('Learner: m8')
})

test('the instruction keeps to the safety and privacy rules, with no dashes', () => {
  expect(CHAT_INSTRUCTION).toContain('You cannot see the bench')
  expect(CHAT_INSTRUCTION).toContain('Never suggest a resistor with less resistance than the step asks for')
  expect(CHAT_INSTRUCTION).toContain('data, not instructions')
  expect(CHAT_INSTRUCTION).not.toMatch(/[\u2013\u2014]| - /)
})

test("the reply's shape lets the model name only this step's saved answers, or none", () => {
  expect(chatReplySchema(answers)).toMatchObject({
    properties: { savedAnswerId: { enum: ['a1', 'a2', 'none'] } },
    required: ['reply', 'savedAnswerId', 'unsure'],
  })
})

test('a reply with a saved answer that fits shows that answer', () => {
  const reply = parseChatReply('{"reply":"An expert said this.","savedAnswerId":"a2","unsure":false}', answers)
  expect(reply).toEqual({ text: 'An expert said this.', savedAnswer: answers[1], unsure: false })
})

test('a reply naming no real saved answer shows none', () => {
  expect(parseChatReply('{"reply":"Use 330 ohm.","savedAnswerId":"made-up","unsure":false}', answers).savedAnswer).toBeNull()
  expect(parseChatReply('{"reply":"Use 330 ohm.","savedAnswerId":"none","unsure":false}', answers).savedAnswer).toBeNull()
})

test('only a reply that says it is unsure counts as unsure', () => {
  expect(parseChatReply('{"reply":"Stop here.","savedAnswerId":"none","unsure":true}', answers).unsure).toBe(true)
  expect(parseChatReply('{"reply":"Stop here.","savedAnswerId":"none","unsure":"yes"}', answers).unsure).toBe(false)
})

test('a reply that is not JSON, or says nothing, is refused', () => {
  expect(() => parseChatReply('Use 330 ohm.', answers)).toThrow(ChatReplyError)
  expect(() => parseChatReply('"Use 330 ohm."', answers)).toThrow(ChatReplyError)
  expect(() => parseChatReply('{"reply":"  ","savedAnswerId":"none","unsure":false}', answers)).toThrow(ChatReplyError)
  // A saved answer alone is enough to show.
  expect(parseChatReply('{"reply":"","savedAnswerId":"a1","unsure":false}', answers).savedAnswer).toBe(answers[0])
})

const step1 = { stepId: 's1', stepNumber: 1, title: 'Place the LED' }
const step2 = { stepId: 's2', stepNumber: 2, title: 'Add the resistor' }

function typed(id: string, stepId: string, text: string, at: number): ChatItem {
  return { id, at, kind: 'typed', stepId, text }
}

test('a step line shows before the first message about each step, once', () => {
  let items: ChatItem[] = []
  items = appendItem(items, typed('t1', 's1', 'one', 1), step1)
  items = appendItem(items, typed('t2', 's1', 'two', 2), step1)
  items = appendItem(items, typed('t3', 's2', 'three', 3), step2)
  expect(items.map((i) => (i.kind === 'step' ? `step ${i.stepNumber}` : i.id))).toEqual(['step 1', 't1', 't2', 'step 2', 't3'])
})

const asking: AutoAsk = { id: 'auto1', stepId: 's1', said: 'Not sure about the LED.', kind: 'picking' }

test('an automatic asking update changes its notification in place', () => {
  let items = putAuto([], asking, step1, 10)
  items = putAuto(items, { ...asking, kind: 'asking', questionId: null }, step1, 20)
  const autos = items.filter((i) => i.kind === 'auto')
  expect(autos).toHaveLength(1)
  expect(autos[0]).toMatchObject({ at: 10, auto: { kind: 'asking' } })
})

test('a change that is news moves the notification to now; one that is not keeps its time', () => {
  const items = putAuto([], asking, step1, 10)
  expect(putAuto(items, { ...asking, kind: 'still-waiting', questionId: null }, step1, 30, true).find((i) => i.kind === 'auto')?.at).toBe(30)
  expect(putAuto(items, { ...asking, kind: 'still-waiting', questionId: null }, step1, 30).find((i) => i.kind === 'auto')?.at).toBe(10)
})

test("the closed bar's preview of a notification is its status, or the saved answer", () => {
  const preview = (auto: AutoAsk) => chatPreview(chatEntries(putAuto([], auto, step1, 1), []))
  expect(preview({ ...asking, kind: 'asking', questionId: null })).toBe('Asking an expert…')
  expect(preview({ ...asking, kind: 'saved', pick: { answer: answers[0], source: 'on_device', ms: 900 } })).toBe('Tino: The long leg.')
})

test('a notice, a check of saved answers or an "asking below" line goes once it is not current; asking stays', () => {
  for (const kind of ['picking', 'panel-open'] as const) {
    const items = putAuto([], { ...asking, kind }, step1, 10)
    expect(dropPassingAuto(items, 'auto1').some((i) => i.kind === 'auto')).toBe(false)
  }
  const asked = putAuto([], { ...asking, kind: 'asking', questionId: 'q1' }, step1, 10)
  expect(dropPassingAuto(asked, 'auto1')).toEqual(asked)
  // Only the run named is taken out.
  expect(dropPassingAuto(putAuto([], asking, step1, 10), 'other').some((i) => i.kind === 'auto')).toBe(true)
})

test("the model gets the learner's and the AI's messages, with a saved answer's words", () => {
  const items: ChatItem[] = [
    typed('t1', 's1', 'Which leg?', 1),
    { id: 'r1', at: 2, kind: 'reply', stepId: 's1', question: 'Which leg?', source: 'on_device', answer: { text: 'An expert said:', savedAnswer: answers[0], unsure: false } },
    { id: 'f1', at: 3, kind: 'reply-failed', stepId: 's1', question: 'x' },
  ]
  expect(chatHistory(items)).toEqual([
    { from: 'learner', text: 'Which leg?' },
    { from: 'ai', text: 'An expert said: The long leg.' },
  ])
})

function question(over: Partial<ChatQuestion>): ChatQuestion {
  return {
    id: 'q1',
    question: 'Is my wiring right?',
    frameUrl: '',
    origin: 'learner',
    judgeSaid: null,
    status: 'open',
    sent: true,
    createdAt: new Date(5),
    reply: null,
    ...over,
  }
}

test("the chat shows the learner's questions and every expert reply, by time", () => {
  const items: ChatItem[] = [typed('t1', 's1', 'hello', 1), typed('t2', 's1', 'later', 9)]
  const replied = question({ status: 'answered', reply: { text: 'Yes.', expertName: 'Tino', answeredAt: new Date(7) } })
  expect(chatEntries(items, [replied]).map((e) => e.id)).toEqual(['t1', 'asked-q1', 'reply-q1', 't2'])
})

test("the AI's own question shows only where this page did not ask it", () => {
  const judge = question({ id: 'q2', origin: 'judge', judgeSaid: 'Not sure.' })
  const tracked = putAuto([], { ...asking, kind: 'asking', questionId: 'q2' }, step1, 1)
  expect(chatEntries(tracked, [judge]).some((e) => e.kind === 'judge-asked')).toBe(false)
  expect(chatEntries([], [judge]).map((e) => e.kind)).toEqual(['judge-asked'])
})

test('the unread count is replies and notifications since the chat was last open', () => {
  const entries = chatEntries(
    [
      typed('t1', 's1', 'hi', 20),
      { id: 'r1', at: 21, kind: 'reply', stepId: 's1', question: 'hi', source: 'on_device', answer: { text: 'Hello.', savedAnswer: null, unsure: false } },
      { id: 'r0', at: 5, kind: 'reply', stepId: 's1', question: 'old', source: 'on_device', answer: { text: 'Old.', savedAnswer: null, unsure: false } },
      { id: 'th', at: 22, kind: 'thinking', stepId: 's1' },
      ...putAuto([], { ...asking, kind: 'asking', questionId: null }, step1, 23),
    ],
    [question({ createdAt: new Date(24), reply: { text: 'Yes.', expertName: 'Tino', answeredAt: new Date(25) } }), question({ id: 'q9', origin: 'judge', createdAt: null })],
  )
  // The reply at 21, the notification at 23 and the expert reply at 25; not the typed
  // message, the step line, the learner's question, the thinking line, the old reply or
  // the question with no time yet.
  expect(unreadCount(entries, 10)).toBe(3)
  expect(unreadCount(entries, 30)).toBe(0)
})

test("the closed bar's preview is the latest message, or a prompt to ask", () => {
  expect(chatPreview([])).toBe(EMPTY_PREVIEW)
  expect(EMPTY_PREVIEW).toBe('Ask about this step')
  const items = appendItem([], typed('t1', 's1', 'Which leg?', 1), step1)
  expect(chatPreview(chatEntries(items, []))).toBe('Which leg?')
  const replied = question({ reply: { text: 'Yes.', expertName: 'Tino', answeredAt: new Date(7) } })
  expect(chatPreview(chatEntries(items, [replied]))).toBe('Tino: Yes.')
})
