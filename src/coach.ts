import type { Step } from './skill.ts'

// What the coach is given (see Contracts in the build plan): a skill with its id, and
// each step with its id. The coach never makes up ids.
export type CoachStep = Step & { id: string }

export type CoachSkill = { id: string; title: string; steps: CoachStep[] }

// Where the learner is in a skill. Kept in memory only: a reload starts again.
export type CoachProgress = {
  // 0 based position of the step on screen.
  stepIndex: number
  // One entry per step, true once the learner marked it done.
  done: boolean[]
  // True after the last step was marked done.
  finished: boolean
}

export function startProgress(stepCount: number): CoachProgress {
  return { stepIndex: 0, done: Array<boolean>(stepCount).fill(false), finished: false }
}

export function goBack(progress: CoachProgress): CoachProgress {
  if (progress.stepIndex === 0) return progress
  return { ...progress, stepIndex: progress.stepIndex - 1 }
}

export function goNext(progress: CoachProgress): CoachProgress {
  if (progress.stepIndex >= progress.done.length - 1) return progress
  return { ...progress, stepIndex: progress.stepIndex + 1 }
}

// Marks the current step done and moves to the next one; after the last step, the
// skill is finished.
export function markStepDone(progress: CoachProgress): CoachProgress {
  const done = progress.done.map((isDone, index) => isDone || index === progress.stepIndex)
  const isLast = progress.stepIndex >= progress.done.length - 1
  return isLast ? { ...progress, done, finished: true } : { stepIndex: progress.stepIndex + 1, done, finished: false }
}
