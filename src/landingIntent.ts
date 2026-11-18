// Which Skills page tab a skill belongs to (#59, #83): "Back to skills" and the
// Workspace's Exit open the Skills page on it.
import { DEMO_SKILL_ID } from './demoSkill.ts'
import type { SkillsTab } from './screenAddress.ts'

export type { SkillsTab }

// The demo skill lives under All skills; any other skill is one a learner saved.
export function skillsTabFor(skillId: string): SkillsTab {
  return skillId === DEMO_SKILL_ID ? 'all' : 'mine'
}
