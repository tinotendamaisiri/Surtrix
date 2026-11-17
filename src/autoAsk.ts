// The AI asks an expert by itself when the wiring check is unsure (#65): the learner's
// choice, remembered in this browser, the limit per session, and what to do when no saved
// answer fits.

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

// After no saved answer fits: leave it to the learner's own question when the manual Ask an
// Expert panel is open with one unsent (#69), wait for the question already open on this
// step, past the limit leave it to the learner (the manual panel opens), or ask.
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
  if (panelOpen) return 'panel-open'
  if (openOnStep) return 'still-waiting'
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
