import { Bytes, collection, deleteField, doc, getDoc, getDocs, orderBy, query, updateDoc, where, writeBatch, type Timestamp } from 'firebase/firestore'
import { auth, db, signInLearner } from './firebase'
import type { CoachSkill } from './coach'
import type { Skill, SkillTool } from './skill'
import {
  coachSkillFromDocuments,
  isDocumentId,
  isRefusedRead,
  publishFields,
  skillDocuments,
  skillExtras,
  stepId as stepDocId,
  toolPhotoDocuments,
  type StepDocument,
} from './skillDocuments'
import { knownBadges, type BadgeId } from './safety.ts'
import { publishedNewestFirst, type PublishedSkill } from './skillsPage'

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

// trade, level, description and minutes are saved by Create a skill (#106); older skills
// have none, and the cards leave them out.
export type SkillSummary = {
  id: string
  title: string
  stepCount: number
  published: boolean
  badges: BadgeId[]
  trade?: string
  level?: string
  description?: string
  minutes?: number
}

function optionalText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

async function learnerId(): Promise<string> {
  await signInLearner()
  const user = auth.currentUser
  if (!user) throw new Error('No learner is signed in.')
  return user.uid
}

// Saves the skill and all its steps in one batch, and returns the new skill's id.
// toolPhotos: a shrunk JPEG or null for each of the skill's tools (#106), in order.
export async function saveSkill(skill: Skill, toolPhotos: readonly (Uint8Array | null)[] = []): Promise<string> {
  const documents = skillDocuments(skill, await learnerId())
  const skillRef = doc(collection(db, 'skills'))
  const batch = writeBatch(db)
  batch.set(skillRef, documents.skill)
  for (const step of documents.steps) batch.set(doc(skillRef, 'steps', step.id), step.data)
  for (const photo of toolPhotoDocuments(toolPhotos)) batch.set(doc(skillRef, 'toolPhotos', photo.id), photo.data)
  await batch.commit()
  return skillRef.id
}

// Saves an edit of the creator's own skill (#106) in one batch: the skill's fields, every
// step, steps past the new count removed, and the tool photos. Questions and saved answers
// stay under their step ids.
export async function updateSkill(
  skillId: string,
  skill: Skill,
  before: { stepCount: number; toolCount: number },
  toolPhotos: readonly (Uint8Array | null)[] = [],
): Promise<void> {
  const documents = skillDocuments(skill, await learnerId())
  const skillRef = doc(db, 'skills', skillId)
  const extras = skillExtras(skill)
  const batch = writeBatch(db)
  batch.update(skillRef, {
    title: documents.skill.title,
    stepCount: documents.skill.stepCount,
    badges: documents.skill.badges ?? deleteField(),
    trade: extras.trade ?? deleteField(),
    level: extras.level ?? deleteField(),
    description: extras.description ?? deleteField(),
    minutes: extras.minutes ?? deleteField(),
    tools: extras.tools ?? deleteField(),
  })
  for (const step of documents.steps) batch.set(doc(skillRef, 'steps', step.id), step.data)
  for (let n = documents.steps.length + 1; n <= before.stepCount; n++) batch.delete(doc(skillRef, 'steps', stepDocId(n)))
  const photos = toolPhotoDocuments(toolPhotos)
  for (const photo of photos) batch.set(doc(skillRef, 'toolPhotos', photo.id), photo.data)
  const kept = new Set(photos.map((p) => p.id))
  for (let n = 1; n <= Math.max(before.toolCount, toolPhotos.length); n++) {
    if (!kept.has(`tool-${n}`)) batch.delete(doc(skillRef, 'toolPhotos', `tool-${n}`))
  }
  await batch.commit()
}

