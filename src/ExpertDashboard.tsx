// The expert dashboard at #expert (#20): an expert signs in with Google, sees every
// open question with the learner's photo and step, and replies.
import { useEffect, useState } from 'react'
import {
  AlreadyAnsweredError,
  REPLY_MAX_LENGTH,
  replyProblem,
  replyToQuestion,
  signInExpert,
  signOutExpert,
  watchExpertStatus,
  watchOpenQuestions,
  type Expert,
  type ExpertStatus,
  type OpenQuestion,
} from './experts'
import './ExpertDashboard.css'

function formatTime(date: Date | null): string {
  return date
    ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''
}

export default function ExpertDashboard() {
  const [status, setStatus] = useState<ExpertStatus>({ state: 'checking' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(
    () =>
      watchExpertStatus(setStatus, (e) => {
        console.error('Could not check the expert account', e)
        setError('Could not check your account. Reload the page to try again.')
      }),
    [],
  )

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      await signInExpert()
    } catch (e) {
      console.error('Google sign in failed', e)
      setError('Could not sign in with Google. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setError(null)
    await signOutExpert().catch((e) => {
      console.error('Sign out failed', e)
      setError('Could not sign out. Please try again.')
    })
  }

  return (
    <main className="expert-dashboard">
      <header>
        <h1>
          <a className="home-link" href="#">
            Surtrix
          </a>
        </h1>
        <p className="muted">Expert dashboard</p>
      </header>

      {status.state === 'checking' && <p className="muted">Checking your account</p>}

      {status.state === 'signed-out' && (
        <section className="expert-account">
          <p>For Surtrix experts. Sign in with the Google account the Surtrix team added.</p>
          <button type="button" onClick={signIn} disabled={busy}>
            Sign in with Google
          </button>
          <p className="muted">
            Signing in here replaces the learner on this browser, and with it their skills and questions. To learn and
            answer on one computer, use a separate browser profile for each.
          </p>
        </section>
      )}

      {status.state === 'not-expert' && (
        <section className="expert-account">
          <p>This Google account is not a Surtrix expert yet.</p>
          <p>
            Your user id is <code>{status.userId}</code>. Send it to the Surtrix team to be added.
          </p>
          <button type="button" className="secondary" onClick={signOut}>
            Sign out
          </button>
        </section>
      )}

      {status.state === 'expert' && (
        <>
          <section className="expert-account">
            <p>Signed in as {status.name}.</p>
            <button type="button" className="secondary" onClick={signOut}>
              Sign out
            </button>
          </section>
          <OpenQuestions expert={{ userId: status.userId, name: status.name }} />
        </>
      )}

      {error && <p className="error">{error}</p>}
    </main>
  )
}

function OpenQuestions({ expert }: { expert: Expert }) {
  const [questions, setQuestions] = useState<OpenQuestion[] | null>(null)
  const [listFailed, setListFailed] = useState(false)
  // Cards with a reply typed or sending stay on screen when their question stops being
  // open: Firestore drops it from the list as soon as Send is pressed, and another
  // expert may answer first. The card then shows what happened.
  const [held, setHeld] = useState<Record<string, OpenQuestion>>({})

  useEffect(
    () =>
      watchOpenQuestions(
        (open) => {
          setQuestions(open)
          setListFailed(false)
        },
        (e) => {
          console.error('Could not list open questions', e)
          setListFailed(true)
        },
      ),
    [],
  )

  function hold(question: OpenQuestion, keep: boolean) {
    setHeld((current) => {
      if (keep === question.id in current) return current
      const next = { ...current }
      if (keep) next[question.id] = question
      else delete next[question.id]
      return next
    })
  }

  if (listFailed) return <p className="error">Could not load the questions. Reload the page to try again.</p>
  if (questions === null) return <p className="muted">Loading questions</p>
  const openIds = new Set(questions.map((question) => question.id))
  const shown = [...questions, ...Object.values(held).filter((question) => !openIds.has(question.id))].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  )
  if (shown.length === 0) return <p className="muted">No open questions.</p>
  return (
    <section className="open-questions">
      <h2>Open questions ({questions.length})</h2>
      {shown.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          expert={expert}
          stillOpen={openIds.has(question.id)}
          hold={(keep) => hold(question, keep)}
        />
      ))}
    </section>
  )
}

type CardProps = {
  question: OpenQuestion
  expert: Expert
  // False once the question is no longer in the open list.
  stillOpen: boolean
  // Keeps the card on screen (true) or lets it go (false).
  hold: (keep: boolean) => void
}

function QuestionCard({ question, expert, stillOpen, hold }: CardProps) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Answered by someone else while this card was held (not by this card's own send).
  const answeredElsewhere = !stillOpen && !sending && error === null

  function changeReply(value: string) {
    setReply(value)
    hold(value.trim() !== '')
  }

  async function send() {
    if (replyProblem(reply)) return
    hold(true)
    setSending(true)
    setError(null)
    try {
      await replyToQuestion(question, reply, expert)
      // Answered: the question has left the open list, so the card goes too.
      hold(false)
    } catch (e) {
      console.error('Could not send the reply', e)
      setError(
        e instanceof AlreadyAnsweredError
          ? 'This question was already answered. Your reply was not sent.'
          : 'Could not send your reply. Please try again.',
      )
      setSending(false)
    }
  }

  return (
    <article className="question-card">
      {question.frameUrl && <img src={question.frameUrl} alt="The learner's photo" />}
      <div className="question-details">
        <p className="muted">
          {question.skillTitle}, step {question.stepNumber}: {question.stepTitle}
        </p>
        <p className="muted">{question.stepInstruction}</p>
        <p className="question-text">{question.question}</p>
        {question.judgeSaid !== null && <p className="muted">The check was not sure: {question.judgeSaid}</p>}
        <p className="muted">Asked {formatTime(question.createdAt)}</p>
        <label className="question">
          Your reply
          <textarea
            rows={3}
            maxLength={REPLY_MAX_LENGTH}
            value={reply}
            onChange={(e) => changeReply(e.target.value)}
            disabled={sending}
          />
        </label>
        {answeredElsewhere && <p className="error">This question was already answered. Your reply was not sent.</p>}
        <div className="reply-actions">
          <button
            type="button"
            onClick={send}
            disabled={sending || !stillOpen || replyProblem(reply) !== null}
          >
            {sending ? 'Sending' : 'Send reply'}
          </button>
          {!stillOpen && !sending && (
            <button type="button" className="secondary" onClick={() => hold(false)}>
              Remove
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </article>
  )
}
