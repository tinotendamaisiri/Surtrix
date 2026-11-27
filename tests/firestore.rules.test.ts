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
  Bytes,
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
import { DEMO_SKILL_ID, demoAnswers, demoSkill } from '../src/demoSkill.ts'
import type { Skill } from '../src/skill.ts'
import { coachSkillFromDocuments, publishFields, skillDocuments, type StepDocument } from '../src/skillDocuments.ts'
import { stepAnswersFromDocuments } from '../src/savedAnswerPick.ts'

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
  tools: ['multimeter'],
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

  test('a learner saves 40 steps with 30 parts and 30 tools each', async () => {
    const parts = Array.from({ length: 30 }, (_, i) => `part ${i + 1}`)
    const tools = Array.from({ length: 30 }, (_, i) => `tool ${i + 1}`)
    const steps = Array.from({ length: 40 }, (_, i) => ({ ...step, title: `Step ${i + 1}`, parts, tools }))
    await assertSucceeds(saveSkill(learner(), { skill: { title: 'Long', steps } }))
  })

  test('the creator reads their own skill and its steps', async () => {
    await saveSkill(learner())
    await assertSucceeds(getDoc(doc(learner().firestore(), 'skills/skill-1')))
    await assertSucceeds(getDoc(doc(learner().firestore(), 'skills/skill-1/steps/step-2')))
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

  test('a step with tools is accepted, and so is one with an empty tools list', async () => {
    await assertSucceeds(saveSkill(learner()))
    await assertSucceeds(saveSkill(learner(), { skillId: 'skill-2', stepChanges: { tools: [] } }))
  })

  test('a step without tools is still accepted, as builds before tools save it', async () => {
    await storeSkillWithOneStep()
    await assertSucceeds(setDoc(doc(learner().firestore(), 'skills/skill-1/steps/step-2'), without('tools')(stepTwo)))
  })

  test('more than 30 tools in a step is refused', async () => {
    await assertFails(saveSkill(learner(), { stepChanges: { tools: Array.from({ length: 31 }, () => 'multimeter') } }))
  })

  test('tools that are not a list are refused', async () => {
    await assertFails(saveSkill(learner(), { stepChanges: { tools: 'multimeter' } }))
  })

  test('nobody deletes a saved skill; its creator edits it (#106) but never leaves a gap in its steps', async () => {
    await saveSkill(learner())
    const db = learner().firestore()
    await assertSucceeds(updateDoc(doc(db, 'skills/skill-1'), { title: 'Changed' }))
    await assertFails(deleteDoc(doc(db, 'skills/skill-1')))
    await assertSucceeds(updateDoc(doc(db, 'skills/skill-1/steps/step-1'), { title: 'Changed' }))
    await assertFails(deleteDoc(doc(db, 'skills/skill-1/steps/step-1')))
    await assertFails(setDoc(doc(db, 'skills/skill-1'), { ...skillDocuments(skill, 'learner-1').skill, createdAt: serverTimestamp() }))
  })
})

const EXPERT_NAME = 'Ada Expert'

// A Google account listed in experts, as the expert dashboard signs in (#20).
const expert = (uid = 'expert-1') => testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } })

async function listExperts() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'experts/expert-1'), { name: EXPERT_NAME })
    await setDoc(doc(context.firestore(), 'experts/expert-2'), { name: 'Grace Expert' })
    // Listed, but signed in anonymously: never an expert.
    await setDoc(doc(context.firestore(), 'experts/anonymous-1'), { name: 'Not Google' })
  })
}

// Stores a skill with step-1 and one saved answer under it, rules off. published adds
// the fields an expert's publish writes.
async function storeSkill(skillId: string, creatorId: string, published?: boolean) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const documents = skillDocuments(skill, creatorId)
    const publishing = published === undefined ? {} : { published, expertName: EXPERT_NAME, publishedAt: Timestamp.now() }
    await setDoc(doc(db, `skills/${skillId}`), { ...documents.skill, createdAt: Timestamp.now(), ...publishing })
    await setDoc(doc(db, `skills/${skillId}/steps/step-1`), documents.steps[0].data)
    await setDoc(doc(db, `skills/${skillId}/steps/step-1/answers/answer-1`), { answer: 'Move the wire one row down.' })
  })
}

