// Check saved answers (#31), in the Ask an Expert panel: picks the saved expert answer for
// this step that fits the learner's question, and says which path picked it. When no model
// can pick here, it lists the step's saved answers as they are.
import { useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import type { SavedAnswer } from './savedAnswerPick'
import { pickSavedAnswer, type Pick } from './savedAnswers'

// This step's saved answers, as the coach loaded them.
export type StepSavedAnswers = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; answers: SavedAnswer[] }

const sourceText: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'On device',
  [InferenceSource.IN_CLOUD]: 'Cloud',
}

type Result = { kind: 'picked'; pick: Pick } | { kind: 'list' }

type Props = { stepTitle: string; question: string; saved: StepSavedAnswers }

export default function SavedAnswerPicker({ stepTitle, question, saved }: Props) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  if (saved.kind === 'loading') return <p className="muted">Loading saved answers</p>
  if (saved.kind === 'failed') return <p className="muted">Saved answers could not be loaded.</p>
  const { answers } = saved
  if (answers.length === 0) return <p className="muted">There are no saved answers for this step yet.</p>

  async function check() {
    if (checking || question.trim() === '') return
    setChecking(true)
    setResult(null)
    try {
      setResult({ kind: 'picked', pick: await pickSavedAnswer(stepTitle, question, answers) })
    } catch (e) {
      console.error('Picking a saved answer failed', e)
      setResult({ kind: 'list' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="saved-answers">
      <button type="button" className="secondary" onClick={check} disabled={checking || question.trim() === ''}>
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
              <p className="muted">
                Asked: {a.question} Answer from {a.expertName}:
              </p>
              <p>{a.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
