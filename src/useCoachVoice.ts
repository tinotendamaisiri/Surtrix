// The coach voice (#95, Achird since #100). Messages wait in a queue and are said one at a
// time. Each is said in Achird: a saved line of the step or one shipped with the app plays
// at once, anything else is streamed and starts with its first audio. Offline, or when no
// audio comes, the browser's on device voice says it. While the learner's heard words
// still wait to be sent, the coach waits too, so it never talks over them.
import { useEffect, useRef, useState } from 'react'
import { coachCanSpeak, FIRST_AUDIO_MS, lineKey, pcmReader, SAMPLE_RATE, SHARED_LINE_KEYS } from './coachSpeech.ts'
import { alreadyQueued, belongsHere, keepForStep, maySpeakNow, pickVoice, readCoachMuted, speechTimeoutMs, writeCoachMuted, type Speech } from './coachVoice.ts'
import { loadSharedLine, loadStepLines, saveStepLine, streamLine } from './speechLines.ts'

// Chrome fills the voice list a moment after the page loads; after this long with none,
// there is no on device voice to use.
const VOICES_WAIT_MS = 2000
// Loading a step's saved lines, or a line shipped with the app, takes longer than this
// only when something is wrong; the line is then streamed or said on the device.
const STEP_LINES_WAIT_MS = 2500

export type CoachVoice = {
  // null while it is not known yet.
  available: boolean | null
  muted: boolean
  speaking: boolean
  toggleMute: () => void
  say: (speech: Speech) => void
  // A step change: what is said or waits from other steps stops, then this is said.
  newStep: (speech: Speech & { stepId: string }) => void
  // The learner sent a typed message: what is being said now stops.
  stopCurrent: () => void
  // Loads a step's saved lines ahead, so they play at once.
  prepare: (stepId: string) => void
}

// skillId: the skill whose saved lines are played. mine: this user made the skill, so the
// fixed lines streamed for it are saved for next time.
export type CoachVoiceOptions = { learnerTalking: boolean; skillId: string; mine: boolean }

function synth(): SpeechSynthesis | null {
  return typeof speechSynthesis === 'undefined' ? null : speechSynthesis
}

function hasWebAudio(): boolean {
  return typeof AudioContext !== 'undefined'
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

// One Web Audio context for the page, made and woken on the learner's first tap (Safari
// plays audio only once a tap has started it).
let context: AudioContext | null = null
function audioContext(): AudioContext | null {
  if (!hasWebAudio()) return null
  if (!context) {
    // On iPhone, plain page audio follows the ring switch; the coach is playback, like a
    // video, so it is heard with the switch on silent.
    const session = (navigator as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
    context = new AudioContext({ sampleRate: SAMPLE_RATE })
  }
  if (context.state === 'suspended') void context.resume()
  return context
}

function waitFor<T>(promise: Promise<T>, ms: number, otherwise: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(otherwise), ms))])
}

// Plays samples as they come, one right after another; done resolves when all has played.
function pcmPlayer(ctx: AudioContext) {
  let at = 0
  const sources: AudioBufferSourceNode[] = []
  return {
    push(samples: Float32Array<ArrayBuffer>) {
      if (samples.length === 0) return
      const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE)
      buffer.copyToChannel(samples, 0)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      at = Math.max(at, ctx.currentTime + 0.05)
      source.start(at)
      at += buffer.duration
      sources.push(source)
    },
    done(): Promise<void> {
      const last = sources.at(-1)
      if (!last) return Promise.resolve()
      return new Promise((resolve) => last.addEventListener('ended', () => resolve(), { once: true }))
    },
    stop() {
      for (const s of sources) {
        try {
          s.stop()
        } catch {
          // Already ended.
        }
      }
    },
  }
}

function joined(chunks: readonly Uint8Array[]): Uint8Array {
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.length
  }
  return all
}

