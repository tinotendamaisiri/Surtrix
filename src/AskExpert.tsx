// Ask an Expert (#17). The coach renders this for the current step: the button, the
// panel that sends a question with the camera frame, and this learner's questions
// for the step with their replies, live.
import { useEffect, useRef, useState } from 'react'
import {
  askExpert,
  FrameTooLargeError,
  QUESTION_MAX_LENGTH,
  questionProblem,
  watchMyQuestions,
  type Question,
  type QuestionStep,
} from './questions'
import SavedAnswerPicker, { type StepSavedAnswers } from './SavedAnswerPicker.tsx'
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
  // This step's saved expert answers (#31), for Check saved answers. Left out, the panel
  // has no Check saved answers.
  savedAnswers?: StepSavedAnswers
}

// What the open panel holds. id tells one opened question from the next.
type Draft = { id: number; frame: string | null; question: string; judgeSaid: string | null }

let lastDraftId = 0
function newDraftId(): number {
  lastDraftId += 1
  return lastDraftId
}

type MyQuestions = { stepKey: string; questions: Question[]; failed: boolean }

const JUDGE_QUESTION = 'Is my wiring right for this step?'

// How long Send waits for the server before closing the panel. Offline, the question
// stays in the list as sending and goes once the network is back.
const SEND_WAIT_MS = 8000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatTime(date: Date | null): string {
  return date ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
}

export default function AskExpert({ step, captureFrame, judgeOffer = null, savedAnswers }: Props) {
  const { skillId, stepId } = step
  const stepKey = JSON.stringify([skillId, stepId])
  const [draft, setDraft] = useState<Draft | null>(null)
  // The draft being sent. The learner may move on, and open another, while it sends.
  const [sendingId, setSendingId] = useState<number | null>(null)
  const sending = draft !== null && sendingId === draft.id
  const draftIdRef = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A question that was still sending when the panel closed, and then failed.
  const [lateError, setLateError] = useState(false)
  const [mine, setMine] = useState<MyQuestions | null>(null)
  const [shownStepKey, setShownStepKey] = useState(stepKey)
  const [seenOffer, setSeenOffer] = useState<JudgeOffer | null>(null)

  // State is adjusted while rendering, as React recommends over an effect.
  // A different step drops an unsent question: it would be about the wrong step.
  if (stepKey !== shownStepKey) {
    setShownStepKey(stepKey)
    setDraft(null)
    setError(null)
    setLateError(false)
  }
  // A new judge offer opens the panel.
  if (judgeOffer !== seenOffer) {
    setSeenOffer(judgeOffer)
    if (judgeOffer) {
      setDraft({
        id: newDraftId(),
        frame: judgeOffer.frame,
        question: JUDGE_QUESTION,
        judgeSaid: judgeOffer.said.trim() || null,
      })
      setError(null)
      setLateError(false)
    }
  }

  const draftId = draft?.id ?? null
  useEffect(() => {
    draftIdRef.current = draftId
  }, [draftId])

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

  const open = draft !== null
  const questions = mine?.stepKey === stepKey ? mine.questions : []
  const listFailed = mine?.stepKey === stepKey && mine.failed

  function openPanel() {
    setDraft({ id: newDraftId(), frame: captureFrame(), question: '', judgeSaid: null })
    setError(null)
    setLateError(false)
  }

  async function send() {
    if (!draft?.frame || questionProblem(draft.question) || sending) return
    const sentId = draft.id
    // False once this panel is gone: closed by a step change, or another one opened.
    const stillOpen = () => draftIdRef.current === sentId
    setSendingId(sentId)
    setError(null)
    try {
      const { saved } = await askExpert({
        step,
        question: draft.question,
        frameBase64: draft.frame,
        judgeSaid: draft.judgeSaid,
      })
      const sentInTime = await Promise.race([saved.then(() => true), wait(SEND_WAIT_MS).then(() => false)])
      if (!sentInTime) {
        saved.catch((e: unknown) => {
          console.error('Could not send the question', e)
          setLateError(true)
        })
      }
      if (stillOpen()) setDraft(null)
    } catch (e) {
      console.error('Could not send the question', e)
      if (!stillOpen()) setLateError(true)
      else
        setError(
          e instanceof FrameTooLargeError
            ? 'The photo is too large to send. Retake it.'
            : 'Could not send your question. Please try again.',
        )
    } finally {
      setSendingId((current) => (current === sentId ? null : current))
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
            {draft.frame ? 'Retake' : 'Take photo'}
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
            {savedAnswers && (
              <SavedAnswerPicker
                key={draft.id}
                stepTitle={step.stepTitle}
                question={draft.question}
                saved={savedAnswers}
                disabled={sending}
              />
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {lateError && <p className="error">Your last question could not be sent. Please ask again.</p>}

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
                  {!q.sent ? ', sending' : q.status === 'open' && ', waiting for an expert'}
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
