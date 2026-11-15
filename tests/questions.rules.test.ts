// Rules tests for Ask an Expert questions (#17). They run against the Firestore
// emulator through npm test. They use their own project id, so another test file
// clearing demo-surtrix at the same time never removes the questions saved here.
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
  addDoc,
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
} from 'firebase/firestore'
import { afterAll, beforeAll, describe, test } from 'vitest'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-surtrix-questions',
    firestore: { rules: readFileSync(join(import.meta.dirname, '..', 'firestore.rules'), 'utf8') },
  })
  // Two questions already saved: one by learner-1 and one by learner-2.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'questions/asked-by-learner-1'), { ...validQuestion('learner-1'), createdAt: Timestamp.now() })
    await setDoc(doc(db, 'questions/asked-by-learner-2'), { ...validQuestion('learner-2'), createdAt: Timestamp.now() })
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

function frameOfSize(bytes: number): Bytes {
  return Bytes.fromUint8Array(new Uint8Array(bytes).fill(255))
}

function validQuestion(learnerId: string): Record<string, unknown> {
  return {
    learnerId,
    skillId: 'sample-led',
    skillTitle: 'Light an LED',
    stepId: 'step-2',
    stepNumber: 2,
    stepTitle: 'Add the resistor',
    stepInstruction: 'Put the 220 ohm resistor between row 10 and the ground rail.',
    question: 'Is the resistor in the right row?',
    frame: frameOfSize(50 * 1024),
    origin: 'learner',
    judgeSaid: null,
    status: 'open',
    createdAt: serverTimestamp(),
  }
}

type TestDb = ReturnType<RulesTestContext['firestore']>

function learner(uid: string): TestDb {
  return testEnv.authenticatedContext(uid).firestore()
}

function ask(db: TestDb, question: Record<string, unknown>) {
  return addDoc(collection(db, 'questions'), question)
}

describe('creating a question', () => {
  test('a learner can ask as themselves', async () => {
    await assertSucceeds(ask(learner('learner-1'), validQuestion('learner-1')))
  })

  test('a learner can ask after the judge was unsure, with its words', async () => {
    await assertSucceeds(
      ask(learner('learner-1'), { ...validQuestion('learner-1'), origin: 'judge', judgeSaid: 'The LED may be reversed.' }),
    )
  })

  test('a frame just under 900 KB is accepted', async () => {
    await assertSucceeds(ask(learner('learner-1'), { ...validQuestion('learner-1'), frame: frameOfSize(900 * 1024 - 1) }))
  })

  test('a question of exactly 500 characters is accepted', async () => {
    await assertSucceeds(ask(learner('learner-1'), { ...validQuestion('learner-1'), question: 'a'.repeat(500) }))
  })

  test('a signed out visitor cannot ask', async () => {
    await assertFails(ask(testEnv.unauthenticatedContext().firestore(), validQuestion('learner-1')))
  })

  test('a learner cannot ask as someone else', async () => {
    await assertFails(ask(learner('learner-1'), validQuestion('learner-2')))
  })

  const refused: [string, (q: Record<string, unknown>) => void][] = [
    ['a missing field', (q) => delete q.judgeSaid],
    ['an extra field', (q) => (q.reply = { text: 'Looks right.' })],
    ['a status other than open', (q) => (q.status = 'answered')],
    ['an empty question', (q) => (q.question = '')],
    ['a question of only spaces', (q) => (q.question = '   ')],
    ['a question of 501 characters', (q) => (q.question = 'a'.repeat(501))],
    ['a frame of 900 KB', (q) => (q.frame = frameOfSize(900 * 1024))],
    ['an empty frame', (q) => (q.frame = frameOfSize(0))],
    ['a frame sent as text', (q) => (q.frame = 'aGVsbG8=')],
    ['a time set by the browser', (q) => (q.createdAt = Timestamp.now())],
    ['judge words on a learner question', (q) => (q.judgeSaid = 'The LED may be reversed.')],
    ['a judge question without the judge words', (q) => (q.origin = 'judge')],
    ['an unknown origin', (q) => (q.origin = 'expert')],
    ['step number 0', (q) => (q.stepNumber = 0)],
    ['step number 41', (q) => (q.stepNumber = 41)],
    ['a step number that is not whole', (q) => (q.stepNumber = 1.5)],
    ['an empty skill id', (q) => (q.skillId = '')],
    ['an empty step title', (q) => (q.stepTitle = ' ')],
    ['a question with spaces around it', (q) => (q.question = ' Is it right? ')],
    ['judge words ending in a newline', (q) => ((q.origin = 'judge'), (q.judgeSaid = 'The LED may be reversed.\n'))],
    ['a skill id of 129 characters', (q) => (q.skillId = 'a'.repeat(129))],
    ['a step id of 129 characters', (q) => (q.stepId = 'a'.repeat(129))],
    ['a skill title of 201 characters', (q) => (q.skillTitle = 'a'.repeat(201))],
    ['a step title of 201 characters', (q) => (q.stepTitle = 'a'.repeat(201))],
    ['a step instruction of 5,001 characters', (q) => (q.stepInstruction = 'a'.repeat(5001))],
    ['judge words of 2,001 characters', (q) => ((q.origin = 'judge'), (q.judgeSaid = 'a'.repeat(2001)))],
  ]
  for (const [name, change] of refused) {
    test(`a question with ${name} is refused`, async () => {
      const question = validQuestion('learner-1')
      change(question)
      await assertFails(ask(learner('learner-1'), question))
    })
  }
})

