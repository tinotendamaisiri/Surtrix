// A reply to a learner's typed chat message (#74): gemini-3.5-flash-lite in the cloud first,
// and Gemini Nano on device when the cloud cannot answer (offline, a failed call, or no
// answer within 15 seconds). Cloud
// first because Nano gave unsafe substitute advice in tests on Nov 18 (Tino's decision).
// On device inference is single turn only (Firebase AI Logic hybrid docs, checked Nov 18),
// so each message is one call with the recent chat written into the prompt. Text only: no
// camera photo goes with it.
import {
  getGenerativeModel,
  InferenceMode,
  Schema,
  ThinkingLevel,
  type GenerativeModel,
  type LanguageModelCreateOptions,
} from 'firebase/ai'
import { ai } from './firebase'
import { CHAT_INSTRUCTION, chatPrompt, chatReplySchema, parseChatReply, savedAnswerIds, type ChatAnswer, type ChatContext } from './chat.ts'

// The fast model, never the one kept for the wiring judgment.
export const CHAT_CLOUD_MODEL = 'gemini-3.5-flash-lite'

// How long the cloud gets before Nano answers instead (Tino, Nov 18).
export const CHAT_CLOUD_LIMIT_MS = 15_000

const createOptions: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
  initialPrompts: [{ role: 'system', content: [{ type: 'text', value: CHAT_INSTRUCTION }] }],
}

// The SDK falls back to Nano when the cloud call fails with a network or server error and
// Nano is ready.
function chatModel(context: ChatContext): GenerativeModel {
  const ids = savedAnswerIds(context.savedAnswers)
  return getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_IN_CLOUD,
    onDeviceParams: { createOptions, promptOptions: { responseConstraint: chatReplySchema(context.savedAnswers) } },
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
          },
        }),
        // Thinking counts toward this limit, so leave it plenty of room.
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
  })
}

// Nano alone, for a cloud call that ran out of time: the SDK does not fall back then.
function deviceModel(context: ChatContext): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions, promptOptions: { responseConstraint: chatReplySchema(context.savedAnswers) } },
  })
}

// The models for the last list of saved answers, so the same step reuses them.
let lastModels: { key: string; hybrid: GenerativeModel; device: GenerativeModel } | null = null

function modelsFor(context: ChatContext) {
  const key = JSON.stringify(savedAnswerIds(context.savedAnswers))
  if (lastModels?.key !== key) lastModels = { key, hybrid: chatModel(context), device: deviceModel(context) }
  return lastModels
}

export type ChatReply = { answer: ChatAnswer; source: string; ms: number }

function timedOut(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

// The cloud gets CHAT_CLOUD_LIMIT_MS. When it runs out of time and Chrome has Nano, Nano
// answers on device. Throws when no model can answer or the reply is not in the expected
// shape.
export async function replyToChat(context: ChatContext): Promise<ChatReply> {
  const started = performance.now()
  const prompt = chatPrompt(context)
  const models = modelsFor(context)
  let result
  try {
    result = await models.hybrid.generateContent(prompt, { timeout: CHAT_CLOUD_LIMIT_MS })
  } catch (e) {
    // Without Chrome's API the SDK would send even a device only call to the cloud.
    if (!timedOut(e) || !('LanguageModel' in globalThis)) throw e
    console.warn('The cloud took too long, answering on device', e)
    result = await models.device.generateContent(prompt)
  }
  return {
    answer: parseChatReply(result.response.text(), context.savedAnswers),
    source: result.response.inferenceSource ?? 'unknown',
    ms: Math.round(performance.now() - started),
  }
}
