// Ask an Expert (#17). The coach renders this for the current step: the button, the
// panel that sends a question with the camera frame, and this learner's questions
// for the step with their replies, live.
import { useEffect, useState } from 'react'
import {
  askExpert,
  FrameTooLargeError,
  QUESTION_MAX_LENGTH,
  questionProblem,
  watchMyQuestions,
  type Question,
  type QuestionStep,
} from './questions'
import './AskExpert.css'

// Made by the judge (plan issue 6) when it is unsure about the step: its words and the
// frame it judged, as a base64 JPEG.
export type JudgeOffer = { said: string; frame: string }

type Props = {
  step: QuestionStep
  // The current camera frame as a base64 JPEG, or null when the camera is off.
  captureFrame: () => string | null
  // A new offer object opens the panel with the judge's words and frame. Keep the same
  // object between renders (for example in state), or it opens again.
  judgeOffer?: JudgeOffer | null
}

// What the open panel holds. It belongs to the step it was opened on.
type Draft = { stepKey: string; frame: string | null; question: string; judgeSaid: string | null }

type MyQuestions = { stepKey: string; questions: Question[]; failed: boolean }

const JUDGE_QUESTION = 'Is my wiring right for this step?'

function formatTime(date: Date | null): string {
  return date ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
}

export default function AskExpert({ step, captureFrame, judgeOffer = null }: Props) {
  const { skillId, stepId } = step
  const stepKey = JSON.stringify([skillId, stepId])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState<MyQuestions | null>(null)
  const [seenOffer, setSeenOffer] = useState<JudgeOffer | null>(null)

  // A new judge offer opens the panel (adjusting state while rendering, as React
  // recommends over an effect).
  if (judgeOffer !== seenOffer) {
    setSeenOffer(judgeOffer)
    if (judgeOffer) {
      setDraft({ stepKey, frame: judgeOffer.frame, question: JUDGE_QUESTION, judgeSaid: judgeOffer.said })
      setError(null)
    }
  }

  useEffect(() => {
    const key = JSON.stringify([skillId, stepId])
    return watchMyQuestions(
      { skillId, stepId },
      (questions) => setMine({ stepKey: key, questions, failed: false }),
      (e) => {
        console.error('Could not list questions', e)
        setMine({ stepKey: key, questions: [], failed: true })
      },
    )
  }, [skillId, stepId])

  // A panel opened on another step is closed: its question would be about the wrong step.
  const open = draft !== null && draft.stepKey === stepKey
  const questions = mine?.stepKey === stepKey ? mine.questions : []
  const listFailed = mine?.stepKey === stepKey && mine.failed

  function openPanel() {
    setDraft({ stepKey, frame: captureFrame(), question: '', judgeSaid: null })
    setError(null)
  }

  async function send() {
    if (!draft?.frame || questionProblem(draft.question)) return
    setSending(true)
    setError(null)
    try {
      await askExpert({ step, question: draft.question, frameBase64: draft.frame, judgeSaid: draft.judgeSaid })
      setDraft(null)
    } catch (e) {
      console.error('Could not send the question', e)
      setError(
        e instanceof FrameTooLargeError
          ? 'The photo is too large to send. Retake it.'
          : 'Could not send your question. Please try again.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="ask-expert">
      {!open && (
        <button type="button" onClick={openPanel}>
          Ask an Expert
        </button>
      )}

      {open && (
        <div className="ask-panel">
          <h2>Ask an Expert</h2>
          {draft.judgeSaid !== null && <p className="muted">The check was not sure: {draft.judgeSaid}</p>}
          {draft.frame ? (
            <img src={`data:image/jpeg;base64,${draft.frame}`} alt="The photo the expert will see" />
          ) : (
            <p className="muted">Start the camera to send a photo with your question.</p>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => setDraft({ ...draft, frame: captureFrame() })}
            disabled={sending}
          >
            Retake
          </button>
          <label className="question">
            Your question
            <textarea
              rows={3}
              maxLength={QUESTION_MAX_LENGTH}
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              disabled={sending}
            />
          </label>
          <p className="muted">An expert will see this photo and your question.</p>
          <div className="ask-actions">
            <button
              type="button"
              onClick={send}
              disabled={sending || !draft.frame || questionProblem(draft.question) !== null}
            >
              {sending ? 'Sending' : 'Send'}
            </button>
            <button type="button" className="secondary" onClick={() => setDraft(null)} disabled={sending}>
              Cancel
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {listFailed && <p className="error">Could not load your questions. Reload the page to try again.</p>}

      {questions.length > 0 && (
        <ul className="my-questions">
          {questions.map((q) => (
            <li key={q.id}>
              {q.frameUrl && <img src={q.frameUrl} alt="The photo you sent" />}
              <div>
                <p>{q.question}</p>
                <p className="muted">
                  Asked {formatTime(q.createdAt)}
                  {q.status === 'open' && ', waiting for an expert'}
                </p>
                {q.reply && (
                  <div className="reply">
                    <p className="muted">Expert answer{q.reply.expertName && ` from ${q.reply.expertName}`}</p>
                    <p>{q.reply.text}</p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
