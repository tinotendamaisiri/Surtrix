// The demo skill's text, its seeded answers, and the writes the seed script sends (#25, #29).
import { describe, expect, test } from 'vitest'
import { demoSkillWrites } from '../scripts/seedDemoSkill.ts'
import { DEMO_CREATOR_ID, DEMO_EXPERT_NAME, DEMO_SKILL_ID, demoAnswers, demoProcedureText, demoSkill } from '../src/demoSkill.ts'
import { parseSkill } from '../src/skill.ts'

describe('demo skill', () => {
  test('uses the ids fixed in the Contracts', () => {
    expect(DEMO_SKILL_ID).toBe('sample-led')
    expect(DEMO_CREATOR_ID).toBe('surtrix')
  })

  test('passes the same checks as a skill the model made: trimmed, within the limits, 4 steps', () => {
    expect(parseSkill(JSON.stringify(demoSkill))).toEqual(demoSkill)
    expect(demoSkill.steps).toHaveLength(4)
  })

  test('has no em or en dashes in its text or in the Try a sample procedure', () => {
    expect(JSON.stringify(demoSkill)).not.toMatch(/[–—]/)
    expect(demoProcedureText).not.toMatch(/[–—]/)
  })
})

describe('demo answers', () => {
  test('sit on the steps where a learner meets each problem, with fixed ids', () => {
    expect(demoAnswers.map((a) => `${a.stepId}/${a.id}`)).toEqual([
      'step-2/demo-led-in-rail',
      'step-4/demo-led-backwards',
      'step-4/demo-no-power',
    ])
  })

  test('are signed by the Surtrix team, not a person', () => {
    expect(DEMO_EXPERT_NAME).toBe('Surtrix team')
  })

  test('have trimmed text within the question and reply limits (500 and 2,000 characters)', () => {
    for (const a of demoAnswers) {
      expect(a.question).toBe(a.question.trim())
      expect(a.answer).toBe(a.answer.trim())
      expect(a.question.length).toBeGreaterThan(0)
      expect(a.question.length).toBeLessThanOrEqual(500)
      expect(a.answer.length).toBeGreaterThan(0)
      expect(a.answer.length).toBeLessThanOrEqual(2000)
    }
  })

  test('have no em or en dashes', () => {
    expect(JSON.stringify(demoAnswers)).not.toMatch(/[–—]/)
  })
})

describe('seed writes', () => {
  const writes = demoSkillWrites('surtrix-50d22')
  const base = 'projects/surtrix-50d22/databases/(default)/documents/skills/sample-led'

  test('write the skill, step-1 to step-4 and the 3 answers, and nothing else', () => {
    expect(writes.map((w) => w.update.name)).toEqual([
      base,
      `${base}/steps/step-1`,
      `${base}/steps/step-2`,
      `${base}/steps/step-3`,
      `${base}/steps/step-4`,
      `${base}/steps/step-2/answers/demo-led-in-rail`,
      `${base}/steps/step-4/answers/demo-led-backwards`,
      `${base}/steps/step-4/answers/demo-no-power`,
    ])
  })

  test('write each answer in the Contracts shape, with its seed id as questionId and the server time', () => {
    expect(writes[7]).toEqual({
      update: {
        name: `${base}/steps/step-4/answers/demo-no-power`,
        fields: {
          questionId: { stringValue: 'demo-no-power' },
          question: { stringValue: demoAnswers[2].question },
          answer: { stringValue: demoAnswers[2].answer },
          expertId: { stringValue: 'surtrix' },
          expertName: { stringValue: 'Surtrix team' },
        },
      },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    })
  })

  test('write the skill with the demo creator, 4 steps and the server time', () => {
    expect(writes[0]).toEqual({
      update: {
        name: base,
        fields: {
          title: { stringValue: 'Light an LED with a resistor' },
          creatorId: { stringValue: 'surtrix' },
          stepCount: { integerValue: '4' },
        },
      },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    })
  })

  test('write each step with its number as a whole number and its parts as a list', () => {
    expect(writes[2].update.fields).toEqual({
      number: { integerValue: '2' },
      title: { stringValue: 'Add the resistor' },
      instruction: { stringValue: demoSkill.steps[1].instruction },
      parts: { arrayValue: { values: [{ stringValue: '220 or 330 ohm resistor' }] } },
      doneWhen: { stringValue: demoSkill.steps[1].doneWhen },
    })
  })
})