// Reads the skill, one step, the list of its steps, one saved answer and the list of
// saved answers, as the Workspace does. Each read starts only when it is called.
function readSkillParts(db: ReturnType<RulesTestContext['firestore']>, skillId: string): (() => Promise<unknown>)[] {
  return [
    () => getDoc(doc(db, `skills/${skillId}`)),
    () => getDoc(doc(db, `skills/${skillId}/steps/step-1`)),
    () => getDocs(query(collection(db, `skills/${skillId}/steps`), orderBy('number'))),
    () => getDoc(doc(db, `skills/${skillId}/steps/step-1/answers/answer-1`)),
    () => getDocs(collection(db, `skills/${skillId}/steps/step-1/answers`)),
  ]
}

// Publishing (#52): an expert publishes or unpublishes a skill they made.
describe('publishing a skill', () => {
  beforeEach(listExperts)

  test('an expert saves a skill, then publishes and unpublishes it, with the server time', async () => {
    await assertSucceeds(saveSkill(expert(), { creatorId: 'expert-1' }))
    const db = expert().firestore()
    await assertSucceeds(updateDoc(doc(db, 'skills/skill-1'), publishFields(true, EXPERT_NAME)))
    const published = await assertSucceeds(getDoc(doc(db, 'skills/skill-1')))
    expect(published.get('published')).toBe(true)
    expect(published.get('expertName')).toBe(EXPERT_NAME)
    expect(published.get('publishedAt')).toBeInstanceOf(Timestamp)
    await assertSucceeds(updateDoc(doc(db, 'skills/skill-1'), publishFields(false, EXPERT_NAME)))
    expect((await getDoc(doc(db, 'skills/skill-1'))).get('published')).toBe(false)
  })

  test('a learner cannot publish their own skill', async () => {
    await saveSkill(learner())
    await assertFails(updateDoc(doc(learner().firestore(), 'skills/skill-1'), publishFields(true, EXPERT_NAME)))
  })

  test('an anonymous account listed in experts cannot publish its own skill', async () => {
    await storeSkill('mine', 'anonymous-1')
    const anonymous = testEnv.authenticatedContext('anonymous-1', { firebase: { sign_in_provider: 'anonymous' } })
    await assertFails(updateDoc(doc(anonymous.firestore(), 'skills/mine'), publishFields(true, 'Not Google')))
  })

  for (const field of [{ published: false }, { published: true }, { expertName: EXPERT_NAME }, { publishedAt: serverTimestamp() }]) {
    test(`a new skill cannot be saved with ${Object.keys(field)[0]}, by an expert or a learner`, async () => {
      await assertFails(saveSkill(expert(), { creatorId: 'expert-1', skillChanges: field }))
      await assertFails(saveSkill(learner(), { skillChanges: field }))
    })
  }

  test("an expert cannot publish another expert's skill or a learner's skill", async () => {
    await storeSkill('by-expert-2', 'expert-2')
    await storeSkill('by-learner', 'learner-1')
    const db = expert().firestore()
    await assertFails(updateDoc(doc(db, 'skills/by-expert-2'), publishFields(true, EXPERT_NAME)))
    await assertFails(updateDoc(doc(db, 'skills/by-learner'), publishFields(true, EXPERT_NAME)))
  })

  test('an expert cannot publish under a name that is not theirs', async () => {
    await storeSkill('mine', 'expert-1')
    await assertFails(updateDoc(doc(expert().firestore(), 'skills/mine'), publishFields(true, 'Grace Expert')))
  })

  test('a time set by the browser is refused', async () => {
    await storeSkill('mine', 'expert-1')
    await assertFails(
      updateDoc(doc(expert().firestore(), 'skills/mine'), { published: true, expertName: EXPERT_NAME, publishedAt: Timestamp.now() }),
    )
  })

  test('published must be true or false', async () => {
    await storeSkill('mine', 'expert-1')
    await assertFails(updateDoc(doc(expert().firestore(), 'skills/mine'), { ...publishFields(true, EXPERT_NAME), published: 'yes' }))
  })

  test('publishing cannot change any other field', async () => {
    await storeSkill('mine', 'expert-1')
    const db = expert().firestore()
    await assertFails(updateDoc(doc(db, 'skills/mine'), { ...publishFields(true, EXPERT_NAME), title: 'Changed' }))
    await assertFails(updateDoc(doc(db, 'skills/mine'), { ...publishFields(true, EXPERT_NAME), stepCount: 1 }))
  })

  test('an expert cannot delete their skill', async () => {
    await storeSkill('mine', 'expert-1')
    await assertFails(deleteDoc(doc(expert().firestore(), 'skills/mine')))
  })

  test('nobody publishes the demo skill, even an expert stored as its creator', async () => {
    await storeSkill(DEMO_SKILL_ID, 'expert-1')
    await assertFails(updateDoc(doc(expert().firestore(), `skills/${DEMO_SKILL_ID}`), publishFields(true, EXPERT_NAME)))
  })
})

