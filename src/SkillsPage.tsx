// The Skills page (#83): `#skills` (All skills) and `#skills/mine` (My skills). All skills
// shows the pinned LED card (the one live skill, for judges) and the 44 example skills
// from the skills catalog, with search and trade chips. My skills shows the learner's own
// saved skills.
import { useRef, useState, type FormEvent } from 'react'
import MySkills from './MySkills.tsx'
import TradeChips from './TradeChips.tsx'
import { exampleSkills, pinnedSkill, type CatalogSkill } from './skillCatalog.ts'
import { HOW_IT_WORKS_HASH, MY_SKILLS_HASH, SKILLS_HASH, type SkillsTab } from './screenAddress.ts'
import {
  ALL_TRADES,
  cardTag,
  countText,
  exampleLine,
  PLACEHOLDER_NOTE,
  skillMatches,
  stepsAndTime,
  tradeChips,
} from './skillsPage.ts'
import Wordmark from './Wordmark.tsx'
import './SkillsPage.css'

const chips = tradeChips(exampleSkills)

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function SkillsPage({ tab }: { tab: SkillsTab }) {
  // Kept while switching tabs, so All skills comes back as it was (settled n).
  const [search, setSearch] = useState('')
  const [trade, setTrade] = useState(ALL_TRADES)
  const resultsRef = useRef<HTMLElement>(null)
  const shown = exampleSkills.filter((s) => skillMatches(s, search, trade))
  const pinnedShown = skillMatches(pinnedSkill, search, trade)

  // Search and Enter apply the search and bring the results into view (settled h).
  function applySearch(event: FormEvent) {
    event.preventDefault()
    resultsRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <main className="skills-page">
      <header className="skills-header">
        <a href="#" className="skills-home" aria-label="Surtrix home">
          <Wordmark white />
        </a>
        <nav className="skills-nav" aria-label="Pages">
          <a href={SKILLS_HASH} className="skills-navpill skills-navpill-on" aria-current="page">
            Skills
          </a>
          <a href={HOW_IT_WORKS_HASH} className="skills-navpill">
            How it works
          </a>
        </nav>
        <div className="skills-header-actions">
          <a href="#new-skill" className="skills-btn skills-btn-gold">
            Create a skill
          </a>
          <a href="#expert" className="skills-btn">
            I am an expert
          </a>
        </div>
      </header>

      <div className="skills-wrap">
        <div className="skills-intro">
          <div>
            <h1>What do you want to work on today?</h1>
            <p>Pick a skill verified by experts. Surtrix watches each step with you.</p>
          </div>
          <nav className="skills-tabs" aria-label="Skills">
            <a href={SKILLS_HASH} className="skills-tab" aria-current={tab === 'all' ? 'page' : undefined}>
              All skills
            </a>
            <a href={MY_SKILLS_HASH} className="skills-tab" aria-current={tab === 'mine' ? 'page' : undefined}>
              My skills
            </a>
          </nav>
        </div>

        {tab === 'mine' ? (
          <MySkills />
        ) : (
          <>
            <form className="skills-search" role="search" onSubmit={applySearch}>
              <label htmlFor="skills-search" className="skills-visually-hidden">
                Search skills
              </label>
              <input
                id="skills-search"
                type="search"
                placeholder="Search skills, trades or experts"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="submit" className="skills-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <span className="skills-search-label">Search</span>
              </button>
            </form>

            <TradeChips trades={chips.filter((c) => c !== ALL_TRADES)} picked={trade} onPick={setTrade} />

            {pinnedShown && (
              <section className="skills-pinned" aria-label="Quick to test">
                <p className="skills-pinlabel">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 17v5" />
                    <path d="M9 3h6l-1 6 3 3H7l3-3z" />
                  </svg>
                  QUICK TO TEST · PICKED FOR HACKATHON JUDGES
                </p>
                <div className="skills-grid">
                  <LiveCard />
                </div>
              </section>
            )}

            <section className="skills-results" ref={resultsRef} aria-labelledby="skills-all-heading">
              <div className="skills-results-head">
                <h2 id="skills-all-heading">All skills</h2>
                <p className="skills-count">
                  <span>{countText(shown.length)}</span>
                  <span className="skills-note">{PLACEHOLDER_NOTE}</span>
                </p>
              </div>
              <div className="skills-grid">
                {shown.map((skill) => (
                  <ExampleCard key={skill.image} skill={skill} />
                ))}
                {/* Only when nothing matches at all: a shown pinned card is a match. */}
                {shown.length === 0 && !pinnedShown && (
                  <p className="skills-empty">
                    No skills match. Try another word or trade, or <a href="#new-skill">create a skill</a>.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function Verified() {
  return (
    <span className="skills-vb" title="Verified expert">
      ✓<span className="skills-visually-hidden"> verified expert</span>
    </span>
  )
}

// The one live skill: the whole card opens the demo (settled g).
function LiveCard() {
  const s = pinnedSkill
  return (
    <a className="skills-card skills-card-live" href={s.href}>
      <div className="skills-cover" style={{ backgroundImage: `url(/landing/${s.image})` }}>
        <span className="skills-live">LIVE DEMO</span>
      </div>
      <div className="skills-cbody">
        <p className="skills-meta">
          {s.trade} · {s.level}
        </p>
        <h3>{s.title}</h3>
        <p className="skills-desc">{s.description}</p>
        <p className="skills-by">
          By {s.expert} <Verified />
        </p>
        <span className="skills-steps">{stepsAndTime(s)}</span>
        <span className="skills-start">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" />
          </svg>
          Start
        </span>
      </div>
    </a>
  )
}

// An example skill: display only, no buttons and no link (settled g).
function ExampleCard({ skill }: { skill: CatalogSkill }) {
  return (
    <article className="skills-card">
      <div className="skills-cover" style={{ backgroundImage: `url(/landing/${skill.image})` }}>
        <span className="skills-tag">{cardTag(skill)}</span>
      </div>
      <div className="skills-cbody">
        <p className="skills-meta">
          {skill.trade} · {skill.level}
        </p>
        <h3>{skill.title}</h3>
        <p className="skills-desc">{skill.description}</p>
        <p className="skills-by">
          By {skill.expert} <Verified />
        </p>
        <span className="skills-steps">{stepsAndTime(skill)}</span>
        <p className="skills-example">{exampleLine(skill)}</p>
      </div>
    </article>
  )
}
