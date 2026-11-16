import { useEffect, useState } from 'react'
import Coach from './Coach.tsx'
import type { CoachSkill } from './coach.ts'
import { loadSkill } from './skills.ts'

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
  return (
    <main>
      <header>
        <h1>
          <a className="home-link" href="#">
            Surtrix
          </a>
        </h1>
      </header>
      {state.kind === 'loading' ? (
        <p className="muted">Loading the skill</p>
      ) : (
        <>
          <p className="error">Could not load this skill. Reload the page to try again.</p>
          <a href="#">Back to skills</a>
        </>
      )}
    </main>
  )
}
