import { useEffect, useState } from 'react'
import CaptureTest from './CaptureTest.tsx'
import ExpertDashboard from './ExpertDashboard.tsx'
import Home from './Home.tsx'
import NewSkill from './NewSkill.tsx'
import SavedSkillCoach from './SavedSkillCoach.tsx'
import SkillsPage from './SkillsPage.tsx'
import { screenFromHash } from './screenAddress.ts'

// The one place that picks the screen from the address hash (see Contracts in the build
// plan). No other file reads the hash to choose a screen.
export default function Screen() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const address = screenFromHash(hash)
  // A new screen opens at its top (#83), not where the last one was scrolled to. Switching
  // the Skills page's tab is the same screen, and Home scrolls to How it works itself.
  const screenKey =
    address.screen === 'coach'
      ? `coach/${address.skillId}`
      : address.screen === 'home' && address.section === 'how'
        ? 'home/how'
        : address.screen
  useEffect(() => {
    // Home's own effect has already scrolled to How it works (a child's effects run first).
    if (screenKey === 'home/how') return
    window.scrollTo(0, 0)
  }, [screenKey])
  switch (address.screen) {
    case 'new-skill':
      return <NewSkill />
    case 'capture-test':
      return <CaptureTest />
    case 'expert':
      return <ExpertDashboard />
    case 'coach':
      // Every skill, the demo skill too, is loaded from Firestore. A new key per skill, so
      // another skill starts at its own step 1.
      return <SavedSkillCoach key={address.skillId} skillId={address.skillId} />
    case 'skills':
      // One page for both tabs, so switching tabs keeps the search and chip (settled n).
      return <SkillsPage tab={address.tab} />
    case 'home':
      return <Home section={address.section} />
  }
}
