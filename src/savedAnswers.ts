// Saved expert answers in the coach (#31). When the coach opens a skill (online), it loads
// the saved answers of every step once and keeps them in memory, so they still help if the
// network drops. A learner's question picks one with Gemini Nano on device first, and
// gemini-3.5-flash-lite in the cloud when Nano cannot answer.
import { useEffect, useState } from 'react'
import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  Schema,
  ThinkingLevel,
  type GenerativeModel,
  type LanguageModelCreateOptions,
} from 'firebase/ai'
import { collection, getDocs } from 'firebase/firestore'
import { ai, db, signInLearner } from './firebase'
import type { CoachSkill } from './coach'
import {
  hybridThenCloud,
  parsePick,
  PICK_INSTRUCTION,
  pickPrompt,
  pickValues,
  stepAnswersFromDocuments,
  warmUp,
  warmUpOnce,
  type SavedAnswer,
  type WarmUpOutcome,
} from './savedAnswerPick'

// Cloud picking uses the fast model, never the one kept for the wiring judgment.
export const PICK_CLOUD_MODEL = 'gemini-3.5-flash-lite'

// Every step's saved answers, by step id.
export type StepAnswers = Record<string, SavedAnswer[]>

// Loads the saved answers of every step of a skill the coach loaded. Only these are ever
// offered, so an answer filed under a skill or step that does not exist is never used.
export async function loadSavedAnswers(skill: CoachSkill): Promise<StepAnswers> {
  await signInLearner()
  const steps = await Promise.all(
    skill.steps.map(async (step) => {
      const snapshot = await getDocs(collection(db, 'skills', skill.id, 'steps', step.id, 'answers'))
      return { stepId: step.id, documents: snapshot.docs.map((d) => ({ id: d.id, data: d.data() })) }
    }),
  )
  return stepAnswersFromDocuments(steps)
}

export type SavedAnswersState = { kind: 'loading' } | { kind: 'loaded'; byStep: StepAnswers } | { kind: 'failed' }

// The coach's saved answers, loaded once per skill.
export function useSavedAnswers(skill: CoachSkill): SavedAnswersState {
  const [state, setState] = useState<{ skillId: string; value: SavedAnswersState }>({
    skillId: skill.id,
    value: { kind: 'loading' },
  })
  useEffect(() => {
    let onScreen = true
    loadSavedAnswers(skill).then(
      (byStep) => onScreen && setState({ skillId: skill.id, value: { kind: 'loaded', byStep } }),
      (e) => {
        console.error('Loading saved answers failed', e)
        if (onScreen) setState({ skillId: skill.id, value: { kind: 'failed' } })
      },
    )
    return () => {
      onScreen = false
    }
  }, [skill])
  return state.skillId === skill.id ? state.value : { kind: 'loading' }
}

const createOptions: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
  initialPrompts: [{ role: 'system', content: [{ type: 'text', value: PICK_INSTRUCTION }] }],
}

export type Pick = {
  // null when no saved answer fits the question.
  answer: SavedAnswer | null
  source: string
  ms: number
}

function pickModel(mode: InferenceMode, values: string[]) {
  return getGenerativeModel(ai, {
    mode,
    onDeviceParams: { createOptions, promptOptions: { responseConstraint: { type: 'string', enum: values } } },
    inCloudParams: {
      model: PICK_CLOUD_MODEL,
      systemInstruction: PICK_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'text/x.enum',
        responseSchema: Schema.enumString({ enum: values }),
        // Thinking counts toward this limit, so leave it plenty of room.
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  })
}

// The models for the last list of answers. Each model keeps its own Nano session, so
// asking again on the same step reuses it instead of opening another one. device is used
// only to warm up, and its session keeps Nano loaded.
type PickModels = {
  key: string
  hybrid: GenerativeModel
  cloud: GenerativeModel
  device: GenerativeModel
  warmUp?: Promise<WarmUpOutcome>
}
let lastModels: PickModels | null = null

function pickModels(values: string[]) {
  const key = JSON.stringify(values)
  if (lastModels?.key !== key) {
    lastModels = {
      key,
      hybrid: pickModel(InferenceMode.PREFER_ON_DEVICE, values),
      cloud: pickModel(InferenceMode.ONLY_IN_CLOUD, values),
      device: pickModel(InferenceMode.ONLY_ON_DEVICE, values),
    }
  }
  return lastModels
}

// Picks the saved answer that fits the learner's question. Hybrid answers on device when
// Nano is ready (also offline) and in the cloud when it is not. The SDK does not move a
// failed device call to the cloud, so where Chrome has Nano a failed call is tried once in
// the cloud (offline that fails at once). Every answer of the step goes to the model.
// Throws when no model can answer or the pick is not one of the answers; the caller then
// lists the answers as they are.
export async function pickSavedAnswer(stepTitle: string, question: string, answers: SavedAnswer[]): Promise<Pick> {
  const values = pickValues(answers)
  const prompt = pickPrompt(stepTitle, question, answers)
  const started = performance.now()
  const models = pickModels(values)
  const result = await hybridThenCloud(
    () => models.hybrid.generateContent(prompt),
    () => models.cloud.generateContent(prompt),
    'LanguageModel' in globalThis,
  )
  const ms = Math.round(performance.now() - started)
  return { answer: parsePick(result.response.text(), answers), source: result.response.inferenceSource ?? 'unknown', ms }
}

// What a warm up asks. Any pick will do: the answer is thrown away.
const WARM_UP_QUESTION = 'Which saved answer fits?'

type LanguageModelAvailability = { availability(options: LanguageModelCreateOptions): Promise<string> }

// Warms up Nano for this step's answers when the Ask an Expert panel opens (#43), once per
// list of answers, so the first pick does not wait for the model to load. Only where Chrome
// already has Nano ready: never a download, never the cloud. Nothing on screen changes.
export function warmUpPicker(stepTitle: string, answers: SavedAnswer[]): Promise<WarmUpOutcome> {
  const models = pickModels(pickValues(answers))
  const languageModel = (globalThis as { LanguageModel?: LanguageModelAvailability }).LanguageModel
  return warmUpOnce(models, () =>
    warmUp({
      // Without Chrome's API the SDK would send even a device only call to the cloud.
      hasNano: languageModel !== undefined,
      availability: () => languageModel!.availability(createOptions),
      warm: async () => {
        const result = await models.device.generateContent(pickPrompt(stepTitle, WARM_UP_QUESTION, answers))
        if (result.response.inferenceSource !== InferenceSource.ON_DEVICE) {
          throw new Error('The warm up did not run on device.')
        }
      },
    }),
  )
}
