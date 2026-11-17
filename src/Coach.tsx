import { useCallback, useEffect, useRef, useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import AskExpert, { type JudgeOffer } from './AskExpert.tsx'
import { useBenchWatch, type BenchWatch } from './benchWatch.ts'
import { grabFrameBase64 } from './cameraFrame.ts'
import type { StepSavedAnswers } from './SavedAnswerPicker.tsx'
import { pickSavedAnswer, useSavedAnswers, type Pick as SavedPick } from './savedAnswers.ts'
import {
  goBack,
  goNext,
  goToStep,
  markStepDone,
  startProgress,
  type CoachProgress,
  type CoachSkill,
  type CoachStep,
} from './coach.ts'
import { describeBenchAnswer } from './watch.ts'
import { describeWiringCheck, WIRING_DEADLINE_MS, WIRING_GIVE_UP_MS } from './wiring.ts'
import { checkWiring, type WiringResult } from './wiringCheck.ts'
import BackToSkills from './BackToSkills.tsx'
import { skillsTabFor } from './landingIntent.ts'
import { expertCards, skillParts } from './workspace.ts'
import { askExpert, watchMyQuestions, type Question } from './questions.ts'
import { checkSavedAnswers } from './savedAnswerPick.ts'
import {
  AUTO_QUESTION,
  afterNoFit,
  autoAskedThisSession,
  countAutoAsk,
  manualSendBlocked,
  MANUAL_SEND_BLOCKED,
  readAutoAskChoice,
  uncountAutoAsk,
  writeAutoAskChoice,
  type AutoAskChoice,
} from './autoAsk.ts'
import AutoAskCard, { type AutoAsk } from './AutoAskCard.tsx'
import { ExpertsCard, PartsList, StepList, WorkspaceShell, WorkspaceTopBar } from './WorkspacePanels.tsx'

// Where a wiring check result shows: under a step (by id), or on the All steps done screen.
const FINISHED = 'finished'

type Wiring =
  // slow: past the deadline, so the learner may carry on while the check runs.
  | { kind: 'checking'; stepId: string; slow: boolean }
  // showOn is the next step (or FINISHED) for a correct verdict, else the checked step.
  | { kind: 'result'; stepId: string; showOn: string; stepNumber: number; result: WiringResult }
  | { kind: 'failed'; stepId: string }

// The Surtrix Workspace (#62) for one skill: the parts and steps on the left, the camera
// in the middle, the step, the last wiring check and the expert answers on the right.
// The learner moves through the steps by hand; while the camera is on, Gemini Nano
// watches the bench on device. Mark step done has the cloud model check the wiring first.
export default function Coach({ skill }: { skill: CoachSkill | undefined }) {
  if (!skill) {
    return (
      <WorkspaceShell top={<WorkspaceTopBar exitTab="all" />}>
        <section className="ws-message ws-panel">
          <p>This skill could not be found.</p>
          <BackToSkills tab="all" className="ws-pill" />
        </section>
      </WorkspaceShell>
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
  // How many cameras the device has: Switch camera shows only with more than one.
  const [cameraCount, setCameraCount] = useState(0)
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

  // Where Ask an Expert sits. On stacked layouts it is below the step, so an unsure
  // verdict that opens it scrolls it into view.
  const notSureRef = useRef<HTMLElement>(null)

  // The AI asking an expert by itself when the wiring check is unsure (#65).
  const [autoAsk, setAutoAsk] = useState<AutoAsk | null>(null)
  // Opens the manual Ask an Expert panel with the check's words and photo: when automatic
  // asking is off, past the limit, or when asking failed.
  const [manualOffer, setManualOffer] = useState<JudgeOffer | null>(null)
  const [autoChoice, setAutoChoice] = useState<AutoAskChoice>(readAutoAskChoice)
  const [unsureCount, setUnsureCount] = useState(0)
  // Whether the manual Ask an Expert panel is open with a question not yet sent (#69).
  const panelOpenRef = useRef(false)
  const onPanelChange = useCallback((open: boolean) => {
    panelOpenRef.current = open
    // Cancelled: the "asking below" line no longer holds.
    if (!open) setAutoAsk((a) => (a?.kind === 'panel-open' ? null : a))
  }, [])
  // This learner's questions on the current step, live: an open one blocks a new automatic one.
  const [mine, setMine] = useState<{ stepId: string; questions: Question[] }>({ stepId: '', questions: [] })
  const mineRef = useRef(mine)
  const savedRef = useRef(saved)
  const choiceRef = useRef(autoChoice)
  // Each automatic run's number: a step change or a new run makes an older one stop.
  const runRef = useRef(0)
  useEffect(() => {
    mineRef.current = mine
    savedRef.current = saved
    choiceRef.current = autoChoice
  })
  useEffect(() => {
    const stepId = step.id
    return watchMyQuestions(
      { skillId: skill.id, stepId },
      (questions) => setMine({ stepId, questions }),
      (e) => console.error('Watching your questions failed', e),
    )
  }, [skill.id, step.id])

  // Counts the cameras now and whenever one is plugged in or out.
  useEffect(() => {
    const devices = navigator.mediaDevices
    if (!devices?.enumerateDevices) return
    let current = true
    const count = () =>
      devices
        .enumerateDevices()
        .then((all) => current && setCameraCount(all.filter((d) => d.kind === 'videoinput').length))
        .catch(() => {})
    count()
    devices.addEventListener?.('devicechange', count)
    return () => {
      current = false
      devices.removeEventListener?.('devicechange', count)
    }
  }, [])

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

  // Opens a camera (a given one, or the browser's choice) in place of the current one.
  async function openCamera(deviceId?: string) {
    if (startingRef.current) return
    // Chrome only starts the on device model download right after a click.
    watch.prepare()
    startingRef.current = true
    setCameraStarting(true)
    setCameraError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      })
      if (!onScreenRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = stream
      videoRef.current!.srcObject = stream
      setCameraOn(true)
      // Labels and the full list are known only once a camera is allowed.
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => onScreenRef.current && setCameraCount(all.filter((d) => d.kind === 'videoinput').length))
        .catch(() => {})
      // If the camera stops on its own (for example the phone disconnects), Start camera
      // comes back.
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (streamRef.current !== stream) return
          stopCamera()
        })
      }
    } catch {
      setCameraError(true)
    } finally {
      startingRef.current = false
      setCameraStarting(false)
    }
  }

  function startCamera() {
    if (streamRef.current) return
    void openCamera()
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  // The next camera in the device's list after the one in use.
  async function switchCamera() {
    const inUse = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
    if (cameras.length < 2) return
    const at = cameras.findIndex((c) => c.deviceId === inUse)
    // Some phones cannot open two cameras at once, so the one in use closes first.
    stopCamera()
    await openCamera(cameras[(at + 1) % cameras.length].deviceId)
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
    runRef.current++
    setAutoAsk(null)
    setManualOffer(null)
    setProgress(change)
  }

  function questionStep(s: CoachStep, index: number) {
    return {
      skillId: skill.id,
      skillTitle: skill.title,
      stepId: s.id,
      stepNumber: index + 1,
      stepTitle: s.title,
      stepInstruction: s.instruction,
    }
  }

  // An unsure verdict: ask the learner the first time, leave it to them when automatic
  // asking is off, else let the AI ask.
  function handleUnsure(s: CoachStep, index: number, offer: JudgeOffer) {
    setUnsureCount((n) => n + 1)
    // An open Ask an Expert panel takes this check's photo and words (#69).
    if (panelOpenRef.current) setManualOffer(offer)
    const choice = choiceRef.current ?? readAutoAskChoice()
    if (choice === null) {
      setAutoAsk({ stepId: s.id, kind: 'notice', said: offer.said, offer, index })
      return
    }
    if (choice === 'off') {
      setManualOffer(offer)
      return
    }
    void runAutoAsk(s, index, offer)
  }

  function chooseAutoAsk(choice: 'on' | 'off') {
    writeAutoAskChoice(choice)
    setAutoChoice(choice)
    choiceRef.current = choice
    // Answering the first time notice decides this verdict too.
    if (autoAsk?.kind !== 'notice' || autoAsk.stepId !== step.id) return
    const { offer, index } = autoAsk
    if (choice === 'on') void runAutoAsk(step, index, offer)
    else {
      setAutoAsk(null)
      setManualOffer(offer)
    }
  }

  // The saved answers first; if none fits, a question with the photo, the step and the
  // AI's own words, unless one is already open on this step or the limit is reached.
  async function runAutoAsk(s: CoachStep, index: number, offer: JudgeOffer) {
    const run = ++runRef.current
    const stillHere = () => onScreenRef.current && runRef.current === run
    const said = offer.said
    setAutoAsk({ stepId: s.id, kind: 'picking', said })
    const current = savedRef.current
    const answers = current.kind === 'loaded' ? (current.byStep[s.id] ?? []) : []
    if (answers.length > 0) {
      const result = await checkSavedAnswers(() => pickSavedAnswer(s.title, said, answers))
      if (!stillHere()) return
      if (result.kind === 'picked' && result.pick.answer) {
        setAutoAsk({ stepId: s.id, kind: 'saved', said, pick: result.pick as SavedPick & { answer: NonNullable<SavedPick['answer']> } })
        return
      }
    }
    const open = mineRef.current.stepId === s.id ? mineRef.current.questions.find((q) => q.status === 'open') : undefined
    const next = afterNoFit({ panelOpen: panelOpenRef.current, openOnStep: open !== undefined, asked: autoAskedThisSession() })
    // The learner is already asking in the manual panel: their Send is the one question.
    if (next === 'panel-open') {
      setAutoAsk({ stepId: s.id, kind: 'panel-open', said })
      return
    }
    if (next === 'still-waiting') {
      setAutoAsk({ stepId: s.id, kind: 'still-waiting', said, questionId: open?.id ?? null })
      return
    }
    if (next === 'limit') {
      setAutoAsk({ stepId: s.id, kind: 'limit', said })
      setManualOffer(offer)
      return
    }
    // The learner may have switched it off while the saved answers were checked.
    if ((choiceRef.current ?? readAutoAskChoice()) !== 'on') {
      setAutoAsk(null)
      setManualOffer(offer)
      return
    }
    countAutoAsk()
    const failed = (e: unknown) => {
      console.error('Could not ask an expert', e)
      uncountAutoAsk()
      if (!stillHere()) return
      setAutoAsk({ stepId: s.id, kind: 'failed', said })
      setManualOffer(offer)
    }
    setAutoAsk({ stepId: s.id, kind: navigator.onLine ? 'asking' : 'queued', said, questionId: null })
    try {
      const { id, saved: sent } = await askExpert({
        step: questionStep(s, index),
        question: AUTO_QUESTION,
        frameBase64: offer.frame,
        judgeSaid: said,
      })
      if (stillHere()) setAutoAsk((a) => (a?.stepId === s.id && 'questionId' in a ? { ...a, questionId: id } : a))
      // Offline, the question waits in Firestore's queue and goes once back online.
      sent.then(() => {
        if (stillHere()) setAutoAsk((a) => (a?.stepId === s.id && a.kind === 'queued' ? { ...a, kind: 'asking' } : a))
      }, failed)
    } catch (e) {
      failed(e)
    }
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
    // A new check stops an automatic run from the last verdict, which may still be picking:
    // its photo is out of date, and a correct verdict moves on without a step change.
    runRef.current++
    setAutoAsk(null)
    try {
      const result = await checkWiring(step, frame, controller.signal)
      if (!stillCurrent()) return
      endWiringCheck()
      const checked = { stepId: step.id, stepNumber: index + 1, result }
      if (result.check.verdict === 'correct') {
        const next = index === skill.steps.length - 1 ? FINISHED : skill.steps[index + 1].id
        setWiring({ kind: 'result', ...checked, showOn: next })
        setProgress(markStepDone)
      } else {
        setWiring({ kind: 'result', ...checked, showOn: step.id })
        if (result.check.verdict === 'unsure') handleUnsure(step, index, { said: describeWiringCheck(result.check), frame })
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
  // An unsure verdict is shown in the Not sure? row. On stacked layouts that row is below
  // the step, so it scrolls into view.
  useEffect(() => {
    if (unsureCount === 0 || !window.matchMedia('(max-width: 1100px)').matches) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    notSureRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [unsureCount])
  const isFirst = progress.stepIndex === 0
  const isLast = progress.stepIndex === skill.steps.length - 1

  const exitTab = skillsTabFor(skill.id)
  const parts = skillParts(skill.steps)
  const experts =
    saved.kind === 'loaded' ? { kind: 'loaded' as const, cards: expertCards(skill.steps, saved.byStep, step.id) } : saved
  const markDoneAnyway =
    !progress.finished &&
    (wiring?.kind === 'failed' || (checking && wiring.slow) || (shownResult && shownResult.showOn === shownResult.stepId))

  return (
    <WorkspaceShell
      top={
        <WorkspaceTopBar
          exitTab={exitTab}
          skillTitle={skill.title}
          progress={progress}
          deviceStatus={watch.deviceStatus}
          downloadPercent={watch.downloadPercent}
        />
      }
    >
      <div className="ws-grid">
        <aside className="ws-left ws-panel" aria-label="Parts and steps">
          <PartsList skillId={skill.id} parts={parts} />
          <StepList
            steps={skill.steps}
            progress={progress}
            disabled={holding}
            onGo={(index) => move((p) => goToStep(p, index))}
          />
          {!progress.finished && (
            <section className="ws-notsure" aria-label="Not sure?" ref={notSureRef}>
              <p className="ws-notsure-title">Not sure?</p>
              <AutoAskCard
                autoAsk={autoAsk?.stepId === step.id ? autoAsk : null}
                questions={mine.stepId === step.id ? mine.questions : []}
                choice={autoChoice}
                onChoose={chooseAutoAsk}
              />
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
                judgeOffer={manualOffer}
                onPanelChange={onPanelChange}
                sendBlocked={
                  mine.stepId === step.id && manualSendBlocked(autoChoice, mine.questions) ? MANUAL_SEND_BLOCKED : null
                }
              />
            </section>
          )}
        </aside>

        <section className="ws-center" aria-label="Camera">
          <div className="ws-camera">
            <video ref={videoRef} autoPlay playsInline muted hidden={!cameraOn} />
            {!cameraOn && (
              <p className="ws-camera-off">Start the camera so Surtrix can watch the bench with you.</p>
            )}
            <span className="ws-corner ws-corner-left" aria-hidden="true" />
            <span className="ws-corner ws-corner-right" aria-hidden="true" />
            {cameraOn && (
              <div className="ws-camera-tags">
                <span className="ws-tag ws-tag-rec">
                  <i className="ws-rec" aria-hidden="true" />
                  REC
                </span>
                {watch.deviceStatus === 'available' && !progress.finished && (
                  <span className="ws-tag">
                    <i className="ws-dot" aria-hidden="true" />
                    ON DEVICE · WATCHING THE BENCH
                  </span>
                )}
              </div>
            )}
            <div className="ws-now">
              <div className="ws-now-text">
                <p className="ws-mono ws-now-label">
                  <i className="ws-dot" aria-hidden="true" />
                  NOW
                </p>
                <p className="ws-now-instruction">{progress.finished ? 'All steps done.' : step.instruction}</p>
                {!progress.finished && <BenchLine watch={watch} cameraOn={cameraOn} />}
              </div>
              {!progress.finished && cameraOn && watch.look && (
                <span className="ws-mono ws-now-meta">
                  {(sourceText[watch.look.source] ?? watch.look.source).toUpperCase()} ·{' '}
                  {watch.look.ms.toLocaleString('en-US')} MS
                </span>
              )}
            </div>
          </div>
          <div className="ws-camera-controls">
            {cameraOn ? (
              <button type="button" className="ws-pill" onClick={stopCamera}>
                Stop camera
              </button>
            ) : (
              <button type="button" className="ws-pill ws-pill-yellow" onClick={startCamera} disabled={cameraStarting}>
                {cameraStarting ? 'Starting camera' : 'Start camera'}
              </button>
            )}
            {cameraOn && cameraCount > 1 && (
              <button type="button" className="ws-pill" onClick={switchCamera} disabled={cameraStarting}>
                Switch camera
              </button>
            )}
            <p className="ws-privacy">Video and voice stay on this device.</p>
          </div>
          {cameraError && <p className="ws-error">Could not open the camera. Check the browser has permission to use it.</p>}
        </section>

        <aside className="ws-right" aria-label="This step">
          {progress.finished ? (
            <section className="ws-panel ws-stepcard">
              <p className="ws-mono ws-step-count">ALL STEPS DONE</p>
              <h2>{skill.title}</h2>
              <p>You finished every step.</p>
              <div className="ws-step-actions">
                <button type="button" className="ws-pill ws-pill-yellow ws-wide" onClick={() => move(() => startProgress(skill.steps.length))}>
                  Start again
                </button>
                <BackToSkills tab={exitTab} className="ws-pill ws-wide" />
              </div>
            </section>
          ) : (
            <section className="ws-panel ws-stepcard">
              <p className="ws-mono ws-step-count">
                STEP {progress.stepIndex + 1} OF {skill.steps.length}
                {progress.done[progress.stepIndex] && <span className="ws-done-mark">DONE</span>}
              </p>
              <h2>{step.title}</h2>
              <p className="ws-instruction">{step.instruction}</p>
              {step.parts.length > 0 && (
                <div className="ws-need">
                  <span className="ws-mono">YOU NEED</span>
                  {step.parts.map((part) => (
                    <span key={part} className="ws-chip">
                      {part}
                    </span>
                  ))}
                </div>
              )}
              <div className="ws-done-when">
                <p className="ws-mono">DONE WHEN</p>
                <p>{step.doneWhen}</p>
              </div>
              <button type="button" className="ws-pill ws-pill-yellow ws-wide" onClick={markDone} disabled={checking}>
                Mark step done
              </button>
              {markDoneAnyway && (
                <button type="button" className="ws-pill ws-wide" onClick={() => move(markStepDone)}>
                  Mark done anyway
                </button>
              )}
              <div className="ws-step-actions">
                <button type="button" className="ws-pill" onClick={() => move(goBack)} disabled={isFirst || holding}>
                  Back
                </button>
                <button type="button" className="ws-pill" onClick={() => move(goNext)} disabled={isLast || holding}>
                  Next
                </button>
              </div>
            </section>
          )}

          <section className="ws-panel ws-wiring" aria-labelledby="ws-wiring-heading">
            <div className="ws-card-head">
              <h2 id="ws-wiring-heading">Last wiring check</h2>
              <span className="ws-tag">IN THE CLOUD</span>
            </div>
            <WiringCard wiring={wiring} shown={shownResult} cameraOn={cameraOn} />
          </section>

          {/* A new step starts the rotation again with that step's answers first. */}
          <ExpertsCard key={step.id} state={experts} />
        </aside>
      </div>
    </WorkspaceShell>
  )
}

const sourceText: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'On device',
  [InferenceSource.IN_CLOUD]: 'Cloud',
}

// The small line under NOW: the latest bench read from Gemini Nano, or why there is none.
function BenchLine({ watch, cameraOn }: { watch: BenchWatch; cameraOn: boolean }) {
  if (watch.deviceStatus === 'unavailable') {
    return <p className="ws-bench">Watching the bench needs Chrome on a computer.</p>
  }
  if (watch.deviceStatus === 'downloading') {
    return (
      <p className="ws-bench">
        Getting ready to watch the bench{watch.downloadPercent === null ? '.' : `: ${watch.downloadPercent}%`}
      </p>
    )
  }
  if (!cameraOn) return <p className="ws-bench">Start the camera to check the wiring and watch the bench.</p>
  if (watch.deviceStatus !== 'available') return null
  if (!watch.look) return <p className="ws-bench">Watching the bench.</p>
  return (
    <p className="ws-bench">
      <b>On the bench:</b> {describeBenchAnswer(watch.look.answer)}
    </p>
  )
}

// The Last wiring check card: the latest cloud verdict, a check running, or why there is none.
function WiringCard({
  wiring,
  shown,
  cameraOn,
}: {
  wiring: Wiring | null
  shown: Extract<Wiring, { kind: 'result' }> | null
  cameraOn: boolean
}) {
  if (wiring?.kind === 'checking') {
    return (
      <p className="ws-wiring-line">
        {wiring.slow
          ? 'Still checking the wiring. You can carry on; the answer will show here if you stay on this step.'
          : 'Checking the wiring.'}
      </p>
    )
  }
  if (wiring?.kind === 'failed') {
    return (
      <p className="ws-wiring-line ws-error">
        The wiring check is not available right now. Ask an Expert or Check saved answers, or Mark done anyway.
      </p>
    )
  }
  if (!shown) {
    return (
      <p className="ws-wiring-line ws-quiet">
        {cameraOn ? 'Mark step done to check the wiring.' : 'Turn on the camera to check the wiring.'}
      </p>
    )
  }
  const { check, source, ms } = shown.result
  const correct = check.verdict === 'correct'
  return (
    <>
      <p className={`ws-wiring-line ${check.verdict === 'not yet' ? 'ws-not-yet' : ''}`}>
        <span aria-hidden="true">{correct ? '✓ ' : check.verdict === 'not yet' ? '✗ ' : '? '}</span>
        Step {shown.stepNumber}
        {correct ? '' : check.verdict === 'not yet' ? ', not yet' : ', not sure'}: {describeWiringCheck(check)}
      </p>
      <p className="ws-mono ws-wiring-meta">
        {(sourceText[source] ?? source).toUpperCase()} · {ms.toLocaleString('en-US')} MS
      </p>
    </>
  )
}
