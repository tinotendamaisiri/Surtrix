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

// After no saved answer fits: ask, wait for the question already open on this step, or,
// past the limit, leave it to the learner (the manual Ask an Expert opens).
export type AfterNoFit = 'ask' | 'still-waiting' | 'limit'

export function afterNoFit({ openOnStep, asked }: { openOnStep: boolean; asked: number }): AfterNoFit {
  if (openOnStep) return 'still-waiting'
  if (asked >= AUTO_ASK_LIMIT) return 'limit'
  return 'ask'
}
