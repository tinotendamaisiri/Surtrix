// The coach voice (#95): the browser's speech synthesis with an on device voice only.
// Messages wait in a queue and are said one at a time. While the learner's heard words
// still wait to be sent, the coach waits too, so it never talks over them.
import { useEffect, useRef, useState } from 'react'
import { keepForStep, pickVoice, readCoachMuted, writeCoachMuted, type Speech } from './coachVoice.ts'

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
  // A step change: what waits from other steps is dropped, then this is said.
  newStep: (speech: Speech & { stepId: string }) => void
  // The learner sent a typed message: what is being said now stops.
  stopCurrent: () => void
}

function synth(): SpeechSynthesis | null {
  return typeof speechSynthesis === 'undefined' ? null : speechSynthesis
}

// learnerWaiting: words heard from the learner wait to be sent.
export function useCoachVoice(learnerWaiting: boolean): CoachVoice {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined)
  const [muted, setMuted] = useState(readCoachMuted)
  const [speaking, setSpeaking] = useState(false)
  const queueRef = useRef<Speech[]>([])
  // The utterance being said, kept so Chrome does not drop it before it ends.
  const currentRef = useRef<SpeechSynthesisUtterance | null>(null)
  const voiceRef = useRef(voice)
  const mutedRef = useRef(muted)
  const waitingRef = useRef(learnerWaiting)
  useEffect(() => {
    voiceRef.current = voice
    mutedRef.current = muted
    waitingRef.current = learnerWaiting
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
    if (!s || !v || mutedRef.current || waitingRef.current || currentRef.current) return
    const speech = queueRef.current.shift()
    if (!speech) return
    const u = new SpeechSynthesisUtterance(speech.text)
    u.voice = v
    u.lang = v.lang
    const done = () => {
      if (currentRef.current !== u) return
      currentRef.current = null
      setSpeaking(false)
      next()
    }
    u.onend = done
    // Also when Chrome refuses to speak before the visitor has clicked the page: the rest
    // still waits, for the next click that adds to it.
    u.onerror = done
    currentRef.current = u
    setSpeaking(true)
    s.speak(u)
  }

  // Stops what is being said now; with clear, what waits goes too.
  function stop(clear: boolean) {
    if (clear) queueRef.current = []
    if (!currentRef.current) return
    currentRef.current = null
    setSpeaking(false)
    synth()?.cancel()
  }

  // The learner's words were sent, or a voice arrived: carry on.
  useEffect(() => {
    if (!learnerWaiting) next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerWaiting, voice])

  // Leaving the Workspace stops the voice.
  useEffect(
    () => () => {
      queueRef.current = []
      currentRef.current = null
      synth()?.cancel()
    },
    [],
  )

  function say(speech: Speech) {
    if (mutedRef.current || !voiceRef.current || speech.text.trim() === '') return
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
      say(speech)
    },
    stopCurrent: () => {
      stop(false)
      next()
    },
  }
}
