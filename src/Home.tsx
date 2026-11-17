import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import './Landing.css'
import LandingFooter from './LandingFooter.tsx'
import { HERO_IMAGE, HERO_SMALL_IMAGE, landingSkills, type LandingSkill } from './landingSkills.ts'
import MySkills from './MySkills.tsx'
import { coachHash } from './screenAddress.ts'
import { DEMO_SKILL_ID } from './demoSkill.ts'
import { nextSkillsTab, takeSkillsTab } from './landingIntent.ts'
import Wordmark from './Wordmark.tsx'

// Home is the landing page (#51): the approved design rebuilt in the app's own React and
// CSS. The app routes by the address hash (screenAddress.ts), so the menu scrolls to its
// sections with scrollIntoView and never changes the address.
export default function Home() {
  const skillsRef = useRef<HTMLElement>(null)
  const howRef = useRef<HTMLElement>(null)
  // Arriving from "Back to skills" (#59): open on its tab, scrolled to the Skills section.
  const [arrivalTab] = useState(() => nextSkillsTab())
  useEffect(() => {
    if (takeSkillsTab()) skillsRef.current?.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <main className="landing">
      <section className="landing-hero">
        <HeroPhoto />
        <header className="landing-header">
          <Wordmark white />
          <div className="landing-menu">
            <nav className="landing-nav" aria-label="Sections">
              <button type="button" onClick={() => scrollToSection(howRef)}>
                How it works
              </button>
              <button type="button" onClick={() => scrollToSection(skillsRef)}>
                Skills
              </button>
            </nav>
            <a className="landing-pill landing-pill-expert" href="#expert">
              I am an expert
            </a>
          </div>
        </header>
        <div className="landing-copy">
          <h1>
            An expert
            <br />
            over your shoulder.
          </h1>
          <p>
            Point your camera at the work. Surtrix watches each step, checks the wiring before you power on, and calls a
            real expert when the AI is not sure.
          </p>
          <div className="landing-actions">
            <a className="landing-pill landing-pill-yellow" href={coachHash(DEMO_SKILL_ID)}>
              Try the demo
            </a>
            <a className="landing-pill landing-pill-outline" href="#new-skill">
              Create a skill
            </a>
          </div>
        </div>
      </section>

      <SkillsSection sectionRef={skillsRef} initialTab={arrivalTab ?? 'all'} />
      <HowItWorks sectionRef={howRef} />
      <LandingFooter onHow={() => scrollToSection(howRef)} onSkills={() => scrollToSection(skillsRef)} />
    </main>
  )
}

function scrollToSection(ref: RefObject<HTMLElement | null>) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ref.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
}

// The hero photo shows the real coach screen on the monitor. The frame keeps the photo's
// own shape, cropped like object-fit cover from the top center, so the REC dot and the
// smoke (placed in percent of the photo) stay on the monitor's REC label and the iron tip.
function HeroPhoto() {
  return (
    <div className="landing-photo">
      <div className="landing-photo-frame">
        {/* The browser picks by the photo's width on screen times the screen's density, so
            only small, low density screens get the small photo. */}
        <img
          src={`/landing/${HERO_IMAGE}`}
          srcSet={`/landing/${HERO_SMALL_IMAGE} 664w, /landing/${HERO_IMAGE} 1327w`}
          sizes="(max-width: 900px) 100vw, 1008px"
          alt="A student solders a circuit board under a desk lamp while Surtrix shows the current step"
        />
        <span className="landing-rec" aria-hidden="true" />
        <span className="landing-plume" aria-hidden="true">
          <b />
          <b />
          <b />
          <b />
        </span>
        <span className="landing-smoke" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  )
}

type Tab = 'all' | 'mine'
const tabs: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All skills' },
  { id: 'mine', label: 'My skills' },
]

