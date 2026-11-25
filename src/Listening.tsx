// Talking to the Workspace (#80): the Listening toggle under the camera, the mic buttons
// in the chat, and the LISTENING tag. All three controls turn the same listening on and
// off (settled f).
import type { CoachVoice } from './useCoachVoice.ts'
import type { Listening } from './useListening.ts'
import { listeningOn, listeningProblem, NO_CHECK_LINE, voiceNoteText, type VoiceNote } from './voice.ts'

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

// A message was heard and waits for its silence or its check: no words, only this sign
// (settled l).
// The copy under the camera is the one read out; the chat's copy only shows.
export function HeardYou({ heard, announce = true }: { heard: boolean; announce?: boolean }) {
  return (
    <span className="ws-heard" role={announce ? 'status' : undefined} aria-hidden={announce ? undefined : true}>
      {heard && (
        <>
          <i className="ws-dot" aria-hidden="true" />
          Heard you
        </>
      )}
    </span>
  )
}

// The quiet note after a spoken message that did not go; it fades (settled n, o).
export function VoiceNoteLine({ note }: { note: { note: VoiceNote; id: number } | null }) {
  return (
    <p className="ws-voice-note" role="status">
      {note && (
        <span key={note.id} className="ws-voice-note-text">
          {voiceNoteText(note.note)}
        </span>
      )}
    </p>
  )
}

type ToggleProps = {
  listening: Listening
  // A message heard and not yet sent or let go.
  heard: boolean
  // A quiet note to show here: only while the chat is closed (settled p).
  note: { note: VoiceNote; id: number } | null
  // This device cannot run the voice check, so questions need typing (settled o).
  noVoiceCheck: boolean
}

// Under the camera: "Listening" with moving bars, or a grey "Not listening" with a crossed
// out mic, and the reason when voice cannot run.
export function ListeningToggle({ listening, heard, note, noVoiceCheck }: ToggleProps) {
  const on = listeningOn(listening.state)
  const problem = listeningProblem(listening.state) ?? (on && noVoiceCheck ? NO_CHECK_LINE : null)
  return (
    <>
      <button
        type="button"
        className={`ws-pill ws-listen${on ? ' ws-listen-on' : ''}`}
        onClick={listening.toggle}
        disabled={listening.state === 'unsupported'}
      >
        {on ? <Wave /> : <MicIcon crossed />}
        {label(listening)}
      </button>
      {on && <HeardYou heard={heard} />}
      {on && listening.held && (
        <p className="ws-listen-problem" role="status">
          Coach speaking
        </p>
      )}
      {problem && <p className="ws-listen-problem">{problem}</p>}
      <VoiceNoteLine note={note} />
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
      aria-label="Talk"
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

function SpeakerIcon({ crossed = false }: { crossed?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9z" />
      {crossed ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  )
}

// Next to Listening (#95): the coach reading its messages aloud, on until muted. Where this
// device has no on device English voice, it says so and stays off.
export function CoachVoiceToggle({ voice }: { voice: CoachVoice }) {
  if (voice.available === null) return null
  if (!voice.available) {
    return (
      <button type="button" className="ws-pill ws-listen" disabled>
        <SpeakerIcon crossed />
        No voice on this device
      </button>
    )
  }
  const on = !voice.muted
  return (
    <button
      type="button"
      className={`ws-pill ws-listen${on ? ' ws-listen-on' : ''}`}
      aria-pressed={on}
      onClick={voice.toggleMute}
    >
      <SpeakerIcon crossed={!on} />
      {on ? 'Coach voice' : 'Coach muted'}
    </button>
  )
}
