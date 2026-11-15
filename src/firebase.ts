import { initializeApp } from 'firebase/app'
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import {
  AIError,
  AIErrorCode,
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

const appCheck = initializeAppCheck(app, {
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

// Hybrid (PREFER_ON_DEVICE) is the default: on device first, cloud fallback.
export type Path =
  | typeof InferenceMode.PREFER_ON_DEVICE
  | typeof InferenceMode.ONLY_ON_DEVICE
  | typeof InferenceMode.ONLY_IN_CLOUD

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
  [InferenceMode.ONLY_ON_DEVICE]: createModel(InferenceMode.ONLY_ON_DEVICE),
  [InferenceMode.ONLY_IN_CLOUD]: createModel(InferenceMode.ONLY_IN_CLOUD),
}

// Thrown when "On device only" is chosen but the on-device model cannot answer here.
export class DeviceModelUnavailableError extends Error {
  constructor() {
    super('The on-device model is not available in this browser.')
    this.name = 'DeviceModelUnavailableError'
  }
}

function getLanguageModelApi(): LanguageModelApi | undefined {
  return (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel
}

export type FrameAnswer = {
  answer: string
  source: string
  // Total time: App Check token plus model call.
  ms: number
  // Time to get the App Check token; null when no cloud call can happen.
  appCheckMs: number | null
  modelMs: number
  // Cloud answers only.
  tokens: { prompt: number; output: number; thinking: number } | null
  modelVersion: string | null
}

// Sends one camera frame (base64 JPEG) and a question through the hybrid model.
export async function askAboutFrame(path: Path, question: string, jpegBase64: string): Promise<FrameAnswer> {
  const deviceOnly = path === InferenceMode.ONLY_ON_DEVICE
  // Without Chrome's LanguageModel API the SDK would quietly answer "On device only"
  // from the cloud, so refuse here instead.
  if (deviceOnly && !getLanguageModelApi()) throw new DeviceModelUnavailableError()
  const started = performance.now()
  // Timed on its own so App Check time and model time can be told apart. The model
  // call below reuses this cached token.
  let appCheckMs: number | null = null
  if (!deviceOnly) {
    await getToken(appCheck)
    appCheckMs = Math.round(performance.now() - started)
  }
  const modelStarted = performance.now()
  let result
  try {
    result = await models[path].generateContent([
      question,
      { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } },
    ])
  } catch (e) {
    const deviceRefused =
      e instanceof AIError && (e.code === AIErrorCode.API_NOT_ENABLED || e.code === AIErrorCode.UNSUPPORTED)
    if (deviceOnly && deviceRefused) throw new DeviceModelUnavailableError()
    throw e
  }
  const finished = performance.now()
  const usage = result.response.usageMetadata
  return {
    answer: result.response.text(),
    source: result.response.inferenceSource ?? 'unknown',
    ms: Math.round(finished - started),
    appCheckMs,
    modelMs: Math.round(finished - modelStarted),
    tokens: usage
      ? { prompt: usage.promptTokenCount, output: usage.candidatesTokenCount, thinking: usage.thoughtsTokenCount ?? 0 }
      : null,
    // Sent by the cloud API and kept on the response, but not in the SDK's types.
    modelVersion: (result.response as { modelVersion?: string }).modelVersion ?? null,
  }
}

export type DeviceModelStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable'

type LanguageModelApi = {
  availability(options: LanguageModelCreateOptions): Promise<DeviceModelStatus>
}

// Reads whether Chrome's on-device model can take our text and image input.
// This only reports status; all inference goes through firebase/ai.
export async function getDeviceModelStatus(): Promise<DeviceModelStatus> {
  const api = getLanguageModelApi()
  if (!api) return 'unavailable'
  const { expectedInputs, expectedOutputs } = deviceCreateOptions
  return api.availability({ expectedInputs, expectedOutputs })
}

// Starts the on-device model download if needed, for both modes that use it.
// Must run after a user click. Chrome downloads the model once.
export function prepareDeviceModel(onProgress: (fraction: number) => void): Promise<void> {
  models[InferenceMode.ONLY_ON_DEVICE]
    .initializeDeviceModel()
    .catch((e) => console.warn('On device only model preparation failed', e))
  return models[InferenceMode.PREFER_ON_DEVICE].initializeDeviceModel(onProgress)
}
