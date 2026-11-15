// Firestore rules tests. They run against the Firestore emulator through npm test,
// which starts it as project demo-surtrix.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'
import type { Skill } from '../src/skill.ts'
import { skillDocuments } from '../src/skillDocuments.ts'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-surtrix',
    firestore: { rules: readFileSync(join(import.meta.dirname, '..', 'firestore.rules'), 'utf8') },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

const learner = () => testEnv.authenticatedContext('learner-1')
const otherLearner = () => testEnv.authenticatedContext('learner-2')
const visitor = () => testEnv.unauthenticatedContext()

const step = {
  title: 'Place the LED',
  instruction: 'Push the LED into rows 10 and 11, long leg in row 10.',
  parts: ['LED', 'breadboard'],
  doneWhen: 'The LED sits in rows 10 and 11 with the long leg in row 10.',
}

const skill: Skill = { title: 'Light an LED', steps: [step, { ...step, title: 'Add the resistor' }] }

// Writes a skill and its steps in one batch, as the app does, with optional changes to
// the documents first.
function saveSkill(
  context: RulesTestContext,
  options: {
    skill?: Skill
    creatorId?: string
    skillChanges?: DocumentData
    stepChanges?: DocumentData
    stepIds?: string[]
  } = {},
) {
  const db = context.firestore()
  const documents = skillDocuments(options.skill ?? skill, options.creatorId ?? 'learner-1')
  const batch = writeBatch(db)
  batch.set(doc(db, 'skills/skill-1'), { ...documents.skill, ...options.skillChanges })
  documents.steps.forEach((s, i) =>
    batch.set(doc(db, `skills/skill-1/steps/${options.stepIds?.[i] ?? s.id}`), { ...s.data, ...options.stepChanges }),
  )
  return batch.commit()
}

function without(key: string) {
  return (data: DocumentData) => {
    const copy = { ...data }
    delete copy[key]
    return copy
  }
}

// Stores a skill by learner-1 with 2 steps but only step-1 saved, rules off.
async function storeSkillWithOneStep() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const documents = skillDocuments(skill, 'learner-1')
    await setDoc(doc(db, 'skills/skill-1'), documents.skill)
    await setDoc(doc(db, 'skills/skill-1/steps/step-1'), documents.steps[0].data)
  })
}

const stepTwo = { number: 2, ...step }

