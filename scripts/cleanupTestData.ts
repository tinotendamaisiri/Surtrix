// Clears test data from Firestore and Auth before and after a live release (#40). Staging
// and live share one database, so staging checks leave test skills, questions, saved
// answers and anonymous learners where live learners would see them. It works with the
// owner's credentials, so the rules do not apply to it.
//   node scripts/cleanupTestData.ts emulator|real [--before <UTC time>] [--delete]
// Without --delete it only lists what it would delete, with a cutoff of now unless --before
// says otherwise. --delete needs --before, the cutoff the dry run printed, so it deletes
// exactly what that dry run listed: anything created later is never touched (real learners,
// once the site is live). A cutoff later than now is refused, since things created after the
// dry run would then fall before it.
// Test data, when created before the cutoff: every skill other than the demo skill with
// everything under it, every question, every saved answer except the demo skill's seeded
// ones, anything under the demo skill that src/demoSkill.ts does not define, and every
// anonymous account. Never touched: experts, Google accounts, and collections this script
// does not know (listed as left alone).
//   real needs GOOGLE_ACCESS_TOKEN, an access token of a project owner, for example from
//   gcloud auth print-access-token --account <owner account>.
import { parseArgs } from 'node:util'
import { firebaseConfig } from '../src/firebase-config.ts'
import { DEMO_CREATOR_ID, DEMO_SKILL_ID, demoAnswers, demoSkill } from '../src/demoSkill.ts'
import { skillDocuments } from '../src/skillDocuments.ts'
import { parseWorktree, worktreePorts } from '../src/worktree.ts'
import type { Target } from './seedDemoSkill.ts'

// Same shape, with baseUrl Auth's REST API: https://identitytoolkit.googleapis.com, or the
// emulator's http://127.0.0.1:9099/identitytoolkit.googleapis.com.
export type AuthTarget = Target

// path is relative to the database, for example skills/abc/steps/step-1.
export type FoundDocument = { path: string; createTime: string; label: string }
export type FoundAccount = { userId: string; anonymous: boolean; createdAt: string }

export type CleanupPlan = {
  deleteDocuments: FoundDocument[]
  keepDocuments: FoundDocument[]
  // In collections this script does not know.
  leftAlone: FoundDocument[]
  deleteAccounts: FoundAccount[]
  keepAccounts: FoundAccount[]
}

const demoBase = `skills/${DEMO_SKILL_ID}`
const demoPaths = new Set([
  demoBase,
  ...skillDocuments(demoSkill, DEMO_CREATOR_ID).steps.map((step) => `${demoBase}/steps/${step.id}`),
  ...demoAnswers.map((a) => `${demoBase}/steps/${a.stepId}/answers/${a.id}`),
])

function kind(path: string): 'test' | 'keep' | 'unknown' {
  const collection = path.split('/')[0]
  if (collection === 'experts') return 'keep'
  if (collection === 'questions') return 'test'
  if (collection === 'skills') return demoPaths.has(path) ? 'keep' : 'test'
  return 'unknown'
}

function createdBefore(time: string, before: Date): boolean {
  return new Date(time).getTime() < before.getTime()
}

export function planCleanup(documents: FoundDocument[], accounts: FoundAccount[], before: Date): CleanupPlan {
  const plan: CleanupPlan = { deleteDocuments: [], keepDocuments: [], leftAlone: [], deleteAccounts: [], keepAccounts: [] }
  for (const document of documents) {
    const k = kind(document.path)
    if (k === 'unknown') plan.leftAlone.push(document)
    else if (k === 'test' && createdBefore(document.createTime, before)) plan.deleteDocuments.push(document)
    else plan.keepDocuments.push(document)
  }
  for (const account of accounts) {
    if (account.anonymous && createdBefore(account.createdAt, before)) plan.deleteAccounts.push(account)
    else plan.keepAccounts.push(account)
  }
  return plan
}

