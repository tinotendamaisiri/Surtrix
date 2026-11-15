import { useEffect, useRef, useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import AskExpert from './AskExpert.tsx'
import { useBenchWatch, type BenchWatch } from './benchWatch.ts'
import { grabFrameBase64 } from './cameraFrame.ts'
import { goBack, goNext, markStepDone, startProgress, type CoachSkill } from './coach.ts'
import { describeBenchAnswer } from './watch.ts'

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
// is on, Gemini Nano watches the bench on device and the coach shows what it sees.
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
  const step = skill.steps[progress.stepIndex]
  const watch = useBenchWatch(videoRef, cameraOn && !progress.finished, step.id, step.parts)

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
            <div className="step-buttons">
              <button type="button" onClick={() => setProgress(startProgress(skill.steps.length))}>
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
            <div className="step-buttons">
              <button type="button" className="secondary" onClick={() => setProgress(goBack)} disabled={isFirst}>
                Back
              </button>
              <button type="button" className="secondary" onClick={() => setProgress(goNext)} disabled={isLast}>
                Next
              </button>
              <button type="button" onClick={() => setProgress(markStepDone)}>
                Mark step done
              </button>
            </div>
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
