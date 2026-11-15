// The skill shape shared by every track (see Contracts in the build plan): a skill is a
// title and 1 to 40 steps in order.
export type Step = {
  title: string
  // What to do, including any safety warning.
  instruction: string
  // Components and tools the step uses; may be empty.
  parts: string[]
  // What the bench looks like when the step is done.
  doneWhen: string
}

export type Skill = { title: string; steps: Step[] }

export const MAX_STEPS = 40

// The model's answer was not a usable skill.
export class SkillAnswerError extends Error {
  constructor(reason: string) {
    super(`The model's answer is not a usable skill: ${reason}`)
    this.name = 'SkillAnswerError'
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new SkillAnswerError(`${field} is not text`)
  return value.trim()
}

function step(value: unknown, index: number): Step | null {
  if (typeof value !== 'object' || value === null) throw new SkillAnswerError(`step ${index + 1} is not an object`)
  const raw = value as Record<string, unknown>
  const field = (name: string) => text(raw[name], `step ${index + 1} ${name}`)
  const title = field('title')
  const instruction = field('instruction')
  const doneWhen = field('doneWhen')
  if (!Array.isArray(raw.parts)) throw new SkillAnswerError(`step ${index + 1} parts is not a list`)
  const parts = raw.parts.map((part) => text(part, `step ${index + 1} part`)).filter(Boolean)
  // A step with no text at all is dropped; a step missing only some of it is refused,
  // so a half written step never reaches the learner.
  if (!title && !instruction && !doneWhen) return null
  if (!title || !instruction || !doneWhen) throw new SkillAnswerError(`step ${index + 1} is missing text`)
  return { title, instruction, parts, doneWhen }
}

// Checks the model's JSON answer and returns the skill, or null when the document
// had no steps. Throws SkillAnswerError for anything else.
export function parseSkill(json: string): Skill | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new SkillAnswerError('not JSON')
  }
  if (typeof raw !== 'object' || raw === null) throw new SkillAnswerError('not an object')
  const { title, steps } = raw as Record<string, unknown>
  if (!Array.isArray(steps)) throw new SkillAnswerError('steps is not a list')
  const kept = steps.map(step).filter((s): s is Step => s !== null)
  if (kept.length === 0) return null
  if (kept.length > MAX_STEPS) throw new SkillAnswerError(`more than ${MAX_STEPS} steps`)
  const skillTitle = text(title, 'title')
  if (!skillTitle) throw new SkillAnswerError('title is empty')
  return { title: skillTitle, steps: kept }
}