export function useCoachVoice({ learnerTalking, skillId, mine }: CoachVoiceOptions): CoachVoice {
  const [deviceVoice, setDeviceVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined)
  const [isOnline, setIsOnline] = useState(online)
  const [muted, setMuted] = useState(readCoachMuted)
  const [speaking, setSpeaking] = useState(false)
  const available = coachCanSpeak({
    online: isOnline,
    webAudio: hasWebAudio(),
    deviceVoice: deviceVoice === undefined ? undefined : deviceVoice !== null,
  })
  const queueRef = useRef<Speech[]>([])
  // What is being said now, with how to stop it.
  const currentRef = useRef<{ speech: Speech; stop: () => void } | null>(null)
  // The utterance being said on the device, kept so Chrome does not drop it before it ends.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  // Lines heard this visit, and each step's saved lines, by key.
  const heardRef = useRef(new Map<string, Uint8Array>())
  const stepLinesRef = useRef(new Map<string, Promise<Map<string, Uint8Array>>>())
  const deviceVoiceRef = useRef(deviceVoice)
  const availableRef = useRef(available)
  const mutedRef = useRef(muted)
  const waitingRef = useRef(learnerTalking)
  const skillRef = useRef({ skillId, mine })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    deviceVoiceRef.current = deviceVoice
    availableRef.current = available
    mutedRef.current = muted
    waitingRef.current = learnerTalking
    skillRef.current = { skillId, mine }
  })

  useEffect(() => {
    const s = synth()
    if (!s) {
      setDeviceVoice(null)
      return
    }
    const load = () => {
      const picked = pickVoice(s.getVoices())
      if (picked) setDeviceVoice(picked)
    }
    load()
    s.addEventListener('voiceschanged', load)
    const timer = setTimeout(() => setDeviceVoice((v) => v ?? null), VOICES_WAIT_MS)
    return () => {
      s.removeEventListener('voiceschanged', load)
      clearTimeout(timer)
    }
  }, [])

  // Online and offline change which voice can speak. The first tap wakes Web Audio.
  useEffect(() => {
    const update = () => setIsOnline(online())
    const wake = () => audioContext()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('pointerdown', wake, { once: true })
    window.addEventListener('keydown', wake, { once: true })
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  function stepLines(stepId: string): Promise<Map<string, Uint8Array>> {
    let lines = stepLinesRef.current.get(stepId)
    if (!lines) {
      lines = loadStepLines(skillRef.current.skillId, stepId).catch((e: unknown) => {
        console.warn('Loading the saved coach lines failed', e)
        stepLinesRef.current.delete(stepId)
        return new Map<string, Uint8Array>()
      })
      stepLinesRef.current.set(stepId, lines)
    }
    return lines
  }

  // The line's audio when it is already kept: heard this visit, saved with the step, or
  // shipped with the app.
  async function keptAudio(speech: Speech, key: string): Promise<Uint8Array | null> {
    const heard = heardRef.current.get(key)
    if (heard) return heard
    // Offline, only lines already loaded count: waiting would only delay the device voice.
    const wait = online() ? STEP_LINES_WAIT_MS : 0
    if (speech.fixed && speech.stepId !== null) {
      const saved = (await waitFor(stepLines(speech.stepId), wait, new Map<string, Uint8Array>())).get(key)
      if (saved) return saved
    }
    if (SHARED_LINE_KEYS.has(key)) return waitFor(loadSharedLine(key).catch(() => null), STEP_LINES_WAIT_MS, null)
    return null
  }

  // Says the line in Achird. False when no audio could be had, so the device voice says it.
  async function sayInAchird(speech: Speech, isCurrent: () => boolean, onStop: (stop: () => void) => void): Promise<boolean> {
    const ctx = audioContext()
    if (!ctx) return false
    if (ctx.state !== 'running') await waitFor(ctx.resume(), 300, undefined)
    // Audio the browser will not play yet (no tap so far) goes to the device voice.
    if (ctx.state !== 'running') return false
    const key = await lineKey(speech.text)
    const kept = await keptAudio(speech, key)
    if (!isCurrent()) return true
    const player = pcmPlayer(ctx)
    if (kept) {
      onStop(() => player.stop())
      player.push(pcmReader()(kept))
      await player.done()
      return true
    }
    if (!online()) return false
    const controller = new AbortController()
    onStop(() => {
      controller.abort()
      player.stop()
    })
    const chunks = streamLine(speech.text, controller.signal)
    const first = await waitFor(
      chunks.next().catch(() => null),
      FIRST_AUDIO_MS,
      null,
    )
    if (!first || first.done) {
      controller.abort()
      return false
    }
    const read = pcmReader()
    const all: Uint8Array[] = [first.value]
    player.push(read(first.value))
    try {
      for await (const chunk of chunks) {
        if (!isCurrent()) return true
        all.push(chunk)
        player.push(read(chunk))
      }
    } catch {
      // The stream broke partway, ended early or was stopped: what came is said, the line
      // ends, and it is not kept.
      await player.done()
      return true
    }
    const audio = joined(all)
    heardRef.current.set(key, audio)
    const { skillId: skill, mine: canSave } = skillRef.current
    const stepId = speech.stepId
    if (speech.fixed && stepId !== null && canSave) {
      saveStepLine(skill, stepId, key, speech.text, audio).then(
        () => stepLinesRef.current.get(stepId)?.then((lines) => lines.set(key, audio)),
        (e: unknown) => console.warn('Saving the coach line failed', e),
      )
    }
    await player.done()
    return true
  }

  // Says the line in the on device voice, then calls done.
  function sayOnDevice(speech: Speech, done: () => void, onStop: (stop: () => void) => void) {
    const s = synth()
    const v = deviceVoiceRef.current
    if (!s || !v) {
      done()
      return
    }
    const u = new SpeechSynthesisUtterance(speech.text)
    u.voice = v
    u.lang = v.lang
    u.onend = done
    u.onerror = (event) => {
      // Chrome refuses to speak before the visitor has clicked the page: what waits would
      // be refused too, so it goes.
      if (event.error === 'not-allowed') queueRef.current = []
      done()
    }
    utteranceRef.current = u
    onStop(() => s.cancel())
    s.speak(u)
  }

  // Says the next message when nothing else is being said and the learner is not waiting.
  function next() {
    const may = maySpeakNow({
      hasVoice: !!availableRef.current,
      muted: mutedRef.current,
      speaking: !!currentRef.current,
      learnerTalking: waitingRef.current,
    })
    if (!may) return
    const speech = queueRef.current.shift()
    if (!speech) return
    const current: { speech: Speech; stop: () => void } = { speech, stop: () => {} }
    currentRef.current = current
    setSpeaking(true)
    const isCurrent = () => currentRef.current === current
    const onStop = (stop: () => void) => {
      current.stop = stop
    }
    const done = () => {
      if (!isCurrent()) return
      clearTimeout(timeoutRef.current)
      currentRef.current = null
      utteranceRef.current = null
      setSpeaking(false)
      next()
    }
    // Never stuck: past its time, the message counts as said.
    timeoutRef.current = setTimeout(() => {
      if (!isCurrent()) return
      current.stop()
      done()
    }, FIRST_AUDIO_MS + speechTimeoutMs(speech.text))
    sayInAchird(speech, isCurrent, onStop).then(
      (said) => {
        if (!isCurrent()) return
        if (said) done()
        else sayOnDevice(speech, done, onStop)
      },
      (e: unknown) => {
        console.warn('The coach voice could not say a line', e)
        if (isCurrent()) sayOnDevice(speech, done, onStop)
      },
    )
  }

  // Stops what is being said now; with clear, what waits goes too.
  function stop(clear: boolean) {
    if (clear) queueRef.current = []
    const current = currentRef.current
    if (!current) return
    clearTimeout(timeoutRef.current)
    currentRef.current = null
    utteranceRef.current = null
    setSpeaking(false)
    current.stop()
  }

  // The learner's words were sent, or the coach became able to speak: carry on.
  useEffect(() => {
    if (!learnerTalking) next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerTalking, available])

  // Leaving the Workspace stops the voice.
  useEffect(
    () => () => {
      queueRef.current = []
      clearTimeout(timeoutRef.current)
      const current = currentRef.current
      currentRef.current = null
      current?.stop()
    },
    [],
  )

  function say(speech: Speech) {
    if (mutedRef.current || !availableRef.current || speech.text.trim() === '') return
    if (alreadyQueued(speech, currentRef.current?.speech ?? null, queueRef.current)) return
    queueRef.current.push(speech)
    next()
  }

  return {
    available,
    muted,
    speaking,
    toggleMute: () => {
      const now = !mutedRef.current
      mutedRef.current = now
      setMuted(now)
      writeCoachMuted(now)
      if (now) stop(true)
    },
    say,
    newStep: (speech) => {
      queueRef.current = keepForStep(queueRef.current, speech.stepId)
      const current = currentRef.current?.speech
      if (current && !belongsHere(current, speech.stepId)) stop(false)
      say(speech)
    },
    stopCurrent: () => {
      stop(false)
      next()
    },
    prepare: (stepId) => {
      if (online() && !mutedRef.current) void stepLines(stepId)
    },
  }
}
