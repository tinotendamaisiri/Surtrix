// Firestore rules tests. They run against the Firestore emulator through npm test,
// which starts it as project demo-surtrix.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, describe, test } from 'vitest'

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

const paths = ['skills/sample-skill', 'skills/sample-skill/steps/step-1', 'questions/question-1', 'anything/else']

const visitors: { name: string; context: () => RulesTestContext }[] = [
  { name: 'a signed in learner', context: () => testEnv.authenticatedContext('learner-1') },
  { name: 'a signed out visitor', context: () => testEnv.unauthenticatedContext() },
]

describe('closed rules', () => {
  for (const visitor of visitors) {
    for (const path of paths) {
      test(`${visitor.name} cannot read ${path}`, async () => {
        await assertFails(getDoc(doc(visitor.context().firestore(), path)))
      })

      test(`${visitor.name} cannot write ${path}`, async () => {
        await assertFails(setDoc(doc(visitor.context().firestore(), path), { title: 'Blink an LED' }))
      })
    }
  }
})