function SkillsSection({ sectionRef, initialTab }: { sectionRef: RefObject<HTMLElement | null>; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

  function onTabKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next: Tab = tab === 'all' ? 'mine' : 'all'
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <section className="landing-skills" ref={sectionRef}>
      <div className="landing-glow" aria-hidden="true" />
      <div className="landing-tabs" role="tablist" aria-label="Skills">
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`landing-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="landing-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="landing-section-head">
        <h2>
          Every procedure becomes a skill
          <br />
          <span className="landing-gradient">verified by experts.</span>
        </h2>
        <p>
          Skills checked by real experts across the trades: auto mechanics, welding, HVAC, plumbing, electrical work, phone
          and laptop repair, bike repair, 3D printing, drones, soldering and machine assembly. Or create your own from any
          procedure.
        </p>
      </div>
      <div role="tabpanel" id="landing-panel" aria-labelledby={`landing-tab-${tab}`}>
        {tab === 'all' ? <Carousel /> : <MySkills />}
      </div>
    </section>
  )
}

// Two copies of the cards side by side, sliding left by one copy per loop, so the loop
// never shows a seam. The second copy is hidden from screen readers and, with reduced
// motion, from view.
function Carousel() {
  return (
    <div className="landing-marquee">
      <ul className="landing-track">
        {landingSkills.map((skill) => (
          <SkillCard key={skill.image} skill={skill} />
        ))}
        {landingSkills.map((skill) => (
          <SkillCard key={`copy-${skill.image}`} skill={skill} copy />
        ))}
      </ul>
    </div>
  )
}

function SkillCard({ skill, copy = false }: { skill: LandingSkill; copy?: boolean }) {
  const content = (
    <>
      <div className="landing-card-photo" style={{ backgroundImage: `url(/landing/${skill.image})` }}>
        <div className="landing-card-top">
          <span className="landing-trade">
            <i aria-hidden="true" />
            {skill.trade}
          </span>
          {skill.href ? <span className="landing-live">LIVE DEMO</span> : <span className="landing-verified">✓ VERIFIED</span>}
        </div>
      </div>
      <div className="landing-card-body">
        <h3>{skill.title}</h3>
        <p>{skill.text}</p>
        <span className="landing-ticks">
          <Tick>Verified by {skill.verifiedBy}</Tick>
          <Tick>{skill.stepCount} steps</Tick>
        </span>
      </div>
    </>
  )
  return (
    <li className={copy ? 'landing-card-copy' : undefined} aria-hidden={copy || undefined}>
      {skill.href ? (
        // Out of the tab order (#59): the carousel slides it off screen, and the demo is
        // reachable by keyboard from the hero and the footer. Still clickable.
        <a className="landing-card" href={skill.href} tabIndex={-1}>
          {content}
        </a>
      ) : (
        <div className="landing-card">{content}</div>
      )}
    </li>
  )
}

function Tick({ children }: { children: ReactNode }) {
  return (
    <span className="landing-tick-line">
      <span className="landing-tick" aria-hidden="true">
        ✓
      </span>
      {children}
    </span>
  )
}

const steps: { number: string; where: string; title: string; text: string; icon: ReactNode }[] = [
  {
    number: '01',
    where: 'YOU',
    title: 'Select or create a skill',
    text: 'Pick a skill already verified by experts, or upload your own procedure, a repair guide, a lab sheet or a manual. Surtrix turns it into clear steps it knows how to watch.',
    icon: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M12 17v-6" />
        <path d="M9.5 13.5 12 11l2.5 2.5" />
      </>
    ),
  },
  {
    number: '02',
    where: 'ON DEVICE',
    title: 'It watches every step',
    text: 'Point your camera at the work. Gemini Nano runs right on your device, follows each step and keeps working even offline.',
    icon: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    number: '03',
    where: 'IN THE CLOUD',
    title: 'It checks before it matters',
    text: 'When you mark a step done, a stronger Gemini model in the cloud checks your work, like the wiring before you power on.',
    icon: (
      <>
        <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.5 8.5z" />
        <path d="m9.5 13.5 2 2 3.5-3.5" />
      </>
    ),
  },
  {
    number: '04',
    where: 'REAL EXPERT',
    title: 'An expert steps in',
    text: 'When the AI is not sure, one tap sends a photo to a real expert. Their answer is saved, so the next learner gets it instantly, offline too.',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  },
]

function HowItWorks({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  return (
    <section className="landing-how" ref={sectionRef}>
      <div className="landing-section-head">
        <h2>How it works</h2>
        <p>On device first, the cloud when it matters, and a real person when the AI is not sure.</p>
      </div>
      <ol className="landing-steps">
        {steps.map((step) => (
          <li key={step.number} className="landing-step">
            <div className="landing-step-head">
              <span className="landing-step-number">{step.number}</span>
              <span className="landing-where">{step.where}</span>
            </div>
            <div className="landing-step-icon">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F9D440"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {step.icon}
              </svg>
            </div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="landing-loop">
        <b>Every expert answer makes Surtrix smarter.</b> Saved answers come back on device, so help is there even with no
        signal.
      </p>
    </section>
  )
}
