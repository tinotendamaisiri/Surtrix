import { useEffect, useRef, useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import AskExpert from './AskExpert.tsx'
import { useBenchWatch, type BenchWatch } from './benchWatch.ts'
import { grabFrameBase64 } from './cameraFrame.ts'
import type { StepSavedAnswers } from './SavedAnswerPicker.tsx'
import { useSavedAnswers } from './savedAnswers.ts'
import { goBack, goNext, markStepDone, startProgress, type CoachProgress, type CoachSkill } from './coach.ts'
import { describeBenchAnswer } from './watch.ts'
import { describeWiringCheck } from './wiring.ts'
import { checkWiring, type WiringResult } from './wiringCheck.ts'

// Where a wiring check result shows: under a step (by id), or on the All steps done screen.
const FINISHED = 'finished'

type Wiring =
  | { kind: 'checking'; stepId: string }
  // showOn is the next step (or FINISHED) for a correct verdict, else the checked step.
  | { kind: 'result'; stepId: string; showOn: string; stepNumber: number; result: WiringResult; frame: string }
  | { kind: 'failed'; stepId: string }

function Header() {
  return (
    <header>
      <h1>
        <a className="home-link" href="#">
          Surtrix
        </a>
      </h1>
    </header>
  )
}

// The coach for one skill. The learner moves through the steps by hand; while the camera
// is on, Gemini Nano watches the bench on device and the coach shows what it sees. Mark
// step done has the cloud model check the wiring first.
export default function Coach({ skill }: { skill: CoachSkill | undefined }) {
  if (!skill) {
    return (
      <main>
        <Header />
        <p>This skill could not be found.</p>
        <a href="#">Back to skills</a>
      </main>
    )
  }
  return <CoachScreen skill={skill} />
}

function CoachScreen({ skill }: { skill: CoachSkill }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // False once the learner leaves, so a camera that opens late is turned off at once.
  const onScreenRef = useRef(true)
  // True from the Start camera click until the camera opens or fails, so a second
  // click never opens a second camera that would stay on.
  const startingRef = useRef(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [progress, setProgress] = useState(() => startProgress(skill.steps.length))
  const [wiring, setWiring] = useState<Wiring | null>(null)
  const step = skill.steps[progress.stepIndex]
  const checking = wiring?.kind === 'checking'
  const watch = useBenchWatch(videoRef, cameraOn && !progress.finished, step.id, step.parts)
  // Every step's saved expert answers, loaded once (#31), so they still help offline.
  const saved = useSavedAnswers(skill)
  const stepSaved: StepSavedAnswers =
    saved.kind === 'loaded' ? { kind: 'loaded', answers: saved.byStep[step.id] ?? [] } : saved

  // The camera turns off when the learner leaves the coach.
  useEffect(() => {
    onScreenRef.current = true
    return () => {
      onScreenRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  async function startCamera() {
    if (startingRef.current || streamRef.current) return
    // Chrome only starts the on device model download right after a click.
    watch.prepare()
    startingRef.current = true
    setCameraStarting(true)
    setCameraError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      if (!onScreenRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      videoRef.current!.srcObject = stream
      setCameraOn(true)
      // If the camera stops on its own (for example the phone disconnects), Start camera
      // comes back.
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (streamRef.current !== stream) return
          stream.getTracks().forEach((t) => t.stop())
          streamRef.current = null
          if (videoRef.current) videoRef.current.srcObject = null
          setCameraOn(false)
        })
      }
    } catch {
      setCameraError(true)
    } finally {
      startingRef.current = false
      setCameraStarting(false)
    }
  }

  // Every step change ends the last wiring check: its result belongs to that step.
  function move(change: (p: CoachProgress) => CoachProgress) {
    setWiring(null)
    setProgress(change)
  }

  // One cloud check per click. Without a camera picture the step is marked done unchecked.
  async function markDone() {
    if (checking) return
    const frame = cameraOn ? grabFrameBase64(videoRef.current) : null
    if (!frame) {
      move(markStepDone)
      return
    }
    const index = progress.stepIndex
    setWiring({ kind: 'checking', stepId: step.id })
    try {
      const result = await checkWiring(step, frame)
      if (!onScreenRef.current) return
      const checked = { stepId: step.id, stepNumber: index + 1, result, frame }
      if (result.check.verdict === 'correct') {
        const next = index === skill.steps.length - 1 ? FINISHED : skill.steps[index + 1].id
        setWiring({ kind: 'result', ...checked, showOn: next })
        setProgress(markStepDone)
      } else {
        setWiring({ kind: 'result', ...checked, showOn: step.id })
      }
    } catch (e) {
      console.error('Wiring check failed', e)
      if (onScreenRef.current) setWiring({ kind: 'failed', stepId: step.id })
    }
  }

  const here = progress.finished ? FINISHED : step.id
  const shownResult = wiring?.kind === 'result' && wiring.showOn === here ? wiring : null
  const judgeOffer =
    shownResult?.result.check.verdict === 'unsure'
      ? { said: describeWiringCheck(shownResult.result.check), frame: shownResult.frame }
      : null
  const isFirst = progress.stepIndex === 0
  const isLast = progress.stepIndex === skill.steps.length - 1

  return (
    <main className="coach">
      <Header />

      <div className="coach-title">
        <a href="#">Back to skills</a>
        <h2>{skill.title}</h2>
      </div>

      <div className="coach-body">
        <section className="camera">
          <video ref={videoRef} autoPlay playsInline muted hidden={!cameraOn} />
          {!cameraOn && (
            <button type="button" onClick={startCamera} disabled={cameraStarting}>
              Start camera
            </button>
          )}
        </section>

        {progress.finished ? (
          <section className="step-card">
            <p className="step-heading">All steps done.</p>
            {shownResult && <WiringLine wiring={shownResult} />}
            <div className="step-buttons">
              <button type="button" onClick={() => move(() => startProgress(skill.steps.length))}>
                Start again
              </button>
              <a href="#">Back to skills</a>
            </div>
          </section>
        ) : (
          <section className="step-card">
            <p className="muted">
              Step {progress.stepIndex + 1} of {skill.steps.length}
              {progress.done[progress.stepIndex] && (
                <>
                  {' '}
                  <span className="done-mark">Done</span>
                </>
              )}
            </p>
            <p className="step-heading">{step.title}</p>
            <p>{step.instruction}</p>
            {step.parts.length > 0 && (
              <p>
                <span className="label">You need:</span> {step.parts.join(', ')}
              </p>
            )}
            <p>
              <span className="label">Done when:</span> {step.doneWhen}
            </p>
            <BenchLine watch={watch} cameraOn={cameraOn} />
            {checking && <p className="muted wiring">Checking the wiring.</p>}
            {shownResult && <WiringLine wiring={shownResult} />}
            {wiring?.kind === 'failed' && <p className="wiring error">Could not check the wiring right now.</p>}
            <div className="step-buttons">
              <button type="button" className="secondary" onClick={() => move(goBack)} disabled={isFirst || checking}>
                Back
              </button>
              <button type="button" className="secondary" onClick={() => move(goNext)} disabled={isLast || checking}>
                Next
              </button>
              <button type="button" onClick={markDone} disabled={checking}>
                Mark step done
              </button>
              {(wiring?.kind === 'failed' || (shownResult && shownResult.showOn === shownResult.stepId)) && (
                <button type="button" className="secondary" onClick={() => move(markStepDone)}>
                  Mark done anyway
                </button>
              )}
            </div>
            {!cameraOn && <p className="muted">Turn on the camera to check the wiring.</p>}
            <AskExpert
              step={{
                skillId: skill.id,
                skillTitle: skill.title,
                stepId: step.id,
                stepNumber: progress.stepIndex + 1,
                stepTitle: step.title,
                stepInstruction: step.instruction,
              }}
              captureFrame={() => (cameraOn ? grabFrameBase64(videoRef.current) : null)}
              savedAnswers={stepSaved}
              judgeOffer={judgeOffer}
            />
          </section>
        )}
      </div>

      {cameraError && <p className="error">Could not open the camera. Check the browser has permission to use it.</p>}
    </main>
  )
}

const sourceText: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'On device',
  [InferenceSource.IN_CLOUD]: 'Cloud',
}

// What watching the bench shows under the step: the latest answer, or why there is none.
function BenchLine({ watch, cameraOn }: { watch: BenchWatch; cameraOn: boolean }) {
  if (watch.deviceStatus === 'unavailable') {
    return <p className="muted bench">Watching the bench needs Chrome on a computer.</p>
  }
  if (watch.deviceStatus === 'downloading') {
    return (
      <p className="muted bench">
        Getting ready to watch the bench{watch.downloadPercent === null ? '.' : `: ${watch.downloadPercent}%`}
      </p>
    )
  }
  if (!cameraOn || watch.deviceStatus !== 'available') return null
  if (!watch.look) return <p className="muted bench">Watching the bench.</p>
  const { answer, source, at, ms } = watch.look
  return (
    <p className="bench">
      <span className="label">On the bench:</span> {describeBenchAnswer(answer)}{' '}
      <span className="muted">
        {sourceText[source] ?? source}, {at.toLocaleTimeString('en-US')}, {ms.toLocaleString('en-US')} ms
      </span>
    </p>
  )
}

// The wiring check's verdict, under the step it judged (or the next one when correct).
function WiringLine({ wiring }: { wiring: Extract<Wiring, { kind: 'result' }> }) {
  const { check, source, at, ms } = wiring.result
  const label =
    check.verdict === 'correct'
      ? `Step ${wiring.stepNumber} wiring check:`
      : check.verdict === 'not yet'
        ? 'Wiring check, not yet:'
        : 'Wiring check, not sure:'
  return (
    <p className={`wiring ${check.verdict === 'not yet' ? 'not-yet' : ''}`}>
      <span className="label">{label}</span> {describeWiringCheck(check)}{' '}
      <span className="muted">
        {sourceText[source] ?? source}, {at.toLocaleTimeString('en-US')}, {ms.toLocaleString('en-US')} ms
      </span>
    </p>
  )
}
