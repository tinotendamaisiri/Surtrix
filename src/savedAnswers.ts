// Saved expert answers in the coach (#31). When the coach opens a skill (online), it loads
// the saved answers of every step and keeps listening (#65), with them in memory, so they
// still help if the network drops and a new answer shows at once. A learner's question picks one with Gemini Nano on device first, and
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
import { collection, onSnapshot } from 'firebase/firestore'
import { ai, db, signInLearner } from './firebase'
import type { CoachSkill } from './coach'
import {
  hasSavedAnswers,
  hybridThenCloud,
  NONE_FITS,
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

export type SavedAnswersState = { kind: 'loading' } | { kind: 'loaded'; byStep: StepAnswers } | { kind: 'failed' }

// Listens to the saved answers of every step of a skill the coach loaded, so a new expert
// answer shows at once (#65). Only these steps are ever offered, so an answer filed under a
// skill or step that does not exist is never used. The answers stay in memory, so they
// still help if the network drops. onChange gets every step's answers once each step has
// loaded, then again on every change. Returns a function that stops listening.
export function watchSavedAnswers(
  skill: CoachSkill,
  onChange: (byStep: StepAnswers) => void,
  onError: (error: unknown) => void,
): () => void {
  let stopped = false
  const stops: (() => void)[] = []
  const documents = new Map<string, { id: string; data: Record<string, unknown> }[]>()
  signInLearner().then(() => {
    if (stopped) return
    for (const step of skill.steps) {
      stops.push(
        onSnapshot(
          collection(db, 'skills', skill.id, 'steps', step.id, 'answers'),
          (snapshot) => {
            documents.set(step.id, snapshot.docs.map((d) => ({ id: d.id, data: d.data() })))
            if (documents.size < skill.steps.length) return
            onChange(stepAnswersFromDocuments(skill.steps.map((s) => ({ stepId: s.id, documents: documents.get(s.id) ?? [] }))))
          },
          onError,
        ),
      )
    }
  }, onError)
  return () => {
    stopped = true
    stops.forEach((stop) => stop())
  }
}

// The coach's saved answers, kept up to date while it is open.
export function useSavedAnswers(skill: CoachSkill): SavedAnswersState {
  const [state, setState] = useState<{ skillId: string; value: SavedAnswersState }>({
    skillId: skill.id,
    value: { kind: 'loading' },
  })
  useEffect(() => {
    let first = true
    const stop = watchSavedAnswers(
      skill,
      (byStep) => {
        setState({ skillId: skill.id, value: { kind: 'loaded', byStep } })
        // Get Nano ready while the learner works, so the first pick is quick (#43).
        if (first && hasSavedAnswers(byStep)) void warmUpNano()
        first = false
      },
      (e) => {
        console.error('Loading saved answers failed', e)
        // Answers already loaded stay; only a first load that fails shows as failed.
        setState((current) =>
          current.skillId === skill.id && current.value.kind === 'loaded' ? current : { skillId: skill.id, value: { kind: 'failed' } },
        )
      },
    )
    return stop
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
// asking again on the same step reuses it instead of opening another one.
let lastModels: { key: string; hybrid: GenerativeModel; cloud: GenerativeModel } | null = null

function pickModels(values: string[]) {
  const key = JSON.stringify(values)
  if (lastModels?.key !== key) {
    lastModels = {
      key,
      hybrid: pickModel(InferenceMode.PREFER_ON_DEVICE, values),
      cloud: pickModel(InferenceMode.ONLY_IN_CLOUD, values),
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

// Warming up (#43): a tiny device only call loads Nano into memory, and this model keeps its
// session for the rest of the visit, so Nano stays loaded and each pick only opens its own
// session. It may only answer "none", and that answer is thrown away.
const WARM_UP_PROMPT = 'Answer none.'
let warmUpModel: GenerativeModel | null = null
const nanoWarmUp: { warmUp?: Promise<WarmUpOutcome> } = {}

type LanguageModelAvailability = { availability(options: LanguageModelCreateOptions): Promise<string> }

// Warms up Nano once per visit when the coach opens a skill with saved answers. Only where
// Chrome already has Nano ready for the picker: never a download, never the cloud. Nothing
// on screen changes.
export function warmUpNano(): Promise<WarmUpOutcome> {
  const languageModel = (globalThis as { LanguageModel?: LanguageModelAvailability }).LanguageModel
  return warmUpOnce(nanoWarmUp, () =>
    warmUp({
      // Without Chrome's API the SDK would send even a device only call to the cloud.
      hasNano: languageModel !== undefined,
      availability: () => languageModel!.availability(createOptions),
      warm: async () => {
        warmUpModel ??= getGenerativeModel(ai, {
          mode: InferenceMode.ONLY_ON_DEVICE,
          onDeviceParams: { createOptions, promptOptions: { responseConstraint: { type: 'string', enum: [NONE_FITS] } } },
        })
        const result = await warmUpModel.generateContent(WARM_UP_PROMPT)
        if (result.response.inferenceSource !== InferenceSource.ON_DEVICE) {
          throw new Error('The warm up did not run on device.')
        }
      },
    }),
  )
}
