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
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { firebaseConfig, recaptchaEnterpriseSiteKey } from './firebase-config'
import { parseWorktree, worktreePorts } from './worktree'

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined
}

const app = initializeApp(firebaseConfig)

// Local dev only: App Check uses the registered debug token from .env.local, so every
// local port and worktree shares one token. Without it, App Check prints a new token
// to the browser console, which a project owner would have to register.
if (import.meta.env.DEV) {
  const debugToken: string | undefined = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  if (debugToken) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
  } else {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true
    console.info('Put the registered App Check debug token in .env.local as VITE_APPCHECK_DEBUG_TOKEN.')
  }
}

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
  isTokenAutoRefreshEnabled: true,
})

export const ai = getAI(app, { backend: new GoogleAIBackend() })

export const auth = getAuth(app)
export const db = getFirestore(app)

// Local dev never touches the real database or user accounts: Firestore and Auth go
// to this worktree's emulators. AI Logic and App Check still use the real project.
if (import.meta.env.DEV) {
  const ports = worktreePorts(parseWorktree(import.meta.env.SURTRIX_WORKTREE))
  connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', ports.firestore)
}

let learnerSignIn: Promise<void> | null = null

// Signs the learner in anonymously, once per page. The session is kept in the
// browser, so a reload keeps the same learner. After a sign out (an expert leaving
// #expert), the next call signs a learner in again.
export function signInLearner(): Promise<void> {
  // A failed sign in is forgotten, so the next call tries again.
  learnerSignIn ??= (async () => {
    await auth.authStateReady()
    if (!auth.currentUser) await signInAnonymously(auth)
  })().catch((e: unknown) => {
    learnerSignIn = null
    throw e
  })
  return learnerSignIn.then(() => {
    if (auth.currentUser) return
    learnerSignIn = null
    return signInLearner()
  })
}

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
  // Getting the App Check token on its own; null when it was not fetched first
  // (the call was expected to stay on the device).
  appCheck: { ms: number; ok: boolean } | null
  modelMs: number
  // Cloud answers only. thinking is null when the API does not report it.
  tokens: { prompt: number; output: number; thinking: number | null } | null
}

// Sends one camera frame (base64 JPEG) and a question through the hybrid model.
export async function askAboutFrame(path: Path, question: string, jpegBase64: string): Promise<FrameAnswer> {
  const deviceOnly = path === InferenceMode.ONLY_ON_DEVICE
  // Without Chrome's LanguageModel API the SDK would quietly answer "On device only"
  // from the cloud, so refuse here instead.
  if (deviceOnly && !getLanguageModelApi()) throw new DeviceModelUnavailableError()
  const started = performance.now()
  // Only a call that may go to the cloud needs App Check. Hybrid stays on the device
  // when its model is ready, so it does not wait for a token then (and still works
  // offline).
  const mayUseCloud =
    path === InferenceMode.ONLY_IN_CLOUD ||
    (path === InferenceMode.PREFER_ON_DEVICE &&
      (await getDeviceModelStatus().catch(() => 'unavailable')) !== 'available')
  // Timed on its own so App Check time and model time can be told apart. The model
  // call below reuses the cached token. A failure here is only recorded: the model
  // call reports it the usual way.
  let appCheckResult: FrameAnswer['appCheck'] = null
  if (mayUseCloud) {
    const tokenStarted = performance.now()
    let ok = true
    try {
      await getToken(appCheck)
    } catch (e) {
      ok = false
      console.warn('App Check token failed', e)
    }
    appCheckResult = { ms: Math.round(performance.now() - tokenStarted), ok }
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
    appCheck: appCheckResult,
    modelMs: Math.round(finished - modelStarted),
    tokens: usage
      ? { prompt: usage.promptTokenCount, output: usage.candidatesTokenCount, thinking: usage.thoughtsTokenCount ?? null }
      : null,
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
