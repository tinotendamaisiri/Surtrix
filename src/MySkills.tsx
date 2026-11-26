import { useEffect, useState } from 'react'
import SafetyBadges from './SafetyBadges.tsx'
import { CARD_BADGES } from './safety.ts'
import { coachHash } from './screenAddress.ts'
import { listMySkills, type SkillSummary } from './skills.ts'

type State = { kind: 'loading' } | { kind: 'loaded'; skills: SkillSummary[] } | { kind: 'failed' }

// The Skills page's My skills tab (#83, `#skills/mine`): the skills this learner saved,
// newest first, as simple cards that open their coach. It loads when the tab is opened.
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

  if (state.kind === 'loading') return <p className="skills-mine-note">Loading your skills</p>
  if (state.kind === 'failed') {
    return <p className="skills-mine-note skills-error">Could not load your skills. Reload the page to try again.</p>
  }
  if (state.skills.length === 0) {
    return (
      <div className="skills-mine-empty">
        <p className="skills-mine-note">You have not saved a skill yet.</p>
        <a className="skills-btn skills-btn-primary" href="#new-skill">
          Create a skill
        </a>
      </div>
    )
  }
  return (
    <ul className="skills-grid skills-mine">
      {state.skills.map((skill) => (
        <li key={skill.id}>
          <a className="skills-card skills-mine-card" href={coachHash(skill.id)}>
            <div className="skills-cbody">
              <h3>{skill.title}</h3>
              <SafetyBadges badges={skill.badges} max={CARD_BADGES} className="skills-badges" />
              <span className="skills-steps">
                {skill.stepCount} {skill.stepCount === 1 ? 'step' : 'steps'}
              </span>
              <span className="skills-start">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15l13-7.5z" />
                </svg>
                Start
              </span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  )
}
