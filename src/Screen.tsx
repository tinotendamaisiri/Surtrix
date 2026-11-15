import { useEffect, useState } from 'react'
import App from './App.tsx'
import NewSkill from './NewSkill.tsx'

// The one place that picks the screen from the address hash. No other file reads the hash
// to choose a screen.
export default function Screen() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return hash === '#new-skill' ? <NewSkill /> : <App />
}
