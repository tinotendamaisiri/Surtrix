import { collection, doc, getDoc, getDocs, orderBy, query, where, writeBatch, type Timestamp } from 'firebase/firestore'
import { auth, db, signInLearner } from './firebase'
import type { Skill, Step } from './skill'
import { skillDocuments, type StepDocument } from './skillDocuments'

// A saved skill as the coach gets it: each step carries its id.
export type SavedSkill = { id: string; title: string; steps: (Step & { id: string })[] }

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

// The skills this learner saved, newest first. Sorted here, so no composite index.
export async function listMySkills(): Promise<SkillSummary[]> {
  const snapshot = await getDocs(query(collection(db, 'skills'), where('creatorId', '==', await learnerId())))
  return snapshot.docs
    .map((d) => ({ id: d.id, title: d.get('title') as string, stepCount: d.get('stepCount') as number, createdAt: d.get('createdAt') as Timestamp | null }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .map(({ id, title, stepCount }) => ({ id, title, stepCount }))
}

// Loads one saved skill with its steps in order, or null when there is no such skill.
export async function loadSkill(skillId: string): Promise<SavedSkill | null> {
  await learnerId()
  const skillRef = doc(db, 'skills', skillId)
  const skillSnapshot = await getDoc(skillRef)
  if (!skillSnapshot.exists()) return null
  const steps = await getDocs(query(collection(skillRef, 'steps'), orderBy('number')))
  return {
    id: skillId,
    title: skillSnapshot.get('title') as string,
    steps: steps.docs.map((d) => {
      const { title, instruction, parts, doneWhen } = d.data() as StepDocument
      return { id: d.id, title, instruction, parts, doneWhen }
    }),
  }
}
