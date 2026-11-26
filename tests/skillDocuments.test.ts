// How a skill is stored and read back (src/skillDocuments.ts).
import { describe, expect, test } from 'vitest'
import { serverTimestamp } from 'firebase/firestore'
import {
  coachSkillFromDocuments,
  isDocumentId,
  isRefusedRead,
  publishFields,
  skillDocuments,
  type StepDocument,
} from '../src/skillDocuments.ts'

const step = { title: 'Place the LED', instruction: 'Push it in.', parts: ['LED'], tools: ['pliers'], doneWhen: 'It is in.' }

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
    expect(Object.keys(documents.steps[0].data).sort()).toEqual(['doneWhen', 'instruction', 'number', 'parts', 'title', 'tools'])
    expect(documents.steps[0].data.tools).toEqual(['pliers'])
  })

  test('a new skill is never published and has no expert name', () => {
    const documents = skillDocuments({ title: 'Light an LED', steps: [step] }, 'learner-1')
    expect(Object.keys(documents.skill).sort()).toEqual(['createdAt', 'creatorId', 'stepCount', 'title'])
  })
})

describe('publishFields', () => {
  test('publish and unpublish write exactly published, expertName and publishedAt at server time', () => {
    for (const published of [true, false]) {
      const fields = publishFields(published, 'Ada Expert')
      expect(Object.keys(fields).sort()).toEqual(['expertName', 'published', 'publishedAt'])
      expect(fields.published).toBe(published)
      expect(fields.expertName).toBe('Ada Expert')
      expect(fields.publishedAt.isEqual(serverTimestamp())).toBe(true)
    }
  })
})

describe('isRefusedRead', () => {
  test('a permission denied read counts as refused, anything else does not', () => {
    expect(isRefusedRead({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe(true)
    expect(isRefusedRead({ code: 'unavailable' })).toBe(false)
    expect(isRefusedRead(new Error('offline'))).toBe(false)
    expect(isRefusedRead(null)).toBe(false)
    expect(isRefusedRead(undefined)).toBe(false)
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

  test('marks the skill published only when its published field is true', () => {
    expect(coachSkillFromDocuments('skill-1', { ...skill, published: true }, stored([1, 2, 3]))?.published).toBe(true)
    for (const published of [false, undefined, 'true']) {
      const coachSkill = coachSkillFromDocuments('skill-1', { ...skill, published }, stored([1, 2, 3]))
      expect(coachSkill).not.toBeNull()
      expect(coachSkill).not.toHaveProperty('published')
    }
  })

  test('marks the skill mine only when this user created it (#100)', () => {
    expect(coachSkillFromDocuments('skill-1', { ...skill, mine: true }, stored([1, 2, 3]))?.mine).toBe(true)
    for (const mine of [false, undefined]) {
      expect(coachSkillFromDocuments('skill-1', { ...skill, mine }, stored([1, 2, 3]))).not.toHaveProperty('mine')
    }
  })

  test("keeps a step's tools, an empty tools list, and a missing tools field apart", () => {
    const [first, second, third] = stored([1, 2, 3])
    const { tools: _tools, ...withoutTools } = third.data
    const steps = [first, { ...second, data: { ...second.data, tools: [] } }, { ...third, data: withoutTools }]
    const coachSteps = coachSkillFromDocuments('skill-1', skill, steps)?.steps
    expect(coachSteps?.[0].tools).toEqual(['pliers'])
    expect(coachSteps?.[1].tools).toEqual([])
    expect(coachSteps?.[2]).not.toHaveProperty('tools')
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
