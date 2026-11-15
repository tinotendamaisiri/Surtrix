// The demo skill's text and the writes the seed script sends (#25).
import { describe, expect, test } from 'vitest'
import { demoSkillWrites } from '../scripts/seedDemoSkill.ts'
import { DEMO_CREATOR_ID, DEMO_SKILL_ID, demoProcedureText, demoSkill } from '../src/demoSkill.ts'
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

describe('seed writes', () => {
  const writes = demoSkillWrites('surtrix-50d22')
  const base = 'projects/surtrix-50d22/databases/(default)/documents/skills/sample-led'

  test('write the skill and step-1 to step-4, and nothing else', () => {
    expect(writes.map((w) => w.update.name)).toEqual([
      base,
      `${base}/steps/step-1`,
      `${base}/steps/step-2`,
      `${base}/steps/step-3`,
      `${base}/steps/step-4`,
    ])
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
