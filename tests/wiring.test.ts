import { describe, expect, it } from 'vitest'
import type { Step } from '../src/skill.ts'
import {
  describeWiringCheck,
  parseWiringCheck,
  WIRING_SYSTEM_PROMPT,
  WIRING_TEXT_MAX_LENGTH,
  WiringCheckError,
  wiringPrompt,
} from '../src/wiring.ts'

const step: Step = {
  title: 'Wire the LED and resistor',
  instruction: "Connect a resistor from the top rail to the LED's long leg.",
  parts: ['breadboard', 'LED', 'resistor'],
  doneWhen: "The resistor joins the top rail to the LED's long leg.",
}

describe('wiringPrompt', () => {
  it('carries the current step and the three verdicts', () => {
    const prompt = wiringPrompt(step)
    expect(prompt).toContain('Step: Wire the LED and resistor')
    expect(prompt).toContain("Instruction: Connect a resistor from the top rail to the LED's long leg.")
    expect(prompt).toContain('Parts: breadboard, LED, resistor')
    expect(prompt).toContain("Done when: The resistor joins the top rail to the LED's long leg.")
    for (const verdict of ['"correct"', '"not yet"', '"unsure"']) expect(prompt).toContain(verdict)
  })

  it('says when a step lists no parts', () => {
    expect(wiringPrompt({ ...step, parts: [] })).toContain('Parts: none listed')
  })

  it('has no dashes', () => {
    expect(wiringPrompt(step) + WIRING_SYSTEM_PROMPT).not.toMatch(/[–—]| - /)
  })
})

describe('parseWiringCheck', () => {
  it('reads a "not yet" with what is wrong and what to move, trimmed', () => {
    expect(
      parseWiringCheck(JSON.stringify({ verdict: 'not yet', whatIsWrong: ' The resistor is in the LED row. ', whatToMove: 'Move it up one row.' })),
    ).toEqual({ verdict: 'not yet', whatIsWrong: 'The resistor is in the LED row.', whatToMove: 'Move it up one row.' })
  })

  it('drops any words from a "correct"', () => {
    expect(parseWiringCheck(JSON.stringify({ verdict: 'correct', whatIsWrong: 'nothing', whatToMove: 'n/a' }))).toEqual({
      verdict: 'correct',
      whatIsWrong: '',
      whatToMove: '',
    })
  })

  it('reads an "unsure" with or without a reason', () => {
    expect(parseWiringCheck('{"verdict":"unsure","whatIsWrong":"The board is out of view."}').whatIsWrong).toBe('The board is out of view.')
    expect(parseWiringCheck('{"verdict":"unsure"}')).toEqual({ verdict: 'unsure', whatIsWrong: '', whatToMove: '' })
  })

  it('clips very long text', () => {
    const check = parseWiringCheck(JSON.stringify({ verdict: 'not yet', whatIsWrong: 'x'.repeat(5000) }))
    expect(check.whatIsWrong).toHaveLength(WIRING_TEXT_MAX_LENGTH)
  })

  it.each([
    ['not JSON', 'The wiring looks fine.'],
    ['not an object', '["correct"]'],
    ['null', 'null'],
    ['no verdict', '{"whatIsWrong":"x"}'],
    ['another verdict', '{"verdict":"wrong","whatIsWrong":"x"}'],
    ['a "not yet" that says nothing', '{"verdict":"not yet","whatIsWrong":"  ","whatToMove":"Move it."}'],
  ])('refuses an answer that is %s', (_, answer) => {
    expect(() => parseWiringCheck(answer)).toThrow(WiringCheckError)
  })
})

describe('describeWiringCheck', () => {
  it('words each verdict', () => {
    expect(describeWiringCheck({ verdict: 'correct', whatIsWrong: '', whatToMove: '' })).toBe('The wiring looks right.')
    expect(describeWiringCheck({ verdict: 'not yet', whatIsWrong: 'The LED is backwards.', whatToMove: 'Turn it round.' })).toBe(
      'The LED is backwards. Turn it round.',
    )
    expect(describeWiringCheck({ verdict: 'not yet', whatIsWrong: 'The LED is backwards.', whatToMove: '' })).toBe('The LED is backwards.')
    expect(describeWiringCheck({ verdict: 'unsure', whatIsWrong: 'Too dark.', whatToMove: '' })).toBe('Too dark.')
    expect(describeWiringCheck({ verdict: 'unsure', whatIsWrong: '', whatToMove: '' })).toBe('The check could not tell from the photo.')
  })
})
