// The test data cleanup before and after a live release (#40): what it deletes and keeps,
// and listing and deleting documents in the Firestore emulator, in its own project id so
// other test files clearing demo-surtrix never race it. Deleting Auth accounts is checked
// by the dry run on the real project instead (npm test runs no Auth emulator).
import { beforeAll, describe, expect, test } from 'vitest'
import {
  deleteDocuments,
  findDocuments,
  groupDocuments,
  cutoffFrom,
  planCleanup,
  type FoundAccount,
  type FoundDocument,
} from '../scripts/cleanupTestData.ts'
import { seedDemoSkill } from '../scripts/seedDemoSkill.ts'

const EARLY = '2026-11-15T10:00:00.000000Z'
const LATE = '2026-11-20T10:00:00.000000Z'
const CUTOFF = new Date('2026-11-18T00:00:00Z')

const kept = [
  'experts/tino',
  'skills/sample-led',
  'skills/sample-led/steps/step-1',
  'skills/sample-led/steps/step-2',
  'skills/sample-led/steps/step-2/answers/demo-led-in-rail',
  'skills/sample-led/steps/step-3',
  'skills/sample-led/steps/step-4',
  'skills/sample-led/steps/step-4/answers/demo-led-backwards',
  'skills/sample-led/steps/step-4/answers/demo-no-power',
]

const testData = [
  'questions/q1',
  'skills/other',
  'skills/other/steps/step-1',
  'skills/other/steps/step-1/answers/q2',
  'skills/sample-led/steps/step-1/answers/q1',
  // A seeded id under the wrong step is not a seeded answer.
  'skills/sample-led/steps/step-1/answers/demo-no-power',
  'skills/sample-led/steps/step-5',
  'skills/sample-led/notes/n1',
]

function found(path: string, createTime = EARLY): FoundDocument {
  return { path, createTime, label: '' }
}

function account(userId: string, anonymous: boolean, createdAt = EARLY): FoundAccount {
  return { userId, anonymous, createdAt }
}

describe('the cleanup plan', () => {
  const plan = planCleanup(
    [...kept, ...testData, 'logs/l1'].map((path) => found(path)),
    [account('learner-1', true), account('tino', false), account('learner-late', true, LATE), account('no-time', true, '')],
    CUTOFF,
  )

  test('deletes test skills with everything under them, questions, and anything the demo skill does not define', () => {
    expect(plan.deleteDocuments.map((d) => d.path).sort()).toEqual([...testData].sort())
  })

  test('keeps the demo skill, its steps, its seeded answers and the experts', () => {
    expect(plan.keepDocuments.map((d) => d.path).sort()).toEqual([...kept].sort())
  })

  test('leaves collections it does not know alone', () => {
    expect(plan.leftAlone.map((d) => d.path)).toEqual(['logs/l1'])
  })

  test('deletes only anonymous accounts created before the cutoff, never a Google account or one without a time', () => {
    expect(plan.deleteAccounts.map((a) => a.userId)).toEqual(['learner-1'])
    expect(plan.keepAccounts.map((a) => a.userId)).toEqual(['tino', 'learner-late', 'no-time'])
  })

  test('keeps test data created at or after the cutoff', () => {
    const late = planCleanup(
      [found('questions/new', LATE), found('questions/at', CUTOFF.toISOString())],
      [account('at', true, CUTOFF.toISOString())],
      CUTOFF,
    )
    expect(late.deleteDocuments).toEqual([])
    expect(late.deleteAccounts).toEqual([])
  })
})

describe('the cutoff time', () => {
  const now = new Date('2026-11-20T18:00:00Z')

  test('is now for a dry run without --before', () => {
    expect(cutoffFrom({ delete: false }, now)).toEqual(now)
  })

  test('must be given to delete', () => {
    expect(() => cutoffFrom({ delete: true }, now)).toThrow('--delete needs --before')
  })

  test('needs a time zone, so it never means local time', () => {
    expect(cutoffFrom({ before: '2026-11-20T17:00:00Z', delete: true }, now).toISOString()).toBe('2026-11-20T17:00:00.000Z')
    expect(cutoffFrom({ before: '2026-11-20T12:00:00-05:00', delete: true }, now).toISOString()).toBe('2026-11-20T17:00:00.000Z')
    expect(() => cutoffFrom({ before: '2026-11-20T17:00:00', delete: true }, now)).toThrow('time with its zone')
    expect(() => cutoffFrom({ before: 'soon', delete: true }, now)).toThrow('time with its zone')
  })

  test('cannot be later than now, which would take in things made after the dry run', () => {
    expect(() => cutoffFrom({ before: '2026-11-20T18:00:01Z', delete: true }, now)).toThrow('later than now')
    expect(() => cutoffFrom({ before: '2026-11-20T18:00:01Z', delete: false }, now)).toThrow('later than now')
    expect(cutoffFrom({ before: '2026-11-20T18:00:00Z', delete: true }, now)).toEqual(now)
  })
})

describe('the dry run list', () => {
  test('shows a skill as one line with the number of documents under it', () => {
    const lines = groupDocuments([
      { path: 'skills/other', createTime: EARLY, label: 'Batch check' },
      found('skills/other/steps/step-1'),
      found('skills/other/steps/step-1/answers/q2'),
      found('skills/sample-led/steps/step-1/answers/q1'),
    ])
    expect(lines).toEqual([
      '  skills/other "Batch check", created 2026-11-15T10:00:00Z, and 2 under it',
      '  skills/sample-led/steps/step-1/answers/q1, created 2026-11-15T10:00:00Z',
    ])
  })
})

describe('in the Firestore emulator', () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  const target = { baseUrl: `http://${host}`, projectId: 'demo-surtrix-cleanup', token: 'owner' }
  const documents = `projects/${target.projectId}/databases/(default)/documents`

  async function write(paths: string[]) {
    const response = await fetch(`${target.baseUrl}/v1/${documents}:commit`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: paths.map((path) => ({ update: { name: `${documents}/${path}`, fields: { title: { stringValue: path } } } })),
      }),
    })
    if (!response.ok) throw new Error(await response.text())
  }

  let cutoff: Date

  beforeAll(async () => {
    await fetch(`${target.baseUrl}/emulator/v1/projects/${target.projectId}/databases/(default)/documents`, {
      method: 'DELETE',
    })
    await seedDemoSkill(target)
    // The answer's skill and step have no document: found through showMissing.
    await write(['experts/tino', ...testData, 'skills/gone/steps/step-1/answers/q3'])
    await new Promise((resolve) => setTimeout(resolve, 50))
    cutoff = new Date()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await write(['questions/after-cutoff'])
  })

  test('the dry run lists exactly the test data from before the cutoff, then deleting removes only that', async () => {
    const plan = planCleanup(await findDocuments(target), [], cutoff)
    const expected = [...testData, 'skills/gone/steps/step-1/answers/q3'].sort()
    expect(plan.deleteDocuments.map((d) => d.path).sort()).toEqual(expected)
    expect(plan.keepDocuments.map((d) => d.path).sort()).toEqual([...kept, 'questions/after-cutoff'].sort())

    // Listing again changes nothing: a dry run deletes nothing.
    expect((await findDocuments(target)).length).toBe(kept.length + expected.length + 1)

    await deleteDocuments(target, plan.deleteDocuments)
    expect((await findDocuments(target)).map((d) => d.path).sort()).toEqual([...kept, 'questions/after-cutoff'].sort())
  })
})
