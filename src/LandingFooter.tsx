import { coachHash } from './screenAddress.ts'
import { DEMO_SKILL_ID } from './demoSkill.ts'
import Wordmark from './Wordmark.tsx'

// The landing page's footer (#54). In page links scroll like the header menu (Home passes
// the scrolling in), so the address never changes.
export default function LandingFooter({ onHow, onSkills }: { onHow: () => void; onSkills: () => void }) {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-glow" aria-hidden="true" />
      <div className="landing-footer-main">
        <div className="landing-footer-brand">
          <Wordmark white />
          <p className="landing-footer-line">An expert over your shoulder.</p>
          <p className="landing-footer-text">
            Gemini Nano watches on your device, Gemini in the cloud checks what matters, and real experts answer the
            rest. Built with Firebase AI Logic.
          </p>
          <a className="landing-pill landing-pill-yellow" href={coachHash(DEMO_SKILL_ID)}>
            Try the demo
          </a>
        </div>
        <nav className="landing-footer-column" aria-label="Product">
          <h2>PRODUCT</h2>
          <ul>
            <li>
              <button type="button" onClick={onHow}>
                How it works
              </button>
            </li>
            <li>
              <button type="button" onClick={onSkills}>
                Skills
              </button>
            </li>
            <li>
              <a href={coachHash(DEMO_SKILL_ID)}>Try the demo</a>
            </li>
            <li>
              <a href="#new-skill">Create a skill</a>
            </li>
          </ul>
        </nav>
        <nav className="landing-footer-column" aria-label="Experts">
          <h2>EXPERTS</h2>
          <ul>
            <li>
              <a href="#expert">I am an expert</a>
            </li>
            <li>
              <button type="button" onClick={onHow}>
                How answers are reused
              </button>
            </li>
          </ul>
        </nav>
        <nav className="landing-footer-column" aria-label="Project">
          <h2>PROJECT</h2>
          <ul>
            <li>
              <a href="https://github.com/tinotendamaisiri/Surtrix" target="_blank" rel="noopener">
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="landing-footer-bar">
        <p>© 2026 Surtrix. All rights reserved.</p>
        <p className="landing-footer-built">
          <i aria-hidden="true" />
          Built for #BuildHybridAI
        </p>
      </div>
      <div className="landing-bigmark" aria-hidden="true">
        SURTRIX
      </div>
    </footer>
  )
}
