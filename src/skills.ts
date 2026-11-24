import { collection, doc, getDoc, getDocs, orderBy, query, updateDoc, where, writeBatch, type Timestamp } from 'firebase/firestore'
import { auth, db, signInLearner } from './firebase'
import type { CoachSkill } from './coach'
import type { Skill } from './skill'
import {
  coachSkillFromDocuments,
  isDocumentId,
  isRefusedRead,
  publishFields,
  skillDocuments,
  type StepDocument,
} from './skillDocuments'
import { publishedNewestFirst, type PublishedSkill } from './skillsPage'

export type SkillSummary = { id: string; title: string; stepCount: number; published: boolean }

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

// The skills this learner saved, newest first, for the My skills tab on home (#51).
// The demo skill is never among them: it is seeded by the Surtrix team, not saved by a
// learner.
export async function listMySkills(): Promise<SkillSummary[]> {
  return listSkillsBy(await learnerId())
}

// The skills one person made, newest first: a learner's My skills, and an expert's Your
// skills on the expert dashboard (#52). Sorted here, so no composite index.
export async function listSkillsBy(creatorId: string): Promise<SkillSummary[]> {
  const snapshot = await getDocs(query(collection(db, 'skills'), where('creatorId', '==', creatorId)))
  return snapshot.docs
    .map((d) => ({
      id: d.id,
      title: d.get('title') as string,
      stepCount: d.get('stepCount') as number,
      published: d.get('published') === true,
      createdAt: d.get('createdAt') as Timestamp | null,
    }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .map(({ id, title, stepCount, published }) => ({ id, title, stepCount, published }))
}

// Every published skill, newest publish first, for From experts in All skills (#52).
// One equality filter and no orderBy, so no composite index; sorted here instead.
export async function listPublishedSkills(): Promise<PublishedSkill[]> {
  // The rules refuse this query from a signed out visitor, so sign in (or wait for it) first.
  await learnerId()
  const snapshot = await getDocs(query(collection(db, 'skills'), where('published', '==', true)))
  return publishedNewestFirst(
    snapshot.docs.map((d) => {
      const publishedAt = d.get('publishedAt') as Timestamp | null
      return {
        id: d.id,
        title: String(d.get('title') ?? ''),
        stepCount: Number(d.get('stepCount') ?? 0),
        expertName: String(d.get('expertName') ?? ''),
        publishedAt: publishedAt?.toMillis?.() ?? 0,
      }
    }),
  )
}

// Publishes or unpublishes a skill the expert made (#52). Both write the same three fields
// and nothing else; the rules check the expert made the skill and the name is theirs.
export async function setSkillPublished(skillId: string, published: boolean, expertName: string): Promise<void> {
  await updateDoc(doc(db, 'skills', skillId), publishFields(published, expertName))
}

// Loads one saved skill with its steps in order, or null when there is no such whole skill.
// A skill this user may not read (unpublished, and not theirs) also counts as not found.
export async function loadSkill(skillId: string): Promise<CoachSkill | null> {
  if (!isDocumentId(skillId)) return null
  await learnerId()
  try {
    const skillRef = doc(db, 'skills', skillId)
    const skillSnapshot = await getDoc(skillRef)
    if (!skillSnapshot.exists()) return null
    const steps = await getDocs(query(collection(skillRef, 'steps'), orderBy('number')))
    // A skill whose steps are missing or out of order is treated as not found.
    return coachSkillFromDocuments(
      skillId,
      {
        title: skillSnapshot.get('title'),
        stepCount: skillSnapshot.get('stepCount'),
        published: skillSnapshot.get('published'),
      },
      steps.docs.map((d) => ({ id: d.id, data: d.data() as Partial<StepDocument> })),
    )
  } catch (e) {
    if (isRefusedRead(e)) return null
    throw e
  }
}
