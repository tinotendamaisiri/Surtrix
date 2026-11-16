import SkillList from './SkillList.tsx'

export default function Home() {
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
        <SkillList />
        <a href="#new-skill">New skill</a>
      </section>
    </main>
  )
}
