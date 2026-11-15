import { useEffect, useState } from 'react'
import CaptureTest from './CaptureTest.tsx'
import Coach from './Coach.tsx'
import Home from './Home.tsx'
import NewSkill from './NewSkill.tsx'
import SavedSkillCoach from './SavedSkillCoach.tsx'
import { skills } from './sampleSkill.ts'
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
    case 'coach': {
      // A new key per skill, so another skill starts at its own step 1. A skill that is
      // not built in is loaded from the learner's saved skills.
      const builtIn = skills.find((skill) => skill.id === address.skillId)
      return builtIn ? (
        <Coach key={address.skillId} skill={builtIn} />
      ) : (
        <SavedSkillCoach key={address.skillId} skillId={address.skillId} />
      )
    }
    case 'home':
      return <Home skills={skills} />
  }
}
