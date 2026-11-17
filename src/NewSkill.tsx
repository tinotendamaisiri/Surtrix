import { useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import { demoProcedureText } from './demoSkill'
import {
  MAX_PDF_BYTES,
  MAX_TEXT_CHARACTERS,
  PROCEDURE_MODEL,
  procedureToSteps,
  type ProcedureSteps,
} from './procedure'
import { coachHash } from './screenAddress'
import { saveSkill } from './skills'
import BackToSkills from './BackToSkills.tsx'
import Wordmark from './Wordmark.tsx'

type Input = 'pdf' | 'text'

const sourceText: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'On device',
  [InferenceSource.IN_CLOUD]: 'Cloud',
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// A real PDF starts with %PDF-, whatever the file is named.
async function isPdf(file: File): Promise<boolean> {
  return (await file.slice(0, 5).text()) === '%PDF-'
}

// Upload a PDF or paste a procedure, review the steps the model made from it, and save
// them as a skill.
export default function NewSkill() {
  const [input, setInput] = useState<Input>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProcedureSteps | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const textTooLong = text.length > MAX_TEXT_CHARACTERS
  const ready = input === 'pdf' ? file !== null : text.trim() !== '' && !textTooLong

  // Switching between PDF and text clears the file, since the file input comes back empty.
  function chooseInput(chosen: Input) {
    setInput(chosen)
    setFile(null)
    setFileError(null)
    setError(null)
  }

  // Fills the text box with the demo procedure. Nothing is sent until Make steps.
  function trySample() {
    chooseInput('text')
    setText(demoProcedureText)
  }

  async function chooseFile(chosen: File | undefined) {
    setFile(null)
    setFileError(null)
    setError(null)
    if (!chosen) return
    if (chosen.size === 0) setFileError('This PDF is empty. Choose another file.')
    else if (chosen.size > MAX_PDF_BYTES) setFileError('This PDF is too large. Choose one under 10 MB.')
    else if (!(await isPdf(chosen))) setFileError('Choose a PDF file.')
    else setFile(chosen)
  }

  async function makeSteps() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const procedure =
        input === 'pdf' ? { kind: 'pdf' as const, base64: await readBase64(file!) } : { kind: 'text' as const, text }
      setResult(await procedureToSteps(procedure))
    } catch (e) {
      console.error('Making steps failed', e)
      setError('Could not turn this into steps. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!result?.skill || saving) return
    setSaving(true)
    setError(null)
    try {
      const skillId = await saveSkill(result.skill)
      location.hash = coachHash(skillId)
    } catch (e) {
      console.error('Saving the skill failed', e)
      setError('Could not save the skill. Please try again.')
      setSaving(false)
    }
  }

  function startOver() {
    setResult(null)
    setError(null)
    setFile(null)
    setFileError(null)
    setText('')
  }

  return (
    <main>
      <header>
        <h1>
          <Wordmark />
        </h1>
        <p className="muted">New skill</p>
        <p>
          <BackToSkills tab="mine" />
        </p>
      </header>

      {!result && (
        <section className="controls">
          <fieldset disabled={busy}>
            <legend>Procedure</legend>
            <label>
              <input type="radio" name="input" checked={input === 'pdf'} onChange={() => chooseInput('pdf')} />
              Upload a PDF
            </label>
            <label>
              <input type="radio" name="input" checked={input === 'text'} onChange={() => chooseInput('text')} />
              Paste text
            </label>
          </fieldset>
          <p>
            <button type="button" className="secondary" onClick={trySample} disabled={busy}>
              Try a sample
            </button>
          </p>

          {input === 'pdf' ? (
            <label className="question">
              PDF file, up to 10 MB
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
            </label>
          ) : (
            <label className="question">
              Procedure text
              <textarea rows={12} value={text} disabled={busy} onChange={(e) => {
                  setText(e.target.value)
                  setError(null)
                }} />
              <span className={textTooLong ? 'error' : 'muted'}>
                {text.length.toLocaleString('en-US')} of {MAX_TEXT_CHARACTERS.toLocaleString('en-US')} characters
                {textTooLong && '. Shorten the text to make steps.'}
              </span>
            </label>
          )}
          {input === 'pdf' && fileError && <p className="error">{fileError}</p>}

          <button type="button" onClick={makeSteps} disabled={!ready || busy}>
            {busy ? 'Reading the procedure' : 'Make steps'}
          </button>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="skill">
          {result.skill ? (
            <>
              <h2>{result.skill.title}</h2>
              <ol>
                {result.skill.steps.map((step, i) => (
                  <li key={i}>
                    <p className="step-title">{step.title}</p>
                    <p>{step.instruction}</p>
                    {step.parts.length > 0 && <p className="muted">Parts: {step.parts.join(', ')}</p>}
                    <p className="muted">Done when: {step.doneWhen}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>No steps were found. Try a document that lists the steps of a procedure.</p>
          )}
          <dl>
            <dt>Made by</dt>
            <dd>
              {sourceText[result.source] ?? result.source}, {PROCEDURE_MODEL}
            </dd>
            <dt>Time</dt>
            <dd>{result.ms.toLocaleString('en-US')} ms</dd>
          </dl>
          <div className="actions">
            {result.skill && (
              <button type="button" onClick={save} disabled={saving}>
                {saving ? 'Saving' : 'Save skill'}
              </button>
            )}
            <button type="button" className="secondary" onClick={startOver} disabled={saving}>
              Start over
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
