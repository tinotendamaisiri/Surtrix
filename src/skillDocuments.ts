import { serverTimestamp, type FieldValue } from 'firebase/firestore'
import type { Skill, Step } from './skill.ts'

// How a skill is stored in Firestore: skills/{skillId}, and its steps at
// skills/{skillId}/steps/step-{n}. Step ids never change once saved: questions and
// expert answers point at them.

export type SkillDocument = { title: string; creatorId: string; stepCount: number; createdAt: FieldValue }

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
