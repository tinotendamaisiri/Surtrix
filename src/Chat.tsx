// The Workspace chat (#74), at the bottom of the left column: a bar with the latest message
// when closed; when open, the whole column, with Ask an Expert, the "Ask experts for me"
// switch, the messages and a text box. The open chat stays mounted while closed, so an
// unsent question to an expert is kept.
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { InferenceSource } from 'firebase/ai'
import AutoAskCard from './AutoAskCard.tsx'
import { ListeningTag, MicButton } from './Listening.tsx'
import type { Listening } from './useListening.ts'
import type { AutoAskChoice } from './autoAsk.ts'
import {
  CHAT_LIMIT_TEXT,
  CHAT_MAX_LENGTH,
  COULD_NOT_ANSWER_TEXT,
  LIMITED_TEXT,
  ON_DEVICE_NOTE,
  type ChatEntry,
  type ChatQuestion,
} from './chat.ts'

const sourceLabel: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'ON DEVICE',
  [InferenceSource.IN_CLOUD]: 'IN THE CLOUD',
}

type Props = {
  open: boolean
  onOpen: () => void
  onClose: () => void
  entries: ChatEntry[]
  unread: number
  preview: string
  // The step the learner is on: Ask an expert shows only on its replies.
  stepId: string
  // The current first time notice, the one notification that takes a choice.
  noticeId: string | null
  // This learner's questions on the step, for the notifications waiting on one.
  questions: ChatQuestion[]
  questionsFailed: boolean
  choice: AutoAskChoice
  onChoose: (choice: 'on' | 'off') => void
  answering: boolean
  // The session's message limit is reached: the text box is off.
  limitReached: boolean
  // Voice (#80): one listening state for both mics and the tag.
  listening: Listening
  onSend: (message: string) => void
  // Opens the Ask an Expert panel, with the learner's message when it came from a reply.
  onAskExpert: (question: string) => void
  // The Ask an Expert panel, shown above the text box.
  panel: ReactNode
  sectionRef?: Ref<HTMLElement>
}

type EntryProps = Pick<Props, 'stepId' | 'noticeId' | 'questions' | 'onChoose' | 'onAskExpert'>

export default function Chat({ sectionRef, ...props }: Props) {
  const { open, entries, unread, preview, answering } = props
  const [message, setMessage] = useState('')
  const listRef = useRef<HTMLOListElement>(null)

  // The newest message stays in view.
  const count = entries.length
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [open, count, answering])

  function send(e: FormEvent) {
    e.preventDefault()
    // While words are being heard the box shows them, so Send waits.
    if (answering || props.limitReached || props.listening.heard !== '' || message.trim() === '') return
    props.onSend(message)
    setMessage('')
  }

  return (
    <section className={`ws-chat${open ? ' ws-chat-open' : ''}`} aria-label="Chat" ref={sectionRef}>
      <div className="ws-chatbar" hidden={open}>
        <ChatIcon />
        <div className="ws-chatbar-text">
          <p className="ws-chatbar-title">
            Chat
            {unread > 0 && (
              <span className="ws-chat-badge" aria-label={`${unread} new`}>
                {unread}
              </span>
            )}
          </p>
          <p className="ws-chatbar-preview">{preview}</p>
        </div>
        <MicButton listening={props.listening} />
        <button type="button" className="ws-pill" onClick={props.onOpen}>
          Open
        </button>
      </div>

      <div className="ws-chat-body" hidden={!open}>
        <div className="ws-chat-head">
          <div className="ws-chat-head-row">
            <div className="ws-chat-title">
              <h2>Chat</h2>
              <ListeningTag listening={props.listening} />
            </div>
            <div className="ws-chat-head-actions">
              <button type="button" className="ws-pill ws-pill-gold" onClick={() => props.onAskExpert('')}>
                Ask an Expert
              </button>
              <button type="button" className="ws-pill" onClick={props.onClose}>
                Close
              </button>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={props.choice === 'on'}
            className="ws-switch"
            onClick={() => props.onChoose(props.choice === 'on' ? 'off' : 'on')}
          >
            <span className="ws-switch-track" aria-hidden="true">
              <i />
            </span>
            Ask experts for me
          </button>
        </div>

        <ol className="ws-chat-messages" ref={listRef} aria-live="polite">
          {entries.map((entry) => (
            <li key={entry.id} className={entryClass(entry)}>
              <Entry
                entry={entry}
                stepId={props.stepId}
                noticeId={props.noticeId}
                questions={props.questions}
                onChoose={props.onChoose}
                onAskExpert={props.onAskExpert}
              />
            </li>
          ))}
        </ol>

        {props.questionsFailed && (
          <p className="ws-error ws-chat-error">Could not load your questions. Reload the page to try again.</p>
        )}
        {props.panel}

        {props.limitReached && (
          <div className="ws-chat-limit" role="status">
            <p>{CHAT_LIMIT_TEXT}</p>
            <button type="button" className="ws-pill ws-pill-gold" onClick={() => props.onAskExpert('')}>
              Ask an expert
            </button>
          </div>
        )}
        <form className="ws-chat-input" onSubmit={send}>
          <label htmlFor="ws-chat-message" className="ws-visually-hidden">
            Message
          </label>
          <input
            id="ws-chat-message"
            type="text"
            placeholder={props.limitReached ? 'Message limit reached' : 'Type, or just talk'}
            autoComplete="off"
            maxLength={CHAT_MAX_LENGTH}
            // While a phrase is being heard, its words show here (settled e).
            value={props.listening.heard || message}
            onChange={(e) => setMessage(e.target.value)}
            readOnly={props.listening.heard !== ''}
            disabled={props.limitReached}
          />
          <MicButton listening={props.listening} />
          <button
            type="submit"
            className="ws-chat-send"
            aria-label="Send"
            disabled={answering || props.limitReached || props.listening.heard !== '' || message.trim() === ''}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  )
}

