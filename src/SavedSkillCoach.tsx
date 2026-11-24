import { useEffect, useState } from 'react'
import Coach from './Coach.tsx'
import { loadSkill } from './skills.ts'
import BackToSkills from './BackToSkills.tsx'
import { skillsTabFor } from './landingIntent.ts'
import { WorkspaceShell, WorkspaceTopBar } from './WorkspacePanels.tsx'
import { afterSlowLoadTime, SKILL_LOAD_SLOW_MS, type SkillLoad } from './workspace.ts'

// Loads a skill from Firestore (a saved skill or the demo skill), then shows its coach. A skill that does not exist
// gets the coach's own "could not be found" screen. A load that is slow or failed offers Try again, which reloads
// the page; a slow load keeps running, so the skill still shows if it arrives late.
export default function SavedSkillCoach({ skillId }: { skillId: string }) {
  const [state, setState] = useState<SkillLoad>({ kind: 'loading', slow: false })

  useEffect(() => {
    let onScreen = true
    const slowTimer = setTimeout(() => setState(afterSlowLoadTime), SKILL_LOAD_SLOW_MS)
    loadSkill(skillId).then(
      (skill) => onScreen && setState({ kind: 'loaded', skill }),
      (e) => {
        console.error('Loading the skill failed', e)
        if (onScreen) setState({ kind: 'failed' })
      },
    )
    return () => {
      onScreen = false
      clearTimeout(slowTimer)
    }
  }, [skillId])

  if (state.kind === 'loaded') return <Coach skill={state.skill ?? undefined} />
  const exitTab = skillsTabFor(skillId)
  const tryAgain = (
    <button type="button" className="ws-pill ws-pill-yellow" onClick={() => location.reload()}>
      Try again
    </button>
  )
  return (
    <WorkspaceShell top={<WorkspaceTopBar exitTab={exitTab} />}>
      <section className="ws-message ws-panel">
        {state.kind === 'loading' && !state.slow && <p className="ws-quiet">Loading the skill</p>}
        {state.kind === 'loading' && state.slow && (
          <>
            <p className="ws-error">This is taking longer than it should. Check your connection, then try again.</p>
            {tryAgain}
          </>
        )}
        {state.kind === 'failed' && (
          <>
            <p className="ws-error">Could not load this skill. Check your connection, then try again.</p>
            <div className="ws-message-actions">
              {tryAgain}
              <BackToSkills tab={exitTab} className="ws-pill" />
            </div>
          </>
        )}
      </section>
    </WorkspaceShell>
  )
}
