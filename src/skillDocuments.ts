import { serverTimestamp, type FieldValue } from 'firebase/firestore'
import type { CoachSkill } from './coach.ts'
import type { Skill, Step } from './skill.ts'

// How a skill is stored in Firestore: skills/{skillId}, and its steps at
// skills/{skillId}/steps/step-{n}. Step ids never change once saved: questions and
// expert answers point at them.

export type SkillDocument = { title: string; creatorId: string; stepCount: number; createdAt: FieldValue }

// Publishing (#52). An expert publishes or unpublishes a skill they made, and every such
// update writes these three fields together and nothing else. Saving a new skill never
// sets them, so a skill nobody published has none of them.
//   published: true when the skill shows in All skills under From experts.
//   expertName: the expert's name from experts/{userId}, shown on the card.
//   publishedAt: server time of the last publish or unpublish, newest first in All skills.
export type PublishFields = { published: boolean; expertName: string; publishedAt: FieldValue }

export function publishFields(published: boolean, expertName: string): PublishFields {
  return { published, expertName, publishedAt: serverTimestamp() }
}

// Firestore refuses to read a skill that is unpublished and not this user's own. The
// Workspace treats that the same as a skill that does not exist.
export function isRefusedRead(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'permission-denied'
}

export type StepDocument = Step & { number: number }

export function stepId(number: number): string {
  return `step-${number}`
}

// The documents saved for one skill, written together in one batch.
export function skillDocuments(
  skill: Skill,
  creatorId: string,
): { skill: SkillDocument; steps: { id: string; data: StepDocument }[] } {
  return {
    skill: { title: skill.title, creatorId, stepCount: skill.steps.length, createdAt: serverTimestamp() },
    steps: skill.steps.map((step, i) => ({
      id: stepId(i + 1),
      data: {
        number: i + 1,
        title: step.title,
        instruction: step.instruction,
        parts: step.parts,
        doneWhen: step.doneWhen,
      },
    })),
  }
}

// Whether Firestore accepts this as a document id. Anything else cannot be a saved skill.
export function isDocumentId(id: string): boolean {
  return id !== '' && id !== '.' && id !== '..' && !id.includes('/') && !/^__.*__$/.test(id)
}

// Builds the coach's skill from the stored documents, or null when they do not form a
// whole skill: the steps must be exactly step-1 to step-{stepCount}, each with its number.
export function coachSkillFromDocuments(
  id: string,
  skill: { title: unknown; stepCount: unknown; published?: unknown },
  steps: { id: string; data: Partial<StepDocument> }[],
): CoachSkill | null {
  if (typeof skill.title !== 'string' || typeof skill.stepCount !== 'number') return null
  if (steps.length === 0 || steps.length !== skill.stepCount) return null
  const ordered = [...steps].sort((a, b) => (a.data.number ?? 0) - (b.data.number ?? 0))
  const whole = ordered.every((s, i) => s.data.number === i + 1 && s.id === stepId(i + 1))
  if (!whole) return null
  return {
    id,
    title: skill.title,
    // Only a published skill carries the flag; any other skill leaves it out.
    ...(skill.published === true ? { published: true } : {}),
    steps: ordered.map(({ id: stepDocId, data }) => ({
      id: stepDocId,
      title: String(data.title),
      instruction: String(data.instruction),
      parts: Array.isArray(data.parts) ? data.parts.map(String) : [],
      doneWhen: String(data.doneWhen),
    })),
  }
}
