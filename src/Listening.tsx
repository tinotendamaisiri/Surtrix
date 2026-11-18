// Talking to the Workspace (#80): the Listening toggle under the camera, the mic buttons
// in the chat, and the LISTENING tag. All three controls turn the same listening on and
// off (settled f).
import type { Listening } from './useListening.ts'
import { listeningOn, listeningProblem } from './voice.ts'

function Wave() {
  return (
    <span className="ws-wave" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

function MicIcon({ crossed = false }: { crossed?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  )
}

function label(listening: Listening): string {
  if (listening.state === 'preparing') return 'Getting voice ready'
  if (listening.state === 'paused') return 'Listening paused'
  return listeningOn(listening.state) ? 'Listening' : 'Not listening'
}

// Under the camera: "Listening" with moving bars, or a grey "Not listening" with a crossed
// out mic, and the reason when voice cannot run.
export function ListeningToggle({ listening }: { listening: Listening }) {
  const on = listeningOn(listening.state)
  const problem = listeningProblem(listening.state)
  return (
    <>
      <button
        type="button"
        className={`ws-pill ws-listen${on ? ' ws-listen-on' : ''}`}
        aria-pressed={on}
        onClick={listening.toggle}
        disabled={listening.state === 'unsupported'}
      >
        {on ? <Wave /> : <MicIcon crossed />}
        {label(listening)}
      </button>
      {problem && <p className="ws-listen-problem">{problem}</p>}
    </>
  )
}

// A round mic in the chat bar and beside the text box.
export function MicButton({ listening }: { listening: Listening }) {
  const on = listeningOn(listening.state)
  return (
    <button
      type="button"
      className={`ws-mic${on ? ' ws-mic-on' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Stop listening' : 'Talk'}
      title={listeningProblem(listening.state) ?? undefined}
      onClick={listening.toggle}
      disabled={listening.state === 'unsupported'}
    >
      <MicIcon crossed={!on} />
    </button>
  )
}

// In the chat header while listening.
export function ListeningTag({ listening }: { listening: Listening }) {
  if (listening.state !== 'listening') return null
  return (
    <span className="ws-tag ws-listen-tag">
      <Wave />
      LISTENING
    </span>
  )
}
