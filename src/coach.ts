import type { Step } from './skill.ts'
import type { WiringVerdict } from './wiring.ts'

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

// Goes straight to a step, from the Workspace's step list (#62). Nothing is marked done.
export function goToStep(progress: CoachProgress, index: number): CoachProgress {
  if (index < 0 || index >= progress.done.length) return progress
  return { ...progress, stepIndex: index, finished: false }
}

// Marks the current step done and moves to the next one; after the last step, the
// skill is finished.
export function markStepDone(progress: CoachProgress): CoachProgress {
  const done = progress.done.map((isDone, index) => isDone || index === progress.stepIndex)
  const isLast = progress.stepIndex >= progress.done.length - 1
  return isLast ? { ...progress, done, finished: true } : { stepIndex: progress.stepIndex + 1, done, finished: false }
}

// The Done mark follows the latest wiring check on a step (#39): a correct verdict marks the
// step done like Mark step done, "not yet" or "unsure" clears its mark, and a check that
// failed without a verdict (null) leaves the mark as it is. index is the step that was
// checked: the verdict arrives later, so it is not read from the step on screen.
export function followWiringCheck(progress: CoachProgress, index: number, verdict: WiringVerdict | null): CoachProgress {
  if (verdict === null) return progress
  if (verdict === 'correct' && index === progress.stepIndex) return markStepDone(progress)
  const done = progress.done.map((isDone, i) => (i === index ? verdict === 'correct' : isDone))
  return { ...progress, done }
}
