// The demo skill's coach lines (#100): the words the coach says for each demo step that
// never change, and the Firestore writes that save them. Made in the browser by
// scripts/makeDemoLines.ts (speech goes through Firebase AI Logic with App Check) and
// written by scripts/uploadDemoLines.ts. Saved lines are named by lineKey, so lines made
// for old wording or another voice are never played.
import { lineKey, SPEECH_MODEL, SPEECH_VOICE, splitParts } from '../src/coachSpeech.ts'
import { stepSpeech } from '../src/coachVoice.ts'
import { DEMO_SKILL_ID, demoSkill } from '../src/demoSkill.ts'
import { cantSeeText } from '../src/watch.ts'

export type DemoLine = { stepId: string; text: string }
// One made line, as makeDemoLines.ts saves it: audio is base64 PCM (16 bit, 24000 Hz, mono).
export type MadeLine = DemoLine & { key: string; audio: string }
export type MadeLines = { model: string; voice: string; lines: MadeLine[] }

// Every non empty choice of the parts, in the step's order, as the confirmation names them.
function partChoices(parts: readonly string[]): string[][] {
  const choices: string[][] = []
  for (let mask = 1; mask < 1 << parts.length; mask++) choices.push(parts.filter((_, i) => mask & (1 << i)))
  return choices
}

// Per step: its instruction, its "can't see" warning and one confirmation per choice of parts.
export function demoLines(): DemoLine[] {
  return demoSkill.steps.flatMap((step, i) => {
    const stepId = `step-${i + 1}`
    return [
      stepSpeech(i + 1, demoSkill.steps.length, step.title, step.instruction),
      cantSeeText({ said: 'cant-see', parts: step.parts }),
      ...partChoices(step.parts).map((parts) => cantSeeText({ said: 'can-see', parts })),
    ].map((text) => ({ stepId, text }))
  })
}

// Refuses a file made for other words, another model or voice, or with a line missing.
export async function checkMadeLines(made: MadeLines): Promise<void> {
  if (made.model !== SPEECH_MODEL || made.voice !== SPEECH_VOICE) {
    throw new Error(`The lines were made with ${made.model} ${made.voice}, the app uses ${SPEECH_MODEL} ${SPEECH_VOICE}.`)
  }
  for (const line of made.lines) {
    if (line.key !== (await lineKey(line.text))) throw new Error(`The key of "${line.text}" does not match its words.`)
    if (line.audio === '') throw new Error(`"${line.text}" has no audio.`)
  }
  const madeSet = new Set(made.lines.map((l) => `${l.stepId}\n${l.text}`))
  const missing = demoLines().filter((l) => !madeSet.has(`${l.stepId}\n${l.text}`))
  if (missing.length > 0) throw new Error(`Missing: ${missing.map((l) => l.text).join(' | ')}`)
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

// The Firestore writes for one step's lines, in the shape src/speechLines.ts saves.
export function demoLineWrites(projectId: string, lines: readonly MadeLine[]) {
  const steps = `projects/${projectId}/databases/(default)/documents/skills/${DEMO_SKILL_ID}/steps`
  return lines.flatMap((line) => {
    const parts = splitParts(fromBase64(line.audio))
    return parts.map((audio, part) => ({
      update: {
        name: `${steps}/${line.stepId}/speech/${line.key}-${part}`,
        fields: {
          key: { stringValue: line.key },
          part: { integerValue: String(part) },
          parts: { integerValue: String(parts.length) },
          text: { stringValue: line.text },
          model: { stringValue: SPEECH_MODEL },
          voice: { stringValue: SPEECH_VOICE },
          audio: { bytesValue: toBase64(audio) },
        },
      },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    }))
  })
}
