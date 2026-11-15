// Ports for local development. Each git worktree sets SURTRIX_WORKTREE (1, 2 or 3) in
// its .env.local so parallel worktrees never share a port. Unset means 1: the main
// folder and CI. The Firebase web key allows localhost 5173 to 5175 only.
// Used by vite.config.ts, scripts/emulators.ts and src/firebase.ts.

export type Worktree = 1 | 2 | 3

export type WorktreePorts = {
  dev: number
  firestore: number
  auth: number
  hub: number
  logging: number
  ui: number
  // The tests run their own Firestore emulator, so they can run while the dev
  // emulators are up.
  testFirestore: number
}

export function parseWorktree(value: string | undefined): Worktree {
  if (value === undefined || value.trim() === '') return 1
  const worktree = Number(value)
  if (worktree === 1 || worktree === 2 || worktree === 3) return worktree
  throw new Error(`SURTRIX_WORKTREE must be 1, 2 or 3, not "${value}".`)
}

export function worktreePorts(worktree: Worktree): WorktreePorts {
  const step = worktree - 1
  return {
    dev: 5173 + step,
    firestore: 8080 + step,
    auth: 9099 + step,
    hub: 4400 + step,
    logging: 4500 + step,
    ui: 4000 + step,
    testFirestore: 8180 + step,
  }
}