function headers(target: Target | AuthTarget): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${target.token}`, 'Content-Type': 'application/json' }
  if (target.userProject) h['x-goog-user-project'] = target.userProject
  return h
}

async function call<T>(target: Target | AuthTarget, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: headers(target),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  return (await response.json()) as T
}

function root(target: Target): string {
  return `projects/${target.projectId}/databases/(default)/documents`
}

type ListedDocument = {
  name: string
  createTime?: string
  fields?: Record<string, { stringValue?: string }>
}

// Every document in the database, found by walking each collection. A document that
// does not exist but has subcollections (showMissing) is walked too, not listed.
export async function findDocuments(target: Target): Promise<FoundDocument[]> {
  const prefix = `${root(target)}/`
  const found: FoundDocument[] = []
  async function walk(parent: string) {
    let collectionIds: string[] = []
    let pageToken: string | undefined
    do {
      const page = await call<{ collectionIds?: string[]; nextPageToken?: string }>(
        target,
        `${target.baseUrl}/v1/${parent}:listCollectionIds`,
        { pageSize: 100, pageToken },
      )
      collectionIds = [...collectionIds, ...(page.collectionIds ?? [])]
      pageToken = page.nextPageToken
    } while (pageToken)
    for (const collectionId of collectionIds) {
      let docsToken: string | undefined
      do {
        const query = new URLSearchParams({ pageSize: '300', showMissing: 'true' })
        if (docsToken) query.set('pageToken', docsToken)
        const page = await call<{ documents?: ListedDocument[]; nextPageToken?: string }>(
          target,
          `${target.baseUrl}/v1/${parent}/${collectionId}?${query}`,
        )
        for (const document of page.documents ?? []) {
          if (document.createTime) {
            const fields = document.fields ?? {}
            found.push({
              path: document.name.slice(prefix.length),
              createTime: document.createTime,
              label: fields.title?.stringValue ?? fields.question?.stringValue ?? fields.name?.stringValue ?? '',
            })
          }
          await walk(document.name)
        }
        docsToken = page.nextPageToken
      } while (docsToken)
    }
  }
  await walk(root(target))
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

export async function deleteDocuments(target: Target, documents: FoundDocument[]): Promise<void> {
  // Firestore takes at most 500 writes in one commit.
  for (let i = 0; i < documents.length; i += 500) {
    const writes = documents.slice(i, i + 500).map((document) => ({ delete: `${root(target)}/${document.path}` }))
    await call(target, `${target.baseUrl}/v1/${root(target)}:commit`, { writes })
  }
}

type ListedAccount = { localId: string; createdAt?: string; providerUserInfo?: unknown[] }

// Every account. An anonymous account has no sign in provider.
export async function findAccounts(target: AuthTarget): Promise<FoundAccount[]> {
  const found: FoundAccount[] = []
  let pageToken: string | undefined
  do {
    const query = new URLSearchParams({ maxResults: '1000' })
    if (pageToken) query.set('nextPageToken', pageToken)
    const page = await call<{ users?: ListedAccount[]; nextPageToken?: string }>(
      target,
      `${target.baseUrl}/v1/projects/${target.projectId}/accounts:batchGet?${query}`,
    )
    for (const user of page.users ?? []) {
      found.push({
        userId: user.localId,
        anonymous: (user.providerUserInfo ?? []).length === 0,
        // An account without a creation time is never before the cutoff, so it is kept.
        createdAt: user.createdAt ? new Date(Number(user.createdAt)).toISOString() : '',
      })
    }
    pageToken = page.nextPageToken
  } while (pageToken)
  return found.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function deleteAccounts(target: AuthTarget, accounts: FoundAccount[]): Promise<void> {
  // Auth takes at most 1,000 accounts in one call; force deletes accounts that are enabled.
  for (let i = 0; i < accounts.length; i += 1000) {
    const localIds = accounts.slice(i, i + 1000).map((account) => account.userId)
    const result = await call<{ errors?: unknown[] }>(
      target,
      `${target.baseUrl}/v1/projects/${target.projectId}/accounts:batchDelete`,
      { localIds, force: true },
    )
    if (result.errors?.length) throw new Error(`Some accounts were not deleted: ${JSON.stringify(result.errors)}`)
  }
}

// Lists each document under the highest ancestor that is in the same list, so a skill
// shows as one line with the number of documents under it.
export function groupDocuments(documents: FoundDocument[]): string[] {
  const paths = new Set(documents.map((document) => document.path))
  const groups = new Map<string, { document: FoundDocument; under: number }>()
  for (const document of documents) {
    const parts = document.path.split('/')
    let top = document.path
    for (let length = 2; length < parts.length; length += 2) {
      const ancestor = parts.slice(0, length).join('/')
      if (paths.has(ancestor)) {
        top = ancestor
        break
      }
    }
    const group = groups.get(top)
    if (top === document.path) groups.set(top, { document, under: group?.under ?? 0 })
    else groups.set(top, { document: group?.document ?? document, under: (group?.under ?? 0) + 1 })
  }
  return [...groups.entries()].map(([path, { document, under }]) => {
    const label = path === document.path && document.label ? ` "${document.label.slice(0, 70)}"` : ''
    const created = path === document.path ? `, created ${document.createTime.slice(0, 19)}Z` : ''
    return `  ${path}${label}${created}${under ? `, and ${under} under it` : ''}`
  })
}

export function describePlan(plan: CleanupPlan): string[] {
  const accountLine = (a: FoundAccount) =>
    `  ${a.userId} ${a.anonymous ? 'anonymous' : 'signed in with a provider'}, ${a.createdAt ? `created ${a.createdAt.slice(0, 19)}Z` : 'no creation time'}`
  return [
    `Delete ${plan.deleteDocuments.length} documents:`,
    ...groupDocuments(plan.deleteDocuments),
    `Delete ${plan.deleteAccounts.length} anonymous accounts:`,
    ...plan.deleteAccounts.map(accountLine),
    `Keep ${plan.keepDocuments.length} documents:`,
    ...groupDocuments(plan.keepDocuments),
    `Keep ${plan.keepAccounts.length} accounts:`,
    ...plan.keepAccounts.map(accountLine),
    `Left alone, in collections this script does not know: ${plan.leftAlone.length} documents`,
    ...groupDocuments(plan.leftAlone),
  ]
}

function targetsFrom(where: string | undefined): { firestore: Target; auth: AuthTarget } {
  const projectId = firebaseConfig.projectId
  if (where === 'emulator') {
    const ports = worktreePorts(parseWorktree(process.env.SURTRIX_WORKTREE))
    const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? `127.0.0.1:${ports.firestore}`
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? `127.0.0.1:${ports.auth}`
    return {
      firestore: { baseUrl: `http://${firestoreHost}`, projectId, token: 'owner' },
      auth: { baseUrl: `http://${authHost}/identitytoolkit.googleapis.com`, projectId, token: 'owner' },
    }
  }
  if (where === 'real') {
    const token = process.env.GOOGLE_ACCESS_TOKEN
    if (!token) throw new Error('Set GOOGLE_ACCESS_TOKEN to an access token of a project owner.')
    return {
      firestore: { baseUrl: 'https://firestore.googleapis.com', projectId, token, userProject: projectId },
      auth: { baseUrl: 'https://identitytoolkit.googleapis.com', projectId, token, userProject: projectId },
    }
  }
  throw new Error('Usage: node scripts/cleanupTestData.ts emulator|real [--before <UTC time>] [--delete]')
}

