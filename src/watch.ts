// Watching the bench: what the coach asks Gemini Nano about a camera frame, the answer
// shape Nano must keep to, and the code checks on that answer. No model calls here.

export const SEEN = ['yes', 'no', 'not sure'] as const
export type Seen = (typeof SEEN)[number]

export const LED_LIT = ['yes', 'no', 'no LED seen', 'not sure'] as const
export type LedLit = (typeof LED_LIT)[number]

export type BenchAnswer = { parts: { name: string; seen: Seen }[]; ledLit: LedLit }

export class BenchAnswerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BenchAnswerError'
  }
}

// The step's parts as asked: trimmed, without blanks or repeats, in order.
export function watchedParts(parts: string[]): string[] {
  return [...new Set(parts.map((part) => part.trim()).filter((part) => part !== ''))]
}

// Neutral: it names the parts to look for but never says they are there, because Nano
// tends to describe whatever a question assumes.
export function benchQuestion(parts: string[]): string {
  const asked = watchedParts(parts)
  const items =
    asked.length === 0
      ? ''
      : 'For each item below, answer yes if it is visible in the photo, no if it is not, or not sure. ' +
        `Items: ${asked.join('; ')}. `
  return (
    'Look at this photo of an electronics workbench. ' +
    items +
    'Say whether any LED in the photo is lit: yes, no, no LED seen, or not sure. ' +
    'Judge only from the photo.'
  )
}

// The JSON schema Nano must answer in (Chrome's responseConstraint).
export function benchAnswerSchema(parts: string[]): object {
  const asked = watchedParts(parts)
  const ledLit = { type: 'string', enum: [...LED_LIT] }
  if (asked.length === 0) {
    return { type: 'object', properties: { ledLit }, required: ['ledLit'] }
  }
  return {
    type: 'object',
    properties: {
      parts: {
        type: 'object',
        properties: Object.fromEntries(asked.map((part) => [part, { type: 'string', enum: [...SEEN] }])),
        required: asked,
      },
      ledLit,
    },
    required: ['parts', 'ledLit'],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

// Checks Nano's answer against the asked parts. Keeps only those parts, in the asked
// order, and refuses an answer that is not JSON, misses a part or uses another value.
export function parseBenchAnswer(text: string, parts: string[]): BenchAnswer {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BenchAnswerError('The answer is not JSON.')
  }
  if (!isRecord(data)) throw new BenchAnswerError('The answer is not an object.')
  if (!isOneOf(LED_LIT, data.ledLit)) throw new BenchAnswerError('The answer has no usable LED state.')
  const asked = watchedParts(parts)
  if (asked.length === 0) return { parts: [], ledLit: data.ledLit }
  const answered = data.parts
  if (!isRecord(answered)) throw new BenchAnswerError('The answer has no parts.')
  return {
    parts: asked.map((name) => {
      const seen = Object.hasOwn(answered, name) ? answered[name] : undefined
      if (!isOneOf(SEEN, seen)) throw new BenchAnswerError(`The answer has no usable value for "${name}".`)
      return { name, seen }
    }),
    ledLit: data.ledLit,
  }
}

const ledText: Record<LedLit, string> = {
  yes: 'LED: lit.',
  no: 'LED: not lit.',
  'no LED seen': 'No LED seen.',
  'not sure': 'LED: not sure.',
}

// The short line the coach shows, for example "Seen: breadboard, LED. LED: not lit."
export function describeBenchAnswer(answer: BenchAnswer): string {
  const group = (label: string, seen: Seen) => {
    const names = answer.parts.filter((part) => part.seen === seen).map((part) => part.name)
    return names.length === 0 ? [] : [`${label}: ${names.join(', ')}.`]
  }
  return [...group('Seen', 'yes'), ...group('Not seen', 'no'), ...group('Not sure', 'not sure'), ledText[answer.ledLit]].join(
    ' ',
  )
}

// The can't see warning (#95): Nano's readings, one at a time, decide when the coach says
// in the chat that it cannot see the step's parts, and when it says it can see them again.
// A part is missing when Nano answers no or not sure for it.

// Readings in a row that miss every part before the coach speaks up.
export const CANT_SEE_READINGS = 3
// Readings in a row that see a part before it counts as seen again: Nano sometimes says yes
// to a part on a frame with nothing on it (3 of 17 readings of a grey frame, Nov 25).
export const SEEN_READINGS = 2

export type CantSee = {
  stepId: string | null
  // Readings in a row, in this round of watching, that missed every part.
  missed: number
  // Readings in a row, in this round of watching, that saw a part.
  seenRun: number
  // False after a warning, until a part counts as seen: no repeats while nothing changes.
  mayWarn: boolean
  // A warning was given and no part has counted as seen since.
  warned: boolean
}

export const NO_CANT_SEE: CantSee = { stepId: null, missed: 0, seenRun: 0, mayWarn: true, warned: false }

export type CantSeeSay = { said: 'cant-see' | 'can-see'; parts: string[] }

// One reading on a step. A new step starts afresh; a step with no parts never speaks up.
// A single reading that sees a part starts the miss count again; it takes SEEN_READINGS in
// a row to confirm after a warning or to allow the next one.
export function cantSeeAfterReading(
  state: CantSee,
  stepId: string,
  answer: BenchAnswer,
): { state: CantSee; say: CantSeeSay | null } {
  const current = state.stepId === stepId ? state : { ...NO_CANT_SEE, stepId }
  if (answer.parts.length === 0) return { state: current, say: null }
  const seen = answer.parts.filter((part) => part.seen === 'yes').map((part) => part.name)
  if (seen.length > 0) {
    const seenRun = current.seenRun + 1
    if (seenRun < SEEN_READINGS) return { state: { ...current, missed: 0, seenRun }, say: null }
    return {
      state: { stepId, missed: 0, seenRun, mayWarn: true, warned: false },
      say: current.warned ? { said: 'can-see', parts: seen } : null,
    }
  }
  const missed = current.missed + 1
  if (missed >= CANT_SEE_READINGS && current.mayWarn) {
    return {
      state: { stepId, missed: 0, seenRun: 0, mayWarn: false, warned: true },
      say: { said: 'cant-see', parts: answer.parts.map((part) => part.name) },
    }
  }
  return { state: { ...current, missed, seenRun: 0 }, say: null }
}

// The round of watching ended (the camera stopped, the tab was hidden): both counts start
// again, but that is not a part seen, so a warning given is not repeated.
export function cantSeeRoundEnds(state: CantSee): CantSee {
  return { ...state, missed: 0, seenRun: 0 }
}

// "the X", "the X or the Y", "the X, the Y or the Z". A part named with its own "a", "an"
// or "the" keeps just one "the".
function theParts(parts: string[], joiner: 'or' | 'and'): string {
  const named = parts.map((part) => `the ${part.replace(/^(a|an|the)\s+/i, '')}`)
  if (named.length === 1) return named[0]
  return `${named.slice(0, -1).join(', ')} ${joiner} ${named[named.length - 1]}`
}

export function cantSeeText(say: CantSeeSay): string {
  return say.said === 'cant-see'
    ? `I can't see ${theParts(say.parts, 'or')} yet. Point the camera at your bench.`
    : `I can see ${theParts(say.parts, 'and')} now.`
}
