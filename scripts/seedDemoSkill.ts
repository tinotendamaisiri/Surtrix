// Writes the demo skill (src/demoSkill.ts) to Firestore as skills/sample-led with its
// steps step-1 to step-4 (#25) and its saved expert answers (#29), in one commit, in the
// shapes from the Contracts. It writes with
// the owner's credentials, so the rules do not apply to it.
//   node scripts/seedDemoSkill.ts emulator
//     The Firestore emulator of this worktree. npm run dev:local runs this on start.
//   node scripts/seedDemoSkill.ts real
//     The real Firestore of the project, shared by staging and live. Needs
//     GOOGLE_ACCESS_TOKEN, an access token of a project owner, for example from
//     gcloud auth print-access-token --account <owner account>.
// Rerunning it rewrites only these documents. Anything else under the steps (answers
// saved by experts) is left alone.
import { firebaseConfig } from '../src/firebase-config.ts'
import { DEMO_CREATOR_ID, DEMO_EXPERT_NAME, DEMO_SKILL_ID, demoAnswers, demoSkill } from '../src/demoSkill.ts'
import { skillDocuments } from '../src/skillDocuments.ts'
import { parseWorktree, worktreePorts } from '../src/worktree.ts'

export type Target = {
  // For example http://127.0.0.1:8080 or https://firestore.googleapis.com
  baseUrl: string
  projectId: string
  // "owner" for the emulator, which then skips the rules.
  token: string
  // Bills the request to the project (the real Firestore only).
  userProject?: string
}

type Value =
  | { stringValue: string }
  | { integerValue: string }
  | { arrayValue: { values: Value[] } }

function value(v: unknown): Value {
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'number' && Number.isInteger(v)) return { integerValue: String(v) }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } }
  throw new Error(`Cannot write ${JSON.stringify(v)} to Firestore.`)
}

function fields(data: Record<string, unknown>): Record<string, Value> {
  return Object.fromEntries(Object.entries(data).map(([key, v]) => [key, value(v)]))
}

// The writes for one commit: the skill, each step, and each answer, with createdAt set to
// the server time. A write without a field mask replaces the whole document and nothing
// under it.
export function demoSkillWrites(projectId: string) {
  const documents = skillDocuments(demoSkill, DEMO_CREATOR_ID)
  const skillName = `projects/${projectId}/databases/(default)/documents/skills/${DEMO_SKILL_ID}`
  const { createdAt: _serverTime, ...skillData } = documents.skill
  const serverTime = [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]
  return [
    {
      update: { name: skillName, fields: fields(skillData) },
      updateTransforms: serverTime,
    },
    ...documents.steps.map((step) => ({
      update: { name: `${skillName}/steps/${step.id}`, fields: fields(step.data) },
    })),
    ...demoAnswers.map((a) => ({
      update: {
        name: `${skillName}/steps/${a.stepId}/answers/${a.id}`,
        fields: fields({
          questionId: a.id,
          question: a.question,
          answer: a.answer,
          expertId: DEMO_CREATOR_ID,
          expertName: DEMO_EXPERT_NAME,
        }),
      },
      updateTransforms: serverTime,
    })),
  ]
}

export async function seedDemoSkill(target: Target): Promise<void> {
  const url = `${target.baseUrl}/v1/projects/${target.projectId}/databases/(default)/documents:commit`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${target.token}`,
    'Content-Type': 'application/json',
  }
  if (target.userProject) headers['x-goog-user-project'] = target.userProject
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ writes: demoSkillWrites(target.projectId) }),
  })
  if (!response.ok) throw new Error(`Seeding the demo skill failed: ${response.status} ${await response.text()}`)
}

export function targetFrom(where: string | undefined): Target {
  if (where === 'emulator') {
    // emulators:exec sets FIRESTORE_EMULATOR_HOST; otherwise use this worktree's port.
    const host =
      process.env.FIRESTORE_EMULATOR_HOST ??
      `127.0.0.1:${worktreePorts(parseWorktree(process.env.SURTRIX_WORKTREE)).firestore}`
    return { baseUrl: `http://${host}`, projectId: firebaseConfig.projectId, token: 'owner' }
  }
  if (where === 'real') {
    const token = process.env.GOOGLE_ACCESS_TOKEN
    if (!token) throw new Error('Set GOOGLE_ACCESS_TOKEN to an access token of a project owner.')
    return {
      baseUrl: 'https://firestore.googleapis.com',
      projectId: firebaseConfig.projectId,
      token,
      userProject: firebaseConfig.projectId,
    }
  }
  throw new Error('Usage: node scripts/seedDemoSkill.ts emulator|real')
}

if (import.meta.main) {
  try {
    const where = process.argv[2]
    const target = targetFrom(where)
    await seedDemoSkill(target)
    console.log(
      `Seeded skills/${DEMO_SKILL_ID} with ${demoSkill.steps.length} steps and ${demoAnswers.length} answers (${where}, ${target.projectId}).`,
    )
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
