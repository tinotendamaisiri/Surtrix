import { describe, expect, it } from 'vitest'
import {
  BenchAnswerError,
  benchAnswerSchema,
  benchQuestion,
  describeBenchAnswer,
  parseBenchAnswer,
  watchedParts,
} from '../src/watch.ts'

const parts = ['breadboard', 'LED', '220 ohm resistor']

describe('watchedParts', () => {
  it('trims, drops blanks and repeats, keeps the order', () => {
    expect(watchedParts([' breadboard ', '', 'LED', 'breadboard', '  '])).toEqual(['breadboard', 'LED'])
  })
})

describe('benchQuestion', () => {
  it('names every part and the three answers, without saying a part is there', () => {
    const question = benchQuestion(parts)
    expect(question).toContain('Items: breadboard; LED; 220 ohm resistor.')
    expect(question).toContain('yes if it is visible in the photo, no if it is not, or not sure')
    expect(question).toContain('no LED seen')
    expect(question).not.toMatch(/\bthe (breadboard|LED|resistor) is\b/i)
  })

  it('asks only about the LED when the step has no parts', () => {
    const question = benchQuestion([' ', ''])
    expect(question).not.toContain('Items')
    expect(question).toContain('whether any LED in the photo is lit')
  })

  it('has no dashes', () => {
    expect(benchQuestion(parts) + benchQuestion([])).not.toMatch(/[–—]| - /)
  })
})

describe('benchAnswerSchema', () => {
  it('requires every asked part with yes, no or not sure, and the LED state', () => {
    expect(benchAnswerSchema(['LED', 'LED', 'wire'])).toEqual({
      type: 'object',
      properties: {
        parts: {
          type: 'object',
          properties: {
            LED: { type: 'string', enum: ['yes', 'no', 'not sure'] },
            wire: { type: 'string', enum: ['yes', 'no', 'not sure'] },
          },
          required: ['LED', 'wire'],
        },
        ledLit: { type: 'string', enum: ['yes', 'no', 'no LED seen', 'not sure'] },
      },
      required: ['parts', 'ledLit'],
    })
  })

  it('asks only for the LED state when there are no parts', () => {
    expect(benchAnswerSchema([])).toEqual({
      type: 'object',
      properties: { ledLit: { type: 'string', enum: ['yes', 'no', 'no LED seen', 'not sure'] } },
      required: ['ledLit'],
    })
  })
})

describe('parseBenchAnswer', () => {
  const good = { parts: { breadboard: 'yes', LED: 'not sure', '220 ohm resistor': 'no' }, ledLit: 'no' }

  it('reads a good answer in the asked order', () => {
    expect(parseBenchAnswer(JSON.stringify(good), parts)).toEqual({
      parts: [
        { name: 'breadboard', seen: 'yes' },
        { name: 'LED', seen: 'not sure' },
        { name: '220 ohm resistor', seen: 'no' },
      ],
      ledLit: 'no',
    })
  })

  it('keeps only the asked parts', () => {
    const answer = parseBenchAnswer(JSON.stringify({ ...good, parts: { ...good.parts, battery: 'yes' } }), parts)
    expect(answer.parts.map((part) => part.name)).toEqual(parts)
  })

  it('reads an LED only answer for a step with no parts', () => {
    expect(parseBenchAnswer('{"ledLit":"no LED seen"}', [])).toEqual({ parts: [], ledLit: 'no LED seen' })
  })

  it.each([
    ['not JSON', 'Seen: breadboard'],
    ['not an object', '["yes"]'],
    ['null', 'null'],
    ['no LED state', JSON.stringify({ parts: good.parts })],
    ['another LED value', JSON.stringify({ ...good, ledLit: 'bright' })],
    ['no parts', JSON.stringify({ ledLit: 'no' })],
    ['parts as a list', JSON.stringify({ parts: ['breadboard'], ledLit: 'no' })],
    ['a missing part', JSON.stringify({ parts: { breadboard: 'yes', LED: 'yes' }, ledLit: 'no' })],
    ['another part value', JSON.stringify({ ...good, parts: { ...good.parts, LED: 'maybe' } })],
  ])('refuses an answer with %s', (_, text) => {
    expect(() => parseBenchAnswer(text, parts)).toThrow(BenchAnswerError)
  })

  it('refuses a part named like an inherited property that was not answered', () => {
    expect(() => parseBenchAnswer('{"parts":{},"ledLit":"no"}', ['toString'])).toThrow(BenchAnswerError)
  })
})

describe('describeBenchAnswer', () => {
  it('groups the parts and states the LED', () => {
    expect(
      describeBenchAnswer({
        parts: [
          { name: 'breadboard', seen: 'yes' },
          { name: 'LED', seen: 'yes' },
          { name: 'wire', seen: 'no' },
          { name: 'resistor', seen: 'not sure' },
        ],
        ledLit: 'no',
      }),
    ).toBe('Seen: breadboard, LED. Not seen: wire. Not sure: resistor. LED: not lit.')
  })

  it.each([
    ['yes', 'LED: lit.'],
    ['no LED seen', 'No LED seen.'],
    ['not sure', 'LED: not sure.'],
  ] as const)('says %s as "%s" when there are no parts', (ledLit, text) => {
    expect(describeBenchAnswer({ parts: [], ledLit })).toBe(text)
  })
})