// Reading skills (#52): a skill, its steps and its saved answers follow the skill.
describe('reading skills', () => {
  beforeEach(listExperts)

  test('an unpublished skill, its steps and answers are read by their creator only', async () => {
    for (const published of [undefined, false]) {
      await storeSkill('private', 'learner-1', published)
      for (const read of readSkillParts(learner().firestore(), 'private')) await assertSucceeds(read())
      for (const reader of [otherLearner(), expert(), visitor()]) {
        for (const read of readSkillParts(reader.firestore(), 'private')) await assertFails(read())
      }
    }
  })

  test('a published skill, its steps and answers are read by anyone signed in, not signed out', async () => {
    await storeSkill('shared', 'expert-1', true)
    for (const reader of [learner(), otherLearner(), expert(), expert('expert-2')]) {
      for (const read of readSkillParts(reader.firestore(), 'shared')) await assertSucceeds(read())
    }
    for (const read of readSkillParts(visitor().firestore(), 'shared')) await assertFails(read())
  })

  test('the demo skill, its steps and answers are read by anyone signed in, not signed out', async () => {
    await storeSkill(DEMO_SKILL_ID, 'surtrix')
    for (const reader of [learner(), otherLearner(), expert()]) {
      for (const read of readSkillParts(reader.firestore(), DEMO_SKILL_ID)) await assertSucceeds(read())
    }
    for (const read of readSkillParts(visitor().firestore(), DEMO_SKILL_ID)) await assertFails(read())
  })

  test('a skill that does not exist, and its steps and answers, are refused', async () => {
    for (const read of readSkillParts(learner().firestore(), 'missing')) await assertFails(read())
  })

  test("All skills' query lists only the published skills, for any signed in learner", async () => {
    await storeSkill('shared', 'expert-1', true)
    await storeSkill('unpublished', 'expert-1', false)
    await storeSkill('private', 'learner-1')
    const db = otherLearner().firestore()
    const published = await assertSucceeds(getDocs(query(collection(db, 'skills'), where('published', '==', true))))
    expect(published.docs.map((d) => d.id)).toEqual(['shared'])
    await assertFails(getDocs(query(collection(visitor().firestore(), 'skills'), where('published', '==', true))))
  })

  test("the creator lists their own skills; another learner cannot list them", async () => {
    await storeSkill('private', 'learner-1')
    const mine = await assertSucceeds(getDocs(query(collection(learner().firestore(), 'skills'), where('creatorId', '==', 'learner-1'))))
    expect(mine.size).toBe(1)
    await assertFails(getDocs(query(collection(otherLearner().firestore(), 'skills'), where('creatorId', '==', 'learner-1'))))
  })

  test('a list of every skill is refused, even with only published skills stored', async () => {
    await storeSkill('shared', 'expert-1', true)
    await assertFails(getDocs(collection(learner().firestore(), 'skills')))
    await assertFails(getDocs(collection(expert().firestore(), 'skills')))
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
      // Read from the steps; the card reads the skill's own badges field (#104).
      badges: ['electricity'],
      steps: demoSkill.steps.map((s, i) => ({ id: `step-${i + 1}`, ...s })),
    })
    expect(data.badges).toEqual(['electricity'])
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

  test('a learner reads the seeded answers on their steps, in the Contracts shape', async () => {
    await seed()
    const db = learner().firestore()
    for (const a of demoAnswers) {
      const snapshot = await assertSucceeds(getDoc(doc(db, `skills/${DEMO_SKILL_ID}/steps/${a.stepId}/answers/${a.id}`)))
      const { createdAt, ...rest } = snapshot.data()!
      expect(createdAt).toBeInstanceOf(Timestamp)
      expect(rest).toEqual({
        questionId: a.id,
        question: a.question,
        answer: a.answer,
        expertId: 'surtrix',
        expertName: 'Surtrix team',
      })
    }
    const onStep4 = await assertSucceeds(getDocs(collection(db, `skills/${DEMO_SKILL_ID}/steps/step-4/answers`)))
    expect(onStep4.docs.map((d) => d.id).sort()).toEqual(['demo-led-backwards', 'demo-no-power'])
  })

  test("the coach's loading reads each step's seeded answers as a learner (#31)", async () => {
    await seed()
    const db = learner().firestore()
    const steps = await Promise.all(
      ['step-1', 'step-2', 'step-3', 'step-4'].map(async (stepId) => {
        const snapshot = await assertSucceeds(getDocs(collection(db, `skills/${DEMO_SKILL_ID}/steps/${stepId}/answers`)))
        return { stepId, documents: snapshot.docs.map((d) => ({ id: d.id, data: d.data() })) }
      }),
    )
    const byStep = stepAnswersFromDocuments(steps)
    expect(Object.fromEntries(Object.entries(byStep).map(([stepId, answers]) => [stepId, answers.map((a) => a.id).sort()]))).toEqual({
      'step-1': [],
      'step-2': ['demo-led-in-rail'],
      'step-3': [],
      'step-4': ['demo-led-backwards', 'demo-no-power'],
    })
    expect(byStep['step-2'][0].expertName).toBe('Surtrix team')
  })

  test('neither a learner nor an expert can change or replace a seeded answer', async () => {
    await seed()
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), 'experts/expert-1'), { name: 'Ada Expert' }),
    )
    const expert = testEnv.authenticatedContext('expert-1', { firebase: { sign_in_provider: 'google.com' } }).firestore()
    const path = `skills/${DEMO_SKILL_ID}/steps/step-2/answers/demo-led-in-rail`
    for (const db of [learner().firestore(), expert]) {
      await assertFails(updateDoc(doc(db, path), { answer: 'Changed' }))
      await assertFails(setDoc(doc(db, path), { answer: 'Replaced' }))
      await assertFails(deleteDoc(doc(db, path)))
    }
  })

  test('seeding again keeps the seeded answers', async () => {
    await seed()
    await seed()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      for (const a of demoAnswers) {
        const snapshot = await getDoc(doc(context.firestore(), `skills/${DEMO_SKILL_ID}/steps/${a.stepId}/answers/${a.id}`))
        expect(snapshot.get('answer')).toBe(a.answer)
      }
    })
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

