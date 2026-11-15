import type { CoachSkill } from './coach.ts'
import { coachHash } from './screenAddress.ts'

export default function Home({ skills }: { skills: CoachSkill[] }) {
  return (
    <main>
      <header>
        <h1>
          <a className="home-link" href="#">
            Surtrix
          </a>
        </h1>
      </header>

      <section className="skills">
        <h2>Skills</h2>
        <ul>
          {skills.map((skill) => (
            <li key={skill.id}>
              <a href={coachHash(skill.id)}>
                <span className="skill-title">{skill.title}</span>
                <span className="muted">
                  {skill.steps.length} {skill.steps.length === 1 ? 'step' : 'steps'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
