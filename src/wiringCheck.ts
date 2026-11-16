// The wiring check: when the learner marks a step done, gemini-4-hydrogen judges the camera
// frame against the step, cloud only, through firebase/ai (App Check is applied by the SDK).
import { getGenerativeModel, InferenceMode, Schema, ThinkingLevel } from 'firebase/ai'
import { ai } from './firebase'
import type { Step } from './skill.ts'
import {
  parseWiringCheck,
  WIRING_MODEL,
  WIRING_SYSTEM_PROMPT,
  WIRING_VERDICTS,
  wiringPrompt,
  type WiringCheck,
} from './wiring.ts'

const verdictSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: [...WIRING_VERDICTS], description: 'Whether the photo shows the step done correctly.' }),
    whatIsWrong: Schema.string({ description: 'What is wrong or missing, or why the photo cannot tell. Empty when correct.' }),
    whatToMove: Schema.string({ description: 'Exactly what to move and where. Empty when correct or unsure.' }),
  },
  propertyOrdering: ['verdict', 'whatIsWrong', 'whatToMove'],
})

const wiringModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: WIRING_MODEL,
    systemInstruction: WIRING_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: verdictSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  },
})

export type WiringResult = { check: WiringCheck; source: string; at: Date; ms: number }

// One cloud call per Mark step done click. Throws when the call fails, is cancelled through
// signal, or the answer does not pass the checks in src/wiring.ts. Cancelling does not stop
// Google from charging for the call.
export async function checkWiring(step: Step, jpegBase64: string, signal: AbortSignal): Promise<WiringResult> {
  const started = performance.now()
  // The SDK ignores the signal while it gets the App Check token, so the coach also stops
  // waiting by itself the moment the signal fires.
  const cancelled = new Promise<never>((_, reject) => {
    const stop = () => reject(new DOMException('The wiring check was cancelled.', 'AbortError'))
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
  })
  const result = await Promise.race([
    wiringModel.generateContent(
      [wiringPrompt(step), { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } }],
      { signal },
    ),
    cancelled,
  ])
  const ms = Math.round(performance.now() - started)
  return {
    check: parseWiringCheck(result.response.text()),
    source: result.response.inferenceSource ?? 'unknown',
    at: new Date(),
    ms,
  }
}
