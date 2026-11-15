import { useEffect, useState } from 'react'
import CaptureTest from './CaptureTest.tsx'
import Coach from './Coach.tsx'
import Home from './Home.tsx'
import { skills } from './sampleSkill.ts'
import { screenFromHash } from './screenAddress.ts'

// Screens are picked from the address hash (see Contracts in the build plan). This is
// the one place that chooses a screen.
export default function Screen() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const address = screenFromHash(hash)
  switch (address.screen) {
    case 'capture-test':
      return <CaptureTest />
    case 'coach':
      // A new key per skill, so another skill starts at its own step 1.
      return <Coach key={address.skillId} skill={skills.find((skill) => skill.id === address.skillId)} />
    case 'home':
      return <Home skills={skills} />
  }
}
