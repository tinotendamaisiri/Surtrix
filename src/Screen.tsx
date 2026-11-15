import { useEffect, useState } from 'react'
import CaptureTest from './CaptureTest.tsx'
import ExpertDashboard from './ExpertDashboard.tsx'
import Home from './Home.tsx'
import NewSkill from './NewSkill.tsx'
import SavedSkillCoach from './SavedSkillCoach.tsx'
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
    case 'home':
      return <Home />
  }
}
