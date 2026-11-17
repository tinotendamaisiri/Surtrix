import { openSkillsNext, type SkillsTab } from './landingIntent.ts'

// "Back to skills" (#59): home, scrolled to the Skills section with this tab selected.
// A plain link to '#', so opening it in a new tab still works (it opens home's top).
export default function BackToSkills({ tab }: { tab: SkillsTab }) {
  return (
    <a href="#" onClick={() => openSkillsNext(tab)}>
      Back to skills
    </a>
  )
}
