import { useEffect, useState } from 'react'
import { coachHash } from './screenAddress.ts'
import { listMySkills, type SkillSummary } from './skills.ts'

type State = { kind: 'loading' } | { kind: 'loaded'; skills: SkillSummary[] } | { kind: 'failed' }

// The My skills tab on home (#51): the skills this learner saved, newest first, each
// opening its coach. It loads only when the tab is opened.
export default function MySkills() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let onScreen = true
    listMySkills().then(
      (skills) => onScreen && setState({ kind: 'loaded', skills }),
      (e) => {
        console.error('Loading your skills failed', e)
        if (onScreen) setState({ kind: 'failed' })
      },
    )
    return () => {
      onScreen = false
    }
  }, [])

  if (state.kind === 'loading') return <p className="landing-myskills-note">Loading your skills</p>
  if (state.kind === 'failed') {
    return <p className="landing-myskills-note landing-error">Could not load your skills. Reload the page to try again.</p>
  }
  if (state.skills.length === 0) {
    return (
      <div className="landing-myskills-empty">
        <p className="landing-myskills-note">You have not saved a skill yet.</p>
        <a className="landing-pill landing-pill-yellow" href="#new-skill">
          Create a skill
        </a>
      </div>
    )
  }
  return (
    <ul className="landing-myskills">
      {state.skills.map((skill) => (
        <li key={skill.id}>
          <a className="landing-myskill" href={coachHash(skill.id)}>
            <h3>{skill.title}</h3>
            <span className="landing-ticks">
              <span className="landing-tick-line">
                <span className="landing-tick" aria-hidden="true">
                  ✓
                </span>
                {skill.stepCount} {skill.stepCount === 1 ? 'step' : 'steps'}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