describe('reading questions', () => {
  test('a learner can read their own question', async () => {
    await assertSucceeds(getDoc(doc(learner('learner-1'), 'questions/asked-by-learner-1')))
  })

  test("a learner cannot read another learner's question", async () => {
    await assertFails(getDoc(doc(learner('learner-1'), 'questions/asked-by-learner-2')))
  })

  test('a signed out visitor cannot read a question', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'questions/asked-by-learner-1')))
  })

  test('a learner can list their own questions for a step, as the coach does', async () => {
    const db = learner('learner-1')
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'questions'),
          where('learnerId', '==', 'learner-1'),
          where('skillId', '==', 'sample-led'),
          where('stepId', '==', 'step-2'),
        ),
      ),
    )
  })

  test("a learner cannot list another learner's questions", async () => {
    await assertFails(getDocs(query(collection(learner('learner-1'), 'questions'), where('learnerId', '==', 'learner-2'))))
  })

  test('a learner cannot list every question', async () => {
    await assertFails(getDocs(collection(learner('learner-1'), 'questions')))
  })
})

describe('signed out visitors', () => {
  const visitorDb = () => testEnv.unauthenticatedContext().firestore()

  test('cannot list questions', async () => {
    await assertFails(getDocs(query(collection(visitorDb(), 'questions'), where('learnerId', '==', 'learner-1'))))
  })

  test('cannot change a question', async () => {
    await assertFails(updateDoc(doc(visitorDb(), 'questions/asked-by-learner-1'), { status: 'answered' }))
  })

  test('cannot delete a question', async () => {
    await assertFails(deleteDoc(doc(visitorDb(), 'questions/asked-by-learner-1')))
  })
})

describe('changing questions', () => {
  test('a learner cannot change their own question', async () => {
    await assertFails(updateDoc(doc(learner('learner-1'), 'questions/asked-by-learner-1'), { question: 'Never mind.' }))
  })

  test('a learner cannot mark their own question answered', async () => {
    await assertFails(updateDoc(doc(learner('learner-1'), 'questions/asked-by-learner-1'), { status: 'answered' }))
  })

  test('a learner cannot delete their own question', async () => {
    await assertFails(deleteDoc(doc(learner('learner-1'), 'questions/asked-by-learner-1')))
  })

  test("a learner cannot change another learner's question", async () => {
    await assertFails(updateDoc(doc(learner('learner-1'), 'questions/asked-by-learner-2'), { status: 'answered' }))
  })
})
