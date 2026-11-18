// The chat's notification for the AI asking an expert by itself (#65, #74): the first time
// notice, what the AI is doing about an unsure check, and the saved answer it found. The
// expert's reply shows as its own notification in the chat.
import { InferenceSource } from 'firebase/ai'
import type { AutoAsk } from './autoAsk.ts'
import type { ChatQuestion } from './chat.ts'

const sourceLabel: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'ON DEVICE',
  [InferenceSource.IN_CLOUD]: 'IN THE CLOUD',
}

type Props = {
  autoAsk: AutoAsk
  // The question it is waiting on, from this learner's questions on the step, if known.
  asked: ChatQuestion | undefined
  // Only the current notice takes a choice.
  onChoose?: (choice: 'on' | 'off') => void
}

export default function AutoAskCard({ autoAsk, asked, onChoose }: Props) {
  if (autoAsk.kind === 'notice') {
    return (
      <div className="ws-note" role="region" aria-label="Ask experts for me">
        <p className="ws-mono ws-note-label">IN THE CLOUD · NOT SURE</p>
        <p>{autoAsk.said}</p>
        <p>
          When the AI is not sure, Surtrix can ask a Surtrix expert for you. A photo of your bench and this step go to
          the expert. You can turn this off at any time.
        </p>
        {onChoose && (
          <div className="ws-note-actions">
            <button type="button" className="ws-pill ws-pill-yellow" onClick={() => onChoose('on')}>
              Ask experts for me
            </button>
            <button type="button" className="ws-pill" onClick={() => onChoose('off')}>
              Not now
            </button>
          </div>
        )}
      </div>
    )
  }

  if (autoAsk.kind === 'saved') {
    const { answer, source, ms } = autoAsk.pick
    return (
      <div className="ws-note">
        <p className="ws-mono ws-note-label">FROM AN EXPERT · SAVED</p>
        <p>{answer.answer}</p>
        <p className="ws-note-meta">
          From <b>{answer.expertName}</b>
          <span className="ws-mono">
            {' '}
            · {sourceLabel[source] ?? source.toUpperCase()} · {ms.toLocaleString('en-US')} MS
          </span>
        </p>
      </div>
    )
  }

  const text: Record<Exclude<AutoAsk['kind'], 'notice' | 'saved'>, string> = {
    picking: 'Checking saved expert answers…',
    asking: 'Asking an expert…',
    queued: "An expert will be asked when you're back online.",
    'still-waiting': 'Still waiting for an expert.',
    limit: 'The AI has asked 3 experts this session. You can send this one yourself below.',
    'panel-open': "You're asking an expert below. Send it when you're ready.",
    failed: 'Could not ask an expert. You can send it yourself below.',
  }
  return (
    <div className="ws-note" aria-live="polite">
      <p className="ws-mono ws-note-label">IN THE CLOUD · NOT SURE</p>
      <p>{autoAsk.said}</p>
      <p className="ws-note-status">{asked?.reply ? 'An expert answered.' : text[autoAsk.kind]}</p>
    </div>
  )
}
