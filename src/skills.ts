import { collection, doc, getDoc, getDocs, orderBy, query, where, writeBatch, type Timestamp } from 'firebase/firestore'
import { auth, db, signInLearner } from './firebase'
import type { CoachSkill } from './coach'
import { DEMO_SKILL_ID } from './demoSkill'
import type { Skill } from './skill'
import { coachSkillFromDocuments, isDocumentId, skillDocuments, type StepDocument } from './skillDocuments'

export type SkillSummary = { id: string; title: string; stepCount: number }

async function learnerId(): Promise<string> {
  await signInLearner()
  const user = auth.currentUser
  if (!user) throw new Error('No learner is signed in.')
  return user.uid
}

// Saves the skill and all its steps in one batch, and returns the new skill's id.
export async function saveSkill(skill: Skill): Promise<string> {
  const documents = skillDocuments(skill, await learnerId())
  const skillRef = doc(collection(db, 'skills'))
  const batch = writeBatch(db)
  batch.set(skillRef, documents.skill)
  for (const step of documents.steps) batch.set(doc(skillRef, 'steps', step.id), step.data)
  await batch.commit()
  return skillRef.id
}

// The skills on home: the demo skill first, then the ones this learner saved, newest
// first. A demo skill that is missing or cannot be read is left out, so the learner's own
// skills still show.
export async function listSkills(): Promise<SkillSummary[]> {
  const [demo, mine] = await Promise.all([
    loadDemoSkillSummary().catch((e) => {
      console.error('Loading the demo skill failed', e)
      return null
    }),
    listMySkills(),
  ])
  return demo ? [demo, ...mine] : mine
}

async function loadDemoSkillSummary(): Promise<SkillSummary | null> {
  await learnerId()
  const snapshot = await getDoc(doc(db, 'skills', DEMO_SKILL_ID))
  const title: unknown = snapshot.get('title')
  const stepCount: unknown = snapshot.get('stepCount')
  if (!snapshot.exists() || typeof title !== 'string' || typeof stepCount !== 'number') {
    console.error(`The demo skill skills/${DEMO_SKILL_ID} is missing or not whole. Run scripts/seedDemoSkill.ts.`)
    return null
  }
  return { id: snapshot.id, title, stepCount }
}

// The skills this learner saved, newest first. Sorted here, so no composite index.
async function listMySkills(): Promise<SkillSummary[]> {
  const snapshot = await getDocs(query(collection(db, 'skills'), where('creatorId', '==', await learnerId())))
  return snapshot.docs
    .map((d) => ({ id: d.id, title: d.get('title') as string, stepCount: d.get('stepCount') as number, createdAt: d.get('createdAt') as Timestamp | null }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .map(({ id, title, stepCount }) => ({ id, title, stepCount }))
}

// Loads one saved skill with its steps in order, or null when there is no such whole skill.
export async function loadSkill(skillId: string): Promise<CoachSkill | null> {
  if (!isDocumentId(skillId)) return null
  await learnerId()
  const skillRef = doc(db, 'skills', skillId)
  const skillSnapshot = await getDoc(skillRef)
  if (!skillSnapshot.exists()) return null
  const steps = await getDocs(query(collection(skillRef, 'steps'), orderBy('number')))
  // A skill whose steps are missing or out of order is treated as not found.
  return coachSkillFromDocuments(
    skillId,
    { title: skillSnapshot.get('title'), stepCount: skillSnapshot.get('stepCount') },
    steps.docs.map((d) => ({ id: d.id, data: d.data() as Partial<StepDocument> })),
  )
}
