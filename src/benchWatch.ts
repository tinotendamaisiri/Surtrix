// Watching the bench: while the coach's camera is on, the tab is visible and Gemini Nano is
// ready, the coach asks Nano about the current frame, one question at a time, on device
// only. It never calls the cloud and never changes the step.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  AIError,
  AIErrorCode,
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
  type LanguageModelCreateOptions,
} from 'firebase/ai'
import { grabFrameBase64 } from './cameraFrame.ts'
import { ai, getDeviceModelStatus, prepareDeviceModel, type DeviceModelStatus } from './firebase'
import { benchAnswerSchema, benchQuestion, parseBenchAnswer, type BenchAnswer } from './watch.ts'

// The pause after each answer before the next question. Nano answers in about 2 to 3 s.
const PAUSE_MS = 3000
// While the video has no picture yet, look again soon.
const NO_PICTURE_RETRY_MS = 500

const createOptions: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

export type BenchLook = { stepId: string; answer: BenchAnswer; source: string; at: Date; ms: number }

// Nano cannot answer here, so watching stops for this visit.
class NotOnDeviceError extends Error {
  constructor() {
    super('Watching the bench needs the on device model.')
    this.name = 'NotOnDeviceError'
  }
}

function hasNano(): boolean {
  return 'LanguageModel' in globalThis
}

// Nano answers in JSON that keeps to the schema built from these parts.
function benchModel(parts: string[]): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions, promptOptions: { responseConstraint: benchAnswerSchema(parts) } },
  })
}

// One question about one frame. Without Chrome's LanguageModel API the SDK would send even
// an "on device only" call to the cloud, so that is refused before the call. An answer from
// anywhere but the device is refused too.
async function askNano(model: GenerativeModel, parts: string[], jpegBase64: string) {
  if (!hasNano()) throw new NotOnDeviceError()
  const started = performance.now()
  let result
  try {
    result = await model.generateContent([
      benchQuestion(parts),
      { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } },
    ])
  } catch (e) {
    if (e instanceof AIError && (e.code === AIErrorCode.API_NOT_ENABLED || e.code === AIErrorCode.UNSUPPORTED)) {
      throw new NotOnDeviceError()
    }
    throw e
  }
  const ms = Math.round(performance.now() - started)
  const source = result.response.inferenceSource
  if (source !== InferenceSource.ON_DEVICE) throw new NotOnDeviceError()
  return { answer: parseBenchAnswer(result.response.text(), parts), source, at: new Date(), ms }
}

export type BenchWatch = {
  deviceStatus: DeviceModelStatus | null
  // While Chrome downloads the model after a click, else null.
  downloadPercent: number | null
  // The latest answer for this step while the camera is on, else null.
  look: BenchLook | null
  // Starts the model download if it is needed. Call it from a click.
  prepare: () => void
}

export function useBenchWatch(
  videoRef: RefObject<HTMLVideoElement | null>,
  cameraOn: boolean,
  stepId: string,
  parts: string[],
): BenchWatch {
  const [deviceStatus, setDeviceStatus] = useState<DeviceModelStatus | null>(null)
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [latest, setLatest] = useState<BenchLook | null>(null)
  // The question Nano is answering, so a new step never asks a second one at the same time.
  const inFlight = useRef<Promise<unknown>>(Promise.resolve())
  const model = useMemo(() => benchModel(parts), [parts])

  useEffect(() => {
    let current = true
    // Only the first status: a Start camera click may already have started the download.
    getDeviceModelStatus().then(
      (status) => current && setDeviceStatus((known) => known ?? status),
      () => current && setDeviceStatus((known) => known ?? 'unavailable'),
    )
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const watching = cameraOn && visible && deviceStatus === 'available'

  useEffect(() => {
    if (!watching) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const lookAgain = (ms: number) => {
      if (!stopped) timer = setTimeout(look, ms)
    }
    async function look() {
      await inFlight.current
      if (stopped) return
      const frame = grabFrameBase64(videoRef.current)
      if (!frame) return lookAgain(NO_PICTURE_RETRY_MS)
      const call = askNano(model, parts, frame)
      inFlight.current = call.catch(() => {})
      try {
        const answer = await call
        if (!stopped) setLatest({ stepId, ...answer })
      } catch (e) {
        if (e instanceof NotOnDeviceError) {
          setDeviceStatus('unavailable')
          return
        }
        console.warn('Watching the bench: no usable answer', e)
      }
      lookAgain(PAUSE_MS)
    }
    void look()
    return () => {
      stopped = true
      clearTimeout(timer)
      // An answer belongs to this round of watching: after the camera restarts, the tab
      // comes back or the step changes, the coach waits for a fresh one.
      setLatest(null)
    }
  }, [watching, model, parts, stepId, videoRef])

  function prepare() {
    if (!hasNano() || deviceStatus === 'available' || deviceStatus === 'unavailable') return
    setDeviceStatus('downloading')
    prepareDeviceModel((fraction) => setDownloadPercent(Math.round(fraction * 100)))
      .catch((e: unknown) => console.error('On device model preparation failed', e))
      .then(getDeviceModelStatus)
      .then(setDeviceStatus, () => setDeviceStatus('unavailable'))
      .finally(() => setDownloadPercent(null))
  }

  return {
    deviceStatus,
    downloadPercent,
    look: cameraOn && latest?.stepId === stepId ? latest : null,
    prepare,
  }
}
