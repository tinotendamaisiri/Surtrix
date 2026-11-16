// Check saved answers (#31), in the Ask an Expert panel's row of buttons: picks the saved
// expert answer for this step that fits the learner's question, and says which path picked
// it. When no model can pick here, it lists the step's saved answers as they are.
import { useEffect, useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import { checkSavedAnswers, type CheckResult, type SavedAnswer } from './savedAnswerPick'
import { pickSavedAnswer, warmUpPicker, type Pick } from './savedAnswers'
import './SavedAnswerPicker.css'

// This step's saved answers, as the coach loaded them.
export type StepSavedAnswers = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; answers: SavedAnswer[] }

const sourceText: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'On device',
  [InferenceSource.IN_CLOUD]: 'Cloud',
}

// disabled while the panel sends the question to an expert.
type Props = { stepTitle: string; question: string; saved: StepSavedAnswers; disabled?: boolean }

export default function SavedAnswerPicker({ stepTitle, question, saved, disabled = false }: Props) {
  const [checking, setChecking] = useState(false)
  // The result and the question it was for: an edited question hides an old result.
  const [checked, setChecked] = useState<{ question: string; result: CheckResult<Pick> } | null>(null)
  // The panel is open: get Nano ready for this step's answers, so the first pick is quick.
  const warmAnswers = saved.kind === 'loaded' && saved.answers.length > 0 ? saved.answers : null
  useEffect(() => {
    if (warmAnswers) void warmUpPicker(stepTitle, warmAnswers)
  }, [stepTitle, warmAnswers])

  if (saved.kind !== 'loaded' || saved.answers.length === 0) {
    return (
      <div className="saved-answers">
        <p className="muted">
          {saved.kind === 'loading'
            ? 'Loading saved answers.'
            : saved.kind === 'failed'
              ? 'Saved answers could not be loaded.'
              : 'There are no saved answers for this step yet.'}
        </p>
      </div>
    )
  }
  const { answers } = saved
  const result = checked?.question === question ? checked.result : null

  async function check() {
    if (checking || question.trim() === '') return
    const asked = question
    setChecking(true)
    setChecked(null)
    const outcome = await checkSavedAnswers(() => pickSavedAnswer(stepTitle, asked, answers))
    setChecked({ question: asked, result: outcome })
    setChecking(false)
  }

  return (
    <div className="saved-answers">
      <button
        type="button"
        className="secondary"
        onClick={check}
        disabled={disabled || checking || question.trim() === ''}
      >
        {checking ? 'Checking saved answers' : 'Check saved answers'}
      </button>
      {result?.kind === 'picked' && (
        <div className="reply">
          {result.pick.answer ? (
            <>
              <p className="muted">Saved answer from {result.pick.answer.expertName}</p>
              <p>{result.pick.answer.answer}</p>
            </>
          ) : (
            <p>No saved answer fits. Ask an expert.</p>
          )}
          <p className="muted">
            Checked: {sourceText[result.pick.source] ?? result.pick.source}, {result.pick.ms.toLocaleString('en-US')} ms
          </p>
        </div>
      )}
      {result?.kind === 'list' && (
        <div className="reply">
          <p className="muted">Could not check here, so these are all the saved answers for this step.</p>
          {answers.map((a) => (
            <div key={a.id}>
              <p className="muted">Asked: {a.question}</p>
              <p className="muted">Answer from {a.expertName}:</p>
              <p>{a.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
