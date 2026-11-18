// Ask an Expert (#17). The Workspace chat (#74) renders this panel for the current step: it
// sends a question with the camera frame. The learner's questions and their replies show in
// the chat.
import { useEffect, useRef, useState } from 'react'
import { askExpert, FrameTooLargeError, QUESTION_MAX_LENGTH, questionProblem, type QuestionStep } from './questions'
import { questionAfterNewCheck } from './autoAsk.ts'
import './AskExpert.css'

// Made by the judge (plan issue 6) when it is unsure about the step: its words and the
// frame it judged, as a base64 JPEG.
export type JudgeOffer = { said: string; frame: string }

// Opens the panel with this photo (taken when the learner asked, null with the camera off)
// and this question. A new object opens it again.
export type AskRequest = { question: string; frame: string | null }

type Props = {
  step: QuestionStep
  // The current camera frame as a base64 JPEG, or null when the camera is off.
  captureFrame: () => string | null
  // A new offer object opens the panel with the judge's words and frame. Keep the same
  // object between renders (for example in state), or it opens again.
  judgeOffer?: JudgeOffer | null
  // Ask an Expert in the chat, or an AI reply's Ask an expert. Keep the same object between
  // renders, as for judgeOffer.
  askRequest?: AskRequest | null
  // Told whether the panel is open with a question not yet sent (#69).
  onPanelChange?: (open: boolean) => void
  // Why Send is off, or null when it is on (#69).
  sendBlocked?: string | null
}

// What the open panel holds. id tells one opened question from the next.
type Draft = { id: number; frame: string | null; question: string; judgeSaid: string | null }

let lastDraftId = 0
function newDraftId(): number {
  lastDraftId += 1
  return lastDraftId
}

// How long Send waits for the server before closing the panel. Offline, the question
// stays in the list as sending and goes once the network is back.
const SEND_WAIT_MS = 8000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}


export default function AskExpert({
  step,
  captureFrame,
  judgeOffer = null,
  askRequest = null,
  onPanelChange,
  sendBlocked = null,
}: Props) {
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
  const [shownStepKey, setShownStepKey] = useState(stepKey)
  const [seenOffer, setSeenOffer] = useState<JudgeOffer | null>(null)
  // A request from before the panel was shown again (for example after Start again) is old.
  const [seenRequest, setSeenRequest] = useState<AskRequest | null>(askRequest)

  // State is adjusted while rendering, as React recommends over an effect.
  // A different step drops an unsent question: it would be about the wrong step.
  if (stepKey !== shownStepKey) {
    setShownStepKey(stepKey)
    setDraft(null)
    setError(null)
    setLateError(false)
  }
  // A new judge offer opens the panel, or, when it is already open, brings in its photo and
  // the check's words, keeping a question the learner typed (#69). A question being sent is
  // left alone.
  if (judgeOffer !== seenOffer) {
    setSeenOffer(judgeOffer)
    if (judgeOffer && !sending) {
      setDraft({
        id: newDraftId(),
        frame: judgeOffer.frame,
        question: questionAfterNewCheck(draft?.question ?? null),
        judgeSaid: judgeOffer.said.trim() || null,
      })
      setError(null)
      setLateError(false)
    }
  }
  // Ask an Expert from the chat opens the panel with a new photo, and the learner's message
  // when it came from an AI reply. An open panel keeps its photo, the check's words and what
  // the learner typed; only an empty question takes the message.
  if (askRequest !== seenRequest) {
    setSeenRequest(askRequest)
    if (askRequest && draft) {
      if (!sending && draft.question.trim() === '' && askRequest.question !== '') {
        setDraft({ ...draft, question: askRequest.question })
      }
    } else if (askRequest) {
      setDraft({ id: newDraftId(), frame: askRequest.frame, question: askRequest.question, judgeSaid: null })
      setError(null)
      setLateError(false)
    }
  }

  const draftId = draft?.id ?? null
  useEffect(() => {
    draftIdRef.current = draftId
  }, [draftId])

  const open = draft !== null
  // Reported after render, so the coach knows before it would ask by itself (#69).
  useEffect(() => {
    onPanelChange?.(open)
  }, [open, onPanelChange])
  async function send() {
    if (!draft?.frame || questionProblem(draft.question) || sending || sendBlocked) return
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
              disabled={sending || sendBlocked !== null || !draft.frame || questionProblem(draft.question) !== null}
            >
              {sending ? 'Sending' : 'Send'}
            </button>
            <button type="button" className="secondary" onClick={() => setDraft(null)} disabled={sending}>
              Cancel
            </button>
          </div>
          {sendBlocked && <p className="muted">{sendBlocked}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {lateError && <p className="error">Your last question could not be sent. Please ask again.</p>}

    </section>
  )
}
