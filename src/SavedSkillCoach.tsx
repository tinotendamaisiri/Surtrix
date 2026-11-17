import { useEffect, useState } from 'react'
import Coach from './Coach.tsx'
import type { CoachSkill } from './coach.ts'
import { loadSkill } from './skills.ts'
import BackToSkills from './BackToSkills.tsx'
import { skillsTabFor } from './landingIntent.ts'
import { WorkspaceShell, WorkspaceTopBar } from './WorkspacePanels.tsx'

type State = { kind: 'loading' } | { kind: 'loaded'; skill: CoachSkill | null } | { kind: 'failed' }

// Loads a skill from Firestore (a saved skill or the demo skill), then shows its coach. A skill that does not exist
// gets the coach's own "could not be found" screen.
export default function SavedSkillCoach({ skillId }: { skillId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let onScreen = true
    loadSkill(skillId).then(
      (skill) => onScreen && setState({ kind: 'loaded', skill }),
      (e) => {
        console.error('Loading the skill failed', e)
        if (onScreen) setState({ kind: 'failed' })
      },
    )
    return () => {
      onScreen = false
    }
  }, [skillId])

  if (state.kind === 'loaded') return <Coach skill={state.skill ?? undefined} />
  const exitTab = skillsTabFor(skillId)
  return (
    <WorkspaceShell top={<WorkspaceTopBar exitTab={exitTab} />}>
      <section className="ws-message ws-panel">
        {state.kind === 'loading' ? (
          <p className="ws-quiet">Loading the skill</p>
        ) : (
          <>
            <p className="ws-error">Could not load this skill. Reload the page to try again.</p>
            <BackToSkills tab={exitTab} className="ws-pill" />
          </>
        )}
      </section>
    </WorkspaceShell>
  )
}
