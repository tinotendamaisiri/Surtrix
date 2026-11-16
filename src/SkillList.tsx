import { useEffect, useState } from 'react'
import { coachHash } from './screenAddress.ts'
import { listSkills, type SkillSummary } from './skills.ts'

type State = { kind: 'loading' } | { kind: 'loaded'; skills: SkillSummary[] } | { kind: 'failed' }

// The skills on home: the demo skill first, then the ones this learner saved, newest first.
export default function SkillList() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let onScreen = true
    listSkills().then(
      (skills) => onScreen && setState({ kind: 'loaded', skills }),
      (e) => {
        console.error('Loading the skills failed', e)
        if (onScreen) setState({ kind: 'failed' })
      },
    )
    return () => {
      onScreen = false
    }
  }, [])

  if (state.kind === 'loading') return <p className="muted">Loading skills</p>
  if (state.kind === 'failed') return <p className="error">Could not load the skills. Reload the page to try again.</p>
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
