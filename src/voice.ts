// Talking to the Workspace (#80): what a spoken phrase does. Pure, so the tests can use it
// without a browser. Speech is turned into text by Chrome's on device speech recognition;
// these rules decide what the text does.

import { withDeviceLimit } from './chat.ts'

// The language recognised on the device (settled b: English only).
export const VOICE_LANG = 'en-US'

// The words of a phrase, lower case, without punctuation.
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(' ')
    .filter((w) => w !== '')
}

// The phrases that finish the step, said on their own (settled g).
const DONE_PHRASES = new Set(['done', "i'm done", 'im done', 'i am done', 'step done', 'finished'])

// True when the phrase is only "done", "I'm done", "step done" or "finished", in any case
// and with any punctuation. "Done" inside a longer sentence is not a command.
export function isDoneCommand(text: string): boolean {
  return DONE_PHRASES.has(words(text).join(' '))
}

// A spoken message (settled j and k). Chrome ends a phrase at a short pause, so finished
// phrases are joined into one message, which goes once nothing new has been heard for
// VOICE_SILENCE_MS, or VOICE_MAX_WAIT_MS after its first phrase, or when it reaches the
// chat's length limit, whichever comes first.
export const VOICE_SILENCE_MS = 5000
export const VOICE_MAX_WAIT_MS = 30000

export function joinPhrases(phrases: string[]): string {
  return phrases
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .join(' ')
}

// How long until the message waiting now is due: 0 means it goes now. firstAt: when its
// first phrase was heard; lastHeardAt: when any words were last heard.
export function spokenMessageDueIn(
  { firstAt, lastHeardAt, text }: { firstAt: number; lastHeardAt: number; text: string },
  now: number,
  maxLength: number,
): number {
  if (text.length >= maxLength) return 0
  return Math.max(0, Math.min(lastHeardAt + VOICE_SILENCE_MS, firstAt + VOICE_MAX_WAIT_MS) - now)
}

// What a spoken message does: "done" finishes the step; anything else is first checked on
// the device (settled m).
export type SpokenAction = 'done' | 'check'

export function spokenAction(text: string): SpokenAction {
  return isDoneCommand(text) ? 'done' : 'check'
}

// The quiet notes after a spoken message that did not go (settled n and o), and the line
// under the Listening toggle where the device has no Nano.
export type VoiceNote = 'dropped' | 'unchecked' | 'left'
export const DROPPED_NOTE = "Heard you, but that didn't sound like it was about this step. Try again or type it."
export const UNCHECKED_NOTE = "Couldn't check that on this device. Type it instead."
// A spoken question about a step the learner moved on from before it went (Tino, Nov 21).
export const LEFT_STEP_NOTE = 'That was about the step you just left. Ask again if you still need it.'
export const NO_CHECK_LINE = 'Here voice can say "done". Type your questions.'
export function voiceNoteText(note: VoiceNote): string {
  return note === 'dropped' ? DROPPED_NOTE : note === 'left' ? LEFT_STEP_NOTE : UNCHECKED_NOTE
}
// How long a quiet note shows before it is gone.
export const VOICE_NOTE_MS = 6000

// What Gemini Nano is asked about a spoken message (settled m): is it said to the coach
// about the task, or other talk in the room? The instruction goes in as Nano's system
// prompt and the sentence as the question: measured Nov 21 on 45 sentences, 3 rounds, this
// shape was right 134 of 135 times, with no background talk let through.
export type TopicContext = {
  skillTitle: string
  step: { title: string; instruction: string; parts: string[] }
  // The coach's last answer, so a short follow up counts; null before the first.
  lastReply: string | null
}

