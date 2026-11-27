// Reads which screen an address hash asks for (see Contracts in the build plan). Only
// Screen.tsx uses it to pick the screen. Anything not listed here goes home.
export type SkillsTab = 'all' | 'mine'

export type ScreenAddress =
  // section: home opened scrolled to How it works (#83).
  | { screen: 'home'; section?: 'how' }
  // The Skills page (#83) on its All skills or My skills tab.
  | { screen: 'skills'; tab: SkillsTab }
  | { screen: 'new-skill' }
  // Editing one of the user's own skills on the Create a skill screen (#106).
  | { screen: 'edit-skill'; skillId: string }
  | { screen: 'coach'; skillId: string }
  | { screen: 'capture-test' }
  | { screen: 'expert' }

export function screenFromHash(hash: string): ScreenAddress {
  if (hash === '#new-skill') return { screen: 'new-skill' }
  if (hash === '#capture-test') return { screen: 'capture-test' }
  if (hash === '#expert') return { screen: 'expert' }
  if (hash === SKILLS_HASH) return { screen: 'skills', tab: 'all' }
  if (hash === MY_SKILLS_HASH) return { screen: 'skills', tab: 'mine' }
  if (hash === HOW_IT_WORKS_HASH) return { screen: 'home', section: 'how' }
  const coach = /^#coach\/([^/]+)$/.exec(hash)
  if (coach) return { screen: 'coach', skillId: coach[1] }
  const editing = /^#edit-skill\/([^/]+)$/.exec(hash)
  if (editing) return { screen: 'edit-skill', skillId: editing[1] }
  return { screen: 'home' }
}

export function coachHash(skillId: string): string {
  return `#coach/${skillId}`
}

export function editSkillHash(skillId: string): string {
  return `#edit-skill/${skillId}`
}

export const NEW_SKILL_HASH = '#new-skill'

export const SKILLS_HASH = '#skills'
export const MY_SKILLS_HASH = '#skills/mine'
export const HOW_IT_WORKS_HASH = '#how-it-works'

export function skillsHash(tab: SkillsTab): string {
  return tab === 'mine' ? MY_SKILLS_HASH : SKILLS_HASH
}
