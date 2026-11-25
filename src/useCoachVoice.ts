// The coach voice (#95): the browser's speech synthesis with an on device voice only.
// Messages wait in a queue and are said one at a time. While the learner's heard words
// still wait to be sent, the coach waits too, so it never talks over them.
import { useEffect, useRef, useState } from 'react'
import { alreadyQueued, belongsHere, keepForStep, maySpeakNow, pickVoice, readCoachMuted, speechTimeoutMs, writeCoachMuted, type Speech } from './coachVoice.ts'

// Chrome fills the voice list a moment after the page loads; after this long with none,
// there is no voice to use.
const VOICES_WAIT_MS = 2000

export type CoachVoice = {
  // null while the voices are still loading.
  available: boolean | null
  muted: boolean
  speaking: boolean
  toggleMute: () => void
  say: (speech: Speech) => void
  // A step change: what is said or waits from other steps stops, then this is said.
  newStep: (speech: Speech & { stepId: string }) => void
  // The learner sent a typed message: what is being said now stops.
  stopCurrent: () => void
}

function synth(): SpeechSynthesis | null {
  return typeof speechSynthesis === 'undefined' ? null : speechSynthesis
}

// learnerTalking: words are coming in from the learner, or wait to be sent.
export function useCoachVoice(learnerTalking: boolean): CoachVoice {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined)
  const [muted, setMuted] = useState(readCoachMuted)
  const [speaking, setSpeaking] = useState(false)
  const queueRef = useRef<Speech[]>([])
  // The utterance being said, kept so Chrome does not drop it before it ends.
  const currentRef = useRef<SpeechSynthesisUtterance | null>(null)
  const currentSpeechRef = useRef<Speech | null>(null)
  const voiceRef = useRef(voice)
  const mutedRef = useRef(muted)
  const waitingRef = useRef(learnerTalking)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    voiceRef.current = voice
    mutedRef.current = muted
    waitingRef.current = learnerTalking
  })

  useEffect(() => {
    const s = synth()
    if (!s) {
      setVoice(null)
      return
    }
    const load = () => {
      const picked = pickVoice(s.getVoices())
      if (picked) setVoice(picked)
    }
    load()
    s.addEventListener('voiceschanged', load)
    const timer = setTimeout(() => setVoice((v) => v ?? null), VOICES_WAIT_MS)
    return () => {
      s.removeEventListener('voiceschanged', load)
      clearTimeout(timer)
    }
  }, [])

  // Says the next message when nothing else is being said and the learner is not waiting.
  function next() {
    const s = synth()
    const v = voiceRef.current
    const may = maySpeakNow({ hasVoice: !!v, muted: mutedRef.current, speaking: !!currentRef.current, learnerTalking: waitingRef.current })
    if (!s || !v || !may) return
    const speech = queueRef.current.shift()
    if (!speech) return
    const u = new SpeechSynthesisUtterance(speech.text)
    u.voice = v
    u.lang = v.lang
    const done = () => {
      if (currentRef.current !== u) return
      clearTimeout(timeoutRef.current)
      currentRef.current = null
      currentSpeechRef.current = null
      setSpeaking(false)
      next()
    }
    u.onend = done
    u.onerror = (event) => {
      // Chrome refuses to speak before the visitor has clicked the page: what waits would
      // be refused too, so it goes.
      if (event.error === 'not-allowed') queueRef.current = []
      done()
    }
    currentRef.current = u
    currentSpeechRef.current = speech
    setSpeaking(true)
    s.speak(u)
    // Never stuck: past its time, the message counts as said.
    timeoutRef.current = setTimeout(() => {
      if (currentRef.current !== u) return
      s.cancel()
      done()
    }, speechTimeoutMs(speech.text))
  }

  // Stops what is being said now; with clear, what waits goes too.
  function stop(clear: boolean) {
    if (clear) queueRef.current = []
    if (!currentRef.current) return
    clearTimeout(timeoutRef.current)
    currentRef.current = null
    currentSpeechRef.current = null
    setSpeaking(false)
    synth()?.cancel()
  }

  // The learner's words were sent, or a voice arrived: carry on.
  useEffect(() => {
    if (!learnerTalking) next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerTalking, voice])

  // Leaving the Workspace stops the voice.
  useEffect(
    () => () => {
      queueRef.current = []
      clearTimeout(timeoutRef.current)
      currentRef.current = null
      synth()?.cancel()
    },
    [],
  )

  function say(speech: Speech) {
    if (mutedRef.current || !voiceRef.current || speech.text.trim() === '') return
    if (alreadyQueued(speech, currentSpeechRef.current, queueRef.current)) return
    queueRef.current.push(speech)
    next()
  }

  return {
    available: voice === undefined ? null : voice !== null,
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
      const current = currentSpeechRef.current
      if (current && !belongsHere(current, speech.stepId)) stop(false)
      say(speech)
    },
    stopCurrent: () => {
      stop(false)
      next()
    },
  }
}
