// Rules tests for experts, their replies and saved answers (#20). They run against the
// Firestore emulator through npm test, in their own project id, so another test file
// clearing demo-surtrix at the same time never removes the documents saved here.
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
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, beforeAll, describe, test } from 'vitest'

let testEnv: RulesTestEnvironment

type TestDb = ReturnType<RulesTestContext['firestore']>

const EXPERT_NAME = 'Ada Expert'

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-surtrix-experts',
    firestore: { rules: readFileSync(join(import.meta.dirname, '..', 'firestore.rules'), 'utf8') },
  })
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'experts/expert-1'), { name: EXPERT_NAME })
    await setDoc(doc(db, 'experts/expert-2'), { name: 'Grace Expert' })
    // Listed, but signed in anonymously: never an expert.
    await setDoc(doc(db, 'experts/anonymous-1'), { name: 'Not Google' })
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

function google(uid: string): TestDb {
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore()
}

function anonymous(uid: string): TestDb {
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore()
}

const expert = () => google('expert-1')

let nextId = 0

// Saves an open question by learner-1 on sample-led step-2 and returns its id.
async function openQuestion(): Promise<string> {
  nextId += 1
  const id = `question-${nextId}`
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'questions', id), {
      learnerId: 'learner-1',
      skillId: 'sample-led',
      skillTitle: 'Light an LED',
      stepId: 'step-2',
      stepNumber: 2,
      stepTitle: 'Add the resistor',
      stepInstruction: 'Put the resistor between row 10 and the ground rail.',
      question: 'Is the resistor in the right row?',
      frame: Bytes.fromUint8Array(new Uint8Array(1024).fill(255)),
      origin: 'learner',
      judgeSaid: null,
      status: 'open',
      createdAt: Timestamp.now(),
    })
  })
  return id
}

type Change = {
  reply?: Record<string, unknown>
  answer?: Record<string, unknown>
  question?: Record<string, unknown>
  answerPath?: string
  withAnswer?: boolean
  withReply?: boolean
}

// The reply on the question and the saved answer, in one batch, as the dashboard writes them.
function reply(db: TestDb, questionId: string, change: Change = {}) {
  const text = 'Yes. Move the wire one row down.'
  const batch = writeBatch(db)
  if (change.withReply !== false) {
    batch.update(doc(db, 'questions', questionId), {
      status: 'answered',
      reply: { text, expertId: 'expert-1', expertName: EXPERT_NAME, answeredAt: serverTimestamp(), ...change.reply },
      ...change.question,
    })
  }
  if (change.withAnswer !== false) {
    batch.set(doc(db, change.answerPath ?? `skills/sample-led/steps/step-2/answers/${questionId}`), {
      questionId,
      question: 'Is the resistor in the right row?',
      answer: text,
      expertId: 'expert-1',
      expertName: EXPERT_NAME,
      createdAt: serverTimestamp(),
      ...change.answer,
    })
  }
  return batch.commit()
}

describe('an expert', () => {
  test('can read any question', async () => {
    const id = await openQuestion()
    await assertSucceeds(getDoc(doc(expert(), 'questions', id)))
  })

  test('can list the open questions', async () => {
    await openQuestion()
    await assertSucceeds(getDocs(query(collection(expert(), 'questions'), where('status', '==', 'open'))))
  })

  test('can answer an open question, saving the answer under its step', async () => {
    const id = await openQuestion()
    await assertSucceeds(reply(expert(), id))
  })

  test('cannot delete a question', async () => {
    const id = await openQuestion()
    await assertFails(deleteDoc(doc(expert(), 'questions', id)))
  })
})

describe('after an answer', () => {
  test('the learner who asked reads the reply', async () => {
    const id = await openQuestion()
    await reply(expert(), id)
    await assertSucceeds(getDoc(doc(anonymous('learner-1'), 'questions', id)))
  })

  test('every signed in learner reads the saved answer', async () => {
    const id = await openQuestion()
    await reply(expert(), id)
    await assertSucceeds(getDoc(doc(anonymous('learner-2'), `skills/sample-led/steps/step-2/answers/${id}`)))
    await assertSucceeds(getDocs(collection(anonymous('learner-2'), 'skills/sample-led/steps/step-2/answers')))
  })

  test('a signed out visitor cannot read the saved answer', async () => {
    const id = await openQuestion()
    await reply(expert(), id)
    const visitor = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(visitor, `skills/sample-led/steps/step-2/answers/${id}`)))
  })

  test('a second reply is refused, from another expert or the same one', async () => {
    const id = await openQuestion()
    await reply(expert(), id)
    await assertFails(reply(google('expert-2'), id, { reply: { expertId: 'expert-2', expertName: 'Grace Expert' }, answer: { expertId: 'expert-2', expertName: 'Grace Expert' } }))
    await assertFails(reply(expert(), id))
  })

  test('the saved answer cannot be changed or deleted', async () => {
    const id = await openQuestion()
    await reply(expert(), id)
    const path = `skills/sample-led/steps/step-2/answers/${id}`
    await assertFails(updateDoc(doc(expert(), path), { answer: 'Changed.' }))
    await assertFails(deleteDoc(doc(expert(), path)))
  })
})

