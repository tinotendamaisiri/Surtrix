import { useEffect, useRef, useState } from 'react'
import { InferenceMode, InferenceSource } from 'firebase/ai'
import {
  askAboutFrame,
  getDeviceModelStatus,
  prepareDeviceModel,
  type DeviceModelStatus,
  type FrameAnswer,
  type Path,
} from './firebase'

// Longest side of the frame sent to the model, in pixels.
const FRAME_MAX_SIDE = 768

type Capture = FrameAnswer & { frameUrl: string; question: string }

const deviceStatusText: Record<DeviceModelStatus, string> = {
  available: 'Ready',
  downloadable: 'Not downloaded yet',
  downloading: 'Downloading',
  unavailable: 'Not available on this device',
}

const sourceText: Record<string, string> = {
  [InferenceSource.ON_DEVICE]: 'On device',
  [InferenceSource.IN_CLOUD]: 'Cloud',
}

function grabFrame(video: HTMLVideoElement): string {
  const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [path, setPath] = useState<Path>(InferenceMode.PREFER_ON_DEVICE)
  const [question, setQuestion] = useState('Which parts are visible, and is the LED lit?')
  const [deviceStatus, setDeviceStatus] = useState<DeviceModelStatus | null>(null)
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [capture, setCapture] = useState<Capture | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDeviceModelStatus().then(setDeviceStatus, () => setDeviceStatus('unavailable'))
    return () => streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      videoRef.current!.srcObject = stream
      setCameraOn(true)
    } catch {
      setError('Could not open the camera. Check the browser has permission to use it.')
      return
    }
    // The on-device model may need a download, which Chrome only allows after a click.
    prepareDeviceModel((fraction) => {
      setDeviceStatus('downloading')
      setDownloadPercent(Math.round(fraction * 100))
    })
      .then(getDeviceModelStatus)
      .then(setDeviceStatus)
      .catch(() => setDeviceStatus('unavailable'))
      .finally(() => setDownloadPercent(null))
  }

  async function captureAndAsk() {
    const video = videoRef.current
    if (!video || !question.trim()) return
    setBusy(true)
    setError(null)
    const frameUrl = grabFrame(video)
    try {
      const result = await askAboutFrame(path, question.trim(), frameUrl.split(',')[1])
      setCapture({ ...result, frameUrl, question: question.trim() })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
        <video ref={videoRef} autoPlay playsInline muted hidden={!cameraOn} />
        {!cameraOn && (
          <button type="button" onClick={startCamera}>
            Start camera
          </button>
        )}
      </section>

      <section className="controls">
        <fieldset>
          <legend>Answer from</legend>
          <label>
            <input
              type="radio"
              name="path"
              checked={path === InferenceMode.PREFER_ON_DEVICE}
              onChange={() => setPath(InferenceMode.PREFER_ON_DEVICE)}
            />
            Prefer on device
          </label>
          <label>
            <input
              type="radio"
              name="path"
              checked={path === InferenceMode.ONLY_IN_CLOUD}
              onChange={() => setPath(InferenceMode.ONLY_IN_CLOUD)}
            />
            Cloud only
          </label>
        </fieldset>

        <p className="muted">
          On device model:{' '}
          {deviceStatus ? deviceStatusText[deviceStatus] : 'Checking'}
          {downloadPercent !== null && ` ${downloadPercent}%`}
        </p>

        <label className="question">
          Question
          <textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>

        <button type="button" onClick={captureAndAsk} disabled={!cameraOn || busy || !question.trim()}>
          {busy ? 'Thinking' : 'Capture'}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {capture && (
        <section className="result">
          <img src={capture.frameUrl} alt="Captured frame" />
          <div>
            <p className="muted">{capture.question}</p>
            <p>{capture.answer}</p>
            <dl>
              <dt>Answered</dt>
              <dd>{sourceText[capture.source] ?? capture.source}</dd>
              <dt>Response time</dt>
              <dd>{capture.ms.toLocaleString('en-US')} ms</dd>
            </dl>
          </div>
        </section>
      )}
    </main>
  )
}
