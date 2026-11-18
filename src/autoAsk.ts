// The AI asks an expert by itself when the wiring check is unsure (#65): the learner's
// choice, remembered in this browser, the limit per session, and what to do when no saved
// answer fits.

import type { SavedAnswer } from './savedAnswerPick.ts'

// What the chat (#74) shows of one automatic run. id: the chat item it is shown as; an
// update keeps it, so the notification changes in place.
export type AutoAsk = { id: string; stepId: string; said: string } & (
  // offer: the check's words and the photo it judged, as a base64 JPEG.
  | { kind: 'notice'; offer: { said: string; frame: string }; index: number }
  | { kind: 'picking' }
  // pick: the saved answer that fits, and which model picked it, in how long.
  | { kind: 'saved'; pick: { answer: SavedAnswer; source: string; ms: number } }
  // questionId: the question being waited on, once known.
  | { kind: 'asking' | 'queued' | 'still-waiting'; questionId: string | null }
  | { kind: 'limit' | 'failed' | 'panel-open' }
)

// What a notification says about the run, for each state that has a status line.
export const AUTO_ASK_STATUS: Record<Exclude<AutoAsk['kind'], 'notice' | 'saved'>, string> = {
  picking: 'Checking saved expert answers…',
  asking: 'Asking an expert…',
  queued: "An expert will be asked when you're back online.",
  'still-waiting': 'Still waiting for an expert.',
  limit: 'The AI has asked 3 experts this session. You can send this one yourself below.',
  'panel-open': "You're asking an expert below. Send it when you're ready.",
  failed: 'Could not ask an expert. You can send it yourself below.',
}

// The learner's choice: on, off, or not made yet (the first time notice shows).
export type AutoAskChoice = 'on' | 'off' | null

const CHOICE_KEY = 'surtrix.askExpertsForMe'

type ChoiceStore = { getItem(key: string): string | null; setItem(key: string, value: string): void }

// The browser's localStorage, or null where there is none or it is blocked.
function browserStore(): ChoiceStore | null {
  try {
    return (globalThis as { localStorage?: ChoiceStore }).localStorage ?? null
  } catch {
    return null
  }
}

// Read and kept in this browser only. Storage that cannot be read counts as no choice yet.
export function readAutoAskChoice(store: ChoiceStore | null = browserStore()): AutoAskChoice {
  try {
    const value = store?.getItem(CHOICE_KEY)
    return value === 'on' || value === 'off' ? value : null
  } catch {
    return null
  }
}

export function writeAutoAskChoice(choice: 'on' | 'off', store: ChoiceStore | null = browserStore()) {
  try {
    store?.setItem(CHOICE_KEY, choice)
  } catch {
    // Blocked storage: the choice holds for this page only.
  }
}

// At most this many automatic questions per session (a page load).
export const AUTO_ASK_LIMIT = 3

let askedThisSession = 0

export function autoAskedThisSession(): number {
  return askedThisSession
}

export function countAutoAsk() {
  askedThisSession += 1
}

// A question that could not be sent does not count.
export function uncountAutoAsk() {
  askedThisSession = Math.max(0, askedThisSession - 1)
}

// The question sent with the AI's own words (judgeSaid) and the photo.
export const AUTO_QUESTION = 'The AI was not sure about this step. Is my wiring right?'

// The ready made question in the manual Ask an Expert panel when a check opens it.
export const JUDGE_QUESTION = 'Is my wiring right for this step?'

// A new unsure check while the manual panel is open (#69) brings its own photo and words;
// the learner's question stays if they typed one, else it is the ready made one.
export function questionAfterNewCheck(current: string | null): string {
  const typed = current !== null && current.trim() !== '' && current !== JUDGE_QUESTION
  return typed ? current : JUDGE_QUESTION
}

// After no saved answer fits: wait for the question already open on this step; else leave
// it to the learner's own question when the manual Ask an Expert panel is open with one
// unsent (#69); past the limit leave it to the learner (the manual panel opens); or ask.
export type AfterNoFit = 'panel-open' | 'ask' | 'still-waiting' | 'limit'

export function afterNoFit({
  panelOpen = false,
  openOnStep,
  asked,
}: {
  panelOpen?: boolean
  openOnStep: boolean
  asked: number
}): AfterNoFit {
  if (openOnStep) return 'still-waiting'
  if (panelOpen) return 'panel-open'
  if (asked >= AUTO_ASK_LIMIT) return 'limit'
  return 'ask'
}

// With automatic asking on, the manual panel's Send is off while the AI's own question on
// the step waits for an expert (#69), so a step never gets a second question that way.
export function manualSendBlocked(
  choice: AutoAskChoice,
  questions: readonly { origin: string; status: string }[],
): boolean {
  return choice === 'on' && questions.some((q) => q.origin === 'judge' && q.status === 'open')
}

export const MANUAL_SEND_BLOCKED = 'An expert is already being asked about this step.'
