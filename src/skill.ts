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
