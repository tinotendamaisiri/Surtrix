import { useEffect, useState } from 'react'
import App from './App.tsx'
import NewSkill from './NewSkill.tsx'

// Screens are picked from the address hash (see Contracts in the build plan).
export default function Screen() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return hash === '#new-skill' ? <NewSkill /> : <App />
}
