// How a skill is stored and read back (src/skillDocuments.ts).
import { describe, expect, test } from 'vitest'
import { coachSkillFromDocuments, isDocumentId, skillDocuments, type StepDocument } from '../src/skillDocuments.ts'

const step = { title: 'Place the LED', instruction: 'Push it in.', parts: ['LED'], doneWhen: 'It is in.' }

function stored(numbers: number[], ids = numbers.map((n) => `step-${n}`)) {
  return numbers.map((number, i) => ({ id: ids[i], data: { number, ...step, title: `Step ${number}` } as StepDocument }))
}

describe('skillDocuments', () => {
  test('numbers the steps step-1 to step-n, with the creator and step count', () => {
    const documents = skillDocuments({ title: 'Light an LED', steps: [step, step, step] }, 'learner-1')
    expect(documents.skill).toMatchObject({ title: 'Light an LED', creatorId: 'learner-1', stepCount: 3 })
    expect(documents.steps.map((s) => [s.id, s.data.number])).toEqual([
      ['step-1', 1],
      ['step-2', 2],
      ['step-3', 3],
    ])
    expect(Object.keys(documents.steps[0].data).sort()).toEqual(['doneWhen', 'instruction', 'number', 'parts', 'title'])
  })
})

describe('coachSkillFromDocuments', () => {
  const skill = { title: 'Light an LED', stepCount: 3 }

  test('gives the coach every step in order, with its id', () => {
    const coachSkill = coachSkillFromDocuments('skill-1', skill, stored([3, 1, 2]))
    expect(coachSkill?.id).toBe('skill-1')
    expect(coachSkill?.steps.map((s) => [s.id, s.title])).toEqual([
      ['step-1', 'Step 1'],
      ['step-2', 'Step 2'],
      ['step-3', 'Step 3'],
    ])
    expect(coachSkill?.steps[0]).not.toHaveProperty('number')
  })

  test('treats a skill with no steps as not found', () => {
    expect(coachSkillFromDocuments('skill-1', skill, [])).toBeNull()
  })

  test('treats missing steps as not found', () => {
    expect(coachSkillFromDocuments('skill-1', skill, stored([1, 2]))).toBeNull()
  })

  test('treats a gap in the steps as not found', () => {
    expect(coachSkillFromDocuments('skill-1', { ...skill, stepCount: 2 }, stored([1, 3]))).toBeNull()
  })

  test('treats a step id that does not match its number as not found', () => {
    expect(coachSkillFromDocuments('skill-1', skill, stored([1, 2, 3], ['step-1', 'step-2', 'step-9']))).toBeNull()
  })

  test('treats a skill without a title or step count as not found', () => {
    expect(coachSkillFromDocuments('skill-1', { title: undefined, stepCount: 3 }, stored([1, 2, 3]))).toBeNull()
    expect(coachSkillFromDocuments('skill-1', { title: 'Light an LED', stepCount: '3' }, stored([1, 2, 3]))).toBeNull()
  })
})

describe('isDocumentId', () => {
  test.each(['Yi9DYlbqnNQN2X9UgcgE', 'sample-led'])('accepts %s', (id) => {
    expect(isDocumentId(id)).toBe(true)
  })

  test.each(['', '.', '..', 'a/b', '__id__'])('refuses %j', (id) => {
    expect(isDocumentId(id)).toBe(false)
  })
})
