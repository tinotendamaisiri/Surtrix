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
