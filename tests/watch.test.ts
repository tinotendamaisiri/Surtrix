import { describe, expect, it } from 'vitest'
import {
  BenchAnswerError,
  benchAnswerSchema,
  benchQuestion,
  CANT_SEE_READINGS,
  cantSeeAfterReading,
  cantSeeRoundEnds,
  cantSeeText,
  describeBenchAnswer,
  NO_CANT_SEE,
  SEEN_READINGS,
  parseBenchAnswer,
  watchedParts,
  type BenchAnswer,
  type CantSee,
  type CantSeeSay,
  type Seen,
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

describe("the can't see warning (#95)", () => {
  const reading = (...seen: Seen[]): BenchAnswer => ({
    parts: seen.map((value, i) => ({ name: ['breadboard', 'LED', 'resistor'][i], seen: value })),
    ledLit: 'no LED seen',
  })
  // Runs readings on one step from a state, and lists what the coach said after each one.
  function run(readings: BenchAnswer[], start: CantSee = NO_CANT_SEE, stepId = 's1') {
    let state = start
    const said: (CantSeeSay | null)[] = []
    for (const answer of readings) {
      const next = cantSeeAfterReading(state, stepId, answer)
      state = next.state
      said.push(next.say)
    }
    return { state, said }
  }
  const missing = reading('no', 'not sure')
  const warning = { said: 'cant-see', parts: ['breadboard', 'LED'] }

  it('speaks up after 3 readings in a row that miss every part, counting not sure as missing', () => {
    expect(CANT_SEE_READINGS).toBe(3)
    expect(run([missing, missing, missing]).said).toEqual([null, null, warning])
    expect(run([reading('not sure', 'not sure'), reading('no', 'no'), reading('not sure', 'no')]).said[2]).toEqual(warning)
  })

  it('stays quiet while any part is seen, and a single reading that sees a part starts the count again', () => {
    expect(run([reading('yes', 'no'), reading('no', 'yes'), reading('yes', 'not sure')]).said).toEqual([null, null, null])
    expect(run([missing, missing, reading('no', 'yes'), missing, missing]).said).toEqual([null, null, null, null, null])
  })

  it('does not repeat while nothing changes', () => {
    const said = run([missing, missing, missing, missing, missing, missing, missing]).said
    expect(said.filter(Boolean)).toEqual([warning])
  })

  it('confirms once a part is seen in 2 readings in a row, with the parts seen, and warns again after 3 more misses', () => {
    expect(SEEN_READINGS).toBe(2)
    const seenTwice = [reading('yes', 'not sure'), reading('yes', 'not sure'), reading('yes', 'yes')]
    const { said } = run([missing, missing, missing, ...seenTwice, missing, missing, missing])
    expect(said).toEqual([null, null, warning, null, { said: 'can-see', parts: ['breadboard'] }, null, null, null, warning])
  })

  it('a single false yes neither confirms nor lets the warning come back (Nov 25, grey frame)', () => {
    const falseYes = reading('yes', 'not sure')
    const { said } = run([missing, missing, missing, falseYes, missing, missing, missing, falseYes, missing, missing, missing])
    expect(said.filter(Boolean)).toEqual([warning])
  })

  it('gives no confirmation without a warning first', () => {
    expect(run([reading('yes', 'yes'), reading('yes', 'yes')]).said).toEqual([null, null])
  })

  it('a camera restart starts both counts again but is not a part seen', () => {
    const warned = run([missing, missing, missing]).state
    const restarted = cantSeeRoundEnds(warned)
    expect(run([missing, missing, missing, missing], restarted).said).toEqual([null, null, null, null])
    const counting = cantSeeRoundEnds(run([missing, missing]).state)
    expect(run([missing, missing], counting).said).toEqual([null, null])
    const seenOnce = cantSeeRoundEnds(run([missing, missing, missing, reading('yes', 'no')]).state)
    expect(run([reading('yes', 'no')], seenOnce).said).toEqual([null])
  })

  it('a new step starts afresh and drops a confirmation still due', () => {
    const warned = run([missing, missing, missing]).state
    expect(run([reading('yes', 'yes'), reading('yes', 'yes')], warned, 's2').said).toEqual([null, null])
    expect(run([missing, missing, missing], warned, 's2').said[2]).toEqual(warning)
  })

  it('never speaks up on a step with no parts', () => {
    const none: BenchAnswer = { parts: [], ledLit: 'no LED seen' }
    expect(run([none, none, none, none]).said).toEqual([null, null, null, null])
  })

  it('names the parts as the step lists them', () => {
    expect(cantSeeText({ said: 'cant-see', parts: ['breadboard'] })).toBe("I can't see the breadboard yet. Point the camera at your bench.")
    expect(cantSeeText(warning as CantSeeSay)).toBe("I can't see the breadboard or the LED yet. Point the camera at your bench.")
    expect(cantSeeText({ said: 'cant-see', parts: ['breadboard', 'LED', '220 or 330 ohm resistor'] })).toBe(
      "I can't see the breadboard, the LED or the 220 or 330 ohm resistor yet. Point the camera at your bench.",
    )
    expect(cantSeeText({ said: 'can-see', parts: ['breadboard'] })).toBe('I can see the breadboard now.')
    expect(cantSeeText({ said: 'can-see', parts: ['breadboard', 'LED'] })).toBe('I can see the breadboard and the LED now.')
    expect(cantSeeText({ said: 'cant-see', parts: ['a breadboard', 'An LED', 'the USB cable'] })).toBe(
      "I can't see the breadboard, the LED or the USB cable yet. Point the camera at your bench.",
    )
    expect(cantSeeText({ said: 'can-see', parts: ['antenna', 'theremin'] })).toBe('I can see the antenna and the theremin now.')
  })
})
