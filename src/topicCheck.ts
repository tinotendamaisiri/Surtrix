// Before a spoken message goes to the cloud chat, Gemini Nano on this device checks that it
// was said to the coach about the task, and not other talk in the room (#80, settled m to
// o). On the device only, through firebase/ai: a message Nano does not pass, or cannot
// check, never leaves the page.
import { getGenerativeModel, InferenceMode, type LanguageModelCreateOptions } from 'firebase/ai'
import { ai } from './firebase'
import { DEVICE_LIMIT_MS } from './chat.ts'
import { topicCheckInstruction, topicCheckQuestion, topicVerdict, type TopicContext, type TopicVerdict } from './voice.ts'

const createOptions: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

// Loads Nano; the checks themselves use a model with the step's own instruction.
const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions } })

function checkModel(context: TopicContext) {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        ...createOptions,
        initialPrompts: [{ role: 'system', content: [{ type: 'text', value: topicCheckInstruction(context) }] }],
      },
    },
  })
}

type LanguageModelStatus = { availability(options: LanguageModelCreateOptions): Promise<string> }

// Whether Nano can run on this device at all: false where Chrome has no on-device model
// (another browser, a phone, a computer below Nano's needs). This only reads the status.
export async function topicCheckPossible(): Promise<boolean> {
  const languageModel = (globalThis as { LanguageModel?: LanguageModelStatus }).LanguageModel
  if (!languageModel) return false
  try {
    return (await languageModel.availability(createOptions)) !== 'unavailable'
  } catch {
    return false
  }
}

// Starts loading Nano (and its download, the first time) when Listening turns on, so the
// first message does not wait for it. Must run from the tap that turns Listening on.
export function prepareTopicCheck() {
  model.initializeDeviceModel().catch((e) => console.warn('Getting the voice check ready failed', e))
}

// Nano's verdict on one spoken message, within DEVICE_LIMIT_MS, a first load included.
export function checkTopic(context: TopicContext, message: string): Promise<TopicVerdict> {
  return topicVerdict(
    topicCheckPossible,
    async () => (await checkModel(context).generateContent(topicCheckQuestion(message))).response.text(),
    DEVICE_LIMIT_MS,
  )
}
