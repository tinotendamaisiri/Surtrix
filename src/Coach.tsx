import { useEffect, useRef, useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import AskExpert, { type JudgeOffer } from './AskExpert.tsx'
import { useBenchWatch, type BenchWatch } from './benchWatch.ts'
import { grabFrameBase64 } from './cameraFrame.ts'
import type { StepSavedAnswers } from './SavedAnswerPicker.tsx'
import { useSavedAnswers } from './savedAnswers.ts'
import { goBack, goNext, markStepDone, startProgress, type CoachProgress, type CoachSkill } from './coach.ts'
import { describeBenchAnswer } from './watch.ts'
import { describeWiringCheck, WIRING_DEADLINE_MS, WIRING_GIVE_UP_MS } from './wiring.ts'
import { checkWiring, type WiringResult } from './wiringCheck.ts'
import Wordmark from './Wordmark.tsx'

// Where a wiring check result shows: under a step (by id), or on the All steps done screen.
const FINISHED = 'finished'

type Wiring =
  // slow: past the deadline, so the learner may carry on while the check runs.
  | { kind: 'checking'; stepId: string; slow: boolean }
  // showOn is the next step (or FINISHED) for a correct verdict, else the checked step.
  // offer is made once per result: Ask an Expert opens again for every new offer object.
  | { kind: 'result'; stepId: string; showOn: string; stepNumber: number; result: WiringResult; offer: JudgeOffer | null }
  | { kind: 'failed'; stepId: string }

function Header() {
  return (
    <header>
      <h1>
        <a className="home-link" href="#">
          <Wordmark />
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
  // Held only until the deadline: then Back, Next and Mark done anyway work again.
  const holding = checking && !wiring.slow
  // The running wiring check: its number, its cancel switch and its two timers (#9).
  const attemptRef = useRef(0)
  const runningRef = useRef<{ controller: AbortController; timers: ReturnType<typeof setTimeout>[] } | null>(null)
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
      // A wiring check still running is cancelled with the coach.
      runningRef.current?.timers.forEach(clearTimeout)
      runningRef.current?.controller.abort()
      runningRef.current = null
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

  // Ends the running wiring check, if any: a later answer belongs to a step the learner left,
  // so the call is cancelled and its answer, if it still comes, is dropped.
  function endWiringCheck() {
    attemptRef.current++
    const running = runningRef.current
    runningRef.current = null
    running?.timers.forEach(clearTimeout)
    running?.controller.abort()
  }

  // Every step change ends the last wiring check: its result belongs to that step.
  function move(change: (p: CoachProgress) => CoachProgress) {
    endWiringCheck()
    setWiring(null)
    setProgress(change)
  }

  // One cloud check per click. With the camera off the step is marked done unchecked.
  async function markDone() {
    if (checking) return
    if (!cameraOn) {
      move(markStepDone)
      return
    }
    const frame = grabFrameBase64(videoRef.current)
    // The camera is on but has no picture yet: nothing to check, so say so.
    if (!frame) {
      setWiring({ kind: 'failed', stepId: step.id })
      return
    }
    const index = progress.stepIndex
    endWiringCheck()
    const attempt = attemptRef.current
    const controller = new AbortController()
    const stillCurrent = () => onScreenRef.current && attemptRef.current === attempt
    runningRef.current = {
      controller,
      timers: [
        setTimeout(() => stillCurrent() && setWiring({ kind: 'checking', stepId: step.id, slow: true }), WIRING_DEADLINE_MS),
        setTimeout(() => controller.abort(), WIRING_GIVE_UP_MS),
      ],
    }
    setWiring({ kind: 'checking', stepId: step.id, slow: false })
    try {
      const result = await checkWiring(step, frame, controller.signal)
      if (!stillCurrent()) return
      endWiringCheck()
      const checked = { stepId: step.id, stepNumber: index + 1, result }
      if (result.check.verdict === 'correct') {
        const next = index === skill.steps.length - 1 ? FINISHED : skill.steps[index + 1].id
        setWiring({ kind: 'result', ...checked, showOn: next, offer: null })
        setProgress(markStepDone)
      } else {
        const offer = result.check.verdict === 'unsure' ? { said: describeWiringCheck(result.check), frame } : null
        setWiring({ kind: 'result', ...checked, showOn: step.id, offer })
      }
    } catch (e) {
      if (!stillCurrent()) return
      endWiringCheck()
      console.error('Wiring check failed', e)
      setWiring({ kind: 'failed', stepId: step.id })
    }
  }

  const here = progress.finished ? FINISHED : step.id
  const shownResult = wiring?.kind === 'result' && wiring.showOn === here ? wiring : null
  const judgeOffer = shownResult?.offer ?? null
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
            {checking && (
              <p className="muted wiring">
                {wiring.slow
                  ? 'Still checking the wiring. You can carry on; the answer will show here if you stay on this step.'
                  : 'Checking the wiring.'}
              </p>
            )}
            {shownResult && <WiringLine wiring={shownResult} />}
            {wiring?.kind === 'failed' && (
              <p className="wiring error">
                The wiring check is not available right now. Check saved answers or Ask an Expert below, or Mark done
                anyway.
              </p>
            )}
            <div className="step-buttons">
              <button type="button" className="secondary" onClick={() => move(goBack)} disabled={isFirst || holding}>
                Back
              </button>
              <button type="button" className="secondary" onClick={() => move(goNext)} disabled={isLast || holding}>
                Next
              </button>
              <button type="button" onClick={markDone} disabled={checking}>
                Mark step done
              </button>
              {(wiring?.kind === 'failed' ||
                (checking && wiring.slow) ||
                (shownResult && shownResult.showOn === shownResult.stepId)) && (
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
