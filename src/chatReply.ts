// A reply to a learner's typed chat message (#74): gemini-3.5-flash-lite in the cloud first,
// and Gemini Nano on device when the cloud cannot answer (offline, a failed call, or no
// answer within 15 seconds), but never after a refusal for billing or quota. Cloud first
// because Nano gave unsafe substitute advice in tests on Nov 18 (Tino's decision).
// On device inference is single turn only (Firebase AI Logic hybrid docs, checked Nov 18),
// so each message is one call with the recent chat written into the prompt. Text only: no
// camera photo goes with it.
import {
  getGenerativeModel,
  InferenceMode,
  Schema,
  ThinkingLevel,
  type GenerateContentResult,
  type GenerativeModel,
  type LanguageModelCreateOptions,
} from 'firebase/ai'
import { ai } from './firebase'
import {
  aboutPartValues,
  CHAT_INSTRUCTION,
  chatPrompt,
  chatReplySchema,
  cloudStatus,
  cloudThenDevice,
  parseChatReply,
  withDeviceLimit,
  savedAnswerIds,
  type ChatAnswer,
  type ChatContext,
} from './chat.ts'

// The fast model, never the one kept for the wiring judgment.
export const CHAT_CLOUD_MODEL = 'gemini-3.5-flash-lite'

// How long the cloud gets before Nano answers instead (Tino, Nov 18).
export const CHAT_CLOUD_LIMIT_MS = 15_000

const createOptions: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
  initialPrompts: [{ role: 'system', content: [{ type: 'text', value: CHAT_INSTRUCTION }] }],
}

// The cloud only: the fallback to Nano is decided here, not by the SDK, because the SDK
// would also answer on device after a refusal for billing or quota.
function cloudModel(context: ChatContext): GenerativeModel {
  const ids = savedAnswerIds(context.savedAnswers)
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CHAT_CLOUD_MODEL,
      systemInstruction: CHAT_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: Schema.object({
          properties: {
            reply: Schema.string(),
            savedAnswerId: Schema.enumString({ enum: ids }),
            unsure: Schema.boolean(),
            aboutPart: Schema.enumString({ enum: aboutPartValues(context.step.parts) }),
          },
        }),
        // Thinking counts toward this limit, so leave it plenty of room.
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  })
}

// Nano alone, for when the cloud cannot answer.
function deviceModel(context: ChatContext): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions,
      promptOptions: { responseConstraint: chatReplySchema(context.savedAnswers, context.step.parts) },
    },
  })
}

// The models for the last list of saved answers, so the same step reuses them.
let lastModels: { key: string; cloud: GenerativeModel; device: GenerativeModel } | null = null

function modelsFor(context: ChatContext) {
  const key = JSON.stringify([savedAnswerIds(context.savedAnswers), aboutPartValues(context.step.parts)])
  if (lastModels?.key !== key) lastModels = { key, cloud: cloudModel(context), device: deviceModel(context) }
  return lastModels
}

export type ChatReply = { answer: ChatAnswer; source: string; ms: number }

type LanguageModelAvailability = { availability(options: LanguageModelCreateOptions): Promise<string> }

// Nano can answer now: never a download wait. Without Chrome's API the SDK would send even a
// device only call to the cloud.
async function nanoReady(): Promise<boolean> {
  const languageModel = (globalThis as { LanguageModel?: LanguageModelAvailability }).LanguageModel
  try {
    return languageModel !== undefined && (await languageModel.availability(createOptions)) === 'available'
  } catch {
    return false
  }
}

// The cloud gets CHAT_CLOUD_LIMIT_MS and the device DEVICE_LIMIT_MS; cloudThenDevice
// decides what happens when the cloud cannot answer. Throws when no model can answer or the reply is not in the expected shape.
export async function replyToChat(context: ChatContext): Promise<ChatReply> {
  const started = performance.now()
  const prompt = chatPrompt(context)
  const models = modelsFor(context)
  // Read inside each path, so a garbled cloud reply is known as one and never goes on to
  // the device.
  const read = (result: GenerateContentResult) => ({
    answer: parseChatReply(result.response.text(), context.savedAnswers, context.step.parts),
    source: result.response.inferenceSource ?? 'unknown',
  })
  const reply = await cloudThenDevice({
    cloud: async () => read(await models.cloud.generateContent(prompt, { timeout: CHAT_CLOUD_LIMIT_MS })),
    device: async () => read(await withDeviceLimit(models.device.generateContent(prompt))),
    deviceReady: nanoReady,
    statusOf: cloudStatus,
  })
  return { ...reply, ms: Math.round(performance.now() - started) }
}