// Saved coach lines (#100): the skill's creator saves its fixed lines, anyone who can read
// the skill reads them, and nobody changes them or writes them into the demo skill.
// Safety badges (#104): an optional list on a new skill and on its steps.
describe('safety badges on a saved skill', () => {
  test('a skill and its steps may carry badges', async () => {
    await assertSucceeds(
      saveSkill(learner(), { skill: { ...skill, badges: ['fumes'], steps: skill.steps.map((s) => ({ ...s, badges: ['gloves'] })) } }),
    )
    const saved = await getDoc(doc(learner().firestore(), 'skills/skill-1/steps/step-1'))
    expect(saved.get('badges')).toEqual(['gloves'])
  })

  test('badges must be a list of at most 20', async () => {
    await assertFails(saveSkill(learner(), { skillChanges: { badges: 'gloves' } }))
    await assertFails(saveSkill(learner(), { stepChanges: { badges: 'gloves' } }))
    await assertFails(saveSkill(learner(), { skillChanges: { badges: Array(21).fill('gloves') } }))
    await assertSucceeds(saveSkill(learner(), { skillChanges: { badges: Array(20).fill('gloves') } }))
  })
})

// Create a skill (#106): new fields on a skill, editing by its creator, and tool photos.
describe('creating and editing a skill (#106)', () => {
  const extras = { trade: 'Soldering', level: 'Beginner', description: 'Tack one pin first.', minutes: 20, tools: [{ name: 'Iron', alternative: 'No iron? A gas pen.' }] }

  test('a new skill may have a trade, level, description, minutes and tools', async () => {
    await assertSucceeds(saveSkill(learner(), { skillChanges: extras }))
  })

  test('those fields must fit', async () => {
    for (const bad of [{ level: 'Expert' }, { minutes: 0 }, { minutes: 601 }, { description: 'a'.repeat(301) }, { trade: '' }, { tools: 'Iron' }]) {
      await assertFails(saveSkill(learner(), { skillChanges: { ...extras, ...bad } })).catch((e: unknown) => {
        throw new Error(`${JSON.stringify(bad)} was accepted: ${String(e)}`)
      })
    }
  })

  test('its creator edits it: fields, steps rewritten, a step removed', async () => {
    await saveSkill(learner(), { skillChanges: extras })
    const db = learner().firestore()
    const batch = writeBatch(db)
    batch.update(doc(db, 'skills/skill-1'), { title: 'Light an LED, better', stepCount: 1, trade: 'Electronics', minutes: 15 })
    batch.set(doc(db, 'skills/skill-1/steps/step-1'), { number: 1, ...step, title: 'Place it' })
    batch.delete(doc(db, 'skills/skill-1/steps/step-2'))
    await assertSucceeds(batch.commit())
  })

  test('nobody else edits it, and nobody changes its creator or time', async () => {
    await saveSkill(learner(), { skillChanges: extras })
    await assertFails(updateDoc(doc(otherLearner().firestore(), 'skills/skill-1'), { title: 'Mine now' }))
    await assertFails(setDoc(doc(otherLearner().firestore(), 'skills/skill-1/steps/step-1'), { number: 1, ...step }))
    await assertFails(deleteDoc(doc(otherLearner().firestore(), 'skills/skill-1/steps/step-2')))
    await assertFails(updateDoc(doc(learner().firestore(), 'skills/skill-1'), { creatorId: 'learner-2' }))
    await assertFails(updateDoc(doc(learner().firestore(), 'skills/skill-1'), { createdAt: Timestamp.now() }))
  })

  test('an edit must still fit: a step past the count is refused', async () => {
    await saveSkill(learner())
    const db = learner().firestore()
    const batch = writeBatch(db)
    batch.update(doc(db, 'skills/skill-1'), { stepCount: 1 })
    batch.set(doc(db, 'skills/skill-1/steps/step-2'), stepTwo)
    await assertFails(batch.commit())
  })

  test('a tool photo is written by the creator, at most 150000 bytes, named after its tool', async () => {
    await saveSkill(learner(), { skillChanges: extras })
    const db = learner().firestore()
    const photo = (size: number) => ({ number: 1, photo: Bytes.fromUint8Array(new Uint8Array(size).fill(1)) })
    await assertSucceeds(setDoc(doc(db, 'skills/skill-1/toolPhotos/tool-1'), photo(150000)))
    await assertFails(setDoc(doc(db, 'skills/skill-1/toolPhotos/tool-1'), photo(150001)))
    await assertFails(setDoc(doc(db, 'skills/skill-1/toolPhotos/tool-2'), photo(10)))
    await assertFails(setDoc(doc(otherLearner().firestore(), 'skills/skill-1/toolPhotos/tool-1'), photo(10)))
    await assertSucceeds(deleteDoc(doc(db, 'skills/skill-1/toolPhotos/tool-1')))
  })

  test("a tool photo is read like the skill: not by others while it is not published", async () => {
    await saveSkill(learner(), { skillChanges: extras })
    await setDoc(doc(learner().firestore(), 'skills/skill-1/toolPhotos/tool-1'), { number: 1, photo: Bytes.fromUint8Array(new Uint8Array(10)) })
    await assertFails(getDoc(doc(otherLearner().firestore(), 'skills/skill-1/toolPhotos/tool-1')))
    await assertSucceeds(getDoc(doc(learner().firestore(), 'skills/skill-1/toolPhotos/tool-1')))
  })

  test('the demo skill is never edited', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const documents = skillDocuments(skill, 'surtrix')
      await setDoc(doc(context.firestore(), `skills/${DEMO_SKILL_ID}`), { ...documents.skill, createdAt: Timestamp.now() })
    })
    await assertFails(updateDoc(doc(testEnv.authenticatedContext('surtrix').firestore(), `skills/${DEMO_SKILL_ID}`), { title: 'Changed' }))
  })
})

