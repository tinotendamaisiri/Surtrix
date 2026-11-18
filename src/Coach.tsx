import { useCallback, useEffect, useRef, useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import AskExpert, { type AskRequest, type JudgeOffer } from './AskExpert.tsx'
import { useBenchWatch, type BenchWatch } from './benchWatch.ts'
import { grabFrameBase64 } from './cameraFrame.ts'
import Chat from './Chat.tsx'
import {
  appendItem,
  chatEntries,
  chatHistory,
  chatPreview,
  dropPassingAuto,
  newChatId,
  putAuto,
  replaceItem,
  unreadCount,
  type ChatItem,
} from './chat.ts'
import { replyToChat } from './chatReply.ts'
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
  type AutoAsk,
  type AutoAskChoice,
} from './autoAsk.ts'
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

  // The chat (#74). On stacked layouts it is below the step, so an unsure verdict that
  // opens it scrolls it into view.
  const chatRef = useRef<HTMLElement>(null)
  const [chatOpen, setChatOpen] = useState(false)
  // What the chat holds for this page load, in memory only.
  const [chatItems, setChatItems] = useState<ChatItem[]>([])
  const chatItemsRef = useRef(chatItems)
  // When the learner last had the chat open: later replies and notifications count as new.
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now())
  const [answering, setAnswering] = useState(false)
  // Opens the Ask an Expert panel from the chat.
  const [askRequest, setAskRequest] = useState<AskRequest | null>(null)

  // The AI asking an expert by itself when the wiring check is unsure (#65): the chat item
  // of the current run, which changes in place as the run goes on.
  const [currentAutoId, setCurrentAutoId] = useState<string | null>(null)
  const currentAutoIdRef = useRef<string | null>(null)
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
    if (!open) setChatItems((items) => items.filter((i) => !(i.kind === 'auto' && i.auto.kind === 'panel-open')))
  }, [])
  // This learner's questions on the current step, live: an open one blocks a new automatic one.
  const [mine, setMine] = useState<{ stepId: string; questions: Question[]; failed?: boolean }>({
    stepId: '',
    questions: [],
  })
  const mineRef = useRef(mine)
  const savedRef = useRef(saved)
  const choiceRef = useRef(autoChoice)
  // Each automatic run's number: a step change or a new run makes an older one stop.
  const runRef = useRef(0)
  useEffect(() => {
    mineRef.current = mine
    savedRef.current = saved
    choiceRef.current = autoChoice
    chatItemsRef.current = chatItems
  })
  useEffect(() => {
    const stepId = step.id
    return watchMyQuestions(
      { skillId: skill.id, stepId },
      (questions) => setMine({ stepId, questions }),
      (e) => {
        console.error('Watching your questions failed', e)
        setMine({ stepId, questions: [], failed: true })
      },
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
    endAutoAsk()
    setManualOffer(null)
    setProgress(change)
  }

  // The step line the chat shows above a message about this step.
  function stepMark(stepId: string) {
    const index = skill.steps.findIndex((s) => s.id === stepId)
    return { stepId, stepNumber: index + 1, title: skill.steps[index]?.title ?? '' }
  }

  // Shows an automatic asking state in the chat: a new notification, or the run's own one
  // changed in place.
  function showAutoAsk(auto: AutoAsk) {
    currentAutoIdRef.current = auto.id
    setCurrentAutoId(auto.id)
    setChatItems((items) => putAuto(items, auto, stepMark(auto.stepId), Date.now()))
  }

  // Changes a run's notification, even once it is no longer the current one. news: the
  // change is news for the learner, so it counts as new in the closed chat.
  function updateAutoAsk(id: string, change: (auto: AutoAsk) => AutoAsk, news = false) {
    const now = Date.now()
    setChatItems((items) =>
      items.map((i) => (i.id === id && i.kind === 'auto' ? { ...i, at: news ? now : i.at, auto: change(i.auto) } : i)),
    )
  }

  // The current run stops being current. A notice not answered, a check of the saved answers
  // and an "asking below" line only hold while current, so they are taken out.
  function endAutoAsk() {
    const id = currentAutoIdRef.current
    currentAutoIdRef.current = null
    setCurrentAutoId(null)
    setChatItems((items) => dropPassingAuto(items, id))
  }

  function openChat() {
    setChatOpen(true)
  }

  function closeChat() {
    setChatOpen(false)
    setChatSeenAt(Date.now())
  }

  // Ask an Expert from the chat: the panel opens with the current camera frame.
  function askAnExpert(question: string) {
    setAskRequest({ question, frame: cameraOn ? grabFrameBase64(videoRef.current) : null })
  }

  // A typed message: the cloud answers, or Gemini Nano on device when the cloud cannot.
  async function sendChat(text: string) {
    const message = text.trim()
    if (message === '' || answering || progress.finished) return
    const s = step
    const mark = stepMark(s.id)
    const history = chatHistory(chatItemsRef.current)
    const thinkingId = newChatId()
    const now = Date.now()
    setChatItems((items) =>
      appendItem(
        appendItem(items, { id: newChatId(), at: now, kind: 'typed', stepId: s.id, text: message }, mark),
        { id: thinkingId, at: now, kind: 'thinking', stepId: s.id },
        mark,
      ),
    )
    setAnswering(true)
    const look = watch.look?.stepId === s.id ? watch.look : null
    let item: ChatItem
    try {
      const reply = await replyToChat({
        skillTitle: skill.title,
        stepNumber: mark.stepNumber,
        stepCount: skill.steps.length,
        step: s,
        savedAnswers: saved.kind === 'loaded' ? (saved.byStep[s.id] ?? []) : [],
        benchRead: look ? describeBenchAnswer(look.answer) : null,
        history,
        message,
      })
      item = { id: thinkingId, at: Date.now(), kind: 'reply', stepId: s.id, question: message, answer: reply.answer, source: reply.source }
    } catch (e) {
      console.error('The chat could not answer', e)
      item = { id: thinkingId, at: Date.now(), kind: 'reply-failed', stepId: s.id, question: message }
    }
    if (!onScreenRef.current) return
    setChatItems((items) => replaceItem(items, thinkingId, item))
    setAnswering(false)
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
    // The chat opens by itself when the AI is unsure: that is when the learner is needed.
    openChat()
    // An open Ask an Expert panel takes this check's photo and words (#69).
    if (panelOpenRef.current) setManualOffer(offer)
    const choice = choiceRef.current ?? readAutoAskChoice()
    if (choice === null) {
      showAutoAsk({ id: newChatId(), stepId: s.id, kind: 'notice', said: offer.said, offer, index })
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
    const current = chatItems.find((i) => i.id === currentAutoId)
    if (current?.kind !== 'auto' || current.auto.kind !== 'notice' || current.auto.stepId !== step.id) return
    const { offer, index, id } = current.auto
    if (choice === 'on') void runAutoAsk(step, index, offer, id)
    else {
      endAutoAsk()
      setManualOffer(offer)
    }
  }

  // The saved answers first; if none fits, a question with the photo, the step and the
  // AI's own words, unless one is already open on this step or the limit is reached.
  // id: the notification to change, the notice's when the learner just chose.
  async function runAutoAsk(s: CoachStep, index: number, offer: JudgeOffer, id: string = newChatId()) {
    const run = ++runRef.current
    const stillHere = () => onScreenRef.current && runRef.current === run
    const said = offer.said
    showAutoAsk({ id, stepId: s.id, kind: 'picking', said })
    const current = savedRef.current
    const answers = current.kind === 'loaded' ? (current.byStep[s.id] ?? []) : []
    if (answers.length > 0) {
      const result = await checkSavedAnswers(() => pickSavedAnswer(s.title, said, answers))
      if (!stillHere()) return
      if (result.kind === 'picked' && result.pick.answer) {
        showAutoAsk({ id, stepId: s.id, kind: 'saved', said, pick: result.pick as SavedPick & { answer: NonNullable<SavedPick['answer']> } })
        return
      }
    }
    const open = mineRef.current.stepId === s.id ? mineRef.current.questions.find((q) => q.status === 'open') : undefined
    const next = afterNoFit({ panelOpen: panelOpenRef.current, openOnStep: open !== undefined, asked: autoAskedThisSession() })
    // The learner is already asking in the manual panel: their Send is the one question.
    if (next === 'panel-open') {
      showAutoAsk({ id, stepId: s.id, kind: 'panel-open', said })
      return
    }
    if (next === 'still-waiting') {
      showAutoAsk({ id, stepId: s.id, kind: 'still-waiting', said, questionId: open?.id ?? null })
      return
    }
    if (next === 'limit') {
      showAutoAsk({ id, stepId: s.id, kind: 'limit', said })
      setManualOffer(offer)
      return
    }
    // The learner may have switched it off while the saved answers were checked.
    if ((choiceRef.current ?? readAutoAskChoice()) !== 'on') {
      endAutoAsk()
      setManualOffer(offer)
      return
    }
    countAutoAsk()
    const failed = (e: unknown) => {
      console.error('Could not ask an expert', e)
      uncountAutoAsk()
      if (!onScreenRef.current) return
      // The notification says so even after a step change, as news; the panel opens, in the
      // open chat, only on its step.
      updateAutoAsk(id, () => ({ id, stepId: s.id, kind: 'failed', said }), true)
      if (stillHere()) {
        openChat()
        setManualOffer(offer)
      }
    }
    showAutoAsk({ id, stepId: s.id, kind: navigator.onLine ? 'asking' : 'queued', said, questionId: null })
    try {
      const { id: questionId, saved: sent } = await askExpert({
        step: questionStep(s, index),
        question: AUTO_QUESTION,
        frameBase64: offer.frame,
        judgeSaid: said,
      })
      // The notification keeps its question after a step change, so the chat links them.
      if (onScreenRef.current) updateAutoAsk(id, (a) => ('questionId' in a ? { ...a, questionId } : a))
      // Offline, the question waits in Firestore's queue and goes once back online.
      sent.then(() => {
        if (onScreenRef.current) updateAutoAsk(id, (a) => (a.kind === 'queued' ? { ...a, kind: 'asking' } : a))
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
    endAutoAsk()
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
  // An unsure verdict is shown in the chat. On stacked layouts the chat is below the step,
  // so it scrolls into view.
  useEffect(() => {
    if (unsureCount === 0 || !window.matchMedia('(max-width: 1100px)').matches) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    chatRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [unsureCount])
  const isFirst = progress.stepIndex === 0
  const isLast = progress.stepIndex === skill.steps.length - 1

  const exitTab = skillsTabFor(skill.id)
  const parts = skillParts(skill.steps)
  const experts =
    saved.kind === 'loaded' ? { kind: 'loaded' as const, cards: expertCards(skill.steps, saved.byStep, step.id) } : saved
  const myQuestions = mine.stepId === step.id ? mine.questions : []
  const entries = chatEntries(chatItems, myQuestions)
  const currentNotice = chatItems.find((i) => i.id === currentAutoId && i.kind === 'auto' && i.auto.kind === 'notice')
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
      <div className={`ws-grid${chatOpen && !progress.finished ? ' ws-grid-chat' : ''}`}>
        <aside className="ws-left ws-panel" aria-label={chatOpen && !progress.finished ? 'Chat' : 'Parts and steps'}>
          <div className="ws-left-lists" hidden={chatOpen && !progress.finished}>
            <PartsList skillId={skill.id} parts={parts} />
            <StepList
              steps={skill.steps}
              progress={progress}
              disabled={holding}
              onGo={(index) => move((p) => goToStep(p, index))}
            />
          </div>
          {!progress.finished && (
            <Chat
              sectionRef={chatRef}
              open={chatOpen}
              onOpen={openChat}
              onClose={closeChat}
              entries={entries}
              stepId={step.id}
              unread={chatOpen ? 0 : unreadCount(entries, chatSeenAt)}
              preview={chatPreview(entries)}
              noticeId={currentNotice ? currentNotice.id : null}
              questions={myQuestions}
              questionsFailed={mine.stepId === step.id && mine.failed === true}
              choice={autoChoice}
              onChoose={chooseAutoAsk}
              answering={answering}
              onSend={(message) => void sendChat(message)}
              onAskExpert={askAnExpert}
              panel={
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
                  judgeOffer={manualOffer}
                  askRequest={askRequest}
                  onPanelChange={onPanelChange}
                  sendBlocked={manualSendBlocked(autoChoice, myQuestions) ? MANUAL_SEND_BLOCKED : null}
                />
              }
            />
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
