// Talking to the Workspace (#80): Chrome's on device speech recognition. Audio never
// leaves the device: recognition runs with processLocally on and never falls back to the
// server. One listening state serves the toggle under the camera and both chat mics.
// Finished phrases are joined into one message that goes after a silence (settled j, k);
// words still being heard are never shown (settled l).
import { useEffect, useRef, useState } from 'react'
import { CHAT_MAX_LENGTH } from './chat.ts'
import { joinPhrases, listeningOn, spokenMessageDueIn, VOICE_LANG, type ListeningState } from './voice.ts'

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
  // A message has been heard and waits for the silence that ends it.
  waiting: boolean
  // Turns listening on (needs a tap: the first time it gets the language pack ready) or off.
  toggle: () => void
  // Drops the message waiting for its silence; true when there was one.
  drop: () => boolean
}

// The message being heard: its finished phrases, when the first came and when any words
// were last heard.
type Pending = { phrases: string[]; firstAt: number; lastHeardAt: number }

// onMessage gets each spoken message once it is due. onTurnOn runs inside the tap that
// turns listening on.
export function useListening(onMessage: (text: string) => void, onTurnOn?: () => void): Listening {
  const [state, setState] = useState<ListeningState>(() => (onDeviceRecognition() ? 'off' : 'unsupported'))
  const [waiting, setWaiting] = useState(false)
  const pendingRef = useRef<Pending | null>(null)
  const dueTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onMessageRef = useRef(onMessage)
  // Whether the learner wants it on; the recogniser running now, if any.
  const wantRef = useRef(false)
  // True once the language pack is ready for this time listening was turned on, so a tab
  // shown again during the download never starts listening early.
  const readyRef = useRef(false)
  const recognitionRef = useRef<Recognition | null>(null)
  useEffect(() => {
    onMessageRef.current = onMessage
  })

  // The waiting message goes now, if there is one.
  function sendPending() {
    clearTimeout(dueTimerRef.current)
    const pending = pendingRef.current
    pendingRef.current = null
    setWaiting(false)
    const text = pending ? joinPhrases(pending.phrases) : ''
    if (text !== '') onMessageRef.current(text)
  }

  // Sends the waiting message when it is due, or sets a timer for then.
  function scheduleSend(now: number) {
    clearTimeout(dueTimerRef.current)
    const pending = pendingRef.current
    if (!pending) return
    const text = joinPhrases(pending.phrases)
    const dueIn = spokenMessageDueIn({ ...pending, text }, now, CHAT_MAX_LENGTH)
    if (dueIn === 0) sendPending()
    else dueTimerRef.current = setTimeout(() => scheduleSend(Date.now()), dueIn)
  }

  // Turning listening off, the tab going hidden or leaving the Workspace drops what was
  // heard and not yet sent: those words go nowhere (Tino, Nov 21).
  function stopRecognition() {
    clearTimeout(dueTimerRef.current)
    pendingRef.current = null
    setWaiting(false)
    const r = recognitionRef.current
    recognitionRef.current = null
    if (!r) return
    r.onresult = r.onerror = r.onend = null
    r.abort()
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
      const now = Date.now()
      const pending = pendingRef.current
      // Any words heard, finished or not, keep the message waiting.
      if (pending) pending.lastHeardAt = now
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript.trim()
        if (!result.isFinal || text === '') continue
        if (pendingRef.current) pendingRef.current.phrases.push(text)
        else pendingRef.current = { phrases: [text], firstAt: now, lastHeardAt: now }
        setWaiting(true)
      }
      scheduleSend(now)
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
    readyRef.current = false
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
    readyRef.current = true
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
    onTurnOn?.()
    void turnOn()
  }

  // Paused while the tab is hidden, back when it shows again.
  useEffect(() => {
    const onVisibility = () => {
      const C = onDeviceRecognition()
      if (!wantRef.current || !readyRef.current || !C) return
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

  function drop(): boolean {
    const had = pendingRef.current !== null
    clearTimeout(dueTimerRef.current)
    pendingRef.current = null
    setWaiting(false)
    return had
  }

  return { state, waiting, toggle, drop }
}
