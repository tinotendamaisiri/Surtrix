// The Not sure? row's card for the AI asking an expert by itself (#65): the first time
// notice, what the AI is doing about an unsure check, the saved answer it found or the
// expert's reply, and the "Ask experts for me" toggle. Issue B moves this into the chat.
import { InferenceSource } from 'firebase/ai'
import type { JudgeOffer } from './AskExpert.tsx'
import type { AutoAskChoice } from './autoAsk.ts'
import type { Question } from './questions.ts'
import type { Pick } from './savedAnswers.ts'

export type AutoAsk = { stepId: string; said: string } & (
  | { kind: 'notice'; offer: JudgeOffer; index: number }
  | { kind: 'picking' }
  | { kind: 'saved'; pick: Pick & { answer: NonNullable<Pick['answer']> } }
  | { kind: 'asking' | 'queued' | 'still-waiting' | 'limit' | 'failed' }
)

const sourceText: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'ON DEVICE',
  [InferenceSource.IN_CLOUD]: 'CLOUD',
}

type Props = {
  autoAsk: AutoAsk | null
  // This learner's questions on the step, newest first, live.
  questions: Question[]
  choice: AutoAskChoice
  onChoose: (choice: 'on' | 'off') => void
}

export default function AutoAskCard({ autoAsk, questions, choice, onChoose }: Props) {
  return (
    <div className="ws-autoask">
      {autoAsk && <Status autoAsk={autoAsk} questions={questions} onChoose={onChoose} />}
      <button
        type="button"
        role="switch"
        aria-checked={choice === 'on'}
        className="ws-switch"
        onClick={() => onChoose(choice === 'on' ? 'off' : 'on')}
      >
        <span className="ws-switch-track" aria-hidden="true">
          <i />
        </span>
        Ask experts for me
      </button>
    </div>
  )
}

function Status({ autoAsk, questions, onChoose }: { autoAsk: AutoAsk; questions: Question[]; onChoose: Props['onChoose'] }) {
  if (autoAsk.kind === 'notice') {
    return (
      <div className="ws-note" role="region" aria-label="Ask experts for me">
        <p className="ws-mono ws-note-label">IN THE CLOUD · NOT SURE</p>
        <p>{autoAsk.said}</p>
        <p>
          When the AI is not sure, Surtrix can ask a Surtrix expert for you. A photo of your bench and this step go to
          the expert. You can turn this off at any time.
        </p>
        <div className="ws-note-actions">
          <button type="button" className="ws-pill ws-pill-yellow" onClick={() => onChoose('on')}>
            Ask experts for me
          </button>
          <button type="button" className="ws-pill" onClick={() => onChoose('off')}>
            Not now
          </button>
        </div>
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
            · {sourceText[source] ?? source.toUpperCase()} · {ms.toLocaleString('en-US')} MS
          </span>
        </p>
      </div>
    )
  }

  // The newest question the AI asked on this step: its reply shows here once it comes.
  const asked = questions.find((q) => q.origin === 'judge')
  const waitingKinds = ['asking', 'queued', 'still-waiting']
  if (asked?.reply && waitingKinds.includes(autoAsk.kind)) {
    return (
      <div className="ws-note">
        <p className="ws-mono ws-note-label">REAL EXPERT · ANSWERED</p>
        <p>{asked.reply.text}</p>
        <p className="ws-note-meta">
          From <b>{asked.reply.expertName}</b>
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
    failed: 'Could not ask an expert. You can send it yourself below.',
  }
  return (
    <div className="ws-note" aria-live="polite">
      <p className="ws-mono ws-note-label">IN THE CLOUD · NOT SURE</p>
      <p>{autoAsk.said}</p>
      <p className="ws-note-status">{text[autoAsk.kind]}</p>
    </div>
  )
}
