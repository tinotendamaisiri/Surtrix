// Where home opens next (#59). A "Back to skills" link leaves the Skills tab to show here
// just before it goes home, and home takes it when it opens: it selects that tab and
// scrolls to the Skills section. Kept in memory, so there is no new route and the
// address stays '#'.
import { DEMO_SKILL_ID } from './demoSkill.ts'

export type SkillsTab = 'all' | 'mine'

let pending: SkillsTab | null = null

export function openSkillsNext(tab: SkillsTab) {
  pending = tab
}

// Reads without clearing, so React may render more than once before home takes it.
export function nextSkillsTab(): SkillsTab | null {
  return pending
}

export function takeSkillsTab(): SkillsTab | null {
  const tab = pending
  pending = null
  return tab
}

// The demo skill lives under All skills; any other skill is one a learner saved.
export function skillsTabFor(skillId: string): SkillsTab {
  return skillId === DEMO_SKILL_ID ? 'all' : 'mine'
}
