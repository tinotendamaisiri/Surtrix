import { skillsHash, type SkillsTab } from './screenAddress.ts'

// "Back to skills" (#59, #83): the Skills page on this tab, `#skills` or `#skills/mine`.
// A plain link, so it also works in a new tab.
// The Workspace's Exit (#62) is the same link with its own label and look.
export default function BackToSkills({
  tab,
  className,
  children = 'Back to skills',
}: {
  tab: SkillsTab
  className?: string
  children?: string
}) {
  return (
    <a href={skillsHash(tab)} className={className}>
      {children}
    </a>
  )
}