// The cutoff: now for a dry run without --before. --before is a time with its zone, for
// example 2026-11-16T02:18:03.069Z, so it never means local time, and not later than now.
export function cutoffFrom(options: { before?: string; delete: boolean }, now = new Date()): Date {
  if (options.before === undefined) {
    if (options.delete) throw new Error('--delete needs --before, the cutoff of the dry run you checked.')
    return now
  }
  const time = new Date(options.before)
  if (!/(Z|[+-]\d\d:\d\d)$/.test(options.before) || Number.isNaN(time.getTime())) {
    throw new Error(`--before needs a time with its zone, for example 2026-11-16T02:18:03.069Z, not "${options.before}".`)
  }
  if (time.getTime() > now.getTime()) throw new Error(`--before ${options.before} is later than now.`)
  return time
}

if (import.meta.main) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { before: { type: 'string' }, delete: { type: 'boolean', default: false } },
    })
    const where = positionals[0]
    const targets = targetsFrom(where)
    const before = cutoffFrom(values)
    const plan = planCleanup(await findDocuments(targets.firestore), await findAccounts(targets.auth), before)
    console.log(`${where}, project ${targets.firestore.projectId}, cutoff ${before.toISOString()}`)
    console.log(describePlan(plan).join('\n'))
    if (!values.delete) {
      console.log(`Dry run: nothing was deleted. To delete exactly this list, run again with --delete --before ${before.toISOString()}`)
    } else {
      await deleteDocuments(targets.firestore, plan.deleteDocuments)
      await deleteAccounts(targets.auth, plan.deleteAccounts)
      console.log(`Deleted ${plan.deleteDocuments.length} documents and ${plan.deleteAccounts.length} anonymous accounts.`)
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
