// The coach voice (#95): what the coach reads aloud and which voice reads it. Only voices
// that run on this device are used, so voice still stays on this device. No browser
// calls here; useCoachVoice.ts speaks.
import { InferenceSource } from 'firebase/ai'
import { COULD_NOT_ANSWER_TEXT, LIMITED_TEXT, ON_DEVICE_NOTE, type ChatEntry, type FailReason } from './chat.ts'
import { describeWiringCheck, type WiringCheck } from './wiring.ts'

export type VoiceLike = { lang: string; localService: boolean; default: boolean }

function isEnglish(lang: string): boolean {
  return /^en([-_]|$)/i.test(lang)
}

// The browser's default voice if it runs on this device and speaks English, else the first
// such voice for US English, else any such voice. Never a voice that runs on a server.
export function pickVoice<V extends VoiceLike>(voices: readonly V[]): V | null {
  const local = voices.filter((v) => v.localService && isEnglish(v.lang))
  return local.find((v) => v.default) ?? local.find((v) => /^en[-_]US$/i.test(v.lang)) ?? local[0] ?? null
}

// One thing to say. stepId: the step it belongs to, so a step change drops it while it
// waits; null for what belongs to no step.
export type Speech = { id: string; stepId: string | null; text: string }

// A step change: what still waits from other steps is dropped.
export function keepForStep(queue: readonly Speech[], stepId: string): Speech[] {
  return queue.filter((s) => s.stepId === null || s.stepId === stepId)
}

export function stepSpeech(stepNumber: number, stepCount: number, title: string, instruction: string): string {
  return `Step ${stepNumber} of ${stepCount}, ${title}. ${instruction}`
}

export const ALL_DONE_SPEECH = 'All steps done.'

export function expertSpeech(answer: string): string {
  return `An expert answered: ${answer}`
}

// The words of a failed chat reply, as the chat shows them.
export function replyFailedText(reason: FailReason): string {
  return reason === 'limited'
    ? LIMITED_TEXT
    : reason === 'unanswered'
      ? COULD_NOT_ANSWER_TEXT
      : 'The AI could not answer right now. Try again, or ask an expert.'
}

export const WIRING_FAILED_TEXT = 'The wiring check is not available right now. Ask an expert in the chat, or Mark done anyway.'

// The wiring verdict, as the Last wiring check card shows it.
export function wiringLine(stepNumber: number, check: WiringCheck): string {
  const how = check.verdict === 'correct' ? '' : check.verdict === 'not yet' ? ', not yet' : ', not sure'
  return `Step ${stepNumber}${how}: ${describeWiringCheck(check)}`
}

// What the coach says for a chat entry, or null for what stays silent: the learner's own
// messages, step lines, thinking and status changes of asking an expert.
export function entrySpeech(entry: ChatEntry): string | null {
  switch (entry.kind) {
    case 'reply': {
      const { answer, source } = entry
      const said = [
        answer.text,
        answer.savedAnswer ? expertSpeech(answer.savedAnswer.answer) : '',
        source === InferenceSource.ON_DEVICE ? ON_DEVICE_NOTE : '',
      ]
      return said.filter((s) => s !== '').join(' ')
    }
    case 'reply-failed':
      return replyFailedText(entry.reason)
    case 'bench':
      return entry.text
    case 'expert-reply':
      return entry.question.reply?.text ? expertSpeech(entry.question.reply.text) : null
    case 'auto':
      return entry.auto.kind === 'saved' ? expertSpeech(entry.auto.pick.answer.answer) : null
    default:
      return null
  }
}

// An entry changes in place (thinking becomes a reply, an asking run moves on), so each
// state of it is said at most once.
export function speechKey(entry: ChatEntry): string {
  return entry.kind === 'auto' ? `auto:${entry.id}:${entry.auto.kind}` : `${entry.kind}:${entry.id}`
}

// A mute is remembered on this browser only. Storage can be missing or refused: then the
// voice is on.
const MUTED_KEY = 'surtrix.coachVoiceMuted'

export function readCoachMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeCoachMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTED_KEY, '1')
    else localStorage.removeItem(MUTED_KEY)
  } catch {
    // Not remembered; the toggle still works for this visit.
  }
}
