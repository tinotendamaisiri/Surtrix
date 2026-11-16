// Reads which screen an address hash asks for (see Contracts in the build plan). Only
// Screen.tsx uses it to pick the screen. Anything not listed here goes home.
export type ScreenAddress =
  | { screen: 'home' }
  | { screen: 'new-skill' }
  | { screen: 'coach'; skillId: string }
  | { screen: 'capture-test' }
  | { screen: 'expert' }

export function screenFromHash(hash: string): ScreenAddress {
  if (hash === '#new-skill') return { screen: 'new-skill' }
  if (hash === '#capture-test') return { screen: 'capture-test' }
  if (hash === '#expert') return { screen: 'expert' }
  const coach = /^#coach\/([^/]+)$/.exec(hash)
  if (coach) return { screen: 'coach', skillId: coach[1] }
  return { screen: 'home' }
}

export function coachHash(skillId: string): string {
  return `#coach/${skillId}`
}
