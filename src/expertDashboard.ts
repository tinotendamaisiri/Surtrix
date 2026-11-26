// The expert dashboard's own rules (#105), kept apart from React so they are tested.
export type SkillsTab = 'all' | 'published' | 'drafts'

type Publishable = { published: boolean }

export function skillsInTab<T extends Publishable>(skills: readonly T[], tab: SkillsTab): T[] {
  return skills.filter((s) => tab === 'all' || (tab === 'published') === s.published)
}

export function tabCounts(skills: readonly Publishable[]): Record<SkillsTab, number> {
  const published = skills.filter((s) => s.published).length
  return { all: skills.length, published, drafts: skills.length - published }
}

// "6 steps · 20 min", or only the steps when the time is not known.
export function stepsLine(stepCount: number, minutes?: number): string {
  const steps = `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`
  return minutes ? `${steps} · ${minutes} min` : steps
}

// "Soldering · Beginner", either alone, or nothing when neither is known.
export function tradeLine(trade?: string, level?: string): string {
  return [trade, level].filter(Boolean).join(' · ')
}

// "just now", "2 min ago", "3 h ago", "2 days ago".
export function timeAgo(date: Date | null, now: Date): string {
  if (!date) return ''
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

// Learners helped: the different learners whose questions this expert answered.
export function learnersHelped(answered: readonly { learnerId: string }[]): number {
  return new Set(answered.map((q) => q.learnerId).filter(Boolean)).size
}
