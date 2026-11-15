// Runs the Firebase emulators for this worktree, on its own ports (src/worktree.ts)
// and with Java 21, which the Firestore emulator requires.
//   start: the Firestore and Auth emulators with the Emulator UI, next to npm run dev
//   dev:   the same emulators and the Vite dev server in one command
//   test:  a separate Firestore emulator for the rules tests, as project demo-surtrix
// Run through npm (npm run emulators, dev:local or test), which loads .env.local.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseWorktree, worktreePorts } from '../src/worktree.ts'

type Mode = 'start' | 'dev' | 'test'

const root = resolve(import.meta.dirname, '..')

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

// On macOS, pick Java 21 for this command only, whatever the system default is.
// Elsewhere (CI), use the JAVA_HOME that actions/setup-java sets.
function java21Home(): string | undefined {
  if (process.platform !== 'darwin') return process.env.JAVA_HOME
  try {
    return execFileSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch {
    fail('Java 21 is not installed. Install it with: brew install --cask temurin@21')
  }
}

const mode = process.argv[2] as Mode
if (!['start', 'dev', 'test'].includes(mode)) fail('Usage: node scripts/emulators.ts start|dev|test')

const ports = worktreePorts(parseWorktree(process.env.SURTRIX_WORKTREE))
const testing = mode === 'test'

// The CLI reads the rules path relative to the config file, so make it absolute.
const firebaseJson = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'))
const config = {
  firestore: { rules: join(root, firebaseJson.firestore.rules) },
  emulators: {
    singleProjectMode: true,
    firestore: { port: testing ? ports.testFirestore : ports.firestore },
    // The tests leave the hub and logging ports to the CLI, which picks free ones, so
    // they never clash with the dev emulators of the same worktree.
    ...(testing
      ? { ui: { enabled: false } }
      : {
          auth: { port: ports.auth },
          hub: { port: ports.hub },
          logging: { port: ports.logging },
          ui: { enabled: true, port: ports.ui },
        }),
  },
}
const configDir = join(root, '.firebase')
mkdirSync(configDir, { recursive: true })
const configPath = join(configDir, `emulators-${mode}.json`)
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

const args: Record<Mode, string[]> = {
  start: ['emulators:start', '--only', 'firestore,auth', '--project', 'surtrix-50d22'],
  dev: ['emulators:exec', '--only', 'firestore,auth', '--project', 'surtrix-50d22', '--ui', 'vite'],
  test: ['emulators:exec', '--only', 'firestore', '--project', 'demo-surtrix', 'vitest run'],
}

const javaHome = java21Home()
const env = { ...process.env }
if (javaHome) {
  env.JAVA_HOME = javaHome
  env.PATH = `${join(javaHome, 'bin')}:${env.PATH}`
}

const child = spawn('firebase', ['--config', configPath, ...args[mode]], { cwd: root, env, stdio: 'inherit' })
// Ctrl+C reaches the emulators and Vite directly; wait for them to shut down.
process.on('SIGINT', () => {})
process.on('SIGTERM', () => child.kill('SIGTERM'))
child.on('error', (e) => fail(`Could not start the firebase CLI: ${e.message}`))
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