function entryClass(entry: ChatEntry): string {
  switch (entry.kind) {
    case 'step':
      return 'ws-chat-step'
    case 'typed':
    case 'asked':
      return 'ws-msg ws-msg-you'
    case 'thinking':
    case 'reply':
    case 'reply-failed':
      return 'ws-msg ws-msg-ai'
    default:
      return 'ws-chat-note'
  }
}

function Entry({ entry, ...props }: { entry: ChatEntry } & EntryProps) {
  switch (entry.kind) {
    case 'step':
      return (
        <p className="ws-mono">
          {entry.stepNumber > 0 ? `STEP ${entry.stepNumber} · ${entry.title}` : 'ANOTHER STEP'}
        </p>
      )
    case 'typed':
      return (
        <>
          <p className="ws-mono ws-msg-label">{entry.spoken ? 'YOU SAID' : 'YOU TYPED'}</p>
          <p>{entry.text}</p>
        </>
      )
    case 'asked': {
      const q = entry.question
      return (
        <>
          <p className="ws-mono ws-msg-label">YOU ASKED AN EXPERT</p>
          {q.frameUrl && <img className="ws-msg-photo" src={q.frameUrl} alt="The photo you sent" />}
          <p>{q.question}</p>
          <p className="ws-msg-status">
            Asked {formatTime(q.createdAt)}
            {q.status === 'open' && (q.sent ? ', waiting for an expert to answer' : ', sending')}
          </p>
        </>
      )
    }
    case 'thinking':
      return <p className="ws-msg-status">Thinking…</p>
    case 'reply': {
      const { answer, source } = entry
      return (
        <>
          <p className="ws-mono ws-msg-label">
            <i className="ws-dot" aria-hidden="true" />
            {sourceLabel[source] ?? source.toUpperCase()}
          </p>
          {answer.text && <p>{answer.text}</p>}
          {answer.savedAnswer && (
            <div className="ws-msg-saved">
              <p className="ws-mono ws-note-label">FROM AN EXPERT · SAVED</p>
              <p>{answer.savedAnswer.answer}</p>
              <p className="ws-note-meta">
                From <b>{answer.savedAnswer.expertName}</b>
              </p>
            </div>
          )}
          {source === InferenceSource.ON_DEVICE && <p className="ws-msg-device">{ON_DEVICE_NOTE}</p>}
          {answer.unsure && entry.stepId === props.stepId && (
            <button type="button" className="ws-pill ws-pill-gold" onClick={() => props.onAskExpert(entry.question)}>
              Ask an expert
            </button>
          )}
        </>
      )
    }
    case 'reply-failed':
      return (
        <>
          <p>
            {entry.reason === 'limited'
              ? LIMITED_TEXT
              : entry.reason === 'unanswered'
                ? COULD_NOT_ANSWER_TEXT
                : 'The AI could not answer right now. Try again, or ask an expert.'}
          </p>
          {entry.stepId === props.stepId && (
            <button type="button" className="ws-pill ws-pill-gold" onClick={() => props.onAskExpert(entry.question)}>
              Ask an expert
            </button>
          )}
        </>
      )
    case 'auto': {
      const id = 'questionId' in entry.auto ? entry.auto.questionId : null
      return (
        <AutoAskCard
          autoAsk={entry.auto}
          asked={id ? props.questions.find((q) => q.id === id) : undefined}
          onChoose={entry.id === props.noticeId ? props.onChoose : undefined}
          onStep={entry.auto.stepId === props.stepId}
        />
      )
    }
    case 'judge-asked': {
      const q = entry.question
      return (
        <div className="ws-note">
          <p className="ws-mono ws-note-label">IN THE CLOUD · NOT SURE</p>
          <p>{q.judgeSaid ?? q.question}</p>
          <p className="ws-note-status">{q.reply ? 'An expert answered.' : 'Waiting for an expert to answer.'}</p>
        </div>
      )
    }
    case 'expert-reply': {
      const reply = entry.question.reply
      return (
        <div className="ws-note">
          <p className="ws-mono ws-note-label">REAL EXPERT · ANSWERED</p>
          <p>{reply?.text}</p>
          {reply?.expertName && (
            <p className="ws-note-meta">
              From <b>{reply.expertName}</b>
            </p>
          )}
        </div>
      )
    }
  }
}

function formatTime(date: Date | null): string {
  return date ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
}

function ChatIcon() {
  return (
    <svg className="ws-chat-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  )
}
