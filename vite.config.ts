import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { parseWorktree, worktreePorts } from './src/worktree.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // SURTRIX_WORKTREE in .env.local picks this worktree's ports (see src/worktree.ts).
  // The Firebase web key only accepts requests from localhost 5173 to 5175.
  const worktree = parseWorktree(loadEnv(mode, process.cwd(), 'SURTRIX_').SURTRIX_WORKTREE)
  const port = worktreePorts(worktree).dev
  return {
    plugins: [react()],
    // The app reads SURTRIX_WORKTREE to find this worktree's emulators.
    envPrefix: ['VITE_', 'SURTRIX_'],
    server: { port, strictPort: true },
    preview: { port, strictPort: true },
  }
})
