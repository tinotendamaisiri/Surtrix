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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { seedDemoSkill } from '../scripts/seedDemoSkill.ts'
import { DEMO_SKILL_ID, demoSkill } from '../src/demoSkill.ts'
import type { Skill } from '../src/skill.ts'
import { coachSkillFromDocuments, skillDocuments, type StepDocument } from '../src/skillDocuments.ts'

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
    skillId?: string
    skill?: Skill
    creatorId?: string
    skillChanges?: DocumentData
    stepChanges?: DocumentData
    stepIds?: string[]
  } = {},
) {
  const db = context.firestore()
  const documents = skillDocuments(options.skill ?? skill, options.creatorId ?? 'learner-1')
  const skillId = options.skillId ?? 'skill-1'
  const batch = writeBatch(db)
  batch.set(doc(db, `skills/${skillId}`), { ...documents.skill, ...options.skillChanges })
  documents.steps.forEach((s, i) =>
    batch.set(doc(db, `skills/${skillId}/steps/${options.stepIds?.[i] ?? s.id}`), { ...s.data, ...options.stepChanges }),
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

  test("a learner lists their own skills with home's query", async () => {
    await saveSkill(learner())
    const db = learner().firestore()
    const mine = await assertSucceeds(getDocs(query(collection(db, 'skills'), where('creatorId', '==', 'learner-1'))))
    if (mine.size !== 1) throw new Error(`expected 1 skill, got ${mine.size}`)
  })

  test("a signed out visitor cannot run home's query", async () => {
    await saveSkill(learner())
    await assertFails(getDocs(query(collection(visitor().firestore(), 'skills'), where('creatorId', '==', 'learner-1'))))
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

  test('limits count characters, not bytes: 2,000 ohm signs fit an instruction', async () => {
    await assertSucceeds(saveSkill(learner(), { stepChanges: { instruction: '\u03a9'.repeat(2000) } }))
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

// The demo skill, written by the seed script as the owner (rules off), then read and
// written by learners through the rules (#25).
describe('demo skill', () => {
  const seed = () =>
    seedDemoSkill({ baseUrl: `http://${process.env.FIRESTORE_EMULATOR_HOST}`, projectId: 'demo-surtrix', token: 'owner' })

  test('a learner cannot create a skill with the demo skill id', async () => {
    await assertFails(saveSkill(learner(), { skillId: DEMO_SKILL_ID }))
  })

  test('a learner can still create a skill with any other id', async () => {
    await assertSucceeds(saveSkill(learner(), { skillId: 'sample-led-2' }))
  })

  test('the seeded demo skill loads for a learner as its 4 steps, with ids step-1 to step-4', async () => {
    await seed()
    const db = learner().firestore()
    const skillSnapshot = await assertSucceeds(getDoc(doc(db, `skills/${DEMO_SKILL_ID}`)))
    const data = skillSnapshot.data()!
    if (data.creatorId !== 'surtrix' || !(data.createdAt instanceof Timestamp)) {
      throw new Error(`unexpected demo skill ${JSON.stringify(data)}`)
    }
    const steps = await assertSucceeds(getDocs(query(collection(db, `skills/${DEMO_SKILL_ID}/steps`), orderBy('number'))))
    const loaded = coachSkillFromDocuments(
      DEMO_SKILL_ID,
      { title: data.title, stepCount: data.stepCount },
      steps.docs.map((d) => ({ id: d.id, data: d.data() as Partial<StepDocument> })),
    )
    expect(loaded).toEqual({
      id: DEMO_SKILL_ID,
      title: demoSkill.title,
      steps: demoSkill.steps.map((s, i) => ({ id: `step-${i + 1}`, ...s })),
    })
  })

  test('the seeded demo skill is in no learner\'s own list', async () => {
    await seed()
    const db = learner().firestore()
    const mine = await assertSucceeds(getDocs(query(collection(db, 'skills'), where('creatorId', '==', 'learner-1'))))
    expect(mine.size).toBe(0)
  })

  test('no learner can change the demo skill or its steps', async () => {
    await seed()
    const db = learner().firestore()
    await assertFails(updateDoc(doc(db, `skills/${DEMO_SKILL_ID}`), { title: 'Changed' }))
    await assertFails(updateDoc(doc(db, `skills/${DEMO_SKILL_ID}/steps/step-1`), { title: 'Changed' }))
  })

  test('no learner can add a missing step to the demo skill, since it is not theirs', async () => {
    await seed()
    // With step-4 gone, creating it fits every other step rule, so only the creator check
    // refuses it.
    await testEnv.withSecurityRulesDisabled((context) =>
      deleteDoc(doc(context.firestore(), `skills/${DEMO_SKILL_ID}/steps/step-4`)),
    )
    const db = learner().firestore()
    await assertFails(setDoc(doc(db, `skills/${DEMO_SKILL_ID}/steps/step-4`), { number: 4, ...step }))
  })

  test('seeding again leaves what is under a step alone', async () => {
    await seed()
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), `skills/${DEMO_SKILL_ID}/steps/step-2/answers/answer-1`), { answer: 'Kept' }),
    )
    await seed()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const answer = await getDoc(doc(context.firestore(), `skills/${DEMO_SKILL_ID}/steps/step-2/answers/answer-1`))
      expect(answer.get('answer')).toBe('Kept')
    })
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
