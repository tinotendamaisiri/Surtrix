import type { MouseEvent } from 'react'
import { openSkillsNext, type SkillsTab } from './landingIntent.ts'

// "Back to skills" (#59): home, scrolled to the Skills section with this tab selected.
// A plain link to '#', so opening it in a new tab still works (it opens home's top). A
// click that opens a new tab or window (a modifier key or another button) leaves nothing
// behind, so this tab's next visit to home is not moved.
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
  function onClick(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    openSkillsNext(tab)
  }
  return (
    <a href="#" className={className} onClick={onClick}>
      {children}
    </a>
  )
}
