import { useEffect, useState } from 'react'
import { coachHash } from './screenAddress.ts'
import { listMySkills, type SkillSummary } from './skills.ts'

type State = { kind: 'loading' } | { kind: 'loaded'; skills: SkillSummary[] } | { kind: 'failed' }

// The skills this learner saved, newest first, listed on home below the built in ones.
export default function MySkills() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let onScreen = true
    listMySkills().then(
      (skills) => onScreen && setState({ kind: 'loaded', skills }),
      (e) => {
        console.error('Loading saved skills failed', e)
        if (onScreen) setState({ kind: 'failed' })
      },
    )
    return () => {
      onScreen = false
    }
  }, [])

  if (state.kind === 'loading') return <p className="muted">Loading your skills</p>
  if (state.kind === 'failed') return <p className="error">Could not load your skills. Reload the page to try again.</p>
  if (state.skills.length === 0) return null
  return (
    <ul>
      {state.skills.map((skill) => (
        <li key={skill.id}>
          <a href={coachHash(skill.id)}>
            <span className="skill-title">{skill.title}</span>
            <span className="muted">
              {skill.stepCount} {skill.stepCount === 1 ? 'step' : 'steps'}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
