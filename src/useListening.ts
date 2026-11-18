// Talking to the Workspace (#80): Chrome's on device speech recognition. Audio never
// leaves the device: recognition runs with processLocally on and never falls back to the
// server. One listening state serves the toggle under the camera and both chat mics.
import { useEffect, useRef, useState } from 'react'
import { listeningOn, VOICE_LANG, type ListeningState } from './voice.ts'

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  processLocally: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable'
type PackOptions = { langs: string[]; processLocally: boolean }

type RecognitionClass = {
  new (): Recognition
  prototype: object
  available(options: PackOptions): Promise<Availability>
  install(options: PackOptions): Promise<boolean>
}

const PACK: PackOptions = { langs: [VOICE_LANG], processLocally: true }

// Chrome's speech recognition, only where it can run on the device.
function onDeviceRecognition(): RecognitionClass | null {
  const g = globalThis as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  const C = g.SpeechRecognition ?? g.webkitSpeechRecognition
  if (!C || typeof C.available !== 'function' || typeof C.install !== 'function') return null
  if (!('processLocally' in C.prototype)) return null
  return C
}

// After Chrome ends a recognition (silence, a pause), listening starts again this soon.
const RESTART_MS = 250

export type Listening = {
  state: ListeningState
  // The words of the phrase being heard, before it is final.
  heard: string
  // Turns listening on (needs a tap: the first time it gets the language pack ready) or off.
  toggle: () => void
}

// onPhrase gets each finished phrase.
export function useListening(onPhrase: (text: string) => void): Listening {
  const [state, setState] = useState<ListeningState>(() => (onDeviceRecognition() ? 'off' : 'unsupported'))
  const [heard, setHeard] = useState('')
  const onPhraseRef = useRef(onPhrase)
  // Whether the learner wants it on; the recogniser running now, if any.
  const wantRef = useRef(false)
  const recognitionRef = useRef<Recognition | null>(null)
  useEffect(() => {
    onPhraseRef.current = onPhrase
  })

  function stopRecognition() {
    const r = recognitionRef.current
    recognitionRef.current = null
    if (!r) return
    r.onresult = r.onerror = r.onend = null
    r.abort()
    setHeard('')
  }

  function begin(C: RecognitionClass) {
    stopRecognition()
    const r = new C()
    r.lang = VOICE_LANG
    r.continuous = true
    r.interimResults = true
    // On the device only: never the server.
    r.processLocally = true
    r.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript.trim()
        if (result.isFinal) {
          if (text !== '') onPhraseRef.current(text)
        } else interim += `${result[0].transcript}`
      }
      setHeard(interim.trim())
    }
    r.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        wantRef.current = false
        stopRecognition()
        setState('blocked')
      } else if (event.error === 'service-not-allowed' || event.error === 'language-not-supported') {
        wantRef.current = false
        stopRecognition()
        setState('failed')
      }
      // Anything else (no speech, a pause): the end handler starts listening again.
    }
    r.onend = () => {
      setHeard('')
      if (recognitionRef.current !== r || !wantRef.current || document.visibilityState === 'hidden') return
      setTimeout(() => {
        if (recognitionRef.current !== r || !wantRef.current || document.visibilityState === 'hidden') return
        try {
          r.start()
        } catch {
          // Already started.
        }
      }, RESTART_MS)
    }
    recognitionRef.current = r
    if (document.visibilityState === 'hidden') {
      setState('paused')
      return
    }
    r.start()
    setState('listening')
  }

  async function turnOn() {
    const C = onDeviceRecognition()
    if (!C) {
      setState('unsupported')
      return
    }
    wantRef.current = true
    setState('preparing')
    try {
      if ((await C.available(PACK)) === 'unavailable') {
        wantRef.current = false
        setState('unsupported')
        return
      }
      // Until a site calls install(), available() says "downloadable" even when the pack is
      // there, so it is always called; it returns at once when the pack is ready.
      if (!(await C.install(PACK))) {
        wantRef.current = false
        setState('failed')
        return
      }
    } catch (e) {
      console.error('Getting voice ready failed', e)
      wantRef.current = false
      setState('failed')
      return
    }
    if (!wantRef.current) return
    begin(C)
  }

  function toggle() {
    if (listeningOn(state)) {
      wantRef.current = false
      stopRecognition()
      setState('off')
      return
    }
    if (state === 'unsupported') return
    void turnOn()
  }

  // Paused while the tab is hidden, back when it shows again.
  useEffect(() => {
    const onVisibility = () => {
      const C = onDeviceRecognition()
      if (!wantRef.current || !C) return
      if (document.visibilityState === 'hidden') {
        stopRecognition()
        setState('paused')
      } else begin(C)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  })

  // Leaving the Workspace stops listening.
  useEffect(
    () => () => {
      wantRef.current = false
      stopRecognition()
    },
    [],
  )

  return { state, heard, toggle }
}
