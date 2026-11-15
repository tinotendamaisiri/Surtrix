import { useEffect, useRef, useState } from 'react'
import { goBack, goNext, markStepDone, startProgress, type CoachSkill } from './coach.ts'

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

// The coach for one skill. No AI yet: the learner moves through the steps by hand.
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
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [progress, setProgress] = useState(() => startProgress(skill.steps.length))

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
    } catch {
      setCameraError(true)
    }
  }

  const step = skill.steps[progress.stepIndex]
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
            <button type="button" onClick={startCamera}>
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
              {progress.done[progress.stepIndex] && <span className="done-mark">Done</span>}
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
          </section>
        )}
      </div>

      {cameraError && <p className="error">Could not open the camera. Check the browser has permission to use it.</p>}
    </main>
  )
}
