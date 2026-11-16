// Checks of the model's answer before a skill is shown (src/skill.ts).
import { describe, expect, test } from 'vitest'
import { LIMITS, MAX_STEPS, parseSkill, SkillAnswerError } from '../src/skill.ts'

const goodStep = {
  title: 'Place the LED',
  instruction: 'Push the LED into row 10, long leg on the right.',
  parts: ['LED'],
  doneWhen: 'The LED sits in row 10 with the long leg on the right.',
}

function answer(value: unknown): string {
  return JSON.stringify(value)
}

describe('parseSkill', () => {
  test('returns a good answer as the skill', () => {
    expect(parseSkill(answer({ title: 'Light an LED', steps: [goodStep] }))).toEqual({
      title: 'Light an LED',
      steps: [goodStep],
    })
  })

  test('trims text and drops blank parts', () => {
    const skill = parseSkill(
      answer({
        title: '  Light an LED ',
        steps: [{ ...goodStep, title: ' Place the LED\n', parts: [' LED ', '  ', 'breadboard'] }],
      }),
    )
    expect(skill?.title).toBe('Light an LED')
    expect(skill?.steps[0].title).toBe('Place the LED')
    expect(skill?.steps[0].parts).toEqual(['LED', 'breadboard'])
  })

  test('keeps a step with no parts', () => {
    expect(parseSkill(answer({ title: 'Check', steps: [{ ...goodStep, parts: [] }] }))?.steps[0].parts).toEqual([])
  })

  test('drops blank steps', () => {
    const blank = { title: ' ', instruction: '', parts: [], doneWhen: '\n' }
    expect(parseSkill(answer({ title: 'Light an LED', steps: [blank, goodStep, blank] }))?.steps).toEqual([goodStep])
  })

  test('returns null when there are no steps', () => {
    expect(parseSkill(answer({ title: '', steps: [] }))).toBeNull()
  })

  test('returns null when every step is blank', () => {
    expect(parseSkill(answer({ title: '', steps: [{ title: '', instruction: '', parts: [], doneWhen: '' }] }))).toBeNull()
  })

  test('refuses malformed JSON', () => {
    expect(() => parseSkill('{"title": "Light an LED", "steps": [')).toThrow(SkillAnswerError)
  })

  test('refuses an answer that is not an object', () => {
    expect(() => parseSkill(answer('steps'))).toThrow(SkillAnswerError)
    expect(() => parseSkill('null')).toThrow(SkillAnswerError)
  })

  test('refuses missing steps', () => {
    expect(() => parseSkill(answer({ title: 'Light an LED' }))).toThrow(SkillAnswerError)
  })

  test.each(['title', 'instruction', 'parts', 'doneWhen'])('refuses a step without %s', (field) => {
    const step: Record<string, unknown> = { ...goodStep }
    delete step[field]
    expect(() => parseSkill(answer({ title: 'Light an LED', steps: [step] }))).toThrow(SkillAnswerError)
  })

  test('refuses a step with only some of its text', () => {
    expect(() => parseSkill(answer({ title: 'Light an LED', steps: [{ ...goodStep, doneWhen: ' ' }] }))).toThrow(
      SkillAnswerError,
    )
  })

  test('refuses a part that is not text', () => {
    expect(() => parseSkill(answer({ title: 'Light an LED', steps: [{ ...goodStep, parts: ['LED', 5] }] }))).toThrow(
      SkillAnswerError,
    )
  })

  test('refuses a skill with steps but no title', () => {
    expect(() => parseSkill(answer({ title: ' ', steps: [goodStep] }))).toThrow(SkillAnswerError)
  })

  test.each([
    ['title', LIMITS.title],
    ['instruction', LIMITS.instruction],
    ['doneWhen', LIMITS.doneWhen],
  ] as const)('accepts a step %s at its limit of %i characters and refuses one more', (field, limit) => {
    const withLength = (n: number) => answer({ title: 'Light an LED', steps: [{ ...goodStep, [field]: 'a'.repeat(n) }] })
    expect(parseSkill(withLength(limit))?.steps[0][field]).toHaveLength(limit)
    expect(() => parseSkill(withLength(limit + 1))).toThrow(SkillAnswerError)
  })

  test('refuses a skill title over its limit', () => {
    expect(() => parseSkill(answer({ title: 'a'.repeat(LIMITS.title + 1), steps: [goodStep] }))).toThrow(SkillAnswerError)
    expect(parseSkill(answer({ title: 'a'.repeat(LIMITS.title), steps: [goodStep] }))?.title).toHaveLength(LIMITS.title)
  })

  test('limits parts by count and length, after dropping blank ones', () => {
    const withParts = (parts: string[]) => answer({ title: 'Light an LED', steps: [{ ...goodStep, parts }] })
    const many = (n: number) => Array.from({ length: n }, () => 'LED')
    expect(parseSkill(withParts([...many(LIMITS.parts), ' ']))?.steps[0].parts).toHaveLength(LIMITS.parts)
    expect(() => parseSkill(withParts(many(LIMITS.parts + 1)))).toThrow(SkillAnswerError)
    expect(() => parseSkill(withParts(['a'.repeat(LIMITS.part + 1)]))).toThrow(SkillAnswerError)
  })

  test('measures a limit after trimming', () => {
    const padded = ` ${'a'.repeat(LIMITS.title)} `
    expect(parseSkill(answer({ title: padded, steps: [goodStep] }))?.title).toHaveLength(LIMITS.title)
  })

  test(`accepts ${MAX_STEPS} steps and refuses ${MAX_STEPS + 1}`, () => {
    const steps = (n: number) => Array.from({ length: n }, () => goodStep)
    expect(parseSkill(answer({ title: 'Long', steps: steps(MAX_STEPS) }))?.steps).toHaveLength(MAX_STEPS)
    expect(() => parseSkill(answer({ title: 'Long', steps: steps(MAX_STEPS + 1) }))).toThrow(SkillAnswerError)
  })
})