// A skill of this user's to edit (#106): the skill as saved, its tool photos by tool, and
// how many steps and tools it had. Null when it is not there or not theirs.
export async function loadSkillForEdit(
  skillId: string,
): Promise<{ skill: Skill; toolPhotos: (Uint8Array | null)[]; published: boolean; before: { stepCount: number; toolCount: number } } | null> {
  if (!isDocumentId(skillId)) return null
  const userId = await learnerId()
  const skillRef = doc(db, 'skills', skillId)
  const snapshot = await getDoc(skillRef).catch((e: unknown) => {
    if (isRefusedRead(e)) return null
    throw e
  })
  if (!snapshot?.exists() || snapshot.get('creatorId') !== userId) return null
  const [steps, photos] = await Promise.all([getDocs(query(collection(skillRef, 'steps'), orderBy('number'))), getDocs(collection(skillRef, 'toolPhotos'))])
  const coach = coachSkillFromDocuments(
    skillId,
    { title: snapshot.get('title'), stepCount: snapshot.get('stepCount'), badges: snapshot.get('badges') },
    steps.docs.map((d) => ({ id: d.id, data: d.data() as Partial<StepDocument> })),
  )
  if (!coach) return null
  const tools: SkillTool[] = listValue(snapshot.get('tools')).flatMap((t) => {
    const tool = (t ?? {}) as Record<string, unknown>
    return typeof tool.name === 'string' ? [{ name: tool.name, ...(typeof tool.alternative === 'string' && tool.alternative ? { alternative: tool.alternative } : {}) }] : []
  })
  const byNumber = new Map(photos.docs.map((d) => [d.get('number') as number, d.get('photo') as Bytes]))
  const text = (key: string) => (typeof snapshot.get(key) === 'string' && snapshot.get(key) ? { [key]: snapshot.get(key) as string } : {})
  return {
    skill: {
      title: coach.title,
      steps: coach.steps.map(({ id: _id, ...step }) => ({ ...step, tools: step.tools ?? [] })),
      ...(knownBadges(listValue(snapshot.get('badges'))).length ? { badges: knownBadges(listValue(snapshot.get('badges'))) } : {}),
      ...text('trade'),
      ...text('level'),
      ...text('description'),
      ...(typeof snapshot.get('minutes') === 'number' ? { minutes: snapshot.get('minutes') as number } : {}),
      tools,
    },
    toolPhotos: tools.map((_, i) => byNumber.get(i + 1)?.toUint8Array() ?? null),
    published: snapshot.get('published') === true,
    before: { stepCount: Number(snapshot.get('stepCount') ?? coach.steps.length), toolCount: tools.length },
  }
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
      badges: knownBadges(listValue(d.get('badges'))),
      ...(optionalText(d.get('trade')) ? { trade: String(d.get('trade')).trim() } : {}),
      ...(optionalText(d.get('level')) ? { level: String(d.get('level')).trim() } : {}),
      ...(optionalText(d.get('description')) ? { description: String(d.get('description')).trim() } : {}),
      ...(typeof d.get('minutes') === 'number' && d.get('minutes') > 0 ? { minutes: d.get('minutes') as number } : {}),
      createdAt: d.get('createdAt') as Timestamp | null,
    }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .map(({ createdAt: _createdAt, ...summary }) => summary)
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
        badges: knownBadges(listValue(d.get('badges'))),
        ...(optionalText(d.get('trade')) ? { trade: String(d.get('trade')).trim() } : {}),
        ...(optionalText(d.get('level')) ? { level: String(d.get('level')).trim() } : {}),
        ...(optionalText(d.get('description')) ? { description: String(d.get('description')).trim() } : {}),
      }
    }),
  )
}

// Publishes or unpublishes a skill the expert made (#52). Both write the same three fields
// and nothing else; the rules check the expert made the skill and the name is theirs.
export async function setSkillPublished(skillId: string, published: boolean, expertName: string): Promise<void> {
  await updateDoc(doc(db, 'skills', skillId), publishFields(published, expertName))
}

// A skill's tool photos (#106) as data URLs by tool number; none to read for a skill
// without its own tools.
async function toolPhotoUrls(skillRef: ReturnType<typeof doc>, tools: unknown): Promise<Record<number, string>> {
  if (!Array.isArray(tools) || tools.length === 0) return {}
  const photos = await getDocs(collection(skillRef, 'toolPhotos'))
  return Object.fromEntries(
    photos.docs.flatMap((d) => {
      const photo = d.get('photo')
      return photo instanceof Bytes ? [[d.get('number') as number, `data:image/jpeg;base64,${photo.toBase64()}`]] : []
    }),
  )
}

// Loads one saved skill with its steps in order, or null when there is no such whole skill.
// A skill this user may not read (unpublished, and not theirs) also counts as not found.
export async function loadSkill(skillId: string): Promise<CoachSkill | null> {
  if (!isDocumentId(skillId)) return null
  const userId = await learnerId()
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
        mine: skillSnapshot.get('creatorId') === userId,
        badges: skillSnapshot.get('badges'),
        tools: skillSnapshot.get('tools'),
      },
      steps.docs.map((d) => ({ id: d.id, data: d.data() as Partial<StepDocument> })),
      await toolPhotoUrls(skillRef, skillSnapshot.get('tools')),
    )
  } catch (e) {
    if (isRefusedRead(e)) return null
    throw e
  }
}