describe('a reply is refused', () => {
  const refused: [string, Change][] = [
    ['without the saved answer', { withAnswer: false }],
    ['as a saved answer without the reply', { withReply: false }],
    ['with the answer under another step', { answerPath: 'skills/sample-led/steps/step-3/answers/' }],
    ['with the answer under another skill', { answerPath: 'skills/other-skill/steps/step-2/answers/' }],
    ['with another expert id', { reply: { expertId: 'expert-2' } }],
    ['with a name that is not the expert name', { reply: { expertName: 'Someone' } }],
    ['with a time set by the browser', { reply: { answeredAt: Timestamp.now() } }],
    ['with an empty reply', { reply: { text: '' }, answer: { answer: '' } }],
    ['with a reply of 2,001 characters', { reply: { text: 'a'.repeat(2001) }, answer: { answer: 'a'.repeat(2001) } }],
    ['with spaces around the reply', { reply: { text: ' Yes. ' }, answer: { answer: ' Yes. ' } }],
    ['with an extra reply field', { reply: { score: 5 } }],
    ['when it also changes the question', { question: { question: 'Something else?' } }],
    ['when the answer text differs from the reply', { answer: { answer: 'Something else.' } }],
    ['when the answer repeats another question', { answer: { question: 'Something else?' } }],
    ['with an extra answer field', { answer: { frame: 'x' } }],
    ['with a saved answer time set by the browser', { answer: { createdAt: Timestamp.now() } }],
  ]
  for (const [name, change] of refused) {
    test(name, async () => {
      const id = await openQuestion()
      // A path ending in / gets the question id, so only the skill or step differs.
      const answerPath = change.answerPath?.endsWith('/') ? `${change.answerPath}${id}` : change.answerPath
      await assertFails(reply(expert(), id, { ...change, answerPath }))
    })
  }

  // The reply needs its answer at the right path, so these add a second, misplaced copy
  // to an otherwise valid batch: only the answer's own path check can refuse it.
  for (const [name, path] of [
    ['another step', 'skills/sample-led/steps/step-3/answers/'],
    ['another skill', 'skills/other-skill/steps/step-2/answers/'],
  ]) {
    test(`with an extra copy of the answer under ${name}`, async () => {
      const id = await openQuestion()
      const db = expert()
      const batch = writeBatch(db)
      batch.update(doc(db, 'questions', id), {
        status: 'answered',
        reply: { text: 'Yes.', expertId: 'expert-1', expertName: EXPERT_NAME, answeredAt: serverTimestamp() },
      })
      for (const answerPath of [`skills/sample-led/steps/step-2/answers/${id}`, `${path}${id}`]) {
        batch.set(doc(db, answerPath), {
          questionId: id,
          question: 'Is the resistor in the right row?',
          answer: 'Yes.',
          expertId: 'expert-1',
          expertName: EXPERT_NAME,
          createdAt: serverTimestamp(),
        })
      }
      await assertFails(batch.commit())
    })
  }

  test('with a saved answer whose id is another question', async () => {
    const id = await openQuestion()
    const other = await openQuestion()
    await assertFails(reply(expert(), id, { answerPath: `skills/sample-led/steps/step-2/answers/${other}`, answer: { questionId: other } }))
  })
})

describe('someone who is not an expert', () => {
  const others: [string, () => TestDb][] = [
    ['the learner who asked', () => anonymous('learner-1')],
    ['an anonymous account listed in experts', () => anonymous('anonymous-1')],
    ['a Google account not in experts', () => google('google-1')],
  ]
  for (const [name, db] of others) {
    test(`${name} cannot answer`, async () => {
      const id = await openQuestion()
      await assertFails(reply(db(), id))
    })
  }

  test('an anonymous account listed in experts cannot read or list questions', async () => {
    const id = await openQuestion()
    await assertFails(getDoc(doc(anonymous('anonymous-1'), 'questions', id)))
    await assertFails(getDocs(query(collection(anonymous('anonymous-1'), 'questions'), where('status', '==', 'open'))))
  })

  test('a Google account not in experts cannot read or list questions', async () => {
    const id = await openQuestion()
    await assertFails(getDoc(doc(google('google-1'), 'questions', id)))
    await assertFails(getDocs(query(collection(google('google-1'), 'questions'), where('status', '==', 'open'))))
  })
})

describe('the experts list', () => {
  test('a user can read their own entry', async () => {
    await assertSucceeds(getDoc(doc(expert(), 'experts/expert-1')))
  })

  test('a Google account not in experts can check its own entry', async () => {
    await assertSucceeds(getDoc(doc(google('google-1'), 'experts/google-1')))
  })

  test("a user cannot read someone else's entry", async () => {
    await assertFails(getDoc(doc(expert(), 'experts/expert-2')))
  })

  test('nobody can add themselves', async () => {
    await assertFails(setDoc(doc(google('google-1'), 'experts/google-1'), { name: 'Me' }))
  })

  test('an expert cannot change their name', async () => {
    await assertFails(updateDoc(doc(expert(), 'experts/expert-1'), { name: 'New name' }))
  })

  test('a signed out visitor cannot read it', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'experts/expert-1')))
  })
})
