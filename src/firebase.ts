import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  ThinkingLevel,
  type GenerativeModel,
  type LanguageModelCreateOptions,
} from 'firebase/ai'
import { firebaseConfig, recaptchaEnterpriseSiteKey } from './firebase-config'

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined
}

const app = initializeApp(firebaseConfig)

// Local dev only: App Check prints a debug token to the browser console.
// Register it in the Firebase console so localhost requests pass App Check.
if (import.meta.env.DEV) {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
  isTokenAutoRefreshEnabled: true,
})

const ai = getAI(app, { backend: new GoogleAIBackend() })

export const CLOUD_MODEL = 'gemini-4-hydrogen'

const SYSTEM_PROMPT =
  'You are Surtrix, a bench coach for hands-on electronics work. ' +
  'Answer the question about the camera image in two or three short, plain sentences.'

// Gemini Nano in Chrome takes text and JPEG or PNG images, and answers in English text.
const deviceCreateOptions: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
  initialPrompts: [{ role: 'system', content: [{ type: 'text', value: SYSTEM_PROMPT }] }],
}

export type Path = typeof InferenceMode.PREFER_ON_DEVICE | typeof InferenceMode.ONLY_IN_CLOUD

function createModel(mode: Path): GenerativeModel {
  return getGenerativeModel(ai, {
    mode,
    onDeviceParams: { createOptions: deviceCreateOptions },
    inCloudParams: {
      model: CLOUD_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    },
  })
}

const models: Record<Path, GenerativeModel> = {
  [InferenceMode.PREFER_ON_DEVICE]: createModel(InferenceMode.PREFER_ON_DEVICE),
  [InferenceMode.ONLY_IN_CLOUD]: createModel(InferenceMode.ONLY_IN_CLOUD),
}

export type FrameAnswer = {
  answer: string
  source: string
  ms: number
}

// Sends one camera frame (base64 JPEG) and a question through the hybrid model.
export async function askAboutFrame(path: Path, question: string, jpegBase64: string): Promise<FrameAnswer> {
  const started = performance.now()
  const result = await models[path].generateContent([
    question,
    { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } },
  ])
  const ms = Math.round(performance.now() - started)
  return {
    answer: result.response.text(),
    source: result.response.inferenceSource ?? 'unknown',
    ms,
  }
}

export type DeviceModelStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable'

type LanguageModelApi = {
  availability(options: LanguageModelCreateOptions): Promise<DeviceModelStatus>
}

// Reads whether Chrome's on-device model can take our text and image input.
// This only reports status; all inference goes through firebase/ai.
export async function getDeviceModelStatus(): Promise<DeviceModelStatus> {
  const api = (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel
  if (!api) return 'unavailable'
  const { expectedInputs, expectedOutputs } = deviceCreateOptions
  return api.availability({ expectedInputs, expectedOutputs })
}

// Starts the on-device model download if needed. Must run after a user click.
export function prepareDeviceModel(onProgress: (fraction: number) => void): Promise<void> {
  return models[InferenceMode.PREFER_ON_DEVICE].initializeDeviceModel(onProgress)
}
