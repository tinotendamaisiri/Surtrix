// Rules tests for the drafts per visitor per day (#113), against the Firestore emulator.
// Their own project id, so other files clearing theirs never touch these counts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { afterAll, beforeAll, describe, test } from 'vitest'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-surtrix-draft-counts',
    firestore: { rules: readFileSync(join(import.meta.dirname, '..', 'firestore.rules'), 'utf8') },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

const visitor = (uid: string) => testEnv.authenticatedContext(uid).firestore()
const press = (uid: string, count: number, owner = uid) => setDoc(doc(visitor(uid), 'draftCounts', owner), { count, at: serverTimestamp() })

describe('drafts per visitor per day (#113)', () => {
  test('5 drafts are allowed, the sixth is refused', async () => {
    for (const n of [1, 2, 3, 4, 5]) await assertSucceeds(press('judge-1', n))
    await assertFails(press('judge-1', 6))
    await assertFails(press('judge-1', 1))
  })

  test('the count goes up by exactly 1', async () => {
    await assertSucceeds(press('judge-2', 1))
    await assertFails(press('judge-2', 3))
    await assertFails(setDoc(doc(visitor('judge-2'), 'draftCounts', 'judge-2'), { count: 2, at: Timestamp.fromMillis(Date.now() - 1000) }))
  })

  test("another visitor's count can not be written or read", async () => {
    await assertFails(press('judge-3', 1, 'judge-4'))
    await assertFails(getDoc(doc(visitor('judge-3'), 'draftCounts', 'judge-1')))
    await assertSucceeds(getDoc(doc(visitor('judge-1'), 'draftCounts', 'judge-1')))
    await assertFails(deleteDoc(doc(visitor('judge-1'), 'draftCounts', 'judge-1')))
    await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), 'draftCounts', 'x'), { count: 1, at: serverTimestamp() }))
  })

  test('a new day starts again at 1', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'draftCounts', 'judge-5'), { count: 5, at: Timestamp.fromMillis(Date.now() - 26 * 60 * 60 * 1000) })
    })
    await assertFails(press('judge-5', 6))
    await assertSucceeds(press('judge-5', 1))
  })
})