export function topicCheckInstruction(c: TopicContext): string {
  const parts = c.step.parts.map((p) => p.trim()).filter((p) => p !== '')
  return [
    'You decide whether a sentence heard by a microphone was said to a coach that is helping someone with a hands-on task.',
    `The task is "${c.skillTitle}". The current step is "${c.step.title}": ${c.step.instruction}`,
    parts.length > 0 ? `The parts are: ${parts.join(', ')}.` : '',
    c.lastReply ? `The coach last said: "${c.lastReply}"` : '',
    'Answer YES if the sentence is a question, request or remark about the task, the step, the parts or the coach\'s last answer, or a short remark about how the person is getting on with the task, such as "not done yet", "almost there", "hang on" or "is this right".',
    'Answer NO if it is other talk in the room: about anything else, such as other chores, calls, driving, meals, people or plans, or words that make no sense. If part of the sentence is about something other than the task, answer NO.',
    'Answer with one word: YES or NO.',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export function topicCheckQuestion(message: string): string {
  return `Sentence: "${message}"`
}

// Nano's answer: only a YES lets the message go; anything else keeps it on the device.
export function aboutTheTask(answer: string): boolean {
  return /^\W*yes\b/i.test(answer)
}

export type TopicVerdict = 'about the task' | 'other talk' | 'unchecked'

// The verdict on one spoken message. possible: whether Nano can run on this device; ask:
// Nano's answer. Nano is never asked where it cannot run (without Chrome's API the SDK
// would send even a device only call to the cloud). Everything, the status included, gets
// limitMs; past that, or on any failure, the message is unchecked and stays on the device.
export async function topicVerdict(
  possible: () => Promise<boolean>,
  ask: () => Promise<string>,
  limitMs: number,
): Promise<TopicVerdict> {
  const verdict = async (): Promise<TopicVerdict> => {
    if (!(await possible())) return 'unchecked'
    return aboutTheTask(await ask()) ? 'about the task' : 'other talk'
  }
  try {
    return await withDeviceLimit(verdict(), limitMs)
  } catch (e) {
    console.warn('The voice check could not run', e)
    return 'unchecked'
  }
}

// Where listening stands. off: not listening. preparing: getting the language pack ready.
// listening: on. paused: on, but the tab is hidden. unsupported: this browser cannot
// recognise speech on the device. blocked: the microphone is not allowed. failed: the
// language pack could not be made ready. busy: Chrome kept refusing the recogniser, for
// example while another tab or app uses it (#92).
export type ListeningState =
  | 'off'
  | 'preparing'
  | 'listening'
  | 'paused'
  | 'unsupported'
  | 'blocked'
  | 'failed'
  | 'busy'

// The line under the Listening toggle when voice cannot run (settled c), or null.
export function listeningProblem(state: ListeningState): string | null {
  switch (state) {
    case 'unsupported':
      return 'Voice needs Chrome on a computer.'
    case 'blocked':
      return 'Allow the microphone to talk to Surtrix.'
    case 'failed':
      return 'Voice could not get ready. Try again later.'
    case 'busy':
      return 'Voice is busy in another tab or app. Close it, then turn Listening on again.'
    default:
      return null
  }
}

// On means the learner wants it on: listening now, getting ready, or paused while hidden.
export function listeningOn(state: ListeningState): boolean {
  return state === 'listening' || state === 'preparing' || state === 'paused'
}

// The busy rule (#92). Chrome can refuse the recogniser again and again, ending each run
// before any audio, while the toggle says Listening. A run that ends before audio started
// is a refusal; audio starting clears the count. After BUSY_AFTER_REFUSALS refusals in a
// row, listening stops with the busy line.
export const BUSY_AFTER_REFUSALS = 5

export function refusalsAfterRun(refusals: number, heardAudio: boolean): number {
  return heardAudio ? 0 : refusals + 1
}

export function voiceBusy(refusals: number): boolean {
  return refusals >= BUSY_AFTER_REFUSALS
}

// Why the recogniser stopped for good, or null when it only paused (no speech, a pause, a
// refusal) and the end handler starts it again. A refused microphone, including the
// recogniser's own prompt after Start camera (#92), shows the microphone line.
export function stateAfterError(error: string): 'blocked' | 'failed' | null {
  if (error === 'not-allowed' || error === 'audio-capture') return 'blocked'
  if (error === 'service-not-allowed' || error === 'language-not-supported') return 'failed'
  return null
}

// What the camera does to Listening (#92). Start camera turns it on, even if the learner
// turned it off earlier, once the camera is live: the camera's prompt comes first and the
// recogniser asks for the microphone after it. Stop camera turns it off. Where voice cannot
// run, Listening is left as it is.
export type CameraChange = 'start camera' | 'stop camera'
export type ListeningChange = 'turn on' | 'turn off' | 'leave'

export function listeningWithCamera(change: CameraChange, voice: ListeningState): ListeningChange {
  if (voice === 'unsupported') return 'leave'
  return change === 'start camera' ? 'turn on' : 'turn off'
}