describe('skills and steps', () => {
  test('a learner saves a skill and its steps in one batch', async () => {
    await assertSucceeds(saveSkill(learner()))
  })

  test('a learner saves 40 steps with 30 parts each', async () => {
    const parts = Array.from({ length: 30 }, (_, i) => `part ${i + 1}`)
    const steps = Array.from({ length: 40 }, (_, i) => ({ ...step, title: `Step ${i + 1}`, parts }))
    await assertSucceeds(saveSkill(learner(), { skill: { title: 'Long', steps } }))
  })

  test('another signed in learner can read the skill and its steps', async () => {
    await saveSkill(learner())
    await assertSucceeds(getDoc(doc(otherLearner().firestore(), 'skills/skill-1')))
    await assertSucceeds(getDoc(doc(otherLearner().firestore(), 'skills/skill-1/steps/step-2')))
  })

  test('a signed out visitor cannot read a skill or its steps', async () => {
    await saveSkill(learner())
    await assertFails(getDoc(doc(visitor().firestore(), 'skills/skill-1')))
    await assertFails(getDoc(doc(visitor().firestore(), 'skills/skill-1/steps/step-1')))
  })

  test('a signed out visitor cannot save a skill', async () => {
    await assertFails(saveSkill(visitor()))
  })

  test('a learner cannot save a skill as someone else', async () => {
    await assertFails(saveSkill(learner(), { creatorId: 'learner-2' }))
  })

  test.each(['title', 'creatorId', 'stepCount', 'createdAt'])('a skill without %s is refused', async (key) => {
    const db = learner().firestore()
    const data = without(key)(skillDocuments(skill, 'learner-1').skill)
    await assertFails(setDoc(doc(db, 'skills/skill-1'), data))
  })

  test('a skill with an extra field is refused', async () => {
    await assertFails(saveSkill(learner(), { skillChanges: { public: true } }))
  })

  test('a skill title over 200 characters is refused', async () => {
    await assertFails(saveSkill(learner(), { skillChanges: { title: 'a'.repeat(201) } }))
  })

  test('a skill title of 200 characters is saved', async () => {
    await assertSucceeds(saveSkill(learner(), { skillChanges: { title: 'a'.repeat(200) } }))
  })

  test('an untrimmed or empty skill title is refused', async () => {
    await assertFails(saveSkill(learner(), { skillChanges: { title: ' Light an LED' } }))
    await assertFails(saveSkill(learner(), { skillChanges: { title: '' } }))
  })

  test('a step count of 0 or 41 is refused', async () => {
    const db = learner().firestore()
    const data = skillDocuments(skill, 'learner-1').skill
    await assertFails(setDoc(doc(db, 'skills/skill-1'), { ...data, stepCount: 0 }))
    await assertFails(setDoc(doc(db, 'skills/skill-1'), { ...data, stepCount: 41 }))
  })

  test('a created time that is not the server time is refused', async () => {
    await assertFails(saveSkill(learner(), { skillChanges: { createdAt: Timestamp.fromMillis(0) } }))
  })

  test('the creator can add a missing step to their own skill', async () => {
    await storeSkillWithOneStep()
    await assertSucceeds(setDoc(doc(learner().firestore(), 'skills/skill-1/steps/step-2'), stepTwo))
  })

  test("a learner cannot add a step to another learner's skill", async () => {
    await storeSkillWithOneStep()
    await assertFails(setDoc(doc(otherLearner().firestore(), 'skills/skill-1/steps/step-2'), stepTwo))
  })

  test('a step under a skill that does not exist is refused', async () => {
    await assertFails(setDoc(doc(learner().firestore(), 'skills/missing/steps/step-1'), { number: 1, ...step }))
  })

  test('a step id that does not match its number is refused', async () => {
    await assertFails(saveSkill(learner(), { stepIds: ['step-1', 'step-3'] }))
    await assertFails(saveSkill(learner(), { stepIds: ['first', 'second'] }))
  })

  test('a step number over the step count is refused', async () => {
    await assertFails(saveSkill(learner(), { skillChanges: { stepCount: 1 } }))
  })

  test.each(['number', 'title', 'instruction', 'parts', 'doneWhen'])('a step without %s is refused', async (key) => {
    await storeSkillWithOneStep()
    await assertFails(setDoc(doc(learner().firestore(), 'skills/skill-1/steps/step-2'), without(key)(stepTwo)))
  })

  test('a step with an extra field is refused', async () => {
    await assertFails(saveSkill(learner(), { stepChanges: { hint: 'none' } }))
  })

  test('step text over its limit is refused', async () => {
    await assertFails(saveSkill(learner(), { stepChanges: { title: 'a'.repeat(201) } }))
    await assertFails(saveSkill(learner(), { stepChanges: { instruction: 'a'.repeat(2001) } }))
    await assertFails(saveSkill(learner(), { stepChanges: { doneWhen: 'a'.repeat(1001) } }))
  })

  test('more than 30 parts in a step is refused', async () => {
    await assertFails(saveSkill(learner(), { stepChanges: { parts: Array.from({ length: 31 }, () => 'LED') } }))
  })

  test('parts that are not a list are refused', async () => {
    await assertFails(saveSkill(learner(), { stepChanges: { parts: 'LED' } }))
  })

  test('nobody can change or delete a saved skill or step, not even its creator', async () => {
    await saveSkill(learner())
    const db = learner().firestore()
    await assertFails(updateDoc(doc(db, 'skills/skill-1'), { title: 'Changed' }))
    await assertFails(deleteDoc(doc(db, 'skills/skill-1')))
    await assertFails(updateDoc(doc(db, 'skills/skill-1/steps/step-1'), { title: 'Changed' }))
    await assertFails(deleteDoc(doc(db, 'skills/skill-1/steps/step-1')))
    await assertFails(setDoc(doc(db, 'skills/skill-1'), { ...skillDocuments(skill, 'learner-1').skill, createdAt: serverTimestamp() }))
  })
})

const closedPaths = ['questions/question-1', 'anything/else', 'skills/skill-1/notes/note-1']

describe('everything else stays closed', () => {
  for (const [name, context] of [
    ['a signed in learner', learner],
    ['a signed out visitor', visitor],
  ] as const) {
    for (const path of closedPaths) {
      test(`${name} cannot read ${path}`, async () => {
        await assertFails(getDoc(doc(context().firestore(), path)))
      })

      test(`${name} cannot write ${path}`, async () => {
        await assertFails(setDoc(doc(context().firestore(), path), { title: 'Blink an LED' }))
      })
    }
  }
})
