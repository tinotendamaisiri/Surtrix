import { useEffect, useRef, useState } from 'react'
import { InferenceMode, InferenceSource } from 'firebase/ai'
import {
  askAboutFrame,
  DeviceModelUnavailableError,
  getDeviceModelStatus,
  prepareDeviceModel,
  type DeviceModelStatus,
  type FrameAnswer,
  type Path,
} from './firebase'

// Longest side of the frame sent to the model, in pixels.
const FRAME_MAX_SIDE = 768

type Frame = { url: string; width: number; height: number; bytes: number }

type Capture = FrameAnswer & { frame: Frame; question: string }

const deviceStatusText: Record<DeviceModelStatus, string> = {
  available: 'Ready',
  downloadable: 'Not downloaded yet',
  downloading: 'Downloading',
  unavailable: 'Not available on this device',
}

const pathOptions: { path: Path; label: string }[] = [
  { path: InferenceMode.PREFER_ON_DEVICE, label: 'Hybrid (on device first, cloud fallback)' },
  { path: InferenceMode.ONLY_ON_DEVICE, label: 'On device only' },
  { path: InferenceMode.ONLY_IN_CLOUD, label: 'Cloud only' },
]

const sourceText: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'On device',
  [InferenceSource.IN_CLOUD]: 'Cloud',
}

function grabFrame(video: HTMLVideoElement): Frame {
  const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.85)
  const base64 = url.split(',')[1]
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return { url, width: canvas.width, height: canvas.height, bytes: (base64.length * 3) / 4 - padding }
}

function formatMs(ms: number): string {
  return `${ms.toLocaleString('en-US')} ms`
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [path, setPath] = useState<Path>(InferenceMode.PREFER_ON_DEVICE)
  // Neutral: Gemini Nano tends to describe whatever a question assumes is there.
  const [question, setQuestion] = useState('Which parts are visible? If there is an LED, is it lit?')
  const [deviceStatus, setDeviceStatus] = useState<DeviceModelStatus | null>(null)
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [capture, setCapture] = useState<Capture | null>(null)
  const [error, setError] = useState<string | null>(null)

  // When the on-device model cannot run here, "On device only" is not an option.
  function updateDeviceStatus(status: DeviceModelStatus) {
    setDeviceStatus(status)
    if (status === 'unavailable') {
      setPath((current) => (current === InferenceMode.ONLY_ON_DEVICE ? InferenceMode.PREFER_ON_DEVICE : current))
    }
  }

  function refreshDeviceStatus() {
    getDeviceModelStatus().then(updateDeviceStatus, () => updateDeviceStatus('unavailable'))
  }

  useEffect(() => {
    refreshDeviceStatus()
    return () => streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  async function startCamera() {
    setError(null)
    // The on-device model may need a download, which Chrome only allows right after a
    // click, so start it before waiting on the camera permission prompt.
    prepareDeviceModel((fraction) => {
      setDeviceStatus('downloading')
      setDownloadPercent(Math.round(fraction * 100))
    })
      .catch((e) => console.error('On device model preparation failed', e))
      .then(refreshDeviceStatus)
      .finally(() => setDownloadPercent(null))

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      videoRef.current!.srcObject = stream
      setCameraOn(true)
    } catch {
      setError('Could not open the camera. Check the browser has permission to use it.')
    }
  }

  async function captureAndAsk() {
    const video = videoRef.current
    if (!video || !videoReady || !question.trim()) return
    setBusy(true)
    setError(null)
    const frame = grabFrame(video)
    try {
      const result = await askAboutFrame(path, question.trim(), frame.url.split(',')[1])
      setCapture({ ...result, frame, question: question.trim() })
    } catch (e) {
      console.error('Capture failed', e)
      if (e instanceof DeviceModelUnavailableError) {
        setError('The on device model is not available on this computer.')
        refreshDeviceStatus()
      } else {
        setError('Could not get an answer. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <header>
        <h1>Surtrix</h1>
        <p className="muted">Capture test</p>
      </header>

      <section className="camera">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          hidden={!cameraOn}
          onLoadedMetadata={() => setVideoReady(true)}
        />
        {!cameraOn && (
          <button type="button" onClick={startCamera}>
            Start camera
          </button>
        )}
      </section>

      <section className="controls">
        <fieldset>
          <legend>Answer from</legend>
          {pathOptions.map((option) => (
            <label key={option.path}>
              <input
                type="radio"
                name="path"
                checked={path === option.path}
                disabled={option.path === InferenceMode.ONLY_ON_DEVICE && deviceStatus === 'unavailable'}
                onChange={() => setPath(option.path)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        {path === InferenceMode.ONLY_ON_DEVICE &&
          (deviceStatus === 'downloading' || deviceStatus === 'downloadable') && (
            <p className="muted">
              {deviceStatus === 'downloadable' && !cameraOn
                ? 'Click Start camera to download the on device model.'
                : 'The answer will come once the on device model finishes downloading.'}
            </p>
          )}

        <p className="muted">
          On device model:{' '}
          {deviceStatus ? deviceStatusText[deviceStatus] : 'Checking'}
          {downloadPercent !== null && ` ${downloadPercent}%`}
        </p>

        <label className="question">
          Question
          <textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>

        <button type="button" onClick={captureAndAsk} disabled={!videoReady || busy || !question.trim()}>
          {busy ? 'Thinking' : 'Capture'}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {capture && (
        <section className="result">
          <img src={capture.frame.url} alt="Captured frame" />
          <div>
            <p className="muted">{capture.question}</p>
            <p>{capture.answer}</p>
            <dl>
              <dt>Answered</dt>
              <dd>{sourceText[capture.source] ?? capture.source}</dd>
              <dt>Response time</dt>
              <dd>{formatMs(capture.ms)}</dd>
            </dl>
            <details>
              <summary>Details</summary>
              <dl>
                <dt>App Check token</dt>
                <dd>
                  {capture.appCheck
                    ? `${formatMs(capture.appCheck.ms)}${capture.appCheck.ok ? '' : ', failed'}`
                    : capture.source === InferenceSource.IN_CLOUD
                      ? 'Included in the model call'
                      : 'Not needed'}
                </dd>
                <dt>Model call</dt>
                <dd>{formatMs(capture.modelMs)}</dd>
                <dt>Total</dt>
                <dd>{formatMs(capture.ms)}</dd>
                <dt>Frame sent</dt>
                <dd>
                  {capture.frame.width} x {capture.frame.height}, JPEG{' '}
                  {(capture.frame.bytes / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KB
                </dd>
                {capture.tokens && (
                  <>
                    <dt>Tokens</dt>
                    <dd>
                      {capture.tokens.prompt} prompt, {capture.tokens.output} output,{' '}
                      {capture.tokens.thinking === null ? 'thinking not reported' : `${capture.tokens.thinking} thinking`}
                    </dd>
                  </>
                )}
              </dl>
            </details>
          </div>
        </section>
      )}
    </main>
  )
}
