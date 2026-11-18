// Talking to the Workspace (#80): what a spoken phrase does. Pure, so the tests can use it
// without a browser. Speech is turned into text by Chrome's on device speech recognition;
// these rules decide what the text does.

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

// Phrases shorter than this go nowhere, so background talk does not use up the chat
// (settled e). "Done" is the exception.
export const MIN_SPOKEN_WORDS = 3

export type SpokenAction = 'done' | 'send' | 'ignore'

export function spokenAction(text: string): SpokenAction {
  if (isDoneCommand(text)) return 'done'
  return words(text).length >= MIN_SPOKEN_WORDS ? 'send' : 'ignore'
}

// Where listening stands. off: not listening. preparing: getting the language pack ready.
// listening: on. paused: on, but the tab is hidden. unsupported: this browser cannot
// recognise speech on the device. blocked: the microphone is not allowed. failed: the
// language pack could not be made ready.
export type ListeningState = 'off' | 'preparing' | 'listening' | 'paused' | 'unsupported' | 'blocked' | 'failed'

// The line under the Listening toggle when voice cannot run (settled c), or null.
export function listeningProblem(state: ListeningState): string | null {
  switch (state) {
    case 'unsupported':
      return 'Voice needs Chrome on a computer.'
    case 'blocked':
      return 'Allow the microphone to talk to Surtrix.'
    case 'failed':
      return 'Voice could not get ready. Try again later.'
    default:
      return null
  }
}

// On means the learner wants it on: listening now, getting ready, or paused while hidden.
export function listeningOn(state: ListeningState): boolean {
  return state === 'listening' || state === 'preparing' || state === 'paused'
}