describe('saved coach lines', () => {
  const KEY = '0123456789abcdef0123456789abcdef'
  const line = (changes: DocumentData = {}) => ({
    key: KEY,
    part: 0,
    parts: 1,
    text: 'Step 1 of 2, Place the LED. Push the LED into rows 10 and 11, long leg in row 10.',
    model: 'gemini-3.8-flash-lite-tts',
    voice: 'Achird',
    audio: Bytes.fromUint8Array(new Uint8Array(1000)),
    createdAt: serverTimestamp(),
    ...changes,
  })
  const linePath = (skillId = 'skill-1', id = `${KEY}-0`, stepId = 'step-1') => `skills/${skillId}/steps/${stepId}/speech/${id}`

  test("the skill's creator saves a line of a step, and reads it back", async () => {
    await storeSkill('skill-1', 'learner-1')
    const db = learner().firestore()
    await assertSucceeds(setDoc(doc(db, linePath()), line()))
    const saved = await assertSucceeds(getDocs(collection(db, 'skills/skill-1/steps/step-1/speech')))
    expect(saved.size).toBe(1)
  })

  test('a long line is saved in parts, each named after its part', async () => {
    await storeSkill('skill-1', 'learner-1')
    const db = learner().firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, linePath('skill-1', `${KEY}-0`)), line({ parts: 2, audio: Bytes.fromUint8Array(new Uint8Array(900000)) }))
    batch.set(doc(db, linePath('skill-1', `${KEY}-1`)), line({ part: 1, parts: 2 }))
    await assertSucceeds(batch.commit())
  })

  test("nobody saves a line in someone else's skill", async () => {
    await storeSkill('skill-1', 'learner-1', true)
    await assertFails(setDoc(doc(otherLearner().firestore(), linePath()), line()))
    await assertFails(setDoc(doc(visitor().firestore(), linePath()), line()))
  })

  test('nobody saves a line in the demo skill, not even as its creator id', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const documents = skillDocuments(skill, 'surtrix')
      await setDoc(doc(context.firestore(), `skills/${DEMO_SKILL_ID}`), { ...documents.skill, createdAt: Timestamp.now() })
      await setDoc(doc(context.firestore(), `skills/${DEMO_SKILL_ID}/steps/step-1`), documents.steps[0].data)
    })
    await assertFails(setDoc(doc(testEnv.authenticatedContext('surtrix').firestore(), linePath(DEMO_SKILL_ID)), line()))
  })

  test('a line must fit its shape', async () => {
    await storeSkill('skill-1', 'learner-1')
    const db = learner().firestore()
    const refused: [string, DocumentData, string?][] = [
      ['an extra field', line({ extra: 1 })],
      ['a missing field', without('voice')(line())],
      ['a key that is not 32 hex characters', line({ key: 'not-a-key' }), 'not-a-key-0'],
      ['an id that is not key-part', line(), `${KEY}-1`],
      ['a part past its parts', line({ part: 1, parts: 1 }), `${KEY}-1`],
      ['more than 20 parts', line({ parts: 21 })],
      ['audio that is not bytes', line({ audio: 'AAAA' })],
      ['empty audio', line({ audio: Bytes.fromUint8Array(new Uint8Array(0)) })],
      ['audio over 900000 bytes', line({ audio: Bytes.fromUint8Array(new Uint8Array(900001)) })],
      ['empty text', line({ text: '' })],
      ['text over 2400 characters', line({ text: 'a'.repeat(2401) })],
      ['a time that is not the server time', line({ createdAt: Timestamp.fromMillis(0) })],
    ]
    for (const [why, data, id] of refused) {
      await assertFails(setDoc(doc(db, linePath('skill-1', id ?? `${KEY}-0`)), data)).catch((e: unknown) => {
        throw new Error(`${why} was accepted: ${String(e)}`)
      })
    }
  })

  test('a line needs its step to exist', async () => {
    await storeSkill('skill-1', 'learner-1')
    await assertFails(setDoc(doc(learner().firestore(), linePath('skill-1', `${KEY}-0`, 'step-9')), line()))
  })

  test('a saved line is never changed or deleted, even by the creator', async () => {
    await storeSkill('skill-1', 'learner-1')
    const db = learner().firestore()
    await assertSucceeds(setDoc(doc(db, linePath()), line()))
    await assertFails(setDoc(doc(db, linePath()), line({ text: 'Other words.' })))
    await assertFails(updateDoc(doc(db, linePath()), { text: 'Other words.' }))
    await assertFails(deleteDoc(doc(db, linePath())))
  })

  test('lines are read by whoever can read the skill', async () => {
    await storeSkill('skill-1', 'learner-1')
    await storeSkill('skill-2', 'learner-1', true)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), linePath('skill-1')), line({ createdAt: Timestamp.now() }))
      await setDoc(doc(context.firestore(), linePath('skill-2')), line({ createdAt: Timestamp.now() }))
    })
    const other = otherLearner().firestore()
    await assertFails(getDocs(collection(other, 'skills/skill-1/steps/step-1/speech')))
    await assertSucceeds(getDocs(collection(other, 'skills/skill-2/steps/step-1/speech')))
    await assertFails(getDocs(collection(visitor().firestore(), 'skills/skill-2/steps/step-1/speech')))
  })

  test("the demo skill's lines are read by any signed in learner", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), linePath(DEMO_SKILL_ID)), line({ createdAt: Timestamp.now() }))
    })
    await assertSucceeds(getDocs(collection(learner().firestore(), `skills/${DEMO_SKILL_ID}/steps/step-1/speech`)))
  })
})

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
